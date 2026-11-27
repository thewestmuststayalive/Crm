"use server";

import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { InvoiceLine } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole, requireWorkspace } from "@/lib/auth";
import { emailBrand, emailText } from "@/lib/branding";
import { getCompany, getContact, getDeal, logEvent } from "@/lib/crm";
import { formatMonth, isMonth, monthRange } from "@/lib/duration";
import {
  bookDraftInvoice,
  createDraftInvoice,
  EconomicError,
  ensureCustomer,
  getEconomicConnection,
  getInvoicePdf,
  isReadOnlyPlan,
  missingSettings,
  type Recipient,
} from "@/lib/economic";
import { brandedEmail, isEmailConfigured, sendEmail } from "@/lib/email";
import { getInvoice, markInvoicePaid, newInvoiceToken, syncInvoice } from "@/lib/invoices";
import { formatIsoDate, todayIso } from "@/lib/labels";
import { formatOre } from "@/lib/quote-math";
import { getStripeConnection } from "@/lib/stripe";
import { getEntries, usageByCompany } from "@/lib/time-tracking";
import { getAppUrl } from "@/lib/url";
import { isUuid } from "@/lib/validation";
import type { ActionState } from "./types";

const kr = (ore: number) => Math.round(ore);
/** Bookingpriser er inkl. moms; fakturalinjer er ekskl. moms. */
const exVat = (oreInclVat: number) => Math.round(oreInclVat / 1.25);

// ---------------------------------------------------------------------------
// Opret
// ---------------------------------------------------------------------------

/** Opretter en fakturakladde ud fra en deal, booking, kundens tid eller tomt – og åbner den. */
export async function createInvoice(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v !== "" ? v : null;
  };
  let companyId: string | null = null;
  let contactId: string | null = null;
  let dealId: string | null = null;
  let bookingId: string | null = null;
  let heading: string | null = null;
  let email: string | null = null;
  let lines: InvoiceLine[] = [{ description: "", quantity: 1, unitPriceOre: 0 }];

  const dealParam = get("dealId");
  const bookingParam = get("bookingId");
  const companyParam = get("companyId");
  const contactParam = get("contactId");
  const month = get("month");

  if (dealParam) {
    const deal = await getDeal(workspace.id, dealParam);
    if (!deal) notFound();
    dealId = deal.id;
    companyId = deal.companyId;
    contactId = deal.contactId;
    heading = deal.title;
    // Linjer fra det seneste accepterede tilbud, ellers dealens værdi.
    const [quote] = await db
      .select({ id: schema.quotes.id })
      .from(schema.quotes)
      .where(
        and(
          eq(schema.quotes.workspaceId, workspace.id),
          eq(schema.quotes.dealId, deal.id),
          eq(schema.quotes.status, "ACCEPTED"),
        ),
      )
      .orderBy(desc(schema.quotes.acceptedAt))
      .limit(1);
    if (quote) {
      const quoteLines = await db
        .select()
        .from(schema.quoteLines)
        .where(eq(schema.quoteLines.quoteId, quote.id))
        .orderBy(schema.quoteLines.position);
      lines = quoteLines.map((l) => ({
        description: l.unit ? `${l.description} (${l.unit})` : l.description,
        quantity: Number(l.quantity),
        unitPriceOre: kr(l.unitPriceOre * (1 - Number(l.discountPct) / 100)),
      }));
    } else {
      lines = [{ description: deal.title, quantity: 1, unitPriceOre: deal.value * 100 }];
    }
  } else if (bookingParam) {
    if (!isUuid(bookingParam)) notFound();
    const [booking] = await db
      .select({
        id: schema.bookings.id,
        contactId: schema.bookings.contactId,
        serviceName: schema.bookings.serviceName,
        priceOre: schema.bookings.priceOre,
        startsAt: schema.bookings.startsAt,
        plate: schema.vehicles.plate,
      })
      .from(schema.bookings)
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.bookings.vehicleId))
      .where(and(eq(schema.bookings.workspaceId, workspace.id), eq(schema.bookings.id, bookingParam)))
      .limit(1);
    if (!booking) notFound();
    bookingId = booking.id;
    contactId = booking.contactId;
    const date = formatIsoDate(booking.startsAt.toISOString().slice(0, 10));
    heading = `${booking.serviceName} ${date}`;
    lines = [
      {
        description: [booking.serviceName, booking.plate].filter(Boolean).join(" – "),
        quantity: 1,
        unitPriceOre: exVat(booking.priceOre),
      },
    ];
  } else if (companyParam) {
    const company = await getCompany(workspace.id, companyParam);
    if (!company) notFound();
    companyId = company.id;
    email = company.email;
    if (month && isMonth(month)) {
      // Månedens tid: fast retainerpris + ekstra timer, ellers de fakturerbare timer.
      heading = `${formatMonth(month)}`;
      const [retainer] = await db
        .select()
        .from(schema.retainers)
        .where(
          and(
            eq(schema.retainers.workspaceId, workspace.id),
            eq(schema.retainers.companyId, company.id),
            eq(schema.retainers.active, true),
          ),
        )
        .limit(1);
      const used = (await usageByCompany(workspace.id, month, [company.id])).get(company.id) ?? 0;
      lines = [];
      if (retainer) {
        if (retainer.monthlyPriceOre) {
          lines.push({ description: `${retainer.name} – ${formatMonth(month)}`, quantity: 1, unitPriceOre: retainer.monthlyPriceOre });
        }
        const over = Math.max(0, used - retainer.monthlyMinutes);
        if (over > 0) {
          lines.push({
            description: `Ekstra timer ${formatMonth(month)}`,
            quantity: Math.round((over / 60) * 100) / 100,
            unitPriceOre: retainer.hourlyRateOre ?? 0,
          });
        }
      } else {
        const { first, last } = monthRange(month);
        const entries = (await getEntries(workspace.id, first, last, { companyId: company.id })).filter((e) => e.billable);
        const minutes = entries.reduce((s, e) => s + e.minutes, 0);
        if (minutes > 0) {
          lines.push({
            description: `Timer ${formatMonth(month)}`,
            quantity: Math.round((minutes / 60) * 100) / 100,
            unitPriceOre: 0,
          });
        }
      }
      if (lines.length === 0) lines = [{ description: `Ydelser ${formatMonth(month)}`, quantity: 1, unitPriceOre: 0 }];
    }
  } else if (contactParam) {
    const contact = await getContact(workspace.id, contactParam);
    if (!contact) notFound();
    contactId = contact.id;
    companyId = contact.companyId;
  } else {
    notFound();
  }

  if (!email && contactId) email = (await getContact(workspace.id, contactId))?.email ?? null;
  if (!email && companyId) email = (await getCompany(workspace.id, companyId))?.email ?? null;

  const [invoice] = await db
    .insert(schema.invoices)
    .values({
      workspaceId: workspace.id,
      companyId,
      contactId,
      dealId,
      bookingId,
      heading,
      email,
      lines,
      token: newInvoiceToken(),
      createdById: user.id,
    })
    .returning({ id: schema.invoices.id });
  redirect(`/fakturaer/${invoice.id}`);
}

// ---------------------------------------------------------------------------
// Ret kladde
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  description: z.string().trim().min(1, "Hver linje skal have en tekst").max(500),
  quantity: z.number().positive("Antal skal være over 0").max(1_000_000),
  unitPriceOre: z.number().int().min(-1_000_000_000).max(1_000_000_000),
});

const draftSchema = z.object({
  heading: z.string().trim().max(250),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Ugyldig e-mail"),
  lines: z.array(lineSchema).min(1, "Tilføj mindst én linje").max(100),
});

function parseDraft(formData: FormData) {
  let lines: unknown;
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    lines = null;
  }
  return draftSchema.safeParse({
    heading: String(formData.get("heading") ?? ""),
    email: String(formData.get("email") ?? ""),
    lines,
  });
}

async function loadInvoice(id: unknown) {
  const ctx = await requireWorkspace();
  if (!isUuid(id)) notFound();
  const row = await getInvoice(ctx.workspace.id, id);
  if (!row) notFound();
  return { ...ctx, invoice: row.invoice, customerName: row.companyName ?? row.contactName };
}

export async function saveInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace, invoice } = await loadInvoice(formData.get("id"));
  if (invoice.status !== "DRAFT") return { error: "Fakturaen er allerede sendt til e-conomic og kan ikke rettes her." };
  const parsed = parseDraft(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db
    .update(schema.invoices)
    .set({
      heading: parsed.data.heading || null,
      email: parsed.data.email || null,
      lines: parsed.data.lines,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.invoices.workspaceId, workspace.id), eq(schema.invoices.id, invoice.id)));
  revalidatePath(`/fakturaer/${invoice.id}`);
  return { success: "Kladden er gemt." };
}

export async function deleteInvoice(formData: FormData) {
  const { workspace, invoice } = await loadInvoice(formData.get("id"));
  if (invoice.status !== "DRAFT" && invoice.status !== "ECONOMIC_DRAFT") return;
  await db
    .delete(schema.invoices)
    .where(and(eq(schema.invoices.workspaceId, workspace.id), eq(schema.invoices.id, invoice.id)));
  revalidatePath("/fakturaer");
  redirect("/fakturaer");
}

// ---------------------------------------------------------------------------
// Bogfør og send
// ---------------------------------------------------------------------------

async function recipientFor(workspaceId: string, invoice: { companyId: string | null; contactId: string | null }) {
  if (invoice.companyId) {
    const c = await getCompany(workspaceId, invoice.companyId);
    if (c) {
      return {
        kind: "company" as const,
        id: c.id,
        recipient: {
          name: c.name,
          email: c.email,
          phone: c.phone,
          address: c.address,
          cvr: c.cvr,
          customerNumber: c.economicCustomerNumber,
        } satisfies Recipient,
      };
    }
  }
  if (invoice.contactId) {
    const p = await getContact(workspaceId, invoice.contactId);
    if (p) {
      return {
        kind: "contact" as const,
        id: p.id,
        recipient: {
          name: p.name,
          email: p.email,
          phone: p.phone,
          address: null,
          cvr: null,
          customerNumber: p.economicCustomerNumber,
        } satisfies Recipient,
      };
    }
  }
  return null;
}

/** Sender fakturaen til kunden på e-mail med PDF'en vedhæftet og et link til fakturasiden. */
async function emailInvoice(workspace: { id: string; name: string }, invoiceId: string) {
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
  if (!inv?.email || !inv.economicNumber || !isEmailConfigured()) return false;
  const conn = await getEconomicConnection(workspace.id);
  if (!conn) return false;
  const pdf = Buffer.from(await getInvoicePdf(conn, inv.economicNumber)).toString("base64");
  const recipient = await recipientFor(workspace.id, inv);
  const firstName = recipient?.kind === "contact" ? recipient.recipient.name.split(" ")[0] : null;
  const url = `${await getAppUrl()}/faktura/${inv.token}`;
  const amount = formatOre(inv.grossOre ?? 0);
  const canPayOnline = Boolean(await getStripeConnection(workspace.id));
  const result = await sendEmail({
    to: inv.email,
    subject: `Faktura ${inv.economicNumber} fra ${workspace.name}`,
    attachments: [{ filename: `Faktura-${inv.economicNumber}.pdf`, content: pdf }],
    ...brandedEmail({
      ...(await emailBrand(workspace.id)),
      heading: firstName ? `Hej ${firstName}` : `Faktura ${inv.economicNumber}`,
      paragraphs: [
        await emailText(workspace.id, "invoiceSent", {
          navn: firstName ?? "",
          nummer: String(inv.economicNumber),
          beløb: amount,
          forfald: inv.dueDate ? formatIsoDate(inv.dueDate) : "",
          firma: workspace.name,
        }),
        canPayOnline
          ? "Fakturaen er vedhæftet som PDF. Du kan betale med MobilePay eller kort via knappen herunder."
          : "Fakturaen er vedhæftet som PDF. Du kan også se den online via knappen herunder.",
      ],
      button: { label: canPayOnline ? "Se og betal fakturaen" : "Se fakturaen", url },
      footer: `Sendt af ${workspace.name} via Kundespor.`,
    }),
  });
  if (result.sent) {
    await db.update(schema.invoices).set({ sentAt: new Date() }).where(eq(schema.invoices.id, inv.id));
  }
  return result.sent;
}

/**
 * Lægger fakturaen i e-conomic (opretter kunden, hvis den mangler). Med mode "send" bogføres
 * den også og sendes til kunden. Kun administratorer.
 */
export async function bookInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) notFound();
  const mode = formData.get("mode") === "draft" ? "draft" : "send";
  const row = await getInvoice(workspace.id, id);
  if (!row) notFound();
  let invoice = row.invoice;
  if (invoice.status !== "DRAFT" && invoice.status !== "ECONOMIC_DRAFT") {
    return { error: "Fakturaen er allerede bogført." };
  }

  // Gem først de seneste rettelser fra formularen.
  if (invoice.status === "DRAFT") {
    const parsed = parseDraft(formData);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    invoice = {
      ...invoice,
      heading: parsed.data.heading || null,
      email: parsed.data.email || null,
      lines: parsed.data.lines,
    };
    await db
      .update(schema.invoices)
      .set({ heading: invoice.heading, email: invoice.email, lines: invoice.lines, updatedAt: new Date() })
      .where(eq(schema.invoices.id, invoice.id));
  }

  const conn = await getEconomicConnection(workspace.id);
  if (!conn) return { error: "Forbind e-conomic under Indstillinger → Regnskab først." };
  if (isReadOnlyPlan(conn.planLevel)) {
    return {
      error:
        "Jeres e-conomic-abonnement tillader ikke, at andre programmer opretter fakturaer. Det kræver e-conomic Plus eller højere.",
    };
  }
  const missing = missingSettings(conn.settings);
  if (missing.length) return { error: `Vælg ${missing.join(", ")} under Indstillinger → Regnskab først.` };
  const target = await recipientFor(workspace.id, invoice);
  if (!target) return { error: "Fakturaen mangler en kunde." };

  // Lås fakturaen, så et dobbeltklik ikke bogfører den to gange.
  const [locked] = await db
    .update(schema.invoices)
    .set({ lockedAt: new Date() })
    .where(
      and(
        eq(schema.invoices.id, invoice.id),
        or(isNull(schema.invoices.lockedAt), lt(schema.invoices.lockedAt, new Date(Date.now() - 120_000))),
      ),
    )
    .returning({ id: schema.invoices.id });
  if (!locked) return { error: "Fakturaen er ved at blive bogført. Vent et øjeblik." };

  let done = false;
  try {
    let draftNumber = invoice.economicDraftNumber;
    if (invoice.status === "DRAFT" || !draftNumber) {
      const customerNumber = await ensureCustomer(conn, target.recipient);
      if (customerNumber !== target.recipient.customerNumber) {
        const table = target.kind === "company" ? schema.companies : schema.contacts;
        await db
          .update(table)
          .set({ economicCustomerNumber: customerNumber })
          .where(and(eq(table.workspaceId, workspace.id), eq(table.id, target.id)));
      }
      const draft = await createDraftInvoice(conn, {
        customerNumber,
        recipient: target.recipient,
        date: todayIso(),
        heading: invoice.heading,
        lines: invoice.lines,
      });
      draftNumber = draft.draftNumber;
      await db
        .update(schema.invoices)
        .set({
          status: "ECONOMIC_DRAFT",
          economicDraftNumber: draft.draftNumber,
          date: todayIso(),
          netOre: draft.netOre,
          vatOre: draft.vatOre,
          grossOre: draft.grossOre,
          updatedAt: new Date(),
        })
        .where(eq(schema.invoices.id, invoice.id));
    }
    if (mode === "draft") {
      await audit(workspace.id, user.id, "Lagde faktura i e-conomic som kladde", `Kladde ${draftNumber}`);
      revalidatePath(`/fakturaer/${invoice.id}`);
      return { success: `Kladden ligger nu i e-conomic (kladde ${draftNumber}).` };
    }

    let booked;
    try {
      booked = await bookDraftInvoice(conn, draftNumber);
    } catch (error) {
      if (error instanceof EconomicError && error.status === 404) {
        // Kladden er slettet i e-conomic: start forfra med en ny kladde.
        await db
          .update(schema.invoices)
          .set({ status: "DRAFT", economicDraftNumber: null })
          .where(eq(schema.invoices.id, invoice.id));
        return { error: "Kladden findes ikke længere i e-conomic. Prøv igen – så oprettes en ny." };
      }
      throw error;
    }
    await db
      .update(schema.invoices)
      .set({
        status: booked.remainderOre <= 0 ? "PAID" : "BOOKED",
        economicNumber: booked.number,
        date: booked.date,
        dueDate: booked.dueDate,
        netOre: booked.netOre,
        vatOre: booked.vatOre,
        grossOre: booked.grossOre,
        remainderOre: booked.remainderOre,
        syncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.invoices.id, invoice.id));

    let emailed = false;
    try {
      emailed = await emailInvoice(workspace, invoice.id);
    } catch (error) {
      console.error("Faktura-mail fejlede", error);
    }
    await logEvent(
      workspace.id,
      user.id,
      `Faktura ${booked.number} på ${formatOre(booked.grossOre)} bogført${emailed ? ` og sendt til ${invoice.email}` : ""}`,
      { dealId: invoice.dealId, contactId: invoice.contactId, companyId: invoice.companyId },
    );
    await audit(workspace.id, user.id, "Bogførte faktura", `Faktura ${booked.number}, ${formatOre(booked.grossOre)}`);
    revalidatePath(`/fakturaer/${invoice.id}`);
    revalidatePath("/fakturaer");
    done = true;
  } catch (error) {
    if (error instanceof EconomicError) return { error: error.message };
    console.error("Bogføring fejlede", error);
    return { error: "Noget gik galt. Prøv igen om lidt." };
  } finally {
    await db.update(schema.invoices).set({ lockedAt: null }).where(eq(schema.invoices.id, invoice.id));
  }
  // Siden viser selv, om fakturaen er bogført og sendt.
  if (done) redirect(`/fakturaer/${invoice.id}?bogfoert=1`);
  return {};
}

export async function resendInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) notFound();
  const row = await getInvoice(workspace.id, id);
  if (!row || !["BOOKED", "PAID"].includes(row.invoice.status)) notFound();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email && !z.email().safeParse(email).success) return { error: "Ugyldig e-mail" };
  if (email && email !== row.invoice.email) {
    await db.update(schema.invoices).set({ email }).where(eq(schema.invoices.id, row.invoice.id));
  }
  if (!(email || row.invoice.email)) return { error: "Skriv kundens e-mail." };
  if (!isEmailConfigured()) return { error: "E-mail er ikke sat op (RESEND_API_KEY). Del linket i stedet." };
  try {
    const sent = await emailInvoice(workspace, row.invoice.id);
    revalidatePath(`/fakturaer/${row.invoice.id}`);
    return sent ? { success: `Fakturaen er sendt til ${email || row.invoice.email}.` } : { error: "E-mailen kunne ikke sendes." };
  } catch (error) {
    return { error: error instanceof EconomicError ? error.message : "E-mailen kunne ikke sendes." };
  }
}

export async function refreshInvoice(formData: FormData) {
  const { workspace, invoice } = await loadInvoice(formData.get("id"));
  try {
    await syncInvoice(workspace.id, invoice.id);
  } catch (error) {
    console.error("Statusopdatering fejlede", error);
  }
  revalidatePath(`/fakturaer/${invoice.id}`);
}

/** Til betaling uden om e-conomic (fx kontant). Betalingen skal også registreres i e-conomic. */
export async function markPaid(formData: FormData) {
  const { user, workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) notFound();
  if (await markInvoicePaid(workspace.id, id, "manual")) {
    await audit(workspace.id, user.id, "Markerede faktura som betalt", id);
  }
  revalidatePath(`/fakturaer/${id}`);
  revalidatePath("/fakturaer");
}
