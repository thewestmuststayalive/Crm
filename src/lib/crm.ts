import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
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

export async function getContactOptions(workspaceId: string) {
  return db
    .select({ id: schema.contacts.id, name: schema.contacts.name })
    .from(schema.contacts)
    .where(eq(schema.contacts.workspaceId, workspaceId))
    .orderBy(asc(schema.contacts.name))
    .limit(2000);
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

export async function getDeal(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.deals)
    .where(and(eq(schema.deals.workspaceId, workspaceId), eq(schema.deals.id, id)))
    .limit(1);
  return row ?? null;
}

export type DealSummary = Awaited<ReturnType<typeof getDealsFor>>[number];

/** Deals for en kontakt eller virksomhed, nyeste først. */
export async function getDealsFor(workspaceId: string, target: { contactId: string } | { companyId: string }) {
  return db
    .select({
      id: schema.deals.id,
      title: schema.deals.title,
      value: schema.deals.value,
      status: schema.deals.status,
      stageName: schema.pipelineStages.name,
    })
    .from(schema.deals)
    .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.deals.stageId))
    .where(
      and(
        eq(schema.deals.workspaceId, workspaceId),
        "contactId" in target
          ? eq(schema.deals.contactId, target.contactId)
          : eq(schema.deals.companyId, target.companyId),
      ),
    )
    .orderBy(desc(schema.deals.createdAt))
    .limit(50);
}

/** Logger en automatisk hændelse (fx faseskift) på tidslinjen. */
export async function logEvent(
  workspaceId: string,
  authorId: string | null,
  body: string,
  target: { dealId?: string | null; contactId?: string | null; companyId?: string | null },
) {
  await db.insert(schema.activities).values({
    workspaceId,
    authorId,
    type: "SYSTEM",
    body,
    dealId: target.dealId ?? null,
    contactId: target.contactId ?? null,
    companyId: target.contactId ? null : (target.companyId ?? null),
  });
}

/**
 * Tidslinje for en kontakt, en deal, eller en virksomhed inkl. alle dens kontakter.
 */
export async function getTimeline(
  workspaceId: string,
  target: { contactId: string } | { dealId: string } | { companyId: string; contactIds: string[] },
) {
  const where =
    "contactId" in target
      ? eq(schema.activities.contactId, target.contactId)
      : "dealId" in target
        ? eq(schema.activities.dealId, target.dealId)
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
      dealId: schema.activities.dealId,
      dealTitle: schema.deals.title,
    })
    .from(schema.activities)
    .leftJoin(schema.users, eq(schema.users.id, schema.activities.authorId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.activities.contactId))
    .leftJoin(schema.deals, eq(schema.deals.id, schema.activities.dealId))
    .where(and(eq(schema.activities.workspaceId, workspaceId), where))
    .orderBy(desc(schema.activities.createdAt))
    .limit(200);
}

export type TaskItem = Awaited<ReturnType<typeof getTasks>>[number];

/** Opgaver i workspacet, evt. filtreret på kontakt, virksomhed, deal eller ansvarlig. */
export async function getTasks(
  workspaceId: string,
  filter: {
    contactId?: string;
    companyId?: string;
    dealId?: string;
    projectId?: string;
    assigneeId?: string;
    open?: boolean;
    limit?: number;
  } = {},
) {
  const conditions = [eq(schema.tasks.workspaceId, workspaceId)];
  if (filter.contactId) conditions.push(eq(schema.tasks.contactId, filter.contactId));
  if (filter.companyId) conditions.push(eq(schema.tasks.companyId, filter.companyId));
  if (filter.dealId) conditions.push(eq(schema.tasks.dealId, filter.dealId));
  if (filter.projectId) conditions.push(eq(schema.tasks.projectId, filter.projectId));
  if (filter.assigneeId) conditions.push(eq(schema.tasks.assigneeId, filter.assigneeId));
  if (filter.open === true) conditions.push(isNull(schema.tasks.completedAt));
  if (filter.open === false) conditions.push(isNotNull(schema.tasks.completedAt));

  return db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      dueDate: schema.tasks.dueDate,
      completedAt: schema.tasks.completedAt,
      assigneeId: schema.tasks.assigneeId,
      assigneeName: schema.users.name,
      contactId: schema.tasks.contactId,
      contactName: schema.contacts.name,
      companyId: schema.tasks.companyId,
      companyName: schema.companies.name,
      dealId: schema.tasks.dealId,
      dealTitle: schema.deals.title,
    })
    .from(schema.tasks)
    .leftJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.tasks.contactId))
    .leftJoin(schema.companies, eq(schema.companies.id, schema.tasks.companyId))
    .leftJoin(schema.deals, eq(schema.deals.id, schema.tasks.dealId))
    .where(and(...conditions))
    .orderBy(
      filter.open === false ? desc(schema.tasks.completedAt) : sql`${schema.tasks.dueDate} asc nulls last`,
      asc(schema.tasks.createdAt),
    )
    .limit(filter.limit ?? 200);
}
