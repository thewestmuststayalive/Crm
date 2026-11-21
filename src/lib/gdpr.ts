import "server-only";
import { and, asc, count, eq, inArray, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatCustomValue, getCustomFields } from "./custom-fields";

// GDPR-værktøjer: indsigt (eksport), sletning af alle data om en person og automatisk
// sletning af gamle leads (dataminimering).

/** Samler alle data om en kontakt i ét maskinlæsbart dokument (indsigtsret, art. 15 og 20). */
export async function exportPersonData(workspaceId: string, contactId: string) {
  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.id, contactId)))
    .limit(1);
  if (!contact) return null;

  const [workspace] = await db
    .select({ name: schema.workspaces.name, cvr: schema.workspaces.cvr })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  const company = contact.companyId
    ? (
        await db
          .select({ name: schema.companies.name, cvr: schema.companies.cvr })
          .from(schema.companies)
          .where(and(eq(schema.companies.workspaceId, workspaceId), eq(schema.companies.id, contact.companyId)))
          .limit(1)
      )[0]
    : null;
  const customFields = await getCustomFields(workspaceId, "CONTACT");

  const [deals, activities, tasks, conversations, submissions, reviews, metaLeads, vehicles, bookings] =
    await Promise.all([
      db
        .select({
          id: schema.deals.id,
          title: schema.deals.title,
          value: schema.deals.value,
          status: schema.deals.status,
          stage: schema.pipelineStages.name,
          createdAt: schema.deals.createdAt,
          closedAt: schema.deals.closedAt,
          lostReason: schema.deals.lostReason,
        })
        .from(schema.deals)
        .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.deals.stageId))
        .where(and(eq(schema.deals.workspaceId, workspaceId), eq(schema.deals.contactId, contactId))),
      db
        .select({
          type: schema.activities.type,
          body: schema.activities.body,
          createdAt: schema.activities.createdAt,
          author: schema.users.name,
        })
        .from(schema.activities)
        .leftJoin(schema.users, eq(schema.users.id, schema.activities.authorId))
        .where(and(eq(schema.activities.workspaceId, workspaceId), eq(schema.activities.contactId, contactId)))
        .orderBy(asc(schema.activities.createdAt)),
      db
        .select({ title: schema.tasks.title, dueDate: schema.tasks.dueDate, completedAt: schema.tasks.completedAt })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.workspaceId, workspaceId), eq(schema.tasks.contactId, contactId))),
      db
        .select()
        .from(schema.conversations)
        .where(and(eq(schema.conversations.workspaceId, workspaceId), eq(schema.conversations.contactId, contactId))),
      db
        .select({ createdAt: schema.leadSubmissions.createdAt, payload: schema.leadSubmissions.payload })
        .from(schema.leadSubmissions)
        .where(
          and(eq(schema.leadSubmissions.workspaceId, workspaceId), eq(schema.leadSubmissions.contactId, contactId)),
        ),
      db
        .select({
          status: schema.reviewRequests.status,
          sendAt: schema.reviewRequests.sendAt,
          sentAt: schema.reviewRequests.sentAt,
          clickedAt: schema.reviewRequests.clickedAt,
        })
        .from(schema.reviewRequests)
        .where(and(eq(schema.reviewRequests.workspaceId, workspaceId), eq(schema.reviewRequests.contactId, contactId))),
      db
        .select({ campaign: schema.metaLeads.campaignName, createdAt: schema.metaLeads.createdAt })
        .from(schema.metaLeads)
        .where(and(eq(schema.metaLeads.workspaceId, workspaceId), eq(schema.metaLeads.contactId, contactId))),
      db
        .select({
          nummerplade: schema.vehicles.plate,
          maerke: schema.vehicles.make,
          model: schema.vehicles.model,
          aargang: schema.vehicles.year,
          farve: schema.vehicles.color,
          noter: schema.vehicles.notes,
        })
        .from(schema.vehicles)
        .where(and(eq(schema.vehicles.workspaceId, workspaceId), eq(schema.vehicles.contactId, contactId))),
      db
        .select({
          ydelse: schema.bookings.serviceName,
          start: schema.bookings.startsAt,
          slut: schema.bookings.endsAt,
          status: schema.bookings.status,
          prisOre: schema.bookings.priceOre,
          besked: schema.bookings.customerNote,
          booketOnline: sql<boolean>`${schema.bookings.source} = 'ONLINE'`,
        })
        .from(schema.bookings)
        .where(and(eq(schema.bookings.workspaceId, workspaceId), eq(schema.bookings.contactId, contactId)))
        .orderBy(asc(schema.bookings.startsAt)),
    ]);

  const dealIds = deals.map((d) => d.id);
  const quotes = dealIds.length
    ? await db
        .select({
          id: schema.quotes.id,
          dealId: schema.quotes.dealId,
          number: schema.quotes.number,
          title: schema.quotes.title,
          status: schema.quotes.status,
          sentAt: schema.quotes.sentAt,
          viewedAt: schema.quotes.viewedAt,
          acceptedAt: schema.quotes.acceptedAt,
          acceptedName: schema.quotes.acceptedName,
          declinedAt: schema.quotes.declinedAt,
          declineReason: schema.quotes.declineReason,
        })
        .from(schema.quotes)
        .where(and(eq(schema.quotes.workspaceId, workspaceId), inArray(schema.quotes.dealId, dealIds)))
    : [];
  const quoteLines = quotes.length
    ? await db
        .select()
        .from(schema.quoteLines)
        .where(
          inArray(
            schema.quoteLines.quoteId,
            quotes.map((q) => q.id),
          ),
        )
        .orderBy(asc(schema.quoteLines.position))
    : [];
  const messages = conversations.length
    ? await db
        .select({
          conversationId: schema.messages.conversationId,
          direction: schema.messages.direction,
          text: schema.messages.text,
          sentAt: schema.messages.sentAt,
        })
        .from(schema.messages)
        .where(
          inArray(
            schema.messages.conversationId,
            conversations.map((c) => c.id),
          ),
        )
        .orderBy(asc(schema.messages.sentAt))
    : [];

  return {
    udtrukket: new Date().toISOString(),
    dataansvarlig: workspace,
    person: {
      navn: contact.name,
      email: contact.email,
      telefon: contact.phone,
      stilling: contact.title,
      status: contact.status,
      kilde: contact.source,
      virksomhed: company,
      frabedtEmails: contact.emailOptOutAt,
      oprettet: contact.createdAt,
      opdateret: contact.updatedAt,
      egneFelter: Object.fromEntries(customFields.map((f) => [f.label, formatCustomValue(f, contact.custom[f.id])])),
    },
    deals: deals.map(({ id, ...d }) => ({
      ...d,
      tilbud: quotes
        .filter((q) => q.dealId === id)
        .map((q) => ({
          nummer: q.number,
          titel: q.title,
          status: q.status,
          sendt: q.sentAt,
          aabnet: q.viewedAt,
          accepteret: q.acceptedAt,
          accepteretAf: q.acceptedName,
          afvist: q.declinedAt,
          begrundelse: q.declineReason,
          linjer: quoteLines
            .filter((l) => l.quoteId === q.id)
            .map((l) => ({
              beskrivelse: l.description,
              antal: l.quantity,
              enhed: l.unit,
              prisOre: l.unitPriceOre,
              rabatProcent: l.discountPct,
            })),
        })),
    })),
    aktiviteter: activities,
    opgaver: tasks,
    samtaler: conversations.map((c) => ({
      platform: c.platform,
      navn: c.name,
      beskeder: messages
        .filter((m) => m.conversationId === c.id)
        .map((m) => ({
          retning: m.direction === "IN" ? "fra personen" : "til personen",
          tekst: m.text,
          tidspunkt: m.sentAt,
        })),
    })),
    henvendelserFraKontaktformular: submissions,
    leadsFraMetaAnnoncer: metaLeads,
    anmodningerOmAnmeldelse: reviews,
    biler: vehicles,
    bookinger: bookings,
  };
}

/**
 * Sletter en person og alle data om personen: samtaler og beskeder, henvendelser,
 * aktiviteter, opgaver, anmodninger og private deals (deals uden virksomhed) inkl. tilbud.
 * Deals med en virksomhed bevares, men kobles fra personen.
 */
export async function deletePersonData(workspaceId: string, contactId: string) {
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.id, contactId)))
      .for("update")
      .limit(1);
    if (!contact) return false;

    const privateDeals = await tx
      .select({ id: schema.deals.id })
      .from(schema.deals)
      .where(
        and(
          eq(schema.deals.workspaceId, workspaceId),
          eq(schema.deals.contactId, contactId),
          isNull(schema.deals.companyId),
        ),
      );
    const hrefs: SQL[] = [like(schema.notifications.href, `/kunder/${contactId}%`)];
    for (const d of privateDeals) hrefs.push(like(schema.notifications.href, `/pipeline/${d.id}%`));
    const personBookings = await tx
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.workspaceId, workspaceId), eq(schema.bookings.contactId, contactId)));
    for (const b of personBookings) hrefs.push(like(schema.notifications.href, `/kalender/${b.id}%`));
    await tx.delete(schema.notifications).where(and(eq(schema.notifications.workspaceId, workspaceId), or(...hrefs)));
    await tx
      .delete(schema.conversations)
      .where(and(eq(schema.conversations.workspaceId, workspaceId), eq(schema.conversations.contactId, contactId)));
    await tx
      .delete(schema.leadSubmissions)
      .where(and(eq(schema.leadSubmissions.workspaceId, workspaceId), eq(schema.leadSubmissions.contactId, contactId)));
    if (privateDeals.length > 0) {
      await tx.delete(schema.deals).where(
        and(
          eq(schema.deals.workspaceId, workspaceId),
          inArray(
            schema.deals.id,
            privateDeals.map((d) => d.id),
          ),
        ),
      );
    }
    // Aktiviteter, opgaver, anmodninger, biler og bookinger slettes med kontakten (cascade).
    await tx.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
    return true;
  });
}

/** Leads uden nogen aktivitet i `months` måneder – de kandidater, oprydningen sletter. */
function staleLeadFilter(workspaceId: string, months: number) {
  const cutoff = sql`now() - make_interval(months => ${months})`;
  return and(
    eq(schema.contacts.workspaceId, workspaceId),
    eq(schema.contacts.status, "LEAD"),
    isNull(schema.contacts.awaitingSince),
    sql`${schema.contacts.createdAt} < ${cutoff}`,
    sql`${schema.contacts.updatedAt} < ${cutoff}`,
    sql`not exists (select 1 from ${schema.activities} a where a.contact_id = ${schema.contacts.id} and a.created_at >= ${cutoff})`,
    sql`not exists (select 1 from ${schema.deals} d where d.contact_id = ${schema.contacts.id} and (d.status = 'OPEN' or d.updated_at >= ${cutoff}))`,
    sql`not exists (select 1 from ${schema.tasks} t where t.contact_id = ${schema.contacts.id} and t.completed_at is null)`,
    sql`not exists (select 1 from ${schema.conversations} c where c.contact_id = ${schema.contacts.id} and c.last_message_at >= ${cutoff})`,
    sql`not exists (select 1 from ${schema.bookings} b where b.contact_id = ${schema.contacts.id} and (b.starts_at >= ${cutoff} or b.created_at >= ${cutoff}))`,
  );
}

export const RETENTION_OPTIONS = [12, 24, 36] as const;

export async function countStaleLeads(workspaceId: string, months: number) {
  const [{ n }] = await db.select({ n: count() }).from(schema.contacts).where(staleLeadFilter(workspaceId, months));
  return n;
}

/** Daglig oprydning: sletter gamle leads i de firmaer, der har slået det til. Returnerer antal. */
export async function cleanupStaleLeads() {
  const workspaces = await db
    .select({ id: schema.workspaces.id, months: schema.workspaces.leadRetentionMonths })
    .from(schema.workspaces)
    .where(isNotNull(schema.workspaces.leadRetentionMonths));
  let deleted = 0;
  for (const ws of workspaces) {
    if (!ws.months || ws.months < 6) continue;
    const stale = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(staleLeadFilter(ws.id, ws.months))
      .limit(500);
    for (const c of stale) {
      if (await deletePersonData(ws.id, c.id)) deleted++;
    }
  }
  return deleted;
}
