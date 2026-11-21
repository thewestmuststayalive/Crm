import "server-only";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "./validation";

// Alle funktioner her tager workspaceId og filtrerer på det. Kald dem kun med
// workspace-id'et fra requireWorkspace(), aldrig med et id fra brugeren.

export async function getMemberOptions(workspaceId: string) {
  return db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.workspaceId, workspaceId))
    .orderBy(asc(schema.users.name));
}

export async function getCompanyOptions(workspaceId: string) {
  return db
    .select({ id: schema.companies.id, name: schema.companies.name })
    .from(schema.companies)
    .where(eq(schema.companies.workspaceId, workspaceId))
    .orderBy(asc(schema.companies.name));
}

export async function isMemberOf(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.workspaceId, workspaceId), eq(schema.memberships.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function getContact(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getCompany(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.companies)
    .where(and(eq(schema.companies.workspaceId, workspaceId), eq(schema.companies.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getUserName(userId: string | null) {
  if (!userId) return null;
  const [row] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.name ?? null;
}

export type TimelineItem = Awaited<ReturnType<typeof getTimeline>>[number];

/**
 * Tidslinje for en kontakt, eller for en virksomhed inkl. alle dens kontakter.
 */
export async function getTimeline(
  workspaceId: string,
  target: { contactId: string } | { companyId: string; contactIds: string[] },
) {
  const where =
    "contactId" in target
      ? eq(schema.activities.contactId, target.contactId)
      : target.contactIds.length > 0
        ? or(
            eq(schema.activities.companyId, target.companyId),
            inArray(schema.activities.contactId, target.contactIds),
          )
        : eq(schema.activities.companyId, target.companyId);

  return db
    .select({
      id: schema.activities.id,
      type: schema.activities.type,
      body: schema.activities.body,
      createdAt: schema.activities.createdAt,
      authorId: schema.activities.authorId,
      authorName: schema.users.name,
      contactId: schema.activities.contactId,
      contactName: schema.contacts.name,
    })
    .from(schema.activities)
    .leftJoin(schema.users, eq(schema.users.id, schema.activities.authorId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.activities.contactId))
    .where(and(eq(schema.activities.workspaceId, workspaceId), where))
    .orderBy(desc(schema.activities.createdAt))
    .limit(200);
}
