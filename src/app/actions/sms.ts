"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";
import { getSmsAccount, getSmsSettings, sendSms, SmsError, toMsisdn, validSender } from "@/lib/sms";
import { pickValues, type ActionState } from "./types";

const PATH = "/indstillinger/sms";

/** Gemmer SMS-opsætningen. Nøglen tjekkes hos GatewayAPI, før den gemmes (krypteret). */
export async function saveSmsSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  if (!isEncryptionConfigured()) return { error: "Kryptering er ikke sat op på serveren (ENCRYPTION_KEY)." };
  const values = pickValues(formData, ["sender", "monthlyLimit"]);
  const sender = values.sender.trim();
  if (!validSender(sender)) return { error: "Afsendernavnet skal være 2–11 tegn: bogstaver a–z, tal og mellemrum.", values };
  const limit = Number(values.monthlyLimit);
  if (!Number.isInteger(limit) || limit < 0 || limit > 20000) return { error: "Loftet skal være et helt tal fra 0 til 20.000.", values };
  const existing = await getSmsSettings(workspace.id);
  const newToken = String(formData.get("token") ?? "").trim();
  const token = newToken || existing?.token;
  if (!token) return { error: "Indsæt API-nøglen fra GatewayAPI.", values };
  if (newToken) {
    if (!/^[A-Za-z0-9_.-]{20,200}$/.test(newToken)) return { error: "Det ligner ikke en API-nøgle fra GatewayAPI.", values };
    try {
      await getSmsAccount(newToken);
    } catch (error) {
      return { error: error instanceof SmsError ? error.message : "Nøglen kunne ikke tjekkes.", values };
    }
  }
  const row = {
    tokenEnc: encrypt(token),
    sender,
    confirmation: formData.get("confirmation") === "on",
    reminder: formData.get("reminder") === "on",
    monthlyLimit: limit,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.smsSettings)
    .values({ workspaceId: workspace.id, ...row })
    .onConflictDoUpdate({ target: schema.smsSettings.workspaceId, set: row });
  await audit(workspace.id, user.id, "Ændrede SMS-indstillinger", `Afsender ${sender}, loft ${limit}`);
  revalidatePath(PATH);
  return { success: "SMS-indstillingerne er gemt." };
}

export async function sendTestSms(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireRole("ADMIN");
  const settings = await getSmsSettings(workspace.id);
  if (!settings) return { error: "Gem SMS-indstillingerne først." };
  const to = toMsisdn(String(formData.get("phone") ?? ""));
  if (!to) return { error: "Skriv et gyldigt mobilnummer." };
  try {
    await sendSms(settings.token, settings.sender, to, `Test fra Kundespor: SMS virker for ${workspace.name}.`);
    await db.insert(schema.smsLog).values({ workspaceId: workspace.id, kind: "test", parts: 1, status: "sent" });
    return { success: "Test-SMS'en er sendt." };
  } catch (error) {
    return { error: error instanceof SmsError ? error.message : "SMS'en kunne ikke sendes." };
  }
}

export async function disableSms() {
  const { user, workspace } = await requireRole("ADMIN");
  await db.delete(schema.smsSettings).where(eq(schema.smsSettings.workspaceId, workspace.id));
  await audit(workspace.id, user.id, "Slog SMS fra");
  revalidatePath(PATH);
}
