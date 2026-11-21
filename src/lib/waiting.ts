import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { LeadSource, Platform } from "@/db/schema";

export type WaitingItem =
  | { kind: "contact"; id: string; name: string; since: Date; source: LeadSource; ownerName: string | null }
  | { kind: "conversation"; id: string; name: string; since: Date; platform: Platform; preview: string | null };

/** Alle henvendelser i firmaet, der venter på svar – længst ventende først. */
export async function getWaiting(workspaceId: string): Promise<WaitingItem[]> {
  const [contacts, conversations] = await Promise.all([
    db
      .select({
        id: schema.contacts.id,
        name: schema.contacts.name,
        since: schema.contacts.awaitingSince,
        source: schema.contacts.source,
        ownerName: schema.users.name,
      })
      .from(schema.contacts)
      .leftJoin(schema.users, eq(schema.users.id, schema.contacts.ownerId))
      .where(and(eq(schema.contacts.workspaceId, workspaceId), isNotNull(schema.contacts.awaitingSince)))
      .orderBy(asc(schema.contacts.awaitingSince))
      .limit(200),
    db
      .select({
        id: schema.conversations.id,
        name: schema.conversations.name,
        since: schema.conversations.awaitingSince,
        platform: schema.conversations.platform,
        preview: schema.conversations.lastMessagePreview,
      })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.workspaceId, workspaceId), isNotNull(schema.conversations.awaitingSince)))
      .orderBy(asc(schema.conversations.awaitingSince))
      .limit(200),
  ]);

  const items: WaitingItem[] = [
    ...contacts.map((c) => ({ kind: "contact" as const, ...c, since: c.since! })),
    ...conversations.map((c) => ({ kind: "conversation" as const, ...c, name: c.name ?? "Ukendt", since: c.since! })),
  ];
  return items.sort((a, b) => a.since.getTime() - b.since.getTime());
}

/** Firmaets mål for svartid i sekunder (standard 2 timer). */
export async function getResponseTargetSeconds(workspaceId: string) {
  const [row] = await db
    .select({ minutes: schema.workspaces.responseTargetMinutes })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  return (row?.minutes ?? 120) * 60;
}

export async function countWaiting(workspaceId: string) {
  const result = await db.execute<{ n: number }>(sql`
    select
      (select count(*) from contacts where workspace_id = ${workspaceId} and awaiting_since is not null) +
      (select count(*) from conversations where workspace_id = ${workspaceId} and awaiting_since is not null) as n
  `);
  return Number(result.rows[0]?.n ?? 0);
}

/** Median svartid i sekunder de seneste 30 dage, for leads og for beskeder. */
export async function getResponseStats(workspaceIds: string[]) {
  if (workspaceIds.length === 0) return { leads: null, messages: null, count: 0 };
  const rows = await db
    .select({
      leads: sql<number | null>`percentile_cont(0.5) within group (order by ${schema.responseLog.seconds}) filter (where ${schema.responseLog.channel} = 'LEAD')`,
      messages: sql<number | null>`percentile_cont(0.5) within group (order by ${schema.responseLog.seconds}) filter (where ${schema.responseLog.channel} <> 'LEAD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.responseLog)
    .where(
      and(
        inArray(schema.responseLog.workspaceId, workspaceIds),
        gt(schema.responseLog.createdAt, sql`now() - interval '30 days'`),
      ),
    );
  const r = rows[0];
  return {
    leads: r?.leads == null ? null : Number(r.leads),
    messages: r?.messages == null ? null : Number(r.messages),
    count: r?.count ?? 0,
  };
}

/** "45 min", "2 t 10 min", "3 dage" */
export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} t ${minutes % 60} min` : `${hours} t`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 dag" : `${days} dage`;
}
