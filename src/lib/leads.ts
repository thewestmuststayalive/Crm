import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { LeadSource } from "@/db/schema";
import { markContactAwaiting } from "./awaiting";
import { logEvent } from "./crm";
import { todayIso } from "./labels";
import { notify } from "./notify";
import { getEntryStage } from "./pipelines";

export type IncomingLead = {
  workspaceId: string;
  source: LeadSource;
  /** Hvor henvendelsen kom fra, fx "kontaktformularen på eksempel.dk" eller "Meta Lead Ads". */
  channelLabel: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  message?: string | null;
  /** Ekstra felter, der skrives med i noten (fx svar fra en Meta-formular). */
  extra?: Record<string, string>;
  assigneeId?: string | null;
  createDeal?: boolean;
  dealTitle?: string;
};

function digits(phone: string) {
  return phone.replace(/\D/g, "");
}

/** Finder en eksisterende kontakt på e-mail eller telefonnummer, så vi undgår dubletter. */
async function findExistingContact(workspaceId: string, email?: string | null, phone?: string | null) {
  if (email) {
    const [row] = await db
      .select({ id: schema.contacts.id, companyId: schema.contacts.companyId })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.workspaceId, workspaceId), eq(sql`lower(${schema.contacts.email})`, email.toLowerCase())))
      .limit(1);
    if (row) return row;
  }
  const phoneDigits = phone ? digits(phone) : "";
  if (phoneDigits.length >= 8) {
    const [row] = await db
      .select({ id: schema.contacts.id, companyId: schema.contacts.companyId })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, workspaceId),
          // Sammenlign de sidste 8 cifre, så "+45 12 34 56 78" matcher "12345678".
          sql`right(regexp_replace(${schema.contacts.phone}, '\\D', '', 'g'), 8) = ${phoneDigits.slice(-8)}`,
        ),
      )
      .limit(1);
    if (row) return row;
  }
  return null;
}

async function findOrCreateCompany(workspaceId: string, name: string, ownerId: string | null) {
  const [existing] = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(and(eq(schema.companies.workspaceId, workspaceId), ilike(schema.companies.name, name)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(schema.companies)
    .values({ workspaceId, name, ownerId })
    .returning({ id: schema.companies.id });
  return created.id;
}

/**
 * Fælles indgang for alle nye leads (hjemmeside, Meta Lead Ads, Messenger …):
 * finder eller opretter kontakten, skriver henvendelsen på tidslinjen og
 * opretter evt. en deal og en opfølgningsopgave.
 */
export async function ingestLead(lead: IncomingLead) {
  const assigneeId = lead.assigneeId ?? null;
  const existing = await findExistingContact(lead.workspaceId, lead.email, lead.phone);

  let contactId: string;
  let companyId: string | null;
  if (existing) {
    contactId = existing.id;
    companyId = existing.companyId;
  } else {
    companyId = lead.companyName ? await findOrCreateCompany(lead.workspaceId, lead.companyName, assigneeId) : null;
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        workspaceId: lead.workspaceId,
        name: lead.name,
        email: lead.email?.toLowerCase() ?? null,
        phone: lead.phone ?? null,
        companyId,
        source: lead.source,
        status: "LEAD",
        ownerId: assigneeId,
      })
      .returning({ id: schema.contacts.id });
    contactId = contact.id;
  }

  const lines = [`Ny henvendelse via ${lead.channelLabel}.`];
  if (lead.message) lines.push("", lead.message);
  const extra = Object.entries(lead.extra ?? {}).filter(([, v]) => v);
  if (extra.length > 0) lines.push("", ...extra.map(([k, v]) => `${k}: ${v}`));
  if (existing) lines.push("", "(Kontakten fandtes i forvejen.)");

  await db.insert(schema.activities).values({
    workspaceId: lead.workspaceId,
    contactId,
    authorId: null,
    type: "SYSTEM",
    body: lines.join("\n").slice(0, 5000),
  });

  let dealId: string | null = null;
  // Skriver en eksisterende kontakt igen, genbruger vi en åben deal frem for at lave en ny.
  if (lead.createDeal && existing) {
    const [openDeal] = await db
      .select({ id: schema.deals.id })
      .from(schema.deals)
      .where(
        and(
          eq(schema.deals.workspaceId, lead.workspaceId),
          eq(schema.deals.contactId, contactId),
          eq(schema.deals.status, "OPEN"),
        ),
      )
      .limit(1);
    dealId = openDeal?.id ?? null;
  }
  if (lead.createDeal && !dealId) {
    const stage = await getEntryStage(lead.workspaceId);
    const [deal] = await db
      .insert(schema.deals)
      .values({
        workspaceId: lead.workspaceId,
        title: lead.dealTitle ?? `Henvendelse: ${lead.name}`,
        contactId,
        companyId,
        ownerId: assigneeId,
        source: lead.source,
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        status: stage.kind,
      })
      .returning({ id: schema.deals.id });
    dealId = deal.id;
    await logEvent(lead.workspaceId, null, `Deal oprettet automatisk fra ${lead.channelLabel}`, {
      dealId,
      contactId,
    });
  }

  if (assigneeId) {
    await db.insert(schema.tasks).values({
      workspaceId: lead.workspaceId,
      title: `Følg op på henvendelse fra ${lead.name}`,
      dueDate: todayIso(),
      assigneeId,
      contactId,
      dealId,
    });
  }

  // Kontakten venter nu på svar, og den ansvarlige (ellers administratorerne) får besked.
  await markContactAwaiting(lead.workspaceId, contactId);
  await notify({
    workspaceId: lead.workspaceId,
    to: assigneeId ? { userIds: [assigneeId] } : "admins",
    type: "NEW_LEAD",
    title: existing ? `${lead.name} har skrevet igen` : `Nyt lead: ${lead.name}`,
    body: [`Via ${lead.channelLabel}.`, lead.message?.slice(0, 300)].filter(Boolean).join(" "),
    href: `/kunder/${contactId}`,
    email: true,
  });

  return { contactId, dealId, existing: Boolean(existing) };
}
