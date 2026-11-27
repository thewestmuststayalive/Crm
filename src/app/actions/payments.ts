"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";
import { getModules } from "@/lib/modules";
import { parseAmountOre } from "@/lib/quote-math";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  getStripeAccount,
  getStripeConnection,
  looksLikeStripeKey,
  StripeError,
} from "@/lib/stripe";
import { getAppUrl } from "@/lib/url";
import type { ActionState } from "./types";

const PATH = "/indstillinger/betaling";

/** Gemmer Stripe-nøglen og opretter Kundespors webhook hos Stripe, så betalinger registreres automatisk. */
export async function connectStripe(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  if (!isEncryptionConfigured()) return { error: "Kryptering er ikke sat op på serveren (ENCRYPTION_KEY)." };
  const key = String(formData.get("secretKey") ?? "").trim();
  if (!looksLikeStripeKey(key)) {
    return { error: "Det ligner ikke en hemmelig nøgle fra Stripe. Den starter med sk_live_ eller sk_test_." };
  }
  try {
    const account = await getStripeAccount(key);
    const old = await getStripeConnection(workspace.id);
    if (old?.webhookEndpointId) {
      await deleteWebhookEndpoint(old.secretKey, old.webhookEndpointId).catch(() => undefined);
    }
    const hook = await createWebhookEndpoint(key, `${await getAppUrl()}/api/stripe/webhook/${workspace.id}`);
    const values = {
      secretKeyEnc: encrypt(key),
      webhookEndpointId: hook.id,
      webhookSecretEnc: encrypt(hook.secret),
      accountName: account.name,
      livemode: key.includes("_live_"),
      connectedById: user.id,
    };
    await db
      .insert(schema.stripeConnections)
      .values({ workspaceId: workspace.id, ...values })
      .onConflictDoUpdate({ target: schema.stripeConnections.workspaceId, set: values });
    await audit(workspace.id, user.id, "Forbandt Stripe", account.name ?? account.id);
    revalidatePath(PATH);
    return { success: `Forbundet til Stripe${account.name ? ` (${account.name})` : ""}.` };
  } catch (error) {
    return { error: error instanceof StripeError ? error.message : "Stripe kunne ikke forbindes." };
  }
}

export async function disconnectStripe() {
  const { user, workspace } = await requireRole("ADMIN");
  const conn = await getStripeConnection(workspace.id);
  if (conn?.webhookEndpointId) {
    await deleteWebhookEndpoint(conn.secretKey, conn.webhookEndpointId).catch(() => undefined);
  }
  await db.delete(schema.stripeConnections).where(eq(schema.stripeConnections.workspaceId, workspace.id));
  await audit(workspace.id, user.id, "Afbrød forbindelsen til Stripe");
  revalidatePath(PATH);
}

/** Depositum ved onlinebooking (0 = slået fra). */
export async function saveDeposit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  if (!(await getModules(workspace.id)).booking) return { error: "Slå Booking og biler til først." };
  const raw = String(formData.get("deposit") ?? "").trim();
  const ore = raw === "" ? 0 : parseAmountOre(raw);
  if (ore === null || ore < 0 || ore > 1_000_000) return { error: "Skriv et beløb mellem 0 og 10.000 kr.", values: { deposit: raw } };
  if (ore > 0 && ore < 300) return { error: "Depositum skal være mindst 3 kr.", values: { deposit: raw } };
  const rows = await db
    .update(schema.bookingSettings)
    .set({ depositOre: ore > 0 ? ore : null, updatedAt: new Date() })
    .where(eq(schema.bookingSettings.workspaceId, workspace.id))
    .returning({ key: schema.bookingSettings.key });
  if (rows.length === 0) return { error: "Åbn Indstillinger → Booking én gang først." };
  await audit(workspace.id, user.id, "Ændrede depositum ved onlinebooking", ore > 0 ? `${ore / 100} kr.` : "slået fra");
  revalidatePath(PATH);
  return { success: ore > 0 ? "Depositum er gemt." : "Depositum er slået fra." };
}
