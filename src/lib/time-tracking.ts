import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatHM, formatMonth, monthRange } from "./duration";
import { notify } from "./notify";
import { addDays } from "./time";
import { isUuid } from "./validation";

/** Brugerens kørende stopur i firmaet, hvis der er et. */
export async function getRunningTimer(workspaceId: string, userId: string) {
  const [row] = await db
    .select({
      id: schema.timeEntries.id,
      startedAt: schema.timeEntries.startedAt,
      description: schema.timeEntries.description,
      companyId: schema.timeEntries.companyId,
      companyName: schema.companies.name,
    })
    .from(schema.timeEntries)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.timeEntries.companyId))
    .where(
      and(
        eq(schema.timeEntries.workspaceId, workspaceId),
        eq(schema.timeEntries.userId, userId),
        isNull(schema.timeEntries.endedAt),
        sql`${schema.timeEntries.startedAt} is not null`,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getTimeEntry(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.timeEntries)
    .where(and(eq(schema.timeEntries.workspaceId, workspaceId), eq(schema.timeEntries.id, id)))
    .limit(1);
  return row ?? null;
}

/** Afsluttede registreringer i et datointerval, evt. for én bruger eller én kunde. */
export async function getEntries(
  workspaceId: string,
  from: string,
  to: string,
  filter: { userId?: string; companyId?: string } = {},
) {
  return db
    .select({
      id: schema.timeEntries.id,
      date: schema.timeEntries.date,
      minutes: schema.timeEntries.minutes,
      description: schema.timeEntries.description,
      billable: schema.timeEntries.billable,
      userId: schema.timeEntries.userId,
      userName: schema.users.name,
      companyId: schema.timeEntries.companyId,
      companyName: schema.companies.name,
    })
    .from(schema.timeEntries)
    .innerJoin(schema.users, eq(schema.users.id, schema.timeEntries.userId))
    .leftJoin(schema.companies, eq(schema.companies.id, schema.timeEntries.companyId))
    .where(
      and(
        eq(schema.timeEntries.workspaceId, workspaceId),
        gte(schema.timeEntries.date, from),
        lte(schema.timeEntries.date, to),
        sql`${schema.timeEntries.endedAt} is not null or ${schema.timeEntries.startedAt} is null`,
        filter.userId ? eq(schema.timeEntries.userId, filter.userId) : undefined,
        filter.companyId ? eq(schema.timeEntries.companyId, filter.companyId) : undefined,
      ),
    )
    .orderBy(asc(schema.timeEntries.date), asc(schema.timeEntries.createdAt));
}

export type TimeEntryRow = Awaited<ReturnType<typeof getEntries>>[number];

/** Fakturerbare minutter pr. kunde i en måned. */
export async function usageByCompany(workspaceId: string, month: string, companyIds?: string[]) {
  const { first, last } = monthRange(month);
  if (companyIds && companyIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({
      companyId: schema.timeEntries.companyId,
      minutes: sql<number>`coalesce(sum(${schema.timeEntries.minutes}), 0)::int`,
    })
    .from(schema.timeEntries)
    .where(
      and(
        eq(schema.timeEntries.workspaceId, workspaceId),
        eq(schema.timeEntries.billable, true),
        gte(schema.timeEntries.date, first),
        lte(schema.timeEntries.date, last),
        companyIds ? inArray(schema.timeEntries.companyId, companyIds) : undefined,
      ),
    )
    .groupBy(schema.timeEntries.companyId);
  return new Map(rows.filter((r) => r.companyId).map((r) => [r.companyId as string, r.minutes]));
}

export async function getRetainer(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.retainers)
    .where(and(eq(schema.retainers.workspaceId, workspaceId), eq(schema.retainers.id, id)))
    .limit(1);
  return row ?? null;
}

/** Alle retainers med forbrug i måneden, mest brugte først. */
export async function getRetainerOverview(workspaceId: string, month: string, onlyActive = false) {
  const rows = await db
    .select({ retainer: schema.retainers, companyName: schema.companies.name })
    .from(schema.retainers)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.retainers.companyId))
    .where(
      and(eq(schema.retainers.workspaceId, workspaceId), onlyActive ? eq(schema.retainers.active, true) : undefined),
    )
    .orderBy(desc(schema.retainers.active), asc(schema.companies.name));
  const usage = await usageByCompany(
    workspaceId,
    month,
    rows.map((r) => r.retainer.companyId),
  );
  return rows
    .map((r) => {
      const used = usage.get(r.retainer.companyId) ?? 0;
      const budget = r.retainer.monthlyMinutes;
      const over = Math.max(0, used - budget);
      return {
        ...r.retainer,
        companyName: r.companyName,
        used,
        pct: budget > 0 ? Math.round((used / budget) * 100) : 0,
        overMinutes: over,
        overValueOre: r.retainer.hourlyRateOre ? Math.round((over / 60) * r.retainer.hourlyRateOre) : null,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.pct - a.pct);
}

export type RetainerUsage = Awaited<ReturnType<typeof getRetainerOverview>>[number];

export async function getCompanyRetainer(workspaceId: string, companyId: string, month: string) {
  const all = await getRetainerOverview(workspaceId, month);
  return all.find((r) => r.companyId === companyId) ?? null;
}

/**
 * Efter ny tid på en kunde: advar administratorerne første gang i måneden, retaineren
 * når 80 % og 100 %.
 */
export async function checkRetainerAlerts(workspaceId: string, companyId: string | null, date: string) {
  if (!companyId) return;
  const month = date.slice(0, 7);
  const [retainer] = await db
    .select({ retainer: schema.retainers, companyName: schema.companies.name })
    .from(schema.retainers)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.retainers.companyId))
    .where(
      and(
        eq(schema.retainers.workspaceId, workspaceId),
        eq(schema.retainers.companyId, companyId),
        eq(schema.retainers.active, true),
      ),
    )
    .limit(1);
  if (!retainer || retainer.retainer.monthlyMinutes <= 0) return;
  const used = (await usageByCompany(workspaceId, month, [companyId])).get(companyId) ?? 0;
  const pct = (used / retainer.retainer.monthlyMinutes) * 100;
  const r = retainer.retainer;

  const level = pct >= 100 && r.alerted100 !== month ? 100 : pct >= 80 && r.alerted80 !== month ? 80 : null;
  if (!level) return;
  // Betinget opdatering, så samme advarsel ikke sendes to gange ved samtidige registreringer.
  const column = level === 100 ? schema.retainers.alerted100 : schema.retainers.alerted80;
  const [claimed] = await db
    .update(schema.retainers)
    .set(level === 100 ? { alerted100: month, alerted80: month } : { alerted80: month })
    .where(and(eq(schema.retainers.id, r.id), sql`${column} is distinct from ${month}`))
    .returning({ id: schema.retainers.id });
  if (!claimed) return;
  await notify({
    workspaceId,
    to: "admins",
    type: "RETAINER_ALERT",
    title:
      level === 100
        ? `${retainer.companyName} har brugt hele retaineren for ${formatMonth(month)}`
        : `${retainer.companyName} har brugt ${Math.round(pct)} % af retaineren`,
    body: `${formatHM(used)} af ${formatHM(r.monthlyMinutes)} timer brugt i ${formatMonth(month)}.`,
    href: `/virksomheder/${companyId}`,
    email: true,
  });
}

/** Mandag til søndag for ugen med datoen. */
export function weekDates(monday: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
