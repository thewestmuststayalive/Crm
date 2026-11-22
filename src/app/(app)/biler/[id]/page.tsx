import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteVehicle, updateVehicle } from "@/app/actions/bookings";
import { Badge, PageHeader } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { Card, ConfirmButton } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_STYLES, formatPlate, getBookingsFor, getVehicle } from "@/lib/booking";
import { formatWhen } from "@/lib/booking-flow";
import { getContact } from "@/lib/crm";
import { requireBookingModule } from "@/lib/modules";
import { formatOre } from "@/lib/quote-math";

export const metadata: Metadata = { title: "Bil" };

export default async function VehiclePage({ params }: PageProps<"/biler/[id]">) {
  const { id } = await params;
  const { workspace } = await requireBookingModule();
  const vehicle = await getVehicle(workspace.id, id);
  if (!vehicle) notFound();
  const [contact, history] = await Promise.all([
    getContact(workspace.id, vehicle.contactId),
    getBookingsFor(workspace.id, { vehicleId: vehicle.id }),
  ]);
  const title = [formatPlate(vehicle.plate), vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Bil";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={title}
        back={contact ? { href: `/kunder/${contact.id}`, label: contact.name } : { href: "/kunder", label: "Kunder" }}
        actions={
          <>
            <Link href={`/kalender/ny?kontakt=${vehicle.contactId}`} className={buttonClass()}>
              Ny booking
            </Link>
            <form action={deleteVehicle}>
              <input type="hidden" name="id" value={vehicle.id} />
              <ConfirmButton message="Slet bilen? Bookinger bevares, men mister koblingen til bilen.">
                Slet
              </ConfirmButton>
            </form>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Oplysninger">
          <VehicleForm
            idPrefix="v-edit"
            action={updateVehicle.bind(null, vehicle.id)}
            submitLabel="Gem"
            initial={{
              plate: formatPlate(vehicle.plate),
              make: vehicle.make ?? "",
              model: vehicle.model ?? "",
              year: vehicle.year ? String(vehicle.year) : "",
              color: vehicle.color ?? "",
              notes: vehicle.notes ?? "",
            }}
          />
        </Card>
        <Card title="Behandlinger">
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">Ingen bookinger endnu.</p>
          ) : (
            <ul className="divide-y divide-slate-100" aria-label="Behandlinger">
              {history.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/kalender/${b.id}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <span>
                      <span className="block font-medium text-slate-900">{b.serviceName}</span>
                      <span className="text-xs text-slate-500">
                        {formatWhen(b.startsAt)} · {formatOre(b.priceOre)}
                      </span>
                    </span>
                    <Badge className={BOOKING_STATUS_STYLES[b.status]}>{BOOKING_STATUS_LABELS[b.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
