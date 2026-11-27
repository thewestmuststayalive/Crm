import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { InvoiceLine, InvoiceStatus } from "@/db/schema";
import { getBookedInvoice, getEconomicConnection } from "./economic";
import { todayIso } from "./labels";
import { notify } from "./notify";
import { isUuid } from "./validation";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Kladde",
  ECONOMIC_DRAFT: "Kladde i e-conomic",
  BOOKED: "Sendt",
  PAID: "Betalt",
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus | "OVERDUE", string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ECONOMIC_DRAFT: "bg-sky-50 text-sky-800",
  BOOKED: "bg-amber-50 text-amber-800",
  PAID: "bg-emerald-50 text-emerald-800",
  OVERDUE: "bg-rose-50 text-rose-700",
};

export function newInvoiceToken() {
  return randomBytes(24).toString("base64url");
}

/** Forfalden: sendt, ikke betalt, og forfaldsdatoen er passeret. */
export function isOverdue(inv: { status: InvoiceStatus; dueDate: string | null }, today = todayIso()) {
  return inv.status === "BOOKED" && inv.dueDate !== null && inv.dueDate < today;
}

export function statusLabel(inv: { status: InvoiceStatus; dueDate: string | null }) {
  return isOverdue(inv) ? "Forfalden" : INVOICE_STATUS_LABELS[inv.status];
}

export function statusStyle(inv: { status: InvoiceStatus; dueDate: string | null }) {
  return INVOICE_STATUS_STYLES[isOverdue(inv) ? "OVERDUE" : inv.status];
}

/** Forhåndsvisning i Kundespor (25 % moms). Det endelige beløb beregnes af e-conomic. */
export function previewTotals(lines: InvoiceLine[], vatPct = 25) {
  const net = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPriceOre), 0);
  const vat = Math.round((net * vatPct) / 100);
  return { net, vat, gross: net + vat };
}

export async function getInvoice(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      invoice: schema.invoices,
      companyName: schema.companies.name,
      contactName: schema.contacts.name,
    })
    .from(schema.invoices)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.invoices.companyId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.invoices.contactId))
    .where(and(eq(schema.invoices.workspaceId, workspaceId), eq(schema.invoices.id, id)))
    .limit(1);
  return row ?? null;
}

export type InvoiceFilter = "all" | "drafts" | "open" | "overdue" | "paid";

export async function getInvoices(
  workspaceId: string,
  opts: { filter?: InvoiceFilter; companyId?: string; contactId?: string; dealId?: string } = {},
) {
  const today = todayIso();
  const f = opts.filter ?? "all";
  const statusWhere =
    f === "drafts"
      ? inArray(schema.invoices.status, ["DRAFT", "ECONOMIC_DRAFT"])
      : f === "open"
        ? eq(schema.invoices.status, "BOOKED")
        : f === "overdue"
          ? and(eq(schema.invoices.status, "BOOKED"), sql`${schema.invoices.dueDate} < ${today}`)
          : f === "paid"
            ? eq(schema.invoices.status, "PAID")
            : undefined;
  return db
    .select({
      id: schema.invoices.id,
      status: schema.invoices.status,
      heading: schema.invoices.heading,
      economicNumber: schema.invoices.economicNumber,
      date: schema.invoices.date,
      dueDate: schema.invoices.dueDate,
      grossOre: schema.invoices.grossOre,
      remainderOre: schema.invoices.remainderOre,
      lines: schema.invoices.lines,
      createdAt: schema.invoices.createdAt,
      customer: sql<string>`coalesce(${schema.companies.name}, ${schema.contacts.name}, '–')`,
    })
    .from(schema.invoices)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.invoices.companyId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.invoices.contactId))
    .where(
      and(
        eq(schema.invoices.workspaceId, workspaceId),
        statusWhere,
        opts.companyId ? eq(schema.invoices.companyId, opts.companyId) : undefined,
        opts.contactId ? eq(schema.invoices.contactId, opts.contactId) : undefined,
        opts.dealId ? eq(schema.invoices.dealId, opts.dealId) : undefined,
      ),
    )
    .orderBy(desc(schema.invoices.createdAt))
    .limit(500);
}

/** Udestående og forfaldent beløb for firmaet (til oversigten). */
export async function getInvoiceSummary(workspaceId: string) {
  const today = todayIso();
  const [row] = await db
    .select({
      open: sql<number>`coalesce(sum(${schema.invoices.remainderOre}) filter (where ${schema.invoices.status} = 'BOOKED'), 0)::bigint`,
      overdue: sql<number>`coalesce(sum(${schema.invoices.remainderOre}) filter (where ${schema.invoices.status} = 'BOOKED' and ${schema.invoices.dueDate} < ${today}), 0)::bigint`,
      drafts: sql<number>`count(*) filter (where ${schema.invoices.status} in ('DRAFT', 'ECONOMIC_DRAFT'))::int`,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.workspaceId, workspaceId));
  return { open: Number(row?.open ?? 0), overdue: Number(row?.overdue ?? 0), drafts: row?.drafts ?? 0 };
}

export async function getPublicInvoice(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      invoice: schema.invoices,
      workspace: {
        id: schema.workspaces.id,
        name: schema.workspaces.name,
        address: schema.workspaces.address,
        cvr: schema.workspaces.cvr,
        email: schema.workspaces.email,
        phone: schema.workspaces.phone,
      },
      customer: sql<string>`coalesce(${schema.companies.name}, ${schema.contacts.name}, '')`,
    })
    .from(schema.invoices)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.invoices.workspaceId))
    .leftJoin(schema.companies, eq(schema.companies.id, schema.invoices.companyId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.invoices.contactId))
    .where(and(eq(schema.invoices.token, token), inArray(schema.invoices.status, ["BOOKED", "PAID"])))
    .limit(1);
  return row ?? null;
}

/** Markerer en faktura som betalt og giver den, der oprettede den, besked. */
export async function markInvoicePaid(workspaceId: string, invoiceId: string) {
  const [paid] = await db
    .update(schema.invoices)
    .set({ status: "PAID", paidAt: new Date(), remainderOre: 0, updatedAt: new Date() })
    .where(
      and(
        eq(schema.invoices.workspaceId, workspaceId),
        eq(schema.invoices.id, invoiceId),
        eq(schema.invoices.status, "BOOKED"),
      ),
    )
    .returning({ number: schema.invoices.economicNumber, createdById: schema.invoices.createdById });
  if (!paid) return false;
  await notify({
    workspaceId,
    to: paid.createdById ? { userIds: [paid.createdById] } : "admins",
    type: "INVOICE_PAID",
    title: `Faktura ${paid.number ?? ""} er betalt`.replace("  ", " "),
    href: `/fakturaer/${invoiceId}`,
  });
  return true;
}

/** Henter restbeløbet fra e-conomic. Er det 0, er fakturaen betalt. */
export async function syncInvoice(workspaceId: string, invoiceId: string) {
  const [inv] = await db
    .select({ id: schema.invoices.id, number: schema.invoices.economicNumber, status: schema.invoices.status })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.workspaceId, workspaceId), eq(schema.invoices.id, invoiceId)))
    .limit(1);
  if (!inv?.number || inv.status !== "BOOKED") return null;
  const conn = await getEconomicConnection(workspaceId);
  if (!conn) return null;
  const booked = await getBookedInvoice(conn, inv.number);
  await db
    .update(schema.invoices)
    .set({ remainderOre: booked.remainderOre, dueDate: booked.dueDate, syncedAt: new Date() })
    .where(eq(schema.invoices.id, inv.id));
  if (booked.remainderOre <= 0) await markInvoicePaid(workspaceId, inv.id);
  return booked;
}

/** Daglig kørsel: opdater status på alle sendte, ubetalte fakturaer. */
export async function syncOpenInvoices() {
  const open = await db
    .select({ id: schema.invoices.id, workspaceId: schema.invoices.workspaceId })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.status, "BOOKED"), isNotNull(schema.invoices.economicNumber)))
    .limit(500);
  let paid = 0;
  for (const inv of open) {
    try {
      const booked = await syncInvoice(inv.workspaceId, inv.id);
      if (booked && booked.remainderOre <= 0) paid++;
    } catch (error) {
      console.error("Synk af faktura fejlede", inv.id, error);
    }
  }
  return { checked: open.length, paid };
}
