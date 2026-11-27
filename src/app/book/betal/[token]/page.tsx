import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PayButton } from "@/app/faktura/[token]/pay-button";
import { BrandHeader } from "@/components/brand-header";
import { db, schema } from "@/db";
import { formatWhen } from "@/lib/booking-flow";
import { brandStyle, getBranding } from "@/lib/branding";
import { applyPaidSession } from "@/lib/payments";
import { formatOre } from "@/lib/quote-math";
import { getCheckoutSession, getStripeConnection } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Betal depositum",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({ booking: schema.bookings, workspaceName: schema.workspaces.name })
    .from(schema.bookings)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookings.workspaceId))
    .where(eq(schema.bookings.token, token))
    .limit(1);
  return row?.booking.depositOre ? row : null;
}

export default async function DepositPage({ params, searchParams }: PageProps<"/book/betal/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  let row = await load(token);
  if (!row) notFound();
  const conn = await getStripeConnection(row.booking.workspaceId);
  if (conn && sp.betaling === "ok" && typeof sp.session === "string" && !row.booking.depositPaidAt) {
    try {
      const session = await getCheckoutSession(conn, sp.session);
      if (session && session.metadata?.id === row.booking.id && (await applyPaidSession(row.booking.workspaceId, session))) {
        row = (await load(token)) ?? row;
      }
    } catch (error) {
      console.error("Kunne ikke tjekke betalingen hos Stripe", error);
    }
  }
  const { booking } = row;
  const brand = await getBranding(booking.workspaceId);
  const paid = Boolean(booking.depositPaidAt);

  return (
    <main style={brandStyle(brand.color)} className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <BrandHeader brand={brand} />
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="font-display text-xl font-bold text-slate-900">Depositum hos {row.workspaceName}</h1>
          <p className="text-sm text-slate-700">
            {booking.serviceName} · {formatWhen(booking.startsAt)}
          </p>
          <p className="text-2xl font-semibold text-slate-900">{formatOre(booking.depositOre ?? 0)}</p>
          {paid ? (
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Depositum er betalt. Tak – vi glæder os til at se dig.
            </p>
          ) : booking.status !== "CONFIRMED" ? (
            <p className="text-sm text-slate-600">Bookingen er ikke længere aktiv.</p>
          ) : conn ? (
            <PayButton token={token} kind="deposit" label="Betal med MobilePay eller kort" />
          ) : (
            <p className="text-sm text-slate-600">Online betaling er ikke slået til. Kontakt os direkte.</p>
          )}
        </section>
      </div>
    </main>
  );
}
