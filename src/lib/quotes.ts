import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { notify } from "./notify";
import { quoteTotals } from "./quote-math";
import { isUuid } from "./validation";

export type QuoteLine = typeof schema.quoteLines.$inferSelect;
export type Quote = typeof schema.quotes.$inferSelect;

export { formatOre, lineTotalOre, parseAmountOre, quoteTotals } from "./quote-math";

export function newQuoteToken() {
  return randomBytes(24).toString("base64url");
}

export async function nextQuoteNumber(workspaceId: string) {
  const [{ n }] = await db
    .select({ n: max(schema.quotes.number) })
    .from(schema.quotes)
    .where(eq(schema.quotes.workspaceId, workspaceId));
  return (n ?? 1000) + 1;
}

export async function getQuoteLines(quoteId: string) {
  return db
    .select()
    .from(schema.quoteLines)
    .where(eq(schema.quoteLines.quoteId, quoteId))
    .orderBy(asc(schema.quoteLines.position));
}

/** Tilbud i det aktive firma (til redigering). */
export async function getQuote(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [quote] = await db
    .select()
    .from(schema.quotes)
    .where(and(eq(schema.quotes.workspaceId, workspaceId), eq(schema.quotes.id, id)))
    .limit(1);
  return quote ?? null;
}

/**
 * Alt hvad den offentlige tilbudsside må vise – og intet andet. Kladder returneres kun med
 * `includeDrafts` (forhåndsvisning for firmaets egne medlemmer).
 */
export async function getPublicQuote(token: string, opts: { includeDrafts?: boolean } = {}) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      quote: schema.quotes,
      deal: schema.deals,
      contactName: schema.contacts.name,
      contactEmail: schema.contacts.email,
      companyName: schema.companies.name,
      companyAddress: schema.companies.address,
      seller: {
        name: schema.workspaces.name,
        cvr: schema.workspaces.cvr,
        address: schema.workspaces.address,
        email: schema.workspaces.email,
        phone: schema.workspaces.phone,
        website: schema.workspaces.website,
      },
    })
    .from(schema.quotes)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.quotes.dealId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.quotes.workspaceId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.deals.contactId))
    .leftJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .where(eq(schema.quotes.token, token))
    .limit(1);
  if (!row || (row.quote.status === "DRAFT" && !opts.includeDrafts)) return null;
  const lines = await getQuoteLines(row.quote.id);
  return { ...row, lines };
}

/** Tilbud på en deal med beløb, nyeste først. */
export async function getDealQuotes(workspaceId: string, dealId: string) {
  const quotes = await db
    .select()
    .from(schema.quotes)
    .where(and(eq(schema.quotes.workspaceId, workspaceId), eq(schema.quotes.dealId, dealId)))
    .orderBy(desc(schema.quotes.number));
  if (quotes.length === 0) return [];
  const lines = await db
    .select()
    .from(schema.quoteLines)
    .where(
      inArray(
        schema.quoteLines.quoteId,
        quotes.map((q) => q.id),
      ),
    );
  return quotes.map((q) => ({
    ...q,
    totals: quoteTotals(
      lines.filter((l) => l.quoteId === q.id),
      q.vatRate,
    ),
  }));
}

/** Modtagere af kundens svar: dealens ansvarlige og den der lavede tilbuddet – ellers administratorerne. */
export function quoteResponders(deal: { ownerId: string | null }, createdById: string | null) {
  const ids = [deal.ownerId, createdById].filter((x): x is string => Boolean(x));
  return ids.length > 0 ? { userIds: ids } : ("admins" as const);
}

/** Første gang kunden åbner et sendt tilbud: gem tidspunktet og giv sælgeren besked. */
export async function markQuoteViewed(quote: Quote, deal: { id: string; ownerId: string | null }) {
  if (quote.status !== "SENT" || quote.viewedAt) return;
  const [first] = await db
    .update(schema.quotes)
    .set({ viewedAt: new Date() })
    .where(and(eq(schema.quotes.id, quote.id), eq(schema.quotes.status, "SENT"), isNull(schema.quotes.viewedAt)))
    .returning({ id: schema.quotes.id });
  if (!first) return;
  await notify({
    workspaceId: quote.workspaceId,
    to: quoteResponders(deal, quote.createdById),
    type: "QUOTE_VIEWED",
    title: `Tilbud åbnet: ${quote.title}`,
    body: `Kunden har åbnet tilbud #${quote.number}. Et godt tidspunkt at følge op.`,
    href: `/pipeline/${deal.id}`,
  });
}

/** Er tilbuddets gyldighed udløbet? (sammenlignes med dagens dato i dansk tid) */
export function isExpired(quote: Pick<Quote, "validUntil">, today: string) {
  return Boolean(quote.validUntil && quote.validUntil < today);
}

export const QUOTE_STATUS_LABELS = {
  DRAFT: "Kladde",
  SENT: "Sendt",
  ACCEPTED: "Accepteret",
  DECLINED: "Afvist",
} as const;

export const QUOTE_STATUS_STYLES = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-sky-50 text-sky-800",
  ACCEPTED: "bg-emerald-50 text-emerald-800",
  DECLINED: "bg-red-50 text-red-700",
} as const;
