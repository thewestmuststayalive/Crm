"use server";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ProspectStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole, requireWorkspace } from "@/lib/auth";
import { isMemberOf } from "@/lib/crm";
import { parseKroner } from "@/lib/deals";
import { COMPANY_SIZES, searchCvr, type CompanySize } from "@/lib/lead-sources/cvr-search";
import { googleConfigured, LeadSourceError, searchGooglePlaces } from "@/lib/lead-sources/google";
import { getEntryStage } from "@/lib/pipelines";
import {
  getProspect,
  getProspectList,
  getSearchUsage,
  markKnown,
  PROSPECT_STATUSES,
  prospectInputSchema,
  reserveGoogleRequest,
  saveProspects,
  type ProspectInput,
} from "@/lib/prospects";
import { addDays, isIsoDate, localDate } from "@/lib/time";
import { isUuid, optionalText } from "@/lib/validation";
import { checkWebsite } from "@/lib/website-check";
import { pickValues, type ActionState } from "./types";

export type SearchResult = {
  error?: string;
  results?: (ProspectInput & { saved: boolean; customer: boolean })[];
  nextPageToken?: string | null;
  nextFrom?: number | null;
  total?: number;
  usage?: { used: number; limit: number };
};

const failure = (error: unknown): SearchResult => ({
  error: error instanceof LeadSourceError ? error.message : "Søgningen fejlede. Prøv igen om lidt.",
});

// ---------------------------------------------------------------------------
// Søgning
// ---------------------------------------------------------------------------

/** Søger i Google Maps. Hver side (op til 20 firmaer) tæller med i månedens loft. */
export async function runGoogleSearch(query: string, pageToken: string | null = null): Promise<SearchResult> {
  const { workspace } = await requireWorkspace();
  const q = String(query ?? "").trim();
  if (q.length < 2 || q.length > 120) return { error: "Skriv hvad du søger efter, fx \"frisør Aarhus\"." };
  const token = typeof pageToken === "string" && pageToken.length <= 2000 ? pageToken : null;
  if (!googleConfigured()) return { error: "Google Maps-søgning er ikke sat op endnu. Se vejledningen nedenfor." };
  if (!(await reserveGoogleRequest(workspace.id))) {
    const usage = await getSearchUsage(workspace.id);
    return {
      error: `Månedens loft på ${usage.limit} søgninger er nået. En administrator kan hæve det på siden Find leads.`,
      usage,
    };
  }
  try {
    const { results, nextPageToken } = await searchGooglePlaces(q, token);
    const [marked, usage] = await Promise.all([markKnown(workspace.id, results), getSearchUsage(workspace.id)]);
    return { results: marked, nextPageToken, usage };
  } catch (error) {
    return { ...failure(error), usage: await getSearchUsage(workspace.id) };
  }
}

const cvrFilterSchema = z.object({
  industry: optionalText(120),
  postcodes: optionalText(20),
  form: z.enum(["", "10", "30", "60", "80"]).default(""),
  size: z.enum(["", ...(Object.keys(COMPANY_SIZES) as CompanySize[])]).default(""),
  foundedMonths: z.enum(["", "1", "3", "6", "12", "24"]).default(""),
  name: optionalText(120),
});
export type CvrSearchInput = z.input<typeof cvrFilterSchema>;

/** Postnummer som "8000" eller interval som "8000-8270". */
function parsePostcodes(input: string | null) {
  if (!input) return { postFrom: null, postTo: null };
  const m = input.replace(/\s/g, "").match(/^(\d{4})(?:[-–](\d{4}))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return { postFrom: Math.min(a, b), postTo: Math.max(a, b) };
}

export async function runCvrSearch(input: CvrSearchInput, from = 0): Promise<SearchResult> {
  const { workspace } = await requireWorkspace();
  const parsed = cvrFilterSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: "Tjek filtrene og prøv igen." };
  const f = parsed.data;
  const post = parsePostcodes(f.postcodes);
  if (!post) return { error: "Skriv et postnummer (fx 8000) eller et interval (fx 8000-8270)." };
  if (!f.industry && !post.postFrom && !f.name && !f.foundedMonths) {
    return { error: "Vælg mindst én ting at søge på: branche, postnummer, navn eller nystartede." };
  }
  const offset = Number.isInteger(from) && from >= 0 && from < 3000 ? from : 0;
  const today = localDate(new Date());
  try {
    const { results, total, nextFrom } = await searchCvr(
      {
        industry: f.industry,
        ...post,
        form: f.form || null,
        size: (f.size || null) as CompanySize | null,
        foundedAfter: f.foundedMonths ? addDays(today, -Math.round(Number(f.foundedMonths) * 30.4)) : null,
        name: f.name,
      },
      offset,
    );
    return { results: await markKnown(workspace.id, results), total, nextFrom };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Lister
// ---------------------------------------------------------------------------

const listNameSchema = z.string().trim().min(1, "Giv listen et navn").max(80, "Højst 80 tegn");

export async function createList(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  const parsed = listNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: pickValues(formData, ["name"]) };
  const [list] = await db
    .insert(schema.prospectLists)
    .values({ workspaceId: workspace.id, name: parsed.data, createdById: user.id })
    .returning({ id: schema.prospectLists.id });
  revalidatePath("/leads");
  redirect(`/leads/${list.id}`);
}

export async function deleteList(formData: FormData) {
  const { user, workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const list = await getProspectList(workspace.id, id);
  if (!list) return;
  await db
    .delete(schema.prospectLists)
    .where(and(eq(schema.prospectLists.workspaceId, workspace.id), eq(schema.prospectLists.id, id)));
  await audit(workspace.id, user.id, "Slettede lead-liste", list.name);
  revalidatePath("/leads");
  redirect("/leads");
}

/** Gemmer valgte søgeresultater i en eksisterende eller ny liste. */
export async function saveResults(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  let items: ProspectInput[];
  try {
    const raw: unknown = JSON.parse(String(formData.get("items") ?? "[]"));
    const parsed = z.array(prospectInputSchema).max(100).safeParse(raw);
    if (!parsed.success) return { error: "Resultaterne kunne ikke læses. Søg igen." };
    items = parsed.data.filter((i) => i.source !== "MANUAL");
  } catch {
    return { error: "Resultaterne kunne ikke læses. Søg igen." };
  }
  if (items.length === 0) return { error: "Vælg mindst ét firma." };

  let listId = formData.get("listId");
  let listName: string;
  if (isUuid(listId)) {
    const list = await getProspectList(workspace.id, listId);
    if (!list) return { error: "Listen findes ikke." };
    listName = list.name;
  } else {
    const parsed = listNameSchema.safeParse(formData.get("newList"));
    if (!parsed.success) return { error: "Vælg en liste eller skriv et navn til en ny liste." };
    const [list] = await db
      .insert(schema.prospectLists)
      .values({ workspaceId: workspace.id, name: parsed.data, createdById: user.id })
      .returning({ id: schema.prospectLists.id });
    listId = list.id;
    listName = parsed.data;
  }
  const saved = await saveProspects(workspace.id, listId, items);
  const skipped = items.length - saved;
  revalidatePath("/leads");
  revalidatePath(`/leads/${listId}`);
  return {
    success:
      `${saved} ${saved === 1 ? "firma" : "firmaer"} gemt i "${listName}".` +
      (skipped > 0 ? ` ${skipped} lå allerede i en liste og blev sprunget over.` : ""),
    values: { listId },
  };
}

const manualSchema = z.object({
  name: z.string().trim().min(1, "Skriv firmaets navn").max(200),
  phone: optionalText(40),
  website: optionalText(500),
  address: optionalText(300),
  cvr: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^\d{8}$/.test(v), "CVR-nummeret skal have 8 cifre")
    .transform((v) => (v === "" ? null : v)),
});

export async function addManualProspect(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const values = pickValues(formData, ["name", "phone", "website", "address", "cvr"]);
  const listId = formData.get("listId");
  if (!isUuid(listId) || !(await getProspectList(workspace.id, listId))) notFound();
  const parsed = manualSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  await db.insert(schema.prospects).values({ workspaceId: workspace.id, listId, source: "MANUAL", ...parsed.data });
  revalidatePath(`/leads/${listId}`);
  return { success: `${parsed.data.name} er tilføjet.` };
}

// ---------------------------------------------------------------------------
// Opfølgning
// ---------------------------------------------------------------------------

const CONTACTED: ProspectStatus[] = ["CALLED", "CALL_BACK", "INTERESTED", "NOT_INTERESTED"];

async function loadProspect(id: unknown) {
  const { user, workspace } = await requireWorkspace();
  if (!isUuid(id)) notFound();
  const row = await getProspect(workspace.id, id);
  if (!row) notFound();
  return { user, workspace, prospect: row.prospect, listName: row.listName };
}

function revalidateProspect(p: { id: string; listId: string }) {
  revalidatePath(`/leads/${p.listId}`);
  revalidatePath(`/leads/firma/${p.id}`);
  revalidatePath("/leads");
}

const updateSchema = z.object({
  status: z.enum(PROSPECT_STATUSES),
  notes: optionalText(5000),
  callBackDate: z
    .string()
    .trim()
    .refine((v) => v === "" || isIsoDate(v), "Ugyldig dato")
    .transform((v) => (v === "" ? null : v)),
  ownerId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || isUuid(v), "Ugyldig ansvarlig"),
});

/** Gemmer status, noter, ansvarlig og dato for "Ring igen" (som også bliver til en opgave). */
export async function updateProspect(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace, prospect } = await loadProspect(formData.get("id"));
  const values = pickValues(formData, ["status", "notes", "callBackDate", "ownerId"]);
  const parsed = updateSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const d = parsed.data;
  if (d.status === "CONVERTED" && prospect.status !== "CONVERTED") {
    return { error: 'Brug knappen "Gør til kunde" for at oprette firmaet i CRM\'et.', values };
  }
  if (d.status === "CALL_BACK" && !d.callBackDate) return { error: "Vælg hvornår der skal ringes igen.", values };
  if (d.ownerId && !(await isMemberOf(workspace.id, d.ownerId))) return { error: "Ugyldig ansvarlig.", values };

  const callBackDate = d.status === "CALL_BACK" ? d.callBackDate : null;
  const statusChanged = d.status !== prospect.status;
  await db
    .update(schema.prospects)
    .set({
      status: d.status,
      notes: d.notes,
      ownerId: d.ownerId,
      callBackDate,
      lastContactedAt: statusChanged && CONTACTED.includes(d.status) ? new Date() : prospect.lastContactedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.prospects.workspaceId, workspace.id), eq(schema.prospects.id, prospect.id)));

  // "Ring igen" bliver til en opgave med frist, så den dukker op under Opgaver og på forsiden.
  let taskNote = "";
  if (callBackDate && (statusChanged || callBackDate !== prospect.callBackDate)) {
    await db.insert(schema.tasks).values({
      workspaceId: workspace.id,
      title: `Ring til ${prospect.name}${prospect.phone ? ` (${prospect.phone})` : ""}`.slice(0, 200),
      dueDate: callBackDate,
      assigneeId: d.ownerId ?? user.id,
      createdById: user.id,
    });
    taskNote = " Der er oprettet en opgave.";
  }
  revalidateProspect(prospect);
  revalidatePath("/opgaver");
  return { success: `Gemt.${taskNote}` };
}

/** Hurtigt statusskift direkte fra listen. */
export async function setProspectStatus(formData: FormData) {
  const { workspace, prospect } = await loadProspect(formData.get("id"));
  const status = formData.get("status");
  const quick: ProspectStatus[] = ["NEW", "CALLED", "INTERESTED", "NOT_INTERESTED"];
  if (!quick.includes(status as ProspectStatus) || prospect.status === "CONVERTED") return;
  const next = status as ProspectStatus;
  await db
    .update(schema.prospects)
    .set({
      status: next,
      callBackDate: null,
      lastContactedAt: next !== prospect.status && CONTACTED.includes(next) ? new Date() : prospect.lastContactedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.prospects.workspaceId, workspace.id), eq(schema.prospects.id, prospect.id)));
  revalidateProspect(prospect);
}

export async function deleteProspect(formData: FormData) {
  const { workspace, prospect } = await loadProspect(formData.get("id"));
  await db
    .delete(schema.prospects)
    .where(and(eq(schema.prospects.workspaceId, workspace.id), eq(schema.prospects.id, prospect.id)));
  revalidateProspect(prospect);
  redirect(`/leads/${prospect.listId}`);
}

// ---------------------------------------------------------------------------
// Hjemmeside-tjek
// ---------------------------------------------------------------------------

async function storeCheck(workspaceId: string, id: string, website: string | null) {
  const result = await checkWebsite(website);
  await db
    .update(schema.prospects)
    .set({ websiteCheck: result, websiteCheckedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.prospects.workspaceId, workspaceId), eq(schema.prospects.id, id)));
  return result;
}

export async function checkProspectWebsite(formData: FormData) {
  const { workspace, prospect } = await loadProspect(formData.get("id"));
  await storeCheck(workspace.id, prospect.id, prospect.website);
  revalidateProspect(prospect);
}

const BATCH = 10;

/** Tjekker op til 10 hjemmesider ad gangen i en liste (4 samtidigt), så siden ikke venter for længe. */
export async function checkListWebsites(formData: FormData) {
  const { workspace } = await requireWorkspace();
  const listId = formData.get("listId");
  if (!isUuid(listId) || !(await getProspectList(workspace.id, listId))) notFound();
  const where = and(
    eq(schema.prospects.workspaceId, workspace.id),
    eq(schema.prospects.listId, listId),
    isNull(schema.prospects.websiteCheckedAt),
  );
  // Firmaer uden hjemmeside kræver intet opslag og markeres med det samme.
  const none = await checkWebsite(null);
  await db
    .update(schema.prospects)
    .set({ websiteCheck: none, websiteCheckedAt: new Date() })
    .where(and(where, isNull(schema.prospects.website)));
  const todo = await db
    .select({ id: schema.prospects.id, website: schema.prospects.website })
    .from(schema.prospects)
    .where(and(where, isNotNull(schema.prospects.website)))
    .limit(BATCH);
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        await storeCheck(workspace.id, item.id, item.website);
      }
    }),
  );
  const left = await db.$count(schema.prospects, and(where, isNotNull(schema.prospects.website)));
  revalidatePath(`/leads/${listId}`);
  redirect(`/leads/${listId}?tjekket=${todo.length}&mangler=${left}`);
}

// ---------------------------------------------------------------------------
// Gør til kunde
// ---------------------------------------------------------------------------

const convertSchema = z.object({
  contactName: optionalText(200),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Ugyldig e-mail")
    .transform((v) => (v === "" ? null : v)),
  dealValue: z.string().trim().max(30),
});

/** Opretter leadet som virksomhed (og evt. kontakt og deal) i CRM'et. */
export async function convertProspect(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace, prospect, listName } = await loadProspect(formData.get("id"));
  if (prospect.status === "CONVERTED" && prospect.convertedCompanyId) {
    redirect(`/virksomheder/${prospect.convertedCompanyId}`);
  }
  const values = pickValues(formData, ["contactName", "contactEmail", "dealValue"]);
  const parsed = convertSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const createDeal = formData.get("createDeal") === "on";
  const dealValue = createDeal ? parseKroner(parsed.data.dealValue) : 0;
  if (dealValue === null) return { error: "Ugyldigt beløb.", values };
  const stage = createDeal ? await getEntryStage(workspace.id) : null;
  const ownerId = prospect.ownerId ?? user.id;

  const check = prospect.websiteCheck;
  const noteLines = [
    `Fundet via leadsøgning (${listName}).`,
    prospect.notes ? `Noter: ${prospect.notes}` : null,
    check?.ok ? `Hjemmeside-tjek: ${check.score}/100. ${check.angles.join(". ")}.` : null,
  ].filter(Boolean);

  const companyId = await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(schema.companies)
      .values({
        workspaceId: workspace.id,
        name: prospect.name,
        cvr: prospect.cvr,
        phone: prospect.phone,
        website: prospect.website,
        address: prospect.address,
        ownerId,
      })
      .returning({ id: schema.companies.id });
    let contactId: string | null = null;
    if (parsed.data.contactName) {
      const [contact] = await tx
        .insert(schema.contacts)
        .values({
          workspaceId: workspace.id,
          companyId: company.id,
          name: parsed.data.contactName,
          email: parsed.data.contactEmail,
          phone: prospect.phone,
          status: "LEAD",
          source: "PROSPECTING",
          ownerId,
        })
        .returning({ id: schema.contacts.id });
      contactId = contact.id;
    }
    await tx.insert(schema.activities).values({
      workspaceId: workspace.id,
      companyId: company.id,
      authorId: user.id,
      type: "NOTE",
      body: noteLines.join("\n"),
    });
    if (stage) {
      await tx.insert(schema.deals).values({
        workspaceId: workspace.id,
        title: prospect.name,
        value: dealValue,
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        status: stage.kind,
        contactId,
        companyId: company.id,
        ownerId,
        source: "PROSPECTING",
      });
    }
    await tx
      .update(schema.prospects)
      .set({ status: "CONVERTED", convertedCompanyId: company.id, updatedAt: new Date() })
      .where(and(eq(schema.prospects.workspaceId, workspace.id), eq(schema.prospects.id, prospect.id)));
    return company.id;
  });
  await audit(workspace.id, user.id, "Gjorde lead til kunde", prospect.name);
  revalidateProspect(prospect);
  revalidatePath("/virksomheder");
  redirect(`/virksomheder/${companyId}`);
}

// ---------------------------------------------------------------------------
// Indstillinger
// ---------------------------------------------------------------------------

export async function updateLeadSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  const values = pickValues(formData, ["limit"]);
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 0 || limit > 5000) {
    return { error: "Skriv et helt tal mellem 0 og 5000.", values };
  }
  await db.update(schema.workspaces).set({ leadSearchMonthlyLimit: limit }).where(eq(schema.workspaces.id, workspace.id));
  await audit(workspace.id, user.id, "Ændrede loft for Google-søgninger", `${limit} pr. måned`);
  revalidatePath("/leads");
  return { success: `Loftet er sat til ${limit} søgninger pr. måned.` };
}
