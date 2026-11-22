import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatMonth, monthRange, shiftMonth } from "./duration";
import { brandedEmail, isEmailConfigured, sendEmail } from "./email";
import { localDate } from "./time";
import { getCompanyRetainer } from "./time-tracking";
import { getAppUrl } from "./url";

// Månedsrapport til en kunde: tid brugt, retainer, annonceresultater og udførte opgaver.
// Kunden ser den via et hemmeligt link (/rapport/<token>?maaned=YYYY-MM).

export function newReportToken() {
  return randomBytes(24).toString("base64url");
}

/** Sørger for at virksomheden har et rapportlink og returnerer token. */
export async function ensureReportToken(workspaceId: string, companyId: string) {
  const [row] = await db
    .select({ token: schema.companies.reportToken })
    .from(schema.companies)
    .where(and(eq(schema.companies.workspaceId, workspaceId), eq(schema.companies.id, companyId)))
    .limit(1);
  if (!row) return null;
  if (row.token) return row.token;
  const token = newReportToken();
  await db
    .update(schema.companies)
    .set({ reportToken: token })
    .where(and(eq(schema.companies.workspaceId, workspaceId), eq(schema.companies.id, companyId)));
  return token;
}

export async function getCompanyByReportToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      company: schema.companies,
      workspaceName: schema.workspaces.name,
      agency: schema.workspaces.agencyEnabled,
    })
    .from(schema.companies)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.companies.workspaceId))
    .where(eq(schema.companies.reportToken, token))
    .limit(1);
  return row && row.agency ? row : null;
}

/** Alle tal i rapporten for en kunde og en måned. */
export async function buildClientReport(workspaceId: string, companyId: string, month: string) {
  const { first, last } = monthRange(month);

  const [timeRows, retainer, accounts, doneTasks] = await Promise.all([
    db
      .select({
        description: schema.timeEntries.description,
        minutes: sql<number>`sum(${schema.timeEntries.minutes})::int`,
      })
      .from(schema.timeEntries)
      .where(
        and(
          eq(schema.timeEntries.workspaceId, workspaceId),
          eq(schema.timeEntries.companyId, companyId),
          eq(schema.timeEntries.billable, true),
          gte(schema.timeEntries.date, first),
          lte(schema.timeEntries.date, last),
        ),
      )
      .groupBy(schema.timeEntries.description)
      .orderBy(sql`sum(${schema.timeEntries.minutes}) desc`),
    getCompanyRetainer(workspaceId, companyId, month),
    db
      .select({ adAccountId: schema.metaAdAccounts.adAccountId, name: schema.metaAdAccounts.name })
      .from(schema.metaAdAccounts)
      .where(and(eq(schema.metaAdAccounts.workspaceId, workspaceId), eq(schema.metaAdAccounts.companyId, companyId))),
    db
      .select({ title: schema.tasks.title, completedAt: schema.tasks.completedAt, project: schema.projects.name })
      .from(schema.tasks)
      .leftJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
      .where(
        and(
          eq(schema.tasks.workspaceId, workspaceId),
          eq(schema.tasks.companyId, companyId),
          isNotNull(schema.tasks.completedAt),
          sql`(${schema.tasks.completedAt} at time zone 'Europe/Copenhagen')::date between ${first} and ${last}`,
        ),
      )
      .orderBy(schema.tasks.completedAt)
      .limit(100),
  ]);

  let ads: {
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    campaigns: { name: string; spend: number; leads: number }[];
  } | null = null;
  if (accounts.length > 0) {
    const rows = await db
      .select({
        campaignName: sql<string>`max(${schema.adInsights.campaignName})`,
        spend: sql<string>`coalesce(sum(${schema.adInsights.spend}), 0)`,
        impressions: sql<string>`coalesce(sum(${schema.adInsights.impressions}), 0)`,
        clicks: sql<string>`coalesce(sum(${schema.adInsights.clicks}), 0)`,
        leads: sql<string>`coalesce(sum(${schema.adInsights.metaLeads}), 0)`,
      })
      .from(schema.adInsights)
      .where(
        and(
          eq(schema.adInsights.workspaceId, workspaceId),
          inArray(
            schema.adInsights.adAccountId,
            accounts.map((a) => a.adAccountId),
          ),
          gte(schema.adInsights.date, first),
          lte(schema.adInsights.date, last),
        ),
      )
      .groupBy(schema.adInsights.campaignId);
    const campaigns = rows
      .map((r) => ({ name: r.campaignName, spend: Number(r.spend), leads: Number(r.leads) }))
      .sort((a, b) => b.spend - a.spend);
    ads = {
      spend: rows.reduce((s, r) => s + Number(r.spend), 0),
      impressions: rows.reduce((s, r) => s + Number(r.impressions), 0),
      clicks: rows.reduce((s, r) => s + Number(r.clicks), 0),
      leads: rows.reduce((s, r) => s + Number(r.leads), 0),
      campaigns,
    };
  }

  return {
    month,
    totalMinutes: timeRows.reduce((s, r) => s + r.minutes, 0),
    work: timeRows.map((r) => ({ description: r.description ?? "Øvrigt arbejde", minutes: r.minutes })),
    retainer,
    ads,
    doneTasks,
  };
}

export type ClientReport = Awaited<ReturnType<typeof buildClientReport>>;

/** Sender rapporten for en måned til virksomhedens rapport-e-mail. */
export async function sendClientReport(workspaceId: string, companyId: string, month: string) {
  if (!isEmailConfigured()) return { sent: false, reason: "E-mail er ikke sat op" } as const;
  const [row] = await db
    .select({ company: schema.companies, wsName: schema.workspaces.name })
    .from(schema.companies)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.companies.workspaceId))
    .where(and(eq(schema.companies.workspaceId, workspaceId), eq(schema.companies.id, companyId)))
    .limit(1);
  const to = row?.company.reportEmail || row?.company.email;
  if (!row || !to) return { sent: false, reason: "Kunden har ingen e-mail til rapporten" } as const;
  const token = await ensureReportToken(workspaceId, companyId);
  const url = `${await getAppUrl()}/rapport/${token}?maaned=${month}`;
  const result = await sendEmail({
    to,
    subject: `Månedsrapport for ${formatMonth(month)} fra ${row.wsName}`,
    ...brandedEmail({
      sender: row.wsName,
      heading: `Månedsrapport for ${formatMonth(month)}`,
      paragraphs: [
        `Hej ${row.company.name}`,
        `Her er overblikket over, hvad vi har lavet for jer i ${formatMonth(month)}: timer, resultater og udførte opgaver.`,
      ],
      button: { label: "Se rapporten", url },
      footer: `Sendt af ${row.wsName}.`,
    }),
  });
  if (result.sent) {
    await db.update(schema.companies).set({ reportLastSentMonth: month }).where(eq(schema.companies.id, companyId));
  }
  return result.sent ? ({ sent: true, to } as const) : ({ sent: false, reason: "E-mailen kunne ikke sendes" } as const);
}

/** Daglig kørsel: den 1. i måneden sendes sidste måneds rapport til kunder, der har det slået til. */
export async function sendMonthlyClientReports(now = new Date()) {
  const today = localDate(now);
  if (!today.endsWith("-01")) return 0;
  const month = shiftMonth(today.slice(0, 7), -1);
  const companies = await db
    .select({ id: schema.companies.id, workspaceId: schema.companies.workspaceId })
    .from(schema.companies)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.companies.workspaceId))
    .where(
      and(
        eq(schema.companies.reportEnabled, true),
        eq(schema.workspaces.agencyEnabled, true),
        sql`${schema.companies.reportLastSentMonth} is distinct from ${month}`,
      ),
    )
    .limit(500);
  let sent = 0;
  for (const c of companies) {
    if ((await sendClientReport(c.workspaceId, c.id, month)).sent) sent++;
  }
  return sent;
}
