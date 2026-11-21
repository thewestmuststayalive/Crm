import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { db, schema } from "@/db";
import { BOOKING_STATUS_LABELS, canCustomerCancel, formatPlate } from "@/lib/booking";
import { formatWhen } from "@/lib/booking-flow";
import { CancelForm } from "./cancel-form";

export const metadata: Metadata = {
  title: "Din booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CancelBookingPage({ params }: PageProps<"/book/aflys/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const [row] = await db
    .select({
      booking: schema.bookings,
      plate: schema.vehicles.plate,
      ws: { name: schema.workspaces.name, phone: schema.workspaces.phone, address: schema.workspaces.address },
      cancelHours: schema.bookingSettings.cancelHours,
      key: schema.bookingSettings.key,
    })
    .from(schema.bookings)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookings.workspaceId))
    .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.bookings.vehicleId))
    .leftJoin(schema.bookingSettings, eq(schema.bookingSettings.workspaceId, schema.bookings.workspaceId))
    .where(eq(schema.bookings.token, token))
    .limit(1);
  if (!row) notFound();
  const { booking, ws } = row;
  const cancelHours = row.cancelHours ?? 24;
  const canCancel = canCustomerCancel(booking, cancelHours);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Din booking hos {ws.name}</h1>
          <dl className="mt-4 space-y-1 text-sm text-slate-700">
            <div>
              <dt className="inline font-medium">Ydelse: </dt>
              <dd className="inline">{booking.serviceName}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Tid: </dt>
              <dd className="inline">{formatWhen(booking.startsAt)}</dd>
            </div>
            {row.plate && (
              <div>
                <dt className="inline font-medium">Bil: </dt>
                <dd className="inline">{formatPlate(row.plate)}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium">Status: </dt>
              <dd className="inline">{BOOKING_STATUS_LABELS[booking.status]}</dd>
            </div>
          </dl>
          <div className="mt-5">
            {canCancel ? (
              <CancelForm token={token} />
            ) : booking.status === "CONFIRMED" ? (
              <p className="text-sm text-slate-600">
                Det er for sent at aflyse online (senest {cancelHours} timer før).{" "}
                {ws.phone ? `Ring på ${ws.phone}.` : "Kontakt os direkte."}
              </p>
            ) : null}
          </div>
          {booking.status === "CANCELLED" && row.key && (
            <p className="mt-4 text-sm">
              <a href={`/book/${row.key}`} className="underline">
                Book en ny tid
              </a>
            </p>
          )}
        </section>
        <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
          Booking via <Logo size={18} />
        </p>
      </div>
    </main>
  );
}
