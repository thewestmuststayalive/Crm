import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { logEvent } from "./crm";
import { markInvoicePaid } from "./invoices";
import { notify } from "./notify";
import { formatOre } from "./quote-math";
import type { CheckoutSession } from "./stripe";

/**
 * Registrerer en gennemført betaling fra Stripe (via webhook eller kundens tilbagevenden).
 * Gør intet, hvis betalingen ikke er gennemført, eller hvis den hører til et andet firma.
 * Kan kaldes flere gange for samme betaling uden at gøre noget dobbelt.
 */
export async function applyPaidSession(workspaceId: string, session: CheckoutSession) {
  if (session.payment_status !== "paid") return false;
  const { kind, id } = session.metadata ?? {};
  if (session.metadata?.workspaceId !== workspaceId || !id) return false;

  if (kind === "invoice") {
    const [inv] = await db
      .select({
        number: schema.invoices.economicNumber,
        grossOre: schema.invoices.grossOre,
        dealId: schema.invoices.dealId,
        contactId: schema.invoices.contactId,
        companyId: schema.invoices.companyId,
      })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.workspaceId, workspaceId), eq(schema.invoices.id, id)))
      .limit(1);
    if (!inv) return false;
    const changed = await markInvoicePaid(workspaceId, id, "stripe");
    if (changed) {
      await logEvent(workspaceId, null, `Faktura ${inv.number} betalt online (${formatOre(session.amount_total ?? 0)})`, inv);
    }
    return changed;
  }

  if (kind === "deposit") {
    const [booking] = await db
      .update(schema.bookings)
      .set({ depositPaidAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(schema.bookings.workspaceId, workspaceId), eq(schema.bookings.id, id), isNull(schema.bookings.depositPaidAt)),
      )
      .returning({ contactId: schema.bookings.contactId, serviceName: schema.bookings.serviceName });
    if (!booking) return false;
    await logEvent(
      workspaceId,
      null,
      `Depositum på ${formatOre(session.amount_total ?? 0)} betalt online for ${booking.serviceName}`,
      { contactId: booking.contactId },
    );
    await notify({
      workspaceId,
      to: "admins",
      type: "NEW_BOOKING",
      title: `Depositum betalt: ${booking.serviceName}`,
      href: `/kalender/${id}`,
    });
    return true;
  }
  return false;
}
