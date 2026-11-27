"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getPublicInvoice } from "@/lib/invoices";
import { createCheckoutSession, getStripeConnection, StripeError } from "@/lib/stripe";
import { getAppUrl } from "@/lib/url";
import type { ActionState } from "./types";

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/** Kunden trykker "Betal" på fakturasiden → videre til Stripes betalingsside. */
export async function payInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN.test(token)) return { error: "Linket er ikke gyldigt." };
  const row = await getPublicInvoice(token);
  if (!row || row.invoice.status !== "BOOKED") return { error: "Fakturaen kan ikke betales online." };
  const amount = row.invoice.remainderOre ?? row.invoice.grossOre ?? 0;
  if (amount < 300) return { error: "Beløbet er for lille til online betaling." };
  const conn = await getStripeConnection(row.workspace.id);
  if (!conn) return { error: "Online betaling er ikke slået til." };
  const base = `${await getAppUrl()}/faktura/${token}`;
  let url: string | null = null;
  try {
    const session = await createCheckoutSession(conn, {
      kind: "invoice",
      id: row.invoice.id,
      workspaceId: row.workspace.id,
      amountOre: amount,
      name: `Faktura ${row.invoice.economicNumber} – ${row.workspace.name}`,
      email: row.invoice.email,
      successUrl: `${base}?betaling=ok&session={CHECKOUT_SESSION_ID}`,
      cancelUrl: base,
    });
    url = session.url;
  } catch (error) {
    return { error: error instanceof StripeError ? "Betalingen kunne ikke startes. Prøv igen om lidt." : "Noget gik galt." };
  }
  if (!url) return { error: "Betalingen kunne ikke startes." };
  redirect(url);
}

/** Kunden betaler depositum for en onlinebooking. */
export async function payDeposit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN.test(token)) return { error: "Linket er ikke gyldigt." };
  const [row] = await db
    .select({ booking: schema.bookings, workspaceName: schema.workspaces.name, email: schema.contacts.email })
    .from(schema.bookings)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookings.workspaceId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.bookings.contactId))
    .where(
      and(
        eq(schema.bookings.token, token),
        eq(schema.bookings.status, "CONFIRMED"),
        isNull(schema.bookings.depositPaidAt),
      ),
    )
    .limit(1);
  if (!row?.booking.depositOre) return { error: "Der er intet depositum at betale." };
  const conn = await getStripeConnection(row.booking.workspaceId);
  if (!conn) return { error: "Online betaling er ikke slået til." };
  const base = `${await getAppUrl()}/book/betal/${token}`;
  let url: string | null = null;
  try {
    const session = await createCheckoutSession(conn, {
      kind: "deposit",
      id: row.booking.id,
      workspaceId: row.booking.workspaceId,
      amountOre: row.booking.depositOre,
      name: `Depositum: ${row.booking.serviceName} – ${row.workspaceName}`,
      email: row.email,
      successUrl: `${base}?betaling=ok&session={CHECKOUT_SESSION_ID}`,
      cancelUrl: base,
    });
    url = session.url;
  } catch {
    return { error: "Betalingen kunne ikke startes. Prøv igen om lidt." };
  }
  if (!url) return { error: "Betalingen kunne ikke startes." };
  redirect(url);
}
