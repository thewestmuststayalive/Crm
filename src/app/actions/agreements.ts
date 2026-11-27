"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { getAgreement, runAgreementPeriod } from "@/lib/agreements";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { getService } from "@/lib/booking";
import { getCompany, getContact } from "@/lib/crm";
import { isIsoDate, isTime } from "@/lib/time";
import { isUuid } from "@/lib/validation";
import type { ActionState } from "./types";

const lineSchema = z.object({
  description: z.string().trim().min(1, "Hver linje skal have en tekst").max(500),
  quantity: z.number().positive("Antal skal være over 0").max(100_000),
  unitPriceOre: z.number().int().min(0).max(1_000_000_000),
});

const schemaIn = z.object({
  name: z.string().trim().min(1, "Giv aftalen et navn").max(120),
  companyId: z.string().refine((v) => v === "" || isUuid(v)),
  contactId: z.string().refine((v) => v === "" || isUuid(v)),
  interval: z.enum(["WEEK", "MONTH"]),
  intervalCount: z.coerce.number().int().min(1, "Interval skal være mindst 1").max(52),
  nextDate: z.string().refine(isIsoDate, "Vælg første dato"),
  endDate: z.string().refine((v) => v === "" || isIsoDate(v), "Ugyldig slutdato"),
  seasonMonths: z.array(z.coerce.number().int().min(1).max(12)).max(12),
  priceAdjustPct: z.coerce.number().min(-50).max(50),
  priceAdjustMonth: z.string().refine((v) => v === "" || (Number(v) >= 1 && Number(v) <= 12)),
  serviceId: z.string().refine((v) => v === "" || isUuid(v)),
  bookingTime: z.string().refine((v) => v === "" || isTime(v), "Ugyldigt tidspunkt"),
  invoiceMode: z.enum(["NONE", "DRAFT", "SEND"]),
  lines: z.array(lineSchema).max(20),
});

/** Opretter eller retter en fast aftale. Kun administratorer (den kan fakturere automatisk). */
export async function saveAgreement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  let lines: unknown = [];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Linjerne kunne ikke læses." };
  }
  const str = (k: string) => String(formData.get(k) ?? "");
  const parsed = schemaIn.safeParse({
    name: str("name"),
    companyId: str("companyId"),
    contactId: str("contactId"),
    interval: str("interval"),
    intervalCount: str("intervalCount"),
    nextDate: str("nextDate"),
    endDate: str("endDate"),
    seasonMonths: formData.getAll("seasonMonths").map(String),
    priceAdjustPct: str("priceAdjustPct").replace(",", ".") || "0",
    priceAdjustMonth: str("priceAdjustMonth"),
    serviceId: str("serviceId"),
    bookingTime: str("bookingTime"),
    invoiceMode: str("invoiceMode"),
    lines,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (!d.companyId && !d.contactId) return { error: "Vælg en kunde (virksomhed eller kontaktperson)." };
  if (d.companyId && !(await getCompany(workspace.id, d.companyId))) return { error: "Ukendt virksomhed." };
  if (d.contactId && !(await getContact(workspace.id, d.contactId))) return { error: "Ukendt kontaktperson." };
  if (d.serviceId) {
    if (!(await getService(workspace.id, d.serviceId))) return { error: "Ukendt ydelse." };
    if (!d.contactId) return { error: "Faste bookinger kræver en kontaktperson." };
    if (!d.bookingTime) return { error: "Vælg tidspunktet for den faste booking." };
  }
  if (d.invoiceMode !== "NONE" && d.lines.length === 0) return { error: "Tilføj mindst én linje til fakturaen." };
  if (!d.serviceId && d.invoiceMode === "NONE") return { error: "Vælg en fast booking, fakturering eller begge dele." };
  if (d.endDate && d.endDate < d.nextDate) return { error: "Slutdatoen ligger før første dato." };

  const values = {
    name: d.name,
    companyId: d.companyId || null,
    contactId: d.contactId || null,
    interval: d.interval,
    intervalCount: d.intervalCount,
    nextDate: d.nextDate,
    endDate: d.endDate || null,
    seasonMonths: [...new Set(d.seasonMonths)].sort((a, b) => a - b),
    priceAdjustPct: String(d.priceAdjustPct),
    priceAdjustMonth: d.priceAdjustMonth ? Number(d.priceAdjustMonth) : null,
    serviceId: d.serviceId || null,
    bookingTime: d.serviceId ? d.bookingTime : null,
    invoiceMode: d.invoiceMode,
    lines: d.lines,
    updatedAt: new Date(),
  };
  const id = formData.get("id");
  let agreementId: string;
  if (isUuid(id)) {
    const existing = await getAgreement(workspace.id, id);
    if (!existing) notFound();
    await db
      .update(schema.agreements)
      .set(values)
      .where(and(eq(schema.agreements.workspaceId, workspace.id), eq(schema.agreements.id, id)));
    agreementId = id;
  } else {
    const [created] = await db
      .insert(schema.agreements)
      .values({ workspaceId: workspace.id, createdById: user.id, ...values })
      .returning({ id: schema.agreements.id });
    agreementId = created.id;
  }
  await audit(workspace.id, user.id, isUuid(id) ? "Rettede fast aftale" : "Oprettede fast aftale", d.name);
  revalidatePath("/aftaler");
  redirect(`/aftaler/${agreementId}?gemt=1`);
}

export async function setAgreementStatus(formData: FormData) {
  const { user, workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  const status = formData.get("status");
  if (!isUuid(id) || !["ACTIVE", "PAUSED", "ENDED"].includes(String(status))) return;
  const row = await getAgreement(workspace.id, id);
  if (!row) return;
  await db
    .update(schema.agreements)
    .set({ status: status as "ACTIVE" | "PAUSED" | "ENDED", updatedAt: new Date() })
    .where(and(eq(schema.agreements.workspaceId, workspace.id), eq(schema.agreements.id, id)));
  await audit(workspace.id, user.id, "Ændrede status på fast aftale", `${row.agreement.name}: ${status}`);
  revalidatePath(`/aftaler/${id}`);
  revalidatePath("/aftaler");
}

/** Udfører næste periode med det samme (fx første gang eller efter en ændring). */
export async function runAgreementNow(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const row = await getAgreement(workspace.id, id);
  if (!row || row.agreement.status !== "ACTIVE") return;
  await runAgreementPeriod(row.agreement);
  revalidatePath(`/aftaler/${id}`);
  redirect(`/aftaler/${id}?koert=1`);
}

export async function deleteAgreement(formData: FormData) {
  const { user, workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const row = await getAgreement(workspace.id, id);
  if (!row) return;
  await db
    .delete(schema.agreements)
    .where(and(eq(schema.agreements.workspaceId, workspace.id), eq(schema.agreements.id, id)));
  await audit(workspace.id, user.id, "Slettede fast aftale", row.agreement.name);
  revalidatePath("/aftaler");
  redirect("/aftaler");
}
