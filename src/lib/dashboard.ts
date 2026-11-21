import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { todayIso } from "./labels";
import { getResponseStats } from "./waiting";

// Nøgletal til dashboardet. Tager en liste af workspace-id'er, så det kan vise
// ét firma eller alle brugerens firmaer samlet. Kald kun med id'er fra brugerens medlemskaber.

const monthStart = sql`date_trunc('month', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'`;

export async function getDashboard(workspaceIds: string[], userId: string) {
  const today = todayIso();

  const [
    [newLeads],
    [openPipeline],
    [wonMonth],
    [overdue],
    [waiting],
    myTasks,
    recentLeads,
    sources,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.contacts)
      .where(and(inArray(schema.contacts.workspaceId, workspaceIds), gte(schema.contacts.createdAt, sql`now() - interval '7 days'`))),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.deals.value}), 0)::bigint`, n: count() })
      .from(schema.deals)
      .where(and(inArray(schema.deals.workspaceId, workspaceIds), eq(schema.deals.status, "OPEN"))),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.deals.value}), 0)::bigint`, n: count() })
      .from(schema.deals)
      .where(and(inArray(schema.deals.workspaceId, workspaceIds), eq(schema.deals.status, "WON"), gte(schema.deals.closedAt, monthStart))),
    db
      .select({ value: count() })
      .from(schema.tasks)
      .where(
        and(
          inArray(schema.tasks.workspaceId, workspaceIds),
          eq(schema.tasks.assigneeId, userId),
          isNull(schema.tasks.completedAt),
          lt(schema.tasks.dueDate, today),
        ),
      ),
    db.execute<{ value: number }>(sql`
      select
        (select count(*) from contacts where workspace_id in ${workspaceIds} and awaiting_since is not null) +
        (select count(*) from conversations where workspace_id in ${workspaceIds} and awaiting_since is not null) as value
    `).then((r) => [{ value: Number(r.rows[0]?.value ?? 0) }]),
    db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        dueDate: schema.tasks.dueDate,
        workspaceId: schema.tasks.workspaceId,
        workspaceName: schema.workspaces.name,
        contactId: schema.tasks.contactId,
        dealId: schema.tasks.dealId,
      })
      .from(schema.tasks)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.tasks.workspaceId))
      .where(
        and(
          inArray(schema.tasks.workspaceId, workspaceIds),
          eq(schema.tasks.assigneeId, userId),
          isNull(schema.tasks.completedAt),
          sql`${schema.tasks.dueDate} <= ${today}`,
        ),
      )
      .orderBy(schema.tasks.dueDate)
      .limit(8),
    db
      .select({
        id: schema.contacts.id,
        name: schema.contacts.name,
        source: schema.contacts.source,
        createdAt: schema.contacts.createdAt,
        workspaceId: schema.contacts.workspaceId,
        workspaceName: schema.workspaces.name,
      })
      .from(schema.contacts)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.contacts.workspaceId))
      .where(and(inArray(schema.contacts.workspaceId, workspaceIds), eq(schema.contacts.status, "LEAD")))
      .orderBy(desc(schema.contacts.createdAt))
      .limit(6),
    db
      .select({ source: schema.contacts.source, n: count() })
      .from(schema.contacts)
      .where(and(inArray(schema.contacts.workspaceId, workspaceIds), gte(schema.contacts.createdAt, sql`now() - interval '30 days'`)))
      .groupBy(schema.contacts.source)
      .orderBy(desc(count())),
  ]);

  return {
    newLeads: newLeads.value,
    openPipeline: { value: Number(openPipeline.value), count: openPipeline.n },
    wonMonth: { value: Number(wonMonth.value), count: wonMonth.n },
    overdueTasks: overdue.value,
    waiting: waiting.value,
    response: await getResponseStats(workspaceIds),
    myTasks,
    recentLeads,
    sources,
  };
}
