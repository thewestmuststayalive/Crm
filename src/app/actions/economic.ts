"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { connectEconomic } from "@/lib/economic-connect";
import { EconomicError, economicConfigured, getEconomicConnection, getEconomicOptions } from "@/lib/economic";
import type { ActionState } from "./types";

const PATH = "/indstillinger/regnskab";

/** Hvis e-conomic viser tokenet på skærmen i stedet for at sende brugeren tilbage, kan det sættes ind her. */
export async function saveEconomicToken(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  if (!economicConfigured() || !isEncryptionConfigured()) return { error: "e-conomic er ikke sat op på serveren endnu." };
  const token = String(formData.get("token") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(token)) return { error: "Det ligner ikke et gyldigt token fra e-conomic." };
  try {
    const self = await connectEconomic(workspace.id, user.id, token);
    revalidatePath(PATH);
    return { success: `Forbundet til ${self.companyName ?? "e-conomic"}.` };
  } catch (error) {
    return { error: error instanceof EconomicError ? error.message : "Tokenet kunne ikke bruges." };
  }
}

const settingsSchema = z.object({
  layoutNumber: z.coerce.number().int().positive(),
  paymentTermsNumber: z.coerce.number().int().positive(),
  customerGroupNumber: z.coerce.number().int().positive(),
  vatZoneNumber: z.coerce.number().int().positive(),
  productNumber: z.string().trim().min(1).max(25),
});

/** Standardvalg til fakturaer. Værdierne tjekkes mod det, der findes i e-conomic. */
export async function saveEconomicSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  const conn = await getEconomicConnection(workspace.id);
  if (!conn) return { error: "Forbind e-conomic først." };
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Vælg en værdi i alle felter." };
  try {
    const o = await getEconomicOptions(conn.grantToken);
    const s = parsed.data;
    const ok =
      o.layouts.some((x) => x.value === String(s.layoutNumber)) &&
      o.paymentTerms.some((x) => x.value === String(s.paymentTermsNumber)) &&
      o.customerGroups.some((x) => x.value === String(s.customerGroupNumber)) &&
      o.vatZones.some((x) => x.value === String(s.vatZoneNumber)) &&
      o.products.some((x) => x.value === s.productNumber);
    if (!ok) return { error: "En af værdierne findes ikke i e-conomic. Genindlæs siden og prøv igen." };
  } catch (error) {
    return { error: error instanceof EconomicError ? error.message : "e-conomic svarede ikke." };
  }
  await db
    .update(schema.economicConnections)
    .set({ settings: parsed.data })
    .where(eq(schema.economicConnections.workspaceId, workspace.id));
  await audit(workspace.id, user.id, "Ændrede standardvalg for fakturaer");
  revalidatePath(PATH);
  return { success: "Standardvalgene er gemt." };
}

export async function disconnectEconomic() {
  const { user, workspace } = await requireRole("ADMIN");
  await db.delete(schema.economicConnections).where(eq(schema.economicConnections.workspaceId, workspace.id));
  await audit(workspace.id, user.id, "Afbrød forbindelsen til e-conomic");
  revalidatePath(PATH);
}
