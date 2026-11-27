import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { emailBrand, emailText } from "./branding";
import { getCompany, getContact, logEvent } from "./crm";
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
} from "./economic";
import { brandedEmail, isEmailConfigured, sendEmail } from "./email";
import { formatIsoDate, todayIso } from "./labels";
import { formatOre } from "./quote-math";
import { getStripeConnection } from "./stripe";
import { getAppUrl } from "./url";

export async function recipientFor(workspaceId: string, invoice: { companyId: string | null; contactId: string | null }) {
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
export async function emailInvoice(workspace: { id: string; name: string }, invoiceId: string) {
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


type BookResult = { ok: true; draftNumber: number; number?: number; emailed?: boolean } | { ok: false; error: string };

/**
 * Lægger fakturaen i e-conomic (opretter kunden, hvis den mangler). Med mode "send" bogføres
 * den også og sendes til kunden på e-mail. Bruges både af knappen og af faste aftaler.
 */
export async function bookAndSendInvoice(input: {
  workspace: { id: string; name: string };
  userId: string | null;
  invoiceId: string;
  mode: "send" | "draft";
}): Promise<BookResult> {
  const { workspace, userId, mode } = input;
  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.workspaceId, workspace.id), eq(schema.invoices.id, input.invoiceId)))
    .limit(1);
  if (!invoice) return { ok: false, error: "Fakturaen findes ikke." };
  if (invoice.status !== "DRAFT" && invoice.status !== "ECONOMIC_DRAFT") return { ok: false, error: "Fakturaen er allerede bogført." };
  if (invoice.lines.length === 0) return { ok: false, error: "Tilføj mindst én linje." };

  const conn = await getEconomicConnection(workspace.id);
  if (!conn) return { ok: false, error: "Forbind e-conomic under Indstillinger → Regnskab først." };
  if (isReadOnlyPlan(conn.planLevel)) {
    return {
      ok: false,
      error: "Jeres e-conomic-abonnement tillader ikke, at andre programmer opretter fakturaer. Det kræver e-conomic Plus eller højere.",
    };
  }
  const missing = missingSettings(conn.settings);
  if (missing.length) return { ok: false, error: `Vælg ${missing.join(", ")} under Indstillinger → Regnskab først.` };
  const target = await recipientFor(workspace.id, invoice);
  if (!target) return { ok: false, error: "Fakturaen mangler en kunde." };

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
  if (!locked) return { ok: false, error: "Fakturaen er ved at blive bogført. Vent et øjeblik." };

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
      await audit(workspace.id, userId, "Lagde faktura i e-conomic som kladde", `Kladde ${draftNumber}`);
      return { ok: true, draftNumber };
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
        return { ok: false, error: "Kladden findes ikke længere i e-conomic. Prøv igen – så oprettes en ny." };
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
      userId,
      `Faktura ${booked.number} på ${formatOre(booked.grossOre)} bogført${emailed ? ` og sendt til ${invoice.email}` : ""}`,
      { dealId: invoice.dealId, contactId: invoice.contactId, companyId: invoice.companyId },
    );
    await audit(workspace.id, userId, "Bogførte faktura", `Faktura ${booked.number}, ${formatOre(booked.grossOre)}`);
    return { ok: true, draftNumber, number: booked.number, emailed };
  } catch (error) {
    if (error instanceof EconomicError) return { ok: false, error: error.message };
    console.error("Bogføring fejlede", error);
    return { ok: false, error: "Noget gik galt. Prøv igen om lidt." };
  } finally {
    await db.update(schema.invoices).set({ lockedAt: null }).where(eq(schema.invoices.id, invoice.id));
  }
}
