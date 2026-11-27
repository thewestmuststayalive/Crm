import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandHeader } from "@/components/brand-header";
import { brandStyle, getBranding } from "@/lib/branding";
import { getPublicInvoice, isOverdue } from "@/lib/invoices";
import { applyPaidSession } from "@/lib/payments";
import { getCheckoutSession, getStripeConnection } from "@/lib/stripe";
import { PayButton } from "./pay-button";
import { formatIsoDate } from "@/lib/labels";
import { formatOre } from "@/lib/quote-math";

// Linket er hemmeligt: siden må ikke indekseres, og adressen må ikke sendes videre som referer.
export const metadata: Metadata = {
  title: "Faktura",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PublicInvoicePage({ params, searchParams }: PageProps<"/faktura/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  let row = await getPublicInvoice(token);
  if (!row) notFound();
  const conn = await getStripeConnection(row.workspace.id);
  // Tilbage fra Stripe: registrér betalingen med det samme (webhooken kan komme lidt senere).
  if (conn && sp.betaling === "ok" && typeof sp.session === "string" && row.invoice.status === "BOOKED") {
    try {
      const session = await getCheckoutSession(conn, sp.session);
      if (session && session.metadata?.id === row.invoice.id && (await applyPaidSession(row.workspace.id, session))) {
        row = (await getPublicInvoice(token)) ?? row;
      }
    } catch (error) {
      console.error("Kunne ikke tjekke betalingen hos Stripe", error);
    }
  }
  const { invoice: inv, workspace: ws } = row;
  const brand = await getBranding(ws.id);
  const paid = inv.status === "PAID";
  const overdue = isOverdue(inv);

  return (
    <main style={brandStyle(brand.color)} className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-xl space-y-6">
        <BrandHeader brand={brand} />
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">Faktura {inv.economicNumber}</h1>
              <p className="text-sm text-slate-500">
                Fra {ws.name}
                {row.customer && ` til ${row.customer}`}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                paid ? "bg-emerald-50 text-emerald-800" : overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              {paid ? "Betalt" : overdue ? "Forfalden" : "Ikke betalt"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Beløb inkl. moms</dt>
              <dd className="text-lg font-semibold text-slate-900">{formatOre(inv.grossOre ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Betal senest</dt>
              <dd className="text-lg font-semibold text-slate-900">{inv.dueDate ? formatIsoDate(inv.dueDate) : "–"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Fakturadato</dt>
              <dd>{inv.date ? formatIsoDate(inv.date) : "–"}</dd>
            </div>
            {!paid && inv.remainderOre !== null && inv.remainderOre !== inv.grossOre && (
              <div>
                <dt className="text-slate-500">Mangler at betale</dt>
                <dd>{formatOre(inv.remainderOre)}</dd>
              </div>
            )}
          </dl>
          <a
            href={`/faktura/${token}/pdf`}
            className="inline-flex items-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Hent fakturaen som PDF
          </a>
          {paid && sp.betaling === "ok" && (
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Tak for din betaling.
            </p>
          )}
          {!paid && conn && (
            <div className="border-t border-slate-100 pt-4">
              <PayButton token={token} kind="invoice" label="Betal med MobilePay eller kort" />
            </div>
          )}
          {!paid && <p className="text-sm text-slate-600">Du kan også betale via bankoverførsel – oplysningerne står på fakturaen.</p>}
        </section>
        <p className="text-center text-xs text-slate-500">
          {[ws.name, ws.cvr ? `CVR ${ws.cvr}` : null, ws.phone, ws.email].filter(Boolean).join(" · ")}
        </p>
      </div>
    </main>
  );
}
