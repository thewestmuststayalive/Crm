import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// "Venter på svar": kontakter og samtaler får et tidsstempel, når kunden henvender sig,
// og det nulstilles, når nogen svarer. Svartiden logges, så den kan måles over tid.

/** Markér at kontakten venter på at blive kontaktet (beholder det tidligste tidspunkt). */
export async function markContactAwaiting(workspaceId: string, contactId: string, since = new Date()) {
  await db
    .update(schema.contacts)
    .set({ awaitingSince: sql`coalesce(${schema.contacts.awaitingSince}, ${since})` })
    .where(and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.id, contactId)));
}

/** Nulstiller "venter" atomisk og returnerer det tidligere tidsstempel (eller null hvis den ikke ventede). */
async function takeAwaiting(table: "contacts" | "conversations", workspaceId: string, id: string): Promise<Date | null> {
  const t = table === "contacts" ? schema.contacts : schema.conversations;
  const result = await db.execute<{ since: Date | string }>(sql`
    with old as (
      select id, awaiting_since from ${t}
      where workspace_id = ${workspaceId} and id = ${id} and awaiting_since is not null
      for update
    )
    update ${t} set awaiting_since = null from old where ${t}.id = old.id
    returning old.awaiting_since as since
  `);
  const since = result.rows[0]?.since;
  return since ? new Date(since) : null;
}

async function log(
  workspaceId: string,
  channel: "LEAD" | "MESSENGER" | "INSTAGRAM",
  since: Date,
  at: Date,
  userId: string | null | undefined,
) {
  await db.insert(schema.responseLog).values({
    workspaceId,
    channel,
    seconds: Math.max(0, Math.round((at.getTime() - since.getTime()) / 1000)),
    respondedById: userId ?? null,
  });
}

/**
 * Nogen har kontaktet kunden. Med `log` gemmes svartiden (opkald, e-mail, svar på besked);
 * uden `log` fjernes kontakten blot fra listen (fx "kræver ikke svar").
 */
export async function respondToContact(
  workspaceId: string,
  contactId: string,
  opts: { log: boolean; userId?: string | null },
) {
  const since = await takeAwaiting("contacts", workspaceId, contactId);
  if (since && opts.log) await log(workspaceId, "LEAD", since, new Date(), opts.userId);
}

export async function respondToConversation(
  workspaceId: string,
  conversationId: string,
  channel: "MESSENGER" | "INSTAGRAM",
  opts: { log: boolean; at?: Date; userId?: string | null },
) {
  const since = await takeAwaiting("conversations", workspaceId, conversationId);
  if (since && opts.log) await log(workspaceId, channel, since, opts.at ?? new Date(), opts.userId);
}
