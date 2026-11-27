import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { EconomicSettings, InvoiceLine } from "@/db/schema";
import { decrypt } from "./crypto";

// Integration med Visma e-conomic (REST API). Kundespor er én "app" hos e-conomic:
//   ECONOMIC_APP_SECRET_TOKEN – appens hemmelige nøgle (Vercel)
//   ECONOMIC_APP_PUBLIC_TOKEN – bruges i linket, hvor firmaet giver adgang
// Hvert firma (workspace) giver adgang til sin egen e-conomic-aftale; det giver et
// "AgreementGrantToken", som gemmes krypteret i economic_connections.
// ECONOMIC_API_URL og ECONOMIC_CONNECT_URL bruges kun i tests.
// Kun abonnementer fra "Plus" og op må oprette data via API'et; "Basis" kan kun læse.

export class EconomicError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

const apiBase = () => (process.env.ECONOMIC_API_URL ?? "https://restapi.e-conomic.com").replace(/\/$/, "");

export function economicConfigured() {
  return Boolean(process.env.ECONOMIC_APP_SECRET_TOKEN && process.env.ECONOMIC_APP_PUBLIC_TOKEN);
}

/** Linket, hvor en administrator logger ind i e-conomic og giver Kundespor adgang. */
export function installationUrl(redirectUrl: string) {
  const base = process.env.ECONOMIC_CONNECT_URL ?? "https://secure.e-conomic.com/secure/api1/requestaccess.aspx";
  const url = new URL(base);
  url.searchParams.set("appPublicToken", process.env.ECONOMIC_APP_PUBLIC_TOKEN ?? "");
  url.searchParams.set("redirectUrl", redirectUrl);
  url.searchParams.set("locale", "da-DK");
  return url.toString();
}

/** Abonnementer, der ikke må oprette fakturaer via API'et. */
export function isReadOnlyPlan(level: string | null | undefined) {
  return ["basis", "internal"].includes((level ?? "").toLowerCase());
}

type ErrorBody = { message?: string; title?: string; detail?: string; errorCode?: string; errors?: unknown };

function friendlyError(status: number, body: ErrorBody | null) {
  const code = body?.errorCode ?? "";
  if (code === "LicenseIsReadOnly" || /read-only/i.test(body?.title ?? "")) {
    return "Jeres e-conomic-abonnement tillader ikke, at andre programmer opretter fakturaer. Det kræver e-conomic Plus eller højere.";
  }
  if (status === 401) return "Forbindelsen til e-conomic virker ikke længere. Forbind e-conomic igen under Indstillinger → Regnskab.";
  if (status === 403) return "e-conomic afviste handlingen. Tjek at Kundespor har adgang til aftalen.";
  if (status === 429) return "e-conomic har for travlt lige nu. Prøv igen om et øjeblik.";
  const detail = body?.message ?? body?.detail ?? body?.title;
  return detail ? `e-conomic svarede: ${String(detail).slice(0, 300)}` : "e-conomic svarede med en fejl. Prøv igen.";
}

async function call<T>(grantToken: string, method: string, path: string, body?: unknown): Promise<T> {
  const secret = process.env.ECONOMIC_APP_SECRET_TOKEN;
  if (!secret) throw new EconomicError("e-conomic er ikke sat op endnu.");
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        "X-AppSecretToken": secret,
        "X-AgreementGrantToken": grantToken,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new EconomicError("e-conomic svarede ikke. Prøv igen om lidt.");
  }
  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as ErrorBody | null;
    console.error("e-conomic fejl", method, path, res.status, JSON.stringify(parsed ?? {}).slice(0, 800));
    throw new EconomicError(friendlyError(res.status, parsed), res.status);
  }
  return (await res.json()) as T;
}

async function callPdf(grantToken: string, path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: {
      "X-AppSecretToken": process.env.ECONOMIC_APP_SECRET_TOKEN ?? "",
      "X-AgreementGrantToken": grantToken,
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new EconomicError(friendlyError(res.status, null), res.status);
  return res.arrayBuffer();
}

// ---------------------------------------------------------------------------
// Forbindelse og opslag
// ---------------------------------------------------------------------------

export type EconomicSelf = {
  agreementNumber: number;
  companyName: string | null;
  cvr: string | null;
  planLevel: string | null;
};

export async function getSelf(grantToken: string): Promise<EconomicSelf> {
  const self = await call<{
    agreementNumber: number;
    agreementType?: { subscriptionPlanLevel?: string };
    company?: { name?: string; companyIdentificationNumber?: string };
  }>(grantToken, "GET", "/self");
  return {
    agreementNumber: self.agreementNumber,
    companyName: self.company?.name ?? null,
    cvr: self.company?.companyIdentificationNumber ?? null,
    planLevel: self.agreementType?.subscriptionPlanLevel ?? null,
  };
}

export type EconomicConnection = {
  grantToken: string;
  settings: EconomicSettings;
  companyName: string | null;
  agreementNumber: number | null;
  planLevel: string | null;
};

export async function getEconomicConnection(workspaceId: string): Promise<EconomicConnection | null> {
  const [row] = await db
    .select()
    .from(schema.economicConnections)
    .where(eq(schema.economicConnections.workspaceId, workspaceId))
    .limit(1);
  if (!row) return null;
  return {
    grantToken: decrypt(row.grantTokenEnc),
    settings: row.settings ?? {},
    companyName: row.companyName,
    agreementNumber: row.agreementNumber,
    planLevel: row.planLevel,
  };
}

/** Mangler der standardvalg, før der kan laves fakturaer? */
export function missingSettings(s: EconomicSettings) {
  const missing: string[] = [];
  if (!s.layoutNumber) missing.push("layout");
  if (!s.paymentTermsNumber) missing.push("betalingsbetingelse");
  if (!s.customerGroupNumber) missing.push("kundegruppe");
  if (!s.vatZoneNumber) missing.push("momszone");
  if (!s.productNumber) missing.push("vare");
  return missing;
}

type Collection<T> = { collection: T[] };

export async function getEconomicOptions(grantToken: string) {
  const [layouts, terms, groups, zones, products] = await Promise.all([
    call<Collection<{ layoutNumber: number; name: string }>>(grantToken, "GET", "/layouts?pagesize=1000"),
    call<Collection<{ paymentTermsNumber: number; name: string }>>(grantToken, "GET", "/payment-terms?pagesize=1000"),
    call<Collection<{ customerGroupNumber: number; name: string }>>(grantToken, "GET", "/customer-groups?pagesize=1000"),
    call<Collection<{ vatZoneNumber: number; name: string; enabledForCustomer?: boolean }>>(grantToken, "GET", "/vat-zones"),
    call<Collection<{ productNumber: string; name: string; barred?: boolean }>>(
      grantToken,
      "GET",
      "/products?pagesize=1000&filter=barred$eq:false",
    ),
  ]);
  return {
    layouts: layouts.collection.map((l) => ({ value: String(l.layoutNumber), label: l.name })),
    paymentTerms: terms.collection.map((t) => ({ value: String(t.paymentTermsNumber), label: t.name })),
    customerGroups: groups.collection.map((g) => ({ value: String(g.customerGroupNumber), label: g.name })),
    vatZones: zones.collection
      .filter((z) => z.enabledForCustomer !== false)
      .map((z) => ({ value: String(z.vatZoneNumber), label: VAT_ZONE_LABELS[z.name] ?? z.name })),
    products: products.collection.map((p) => ({ value: p.productNumber, label: `${p.productNumber} · ${p.name}` })),
  };
}

const VAT_ZONE_LABELS: Record<string, string> = {
  Domestic: "Danmark (med moms)",
  EU: "EU",
  Abroad: "Udlandet",
  "Domestic exempt VAT": "Danmark (momsfri)",
};

// ---------------------------------------------------------------------------
// Kunder og fakturaer
// ---------------------------------------------------------------------------

/** Deler en adresse som "Vej 1, 8000 Aarhus C" (eller over flere linjer) i vej, postnummer og by. */
export function splitAddress(address: string | null | undefined) {
  if (!address) return { address: null, zip: null, city: null };
  const flat = address.replace(/\s*\n\s*/g, ", ").trim();
  const m = flat.match(/^(.*?)[,\s]+(\d{4})\s+([^,]+?)(?:,\s*(?:Danmark|Denmark))?$/i);
  if (!m) return { address: flat.slice(0, 255), zip: null, city: null };
  return { address: m[1].replace(/,$/, "").trim().slice(0, 255) || null, zip: m[2], city: m[3].trim().slice(0, 50) };
}

export type Recipient = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  cvr: string | null;
  customerNumber: number | null;
};

/**
 * Finder kunden i e-conomic (på kundenummer eller CVR) eller opretter den.
 * Returnerer kundenummeret, som gemmes på virksomheden/kontakten i Kundespor.
 */
export async function ensureCustomer(conn: EconomicConnection, r: Recipient): Promise<number> {
  if (r.customerNumber) {
    try {
      await call(conn.grantToken, "GET", `/customers/${r.customerNumber}`);
      return r.customerNumber;
    } catch (error) {
      if (!(error instanceof EconomicError && error.status === 404)) throw error;
    }
  }
  if (r.cvr) {
    const found = await call<Collection<{ customerNumber: number }>>(
      conn.grantToken,
      "GET",
      `/customers?filter=corporateIdentificationNumber$eq:${encodeURIComponent(r.cvr)}`,
    );
    if (found.collection[0]) return found.collection[0].customerNumber;
  }
  const parts = splitAddress(r.address);
  const created = await call<{ customerNumber: number }>(conn.grantToken, "POST", "/customers", {
    name: r.name.slice(0, 255),
    currency: "DKK",
    customerGroup: { customerGroupNumber: conn.settings.customerGroupNumber },
    paymentTerms: { paymentTermsNumber: conn.settings.paymentTermsNumber },
    vatZone: { vatZoneNumber: conn.settings.vatZoneNumber },
    ...(r.email ? { email: r.email.slice(0, 255) } : {}),
    ...(r.phone ? { telephoneAndFaxNumber: r.phone.slice(0, 255) } : {}),
    ...(r.cvr ? { corporateIdentificationNumber: r.cvr } : {}),
    ...(parts.address ? { address: parts.address } : {}),
    ...(parts.zip ? { zip: parts.zip } : {}),
    ...(parts.city ? { city: parts.city } : {}),
  });
  return created.customerNumber;
}

type Amounts = { netAmount: number; vatAmount: number; grossAmount: number };
const ore = (kr: number | undefined) => Math.round((kr ?? 0) * 100);

/** Opretter en fakturakladde i e-conomic. Moms beregnes af e-conomic ud fra vare og momszone. */
export async function createDraftInvoice(
  conn: EconomicConnection,
  input: { customerNumber: number; recipient: Recipient; date: string; heading: string | null; lines: InvoiceLine[] },
) {
  const parts = splitAddress(input.recipient.address);
  const draft = await call<{ draftInvoiceNumber: number } & Amounts>(conn.grantToken, "POST", "/invoices/drafts", {
    date: input.date,
    currency: "DKK",
    customer: { customerNumber: input.customerNumber },
    paymentTerms: { paymentTermsNumber: conn.settings.paymentTermsNumber },
    layout: { layoutNumber: conn.settings.layoutNumber },
    recipient: {
      name: input.recipient.name.slice(0, 250),
      ...(parts.address ? { address: parts.address } : {}),
      ...(parts.zip ? { zip: parts.zip } : {}),
      ...(parts.city ? { city: parts.city } : {}),
      vatZone: { vatZoneNumber: conn.settings.vatZoneNumber },
    },
    ...(input.heading ? { notes: { heading: input.heading.slice(0, 250) } } : {}),
    lines: input.lines.map((l, i) => ({
      lineNumber: i + 1,
      sortKey: i + 1,
      product: { productNumber: conn.settings.productNumber },
      description: l.description.slice(0, 2500),
      quantity: l.quantity,
      unitNetPrice: l.unitPriceOre / 100,
    })),
  });
  return {
    draftNumber: draft.draftInvoiceNumber,
    netOre: ore(draft.netAmount),
    vatOre: ore(draft.vatAmount),
    grossOre: ore(draft.grossAmount),
  };
}

export type BookedInvoice = {
  number: number;
  date: string;
  dueDate: string | null;
  netOre: number;
  vatOre: number;
  grossOre: number;
  remainderOre: number;
};

type BookedResponse = Amounts & {
  bookedInvoiceNumber: number;
  date: string;
  dueDate?: string;
  remainder?: number;
};

const toBooked = (b: BookedResponse): BookedInvoice => ({
  number: b.bookedInvoiceNumber,
  date: b.date,
  dueDate: b.dueDate ?? null,
  netOre: ore(b.netAmount),
  vatOre: ore(b.vatAmount),
  grossOre: ore(b.grossAmount),
  remainderOre: ore(b.remainder ?? b.grossAmount),
});

/** Bogfører kladden. Herefter har fakturaen sit endelige nummer i e-conomic. */
export async function bookDraftInvoice(conn: EconomicConnection, draftNumber: number) {
  const booked = await call<BookedResponse>(conn.grantToken, "POST", "/invoices/booked", {
    draftInvoice: { draftInvoiceNumber: draftNumber },
  });
  return toBooked(booked);
}

export async function getBookedInvoice(conn: EconomicConnection, number: number) {
  return toBooked(await call<BookedResponse>(conn.grantToken, "GET", `/invoices/booked/${number}`));
}

export async function getInvoicePdf(conn: EconomicConnection, number: number) {
  return callPdf(conn.grantToken, `/invoices/booked/${number}/pdf`);
}
