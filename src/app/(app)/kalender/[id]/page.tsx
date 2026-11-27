import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteBooking, setBookingStatus, updateBooking } from "@/app/actions/bookings";
import { Badge, DetailRow, PageHeader } from "@/components/display";
import { CreateInvoiceButton } from "@/components/invoice-widgets";
import { Button, Card, ConfirmButton } from "@/components/ui";
import { db, schema } from "@/db";
import type { BookingStatus } from "@/db/schema";
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_STYLES, formatPlate, getBooking, getServices } from "@/lib/booking";
import { formatWhen } from "@/lib/booking-flow";
import { getContact, getMemberOptions, getUserName } from "@/lib/crm";
import { formatDateTime } from "@/lib/labels";
import { requireBookingModule } from "@/lib/modules";
import { formatOre, oreToInput } from "@/lib/quote-math";
import { hasRole } from "@/lib/roles";
import { localDate, localTime } from "@/lib/time";
import { BookingForm } from "../booking-form";

export const metadata: Metadata = { title: "Booking" };

function StatusButton({
  id,
  status,
  label,
  notify,
}: {
  id: string;
  status: BookingStatus;
  label: string;
  notify?: boolean;
}) {
  return (
    <form action={setBookingStatus} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      {notify && <input type="hidden" name="notifyCustomer" value="on" />}
      <Button type="submit" variant="secondary">
        {label}
      </Button>
    </form>
  );
}

export default async function BookingPage({ params }: PageProps<"/kalender/[id]">) {
  const { id } = await params;
  const { workspace } = await requireBookingModule();
  const booking = await getBooking(workspace.id, id);
  if (!booking) notFound();
  const [contact, vehicle, services, members, createdBy] = await Promise.all([
    getContact(workspace.id, booking.contactId),
    booking.vehicleId
      ? db
          .select()
          .from(schema.vehicles)
          .where(and(eq(schema.vehicles.workspaceId, workspace.id), eq(schema.vehicles.id, booking.vehicleId)))
          .then((r) => r[0] ?? null)
      : null,
    getServices(workspace.id, { includeInactive: true }),
    getMemberOptions(workspace.id),
    getUserName(booking.createdById),
  ]);
  const minutes = Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`${booking.serviceName} – ${contact?.name ?? "Ukendt kunde"}`}
        back={{ href: `/kalender?uge=${localDate(booking.startsAt)}`, label: "Kalender" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{formatWhen(booking.startsAt)}</span>
            <Badge className={BOOKING_STATUS_STYLES[booking.status]}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
          </span>
        }
        actions={
          <>
            <CreateInvoiceButton fields={{ bookingId: booking.id }} />
            {hasRole(workspace.role, "ADMIN") && (
              <form action={deleteBooking}>
                <input type="hidden" name="id" value={booking.id} />
                <ConfirmButton message="Slet bookingen helt? Brug hellere 'Aflys', hvis den skal kunne ses i historikken.">
                  Slet
                </ConfirmButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card title="Oplysninger">
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Kunde">
                {contact && (
                  <Link href={`/kunder/${contact.id}`} className="underline">
                    {contact.name}
                  </Link>
                )}
              </DetailRow>
              <DetailRow label="Telefon">
                {contact?.phone && (
                  <a href={`tel:${contact.phone}`} className="underline">
                    {contact.phone}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Bil">
                {vehicle && (
                  <Link href={`/biler/${vehicle.id}`} className="underline">
                    {[formatPlate(vehicle.plate), vehicle.make, vehicle.model].filter(Boolean).join(" ")}
                  </Link>
                )}
              </DetailRow>
              <DetailRow label="Pris">{formatOre(booking.priceOre)}</DetailRow>
              <DetailRow label="Varighed">{minutes} min</DetailRow>
              <DetailRow label="Booket">
                {booking.source === "ONLINE" ? "Online af kunden" : `Af ${createdBy ?? "personalet"}`},{" "}
                {formatDateTime(booking.createdAt)}
              </DetailRow>
              {booking.customerNote && <DetailRow label="Kundens besked">{booking.customerNote}</DetailRow>}
              {booking.reminderSentAt && (
                <DetailRow label="Påmindelse sendt">{formatDateTime(booking.reminderSentAt)}</DetailRow>
              )}
            </dl>
          </Card>
          <Card title="Status">
            <div className="flex flex-wrap gap-2">
              {booking.status === "CONFIRMED" ? (
                <>
                  <StatusButton id={booking.id} status="COMPLETED" label="Gennemført" />
                  <StatusButton id={booking.id} status="NO_SHOW" label="Udeblev" />
                  <StatusButton id={booking.id} status="CANCELLED" label="Aflys og giv kunden besked" notify />
                </>
              ) : (
                <StatusButton id={booking.id} status="CONFIRMED" label="Genåbn" />
              )}
            </div>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card title="Ret eller flyt">
            <BookingForm
              mode="edit"
              action={updateBooking.bind(null, booking.id)}
              services={services.map((s) => ({
                id: s.id,
                name: s.name,
                durationMinutes: s.durationMinutes,
                price: oreToInput(s.priceOre),
              }))}
              members={members}
              initial={{
                serviceId: booking.serviceId ?? "",
                plate: vehicle?.plate ?? "",
                date: localDate(booking.startsAt),
                time: localTime(booking.startsAt),
                duration: String(minutes),
                price: oreToInput(booking.priceOre),
                assigneeId: booking.assigneeId ?? "",
                internalNote: booking.internalNote ?? "",
              }}
              cancelHref={`/kalender?uge=${localDate(booking.startsAt)}`}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
