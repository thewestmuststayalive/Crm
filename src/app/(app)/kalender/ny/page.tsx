import type { Metadata } from "next";
import { createManualBooking } from "@/app/actions/bookings";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { getServices } from "@/lib/booking";
import { getContactOptions, getMemberOptions } from "@/lib/crm";
import { requireBookingModule } from "@/lib/modules";
import { oreToInput } from "@/lib/quote-math";
import { isIsoDate, isTime } from "@/lib/time";
import { isUuid } from "@/lib/validation";
import { BookingForm } from "../booking-form";

export const metadata: Metadata = { title: "Ny booking" };

export default async function NewBookingPage({ searchParams }: PageProps<"/kalender/ny">) {
  const { user, workspace } = await requireBookingModule();
  const sp = await searchParams;
  const [contacts, services, members] = await Promise.all([
    getContactOptions(workspace.id),
    getServices(workspace.id),
    getMemberOptions(workspace.id),
  ]);
  const contactId = isUuid(sp.kontakt) && contacts.some((c) => c.id === sp.kontakt) ? sp.kontakt : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Ny booking" back={{ href: "/kalender", label: "Kalender" }} />
      <Card>
        <BookingForm
          mode="create"
          action={createManualBooking}
          contacts={contacts}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            durationMinutes: s.durationMinutes,
            price: oreToInput(s.priceOre),
          }))}
          members={members}
          initial={{
            contactId,
            date: isIsoDate(sp.dato) ? sp.dato : "",
            time: isTime(sp.tid) ? sp.tid : "",
            duration: "60",
            assigneeId: user.id,
          }}
          cancelHref="/kalender"
        />
      </Card>
    </div>
  );
}
