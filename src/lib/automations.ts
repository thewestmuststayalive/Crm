import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AutomationType } from "@/db/schema";

// Automatiske opfølgningsregler. De kører én gang i døgnet (cron) og kan køres manuelt.
// Hver regel opretter højst én åben opgave pr. kontakt/deal, så der aldrig kommer dubletter.

export const AUTOMATIONS: Record<
  AutomationType,
  { title: string; description: (days: number) => string; defaultDays: number; dayOptions: number[] }
> = {
  STALE_LEAD: {
    title: "Glemte leads",
    description: (d) => `Når et lead ikke har haft aktivitet i ${d} dage, får den ansvarlige en opgave om at følge op.`,
    defaultDays: 3,
    dayOptions: [1, 2, 3, 5, 7, 14],
  },
  PROPOSAL_FOLLOWUP: {
    title: "Opfølgning på tilbud",
    description: (d) => `Når en deal har stået i "Tilbud sendt" i ${d} dage uden aktivitet, får den ansvarlige en opgave om at ringe.`,
    defaultDays: 5,
    dayOptions: [2, 3, 5, 7, 10, 14],
  },
  CLOSE_DATE_PASSED: {
    title: "Overskredet lukkedato",
    description: () => "Når en åben deal har passeret sin forventede lukkedato, får den ansvarlige en opgave om at opdatere den.",
    defaultDays: 0,
    dayOptions: [0],
  },
};

const MAX_TASKS_PER_RULE = 50;

export async function getRules(workspaceId: string) {
  const rows = await db.select().from(schema.automationRules).where(eq(schema.automationRules.workspaceId, workspaceId));
  return (Object.keys(AUTOMATIONS) as AutomationType[]).map((type) => {
    const row = rows.find((r) => r.type === type);
    return {
      type,
      enabled: row?.enabled ?? true,
      days: row?.days ?? AUTOMATIONS[type].defaultDays,
      lastRunAt: row?.lastRunAt ?? null,
    };
  });
}

async function staleLeads(workspaceId: string, days: number) {
  // Leads (ikke importerede, under 60 dage gamle) uden brugeraktivitet eller afsluttet opgave i `days` dage.
  const r = await db.execute(sql`
    insert into tasks (workspace_id, title, due_date, assignee_id, contact_id)
    select c.workspace_id, 'Følg op på ' || c.name, (now() at time zone 'Europe/Copenhagen')::date, c.owner_id, c.id
    from contacts c
    where c.workspace_id = ${workspaceId}
      and c.status = 'LEAD'
      and c.source <> 'IMPORT'
      and c.created_at > now() - interval '60 days'
      and greatest(
            c.created_at,
            coalesce((select max(a.created_at) from activities a
                      where a.contact_id = c.id and a.author_id is not null and a.type <> 'SYSTEM'), c.created_at),
            coalesce((select max(t.completed_at) from tasks t where t.contact_id = c.id), c.created_at)
          ) < now() - make_interval(days => ${days}::int)
      and not exists (select 1 from tasks t where t.contact_id = c.id and t.completed_at is null)
    order by c.created_at
    limit ${MAX_TASKS_PER_RULE}
  `);
  return r.rowCount ?? 0;
}

async function proposalFollowup(workspaceId: string, days: number) {
  const r = await db.execute(sql`
    insert into tasks (workspace_id, title, due_date, assignee_id, deal_id, contact_id)
    select d.workspace_id, 'Følg op på tilbud: ' || d.title, (now() at time zone 'Europe/Copenhagen')::date,
           d.owner_id, d.id, d.contact_id
    from deals d
    where d.workspace_id = ${workspaceId}
      and d.stage = 'PROPOSAL'
      and greatest(
            d.updated_at,
            coalesce((select max(a.created_at) from activities a where a.deal_id = d.id and a.author_id is not null), d.updated_at),
            coalesce((select max(t.completed_at) from tasks t where t.deal_id = d.id), d.updated_at)
          ) < now() - make_interval(days => ${days}::int)
      and not exists (select 1 from tasks t where t.deal_id = d.id and t.completed_at is null)
    order by d.updated_at
    limit ${MAX_TASKS_PER_RULE}
  `);
  return r.rowCount ?? 0;
}

async function closeDatePassed(workspaceId: string) {
  const r = await db.execute(sql`
    insert into tasks (workspace_id, title, due_date, assignee_id, deal_id, contact_id)
    select d.workspace_id, 'Lukkedatoen er passeret – opdatér deal: ' || d.title,
           (now() at time zone 'Europe/Copenhagen')::date, d.owner_id, d.id, d.contact_id
    from deals d
    where d.workspace_id = ${workspaceId}
      and d.stage in ('NEW', 'CONTACTED', 'PROPOSAL')
      and d.expected_close_date < (now() at time zone 'Europe/Copenhagen')::date
      and not exists (select 1 from tasks t where t.deal_id = d.id and t.completed_at is null)
    order by d.expected_close_date
    limit ${MAX_TASKS_PER_RULE}
  `);
  return r.rowCount ?? 0;
}

/** Kører firmaets aktive regler og returnerer, hvor mange opgaver hver regel oprettede. */
export async function runAutomations(workspaceId: string): Promise<Record<AutomationType, number>> {
  const rules = await getRules(workspaceId);
  const result: Record<AutomationType, number> = { STALE_LEAD: 0, PROPOSAL_FOLLOWUP: 0, CLOSE_DATE_PASSED: 0 };
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.type === "STALE_LEAD") result.STALE_LEAD = await staleLeads(workspaceId, rule.days);
    if (rule.type === "PROPOSAL_FOLLOWUP") result.PROPOSAL_FOLLOWUP = await proposalFollowup(workspaceId, rule.days);
    if (rule.type === "CLOSE_DATE_PASSED") result.CLOSE_DATE_PASSED = await closeDatePassed(workspaceId);
    await db
      .insert(schema.automationRules)
      .values({ workspaceId, type: rule.type, enabled: rule.enabled, days: rule.days, lastRunAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.automationRules.workspaceId, schema.automationRules.type],
        set: { lastRunAt: new Date() },
      });
  }
  return result;
}
