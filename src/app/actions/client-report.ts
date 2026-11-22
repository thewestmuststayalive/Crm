"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ensureReportToken, sendClientReport } from "@/lib/client-report";
import { getCompany } from "@/lib/crm";
import { currentMonth, isMonth, shiftMonth } from "@/lib/duration";
import { requireAgencyModule } from "@/lib/modules";
import type { ActionState } from "./types";

/** Gemmer om rapporten sendes automatisk den 1., og til hvilken e-mail. */
export async function saveReportSettings(
  companyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireAgencyModule("ADMIN");
  const company = await getCompany(workspace.id, companyId);
  if (!company) return { error: "Virksomheden findes ikke" };
  const email = String(formData.get("reportEmail") ?? "")
    .trim()
    .toLowerCase();
  if (email && !z.email().safeParse(email).success) return { error: "Ugyldig e-mail", values: { reportEmail: email } };
  const enabled = formData.get("reportEnabled") === "on";
  if (enabled && !email && !company.email) {
    return { error: "Skriv en e-mail, rapporten skal sendes til", values: { reportEmail: email } };
  }
  await ensureReportToken(workspace.id, company.id);
  await db
    .update(schema.companies)
    .set({ reportEnabled: enabled, reportEmail: email || null })
    .where(and(eq(schema.companies.workspaceId, workspace.id), eq(schema.companies.id, company.id)));
  revalidatePath(`/virksomheder/${company.id}`);
  return { success: enabled ? "Gemt. Rapporten sendes automatisk den 1. i hver måned." : "Gemt." };
}

/** Sender rapporten for en måned med det samme (standard: sidste måned). */
export async function sendReportNow(companyId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireAgencyModule();
  const company = await getCompany(workspace.id, companyId);
  if (!company) return { error: "Virksomheden findes ikke" };
  const raw = formData.get("month");
  const month = isMonth(raw) ? raw : shiftMonth(currentMonth(), -1);
  const result = await sendClientReport(workspace.id, company.id, month);
  revalidatePath(`/virksomheder/${company.id}`);
  return result.sent ? { success: `Rapporten er sendt til ${result.to}.` } : { error: result.reason };
}

/** Laver et nyt rapportlink. Det gamle holder op med at virke. */
export async function resetReportLink(formData: FormData) {
  const { workspace } = await requireAgencyModule("ADMIN");
  const company = await getCompany(workspace.id, String(formData.get("companyId") ?? ""));
  if (!company) return;
  await db.update(schema.companies).set({ reportToken: null }).where(eq(schema.companies.id, company.id));
  await ensureReportToken(workspace.id, company.id);
  revalidatePath(`/virksomheder/${company.id}`);
}
