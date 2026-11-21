"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCompany } from "@/lib/crm";
import { parseDuration } from "@/lib/duration";
import { requireAgencyModule } from "@/lib/modules";
import { parseAmountOre } from "@/lib/quote-math";
import { hasRole } from "@/lib/roles";
import { isIsoDate, localDate } from "@/lib/time";
import { checkRetainerAlerts, getRetainer, getRunningTimer, getTimeEntry } from "@/lib/time-tracking";
import { isUuid } from "@/lib/validation";
import { pickValues, type ActionState } from "./types";

const MAX_ENTRY_MINUTES = 24 * 60;

/** Kunden skal høre til firmaet; tom værdi = intern tid. */
async function resolveCompany(workspaceId: string, raw: FormDataEntryValue | null) {
  if (!isUuid(raw)) return null;
  return (await getCompany(workspaceId, raw))?.id ?? null;
}

function refresh() {
  revalidatePath("/tid");
  revalidatePath("/", "layout");
}

/** Starter brugerens stopur. Kører der allerede et, stoppes det først. */
export async function startTimer(formData: FormData) {
  const { user, workspace } = await requireAgencyModule();
  await stopRunning(workspace.id, user.id);
  const now = new Date();
  await db.insert(schema.timeEntries).values({
    workspaceId: workspace.id,
    userId: user.id,
    companyId: await resolveCompany(workspace.id, formData.get("companyId")),
    description:
      String(formData.get("description") ?? "")
        .trim()
        .slice(0, 500) || null,
    date: localDate(now),
    startedAt: now,
    billable: formData.get("billable") !== "off",
  });
  refresh();
}

async function stopRunning(workspaceId: string, userId: string) {
  const running = await getRunningTimer(workspaceId, userId);
  if (!running?.startedAt) return;
  const now = new Date();
  const minutes = Math.min(
    MAX_ENTRY_MINUTES,
    Math.max(1, Math.round((now.getTime() - running.startedAt.getTime()) / 60_000)),
  );
  const [stopped] = await db
    .update(schema.timeEntries)
    .set({ endedAt: now, minutes, updatedAt: now })
    .where(and(eq(schema.timeEntries.id, running.id), isNull(schema.timeEntries.endedAt)))
    .returning({ date: schema.timeEntries.date, companyId: schema.timeEntries.companyId });
  if (stopped) await checkRetainerAlerts(workspaceId, stopped.companyId, stopped.date);
}

export async function stopTimer() {
  const { user, workspace } = await requireAgencyModule();
  await stopRunning(workspace.id, user.id);
  refresh();
}

const ENTRY_KEYS = ["date", "duration", "companyId", "description"];

/** Registrerer tid manuelt. */
export async function addTimeEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireAgencyModule();
  const values = pickValues(formData, ENTRY_KEYS);
  if (!isIsoDate(values.date)) return { error: "Vælg en dato", values };
  const minutes = parseDuration(values.duration);
  if (minutes === null || minutes <= 0) return { error: "Skriv tiden som fx 1:30, 1,5 eller 45m", values };
  if (minutes > MAX_ENTRY_MINUTES) return { error: "Højst 24 timer pr. registrering", values };
  const companyId = await resolveCompany(workspace.id, values.companyId);
  await db.insert(schema.timeEntries).values({
    workspaceId: workspace.id,
    userId: user.id,
    companyId,
    description: values.description.trim().slice(0, 500) || null,
    date: values.date,
    minutes,
    billable: formData.get("billable") === "on",
  });
  await checkRetainerAlerts(workspace.id, companyId, values.date);
  refresh();
  return {
    success: "Tiden er registreret.",
    values: { date: values.date, duration: "", companyId: values.companyId, description: "" },
  };
}

/** Sletter en registrering. Medarbejdere kan kun slette deres egne. */
export async function deleteTimeEntry(formData: FormData) {
  const { user, workspace } = await requireAgencyModule();
  const entry = await getTimeEntry(workspace.id, formData.get("id"));
  if (!entry) return;
  if (entry.userId !== user.id && !hasRole(workspace.role, "ADMIN")) return;
  await db.delete(schema.timeEntries).where(eq(schema.timeEntries.id, entry.id));
  refresh();
}

// ---------- Retainers ----------

const retainerSchema = z.object({
  name: z.string().trim().min(1, "Giv aftalen et navn, fx SoMe-pakke").max(100),
});

/** Opretter eller retter kundens retainer (én pr. kunde). Kun administratorer. */
export async function saveRetainer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireAgencyModule("ADMIN");
  const values = pickValues(formData, ["companyId", "name", "hours", "price", "rate"]);
  const companyId = await resolveCompany(workspace.id, values.companyId);
  if (!companyId) return { error: "Vælg en kunde", values };
  const parsed = retainerSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const minutes = parseDuration(
    values.hours.includes(":") || /[a-z]/i.test(values.hours) ? values.hours : `${values.hours}t`,
  );
  if (minutes === null || minutes <= 0 || minutes > 1000 * 60) return { error: "Skriv timebudgettet, fx 20", values };
  const price = values.price.trim() ? parseAmountOre(values.price) : null;
  const rate = values.rate.trim() ? parseAmountOre(values.rate) : null;
  if ((values.price.trim() && (price === null || price < 0)) || (values.rate.trim() && (rate === null || rate < 0))) {
    return { error: "Ugyldigt beløb", values };
  }
  const data = {
    name: parsed.data.name,
    monthlyMinutes: minutes,
    monthlyPriceOre: price,
    hourlyRateOre: rate,
    active: formData.has("hasActive") ? formData.get("active") === "on" : true,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.retainers)
    .values({ workspaceId: workspace.id, companyId, ...data })
    .onConflictDoUpdate({ target: [schema.retainers.workspaceId, schema.retainers.companyId], set: data });
  revalidatePath("/tid/retainers");
  revalidatePath(`/virksomheder/${companyId}`);
  return { success: "Retaineren er gemt." };
}

export async function deleteRetainer(formData: FormData) {
  const { workspace } = await requireAgencyModule("ADMIN");
  const retainer = await getRetainer(workspace.id, formData.get("id"));
  if (!retainer) return;
  await db.delete(schema.retainers).where(eq(schema.retainers.id, retainer.id));
  revalidatePath("/tid/retainers");
  revalidatePath(`/virksomheder/${retainer.companyId}`);
}
