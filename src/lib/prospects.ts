import "server-only";
import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ProspectSource, ProspectStatus } from "@/db/schema";

export const PROSPECT_STATUSES = [
  "NEW",
  "CALLED",
  "CALL_BACK",
  "INTERESTED",
  "NOT_INTERESTED",
  "CONVERTED",
] as const satisfies readonly ProspectStatus[];

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  NEW: "Ny",
  CALLED: "Ringet op",
  CALL_BACK: "Ring igen",
  INTERESTED: "Interesseret",
  NOT_INTERESTED: "Ikke interesseret",
  CONVERTED: "Gjort til kunde",
};

export const PROSPECT_STATUS_STYLES: Record<ProspectStatus, string> = {
  NEW: "bg-slate-100 text-slate-700",
  CALLED: "bg-sky-50 text-sky-800",
  CALL_BACK: "bg-amber-50 text-amber-800",
  INTERESTED: "bg-emerald-50 text-emerald-800",
  NOT_INTERESTED: "bg-rose-50 text-rose-700",
  CONVERTED: "bg-brand-50 text-brand-800",
};

export const PROSPECT_SOURCE_LABELS: Record<ProspectSource, string> = {
  CVR: "CVR",
  GOOGLE: "Google Maps",
  MANUAL: "Manuel",
};

/** Leads i lister slettes automatisk så mange måneder efter sidste ændring. */
export const PROSPECT_RETENTION_MONTHS = 6;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Et firma fra en søgning. Valideres, når klienten sender de valgte resultater tilbage. */
export const prospectInputSchema = z.object({
  source: z.enum(["CVR", "GOOGLE", "MANUAL"]),
  externalId: text(300),
  name: z.string().trim().min(1).max(200),
  cvr: z
    .string()
    .regex(/^\d{8}$/)
    .nullish()
    .transform((v) => v ?? null),
  address: text(300),
  phone: text(40),
  website: text(500),
  industry: text(200),
  employees: text(40),
  companyForm: text(60),
  foundedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null),
  rating: z.number().min(0).max(5).nullish().transform((v) => v ?? null),
  reviewCount: z.number().int().min(0).max(10_000_000).nullish().transform((v) => v ?? null),
  // Kun https-links (fx til Google Maps) – aldrig javascript: eller andre skemaer.
  mapsUrl: text(500).refine((v) => v === null || /^https:\/\//i.test(v), "Ugyldigt link"),
});
export type ProspectInput = z.infer<typeof prospectInputSchema>;

/** Sidste 8 cifre i et telefonnummer, så "+45 12 34 56 78" og "12345678" matcher. */
export function phoneKey(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : null;
}

/** Domænet i en hjemmesideadresse uden "www.", fx "eksempel.dk". */
export function domainOf(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Gør en hjemmesideadresse klar til et link (tilføjer https:// hvis det mangler). */
export function websiteHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export async function getProspectLists(workspaceId: string) {
  const counts = db
    .select({
      listId: schema.prospects.listId,
      total: count().as("total"),
      fresh: sql<number>`count(*) filter (where ${schema.prospects.status} = 'NEW')::int`.as("fresh"),
      interested: sql<number>`count(*) filter (where ${schema.prospects.status} = 'INTERESTED')::int`.as("interested"),
      converted: sql<number>`count(*) filter (where ${schema.prospects.status} = 'CONVERTED')::int`.as("converted"),
    })
    .from(schema.prospects)
    .where(eq(schema.prospects.workspaceId, workspaceId))
    .groupBy(schema.prospects.listId)
    .as("c");
  return db
    .select({
      id: schema.prospectLists.id,
      name: schema.prospectLists.name,
      createdAt: schema.prospectLists.createdAt,
      total: sql<number>`coalesce(${counts.total}, 0)::int`,
      fresh: sql<number>`coalesce(${counts.fresh}, 0)::int`,
      interested: sql<number>`coalesce(${counts.interested}, 0)::int`,
      converted: sql<number>`coalesce(${counts.converted}, 0)::int`,
    })
    .from(schema.prospectLists)
    .leftJoin(counts, eq(counts.listId, schema.prospectLists.id))
    .where(eq(schema.prospectLists.workspaceId, workspaceId))
    .orderBy(desc(schema.prospectLists.createdAt));
}

export async function getProspectList(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(schema.prospectLists)
    .where(and(eq(schema.prospectLists.workspaceId, workspaceId), eq(schema.prospectLists.id, id)))
    .limit(1);
  return row ?? null;
}

/** SQL der er sand, når leadet allerede findes som virksomhed i CRM'et (samme CVR, telefon eller domæne). */
function knownCompanySql() {
  return sql<boolean>`exists (
    select 1 from companies c
    where c.workspace_id = ${schema.prospects.workspaceId}
      and (
        (${schema.prospects.cvr} is not null and c.cvr = ${schema.prospects.cvr})
        or (${schema.prospects.phone} is not null and length(regexp_replace(${schema.prospects.phone}, '\\D', '', 'g')) >= 8
            and right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 8) = right(regexp_replace(${schema.prospects.phone}, '\\D', '', 'g'), 8))
        or (${schema.prospects.website} is not null and c.website is not null
            and regexp_replace(lower(c.website), '^(https?://)?(www\\.)?([^/:?#]+).*$', '\\3')
              = regexp_replace(lower(${schema.prospects.website}), '^(https?://)?(www\\.)?([^/:?#]+).*$', '\\3'))
      )
  )`;
}

export async function getProspects(workspaceId: string, listId: string, status?: ProspectStatus) {
  return db
    .select({
      id: schema.prospects.id,
      name: schema.prospects.name,
      source: schema.prospects.source,
      phone: schema.prospects.phone,
      website: schema.prospects.website,
      address: schema.prospects.address,
      industry: schema.prospects.industry,
      rating: schema.prospects.rating,
      reviewCount: schema.prospects.reviewCount,
      status: schema.prospects.status,
      callBackDate: schema.prospects.callBackDate,
      score: sql<number | null>`(${schema.prospects.websiteCheck} ->> 'score')::int`,
      ownerName: schema.users.name,
      known: knownCompanySql(),
    })
    .from(schema.prospects)
    .leftJoin(schema.users, eq(schema.users.id, schema.prospects.ownerId))
    .where(
      and(
        eq(schema.prospects.workspaceId, workspaceId),
        eq(schema.prospects.listId, listId),
        status ? eq(schema.prospects.status, status) : undefined,
      ),
    )
    .orderBy(asc(schema.prospects.name));
}

export async function getProspect(workspaceId: string, id: string) {
  const [row] = await db
    .select({
      prospect: schema.prospects,
      listName: schema.prospectLists.name,
      known: knownCompanySql(),
    })
    .from(schema.prospects)
    .innerJoin(schema.prospectLists, eq(schema.prospectLists.id, schema.prospects.listId))
    .where(and(eq(schema.prospects.workspaceId, workspaceId), eq(schema.prospects.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * Markerer søgeresultater, der allerede er gemt i en liste, eller som allerede er virksomheder i CRM'et.
 */
export async function markKnown<T extends ProspectInput>(workspaceId: string, items: T[]) {
  const ids = items.map((i) => i.externalId).filter((v): v is string => Boolean(v));
  const [saved, companies] = await Promise.all([
    ids.length
      ? db
          .select({ externalId: schema.prospects.externalId })
          .from(schema.prospects)
          .where(and(eq(schema.prospects.workspaceId, workspaceId), inArray(schema.prospects.externalId, ids)))
      : [],
    db
      .select({ cvr: schema.companies.cvr, phone: schema.companies.phone, website: schema.companies.website })
      .from(schema.companies)
      .where(eq(schema.companies.workspaceId, workspaceId)),
  ]);
  const savedIds = new Set(saved.map((s) => s.externalId));
  const cvrs = new Set(companies.map((c) => c.cvr).filter(Boolean));
  const phones = new Set(companies.map((c) => phoneKey(c.phone)).filter(Boolean));
  const domains = new Set(companies.map((c) => domainOf(c.website)).filter(Boolean));
  return items.map((item) => ({
    ...item,
    saved: item.externalId ? savedIds.has(item.externalId) : false,
    customer:
      (item.cvr != null && cvrs.has(item.cvr)) ||
      (phoneKey(item.phone) != null && phones.has(phoneKey(item.phone))) ||
      (domainOf(item.website) != null && domains.has(domainOf(item.website))),
  }));
}

/** Gemmer firmaer i en liste. Firmaer, der allerede ligger i en af firmaets lister, springes over. */
export async function saveProspects(workspaceId: string, listId: string, items: ProspectInput[]) {
  if (items.length === 0) return 0;
  const rows = await db
    .insert(schema.prospects)
    .values(items.map((item) => ({ ...item, workspaceId, listId })))
    .onConflictDoNothing()
    .returning({ id: schema.prospects.id });
  return rows.length;
}

/** Sletter leads, der ikke er rørt i PROSPECT_RETENTION_MONTHS måneder (dataminimering). */
export async function cleanupOldProspects() {
  const rows = await db
    .delete(schema.prospects)
    .where(lt(schema.prospects.updatedAt, sql`now() - make_interval(months => ${PROSPECT_RETENTION_MONTHS})`))
    .returning({ id: schema.prospects.id });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Loft over betalte søgninger (Google Maps)
// ---------------------------------------------------------------------------

export function currentUsageMonth(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit" }).format(
    now,
  );
}

export async function getSearchUsage(workspaceId: string) {
  const [[usage], [ws]] = await Promise.all([
    db
      .select({ google: schema.leadSearchUsage.googleRequests })
      .from(schema.leadSearchUsage)
      .where(
        and(
          eq(schema.leadSearchUsage.workspaceId, workspaceId),
          eq(schema.leadSearchUsage.month, currentUsageMonth()),
        ),
      ),
    db
      .select({ limit: schema.workspaces.leadSearchMonthlyLimit })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceId)),
  ]);
  return { used: usage?.google ?? 0, limit: ws?.limit ?? 0 };
}

/**
 * Reserverer én Google-søgning i månedens kvote. Returnerer false, hvis loftet er nået.
 * Tælleren øges atomisk, så to samtidige søgninger ikke kan snyde loftet.
 */
export async function reserveGoogleRequest(workspaceId: string) {
  const { limit } = await getSearchUsage(workspaceId);
  if (limit <= 0) return false;
  const result = await db.execute<{ n: number }>(sql`
    insert into lead_search_usage (workspace_id, month, google_requests)
    values (${workspaceId}, ${currentUsageMonth()}, 1)
    on conflict (workspace_id, month) do update
      set google_requests = lead_search_usage.google_requests + 1
      where lead_search_usage.google_requests < ${limit}
    returning google_requests as n
  `);
  return result.rows.length > 0;
}
