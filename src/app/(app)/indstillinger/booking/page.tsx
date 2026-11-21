import type { Metadata } from "next";
import QRCode from "qrcode";
import { addService, deleteService, newBookingLink, updateService } from "@/app/actions/booking-settings";
import { CopyButton } from "@/components/copy-button";
import { buttonClass } from "@/components/styles";
import { Button, Card, ConfirmButton, Input } from "@/components/ui";
import { getBookingSettings, getServices, type Service } from "@/lib/booking";
import { requireBookingModule } from "@/lib/modules";
import { oreToInput } from "@/lib/quote-math";
import { hasRole } from "@/lib/roles";
import { getAppUrl } from "@/lib/url";
import { RulesForm } from "./rules-form";

export const metadata: Metadata = { title: "Booking" };

function ServiceFields({ service }: { service?: Service }) {
  const id = service?.id ?? "new";
  return (
    <div className="grid gap-2 sm:grid-cols-12">
      <Input
        name="name"
        required
        maxLength={100}
        defaultValue={service?.name}
        placeholder="Navn, fx Indvendig rens"
        aria-label="Navn på ydelse"
        className="sm:col-span-4"
      />
      <Input
        name="durationMinutes"
        type="number"
        min={5}
        step={5}
        required
        defaultValue={service?.durationMinutes ?? 60}
        aria-label="Varighed i minutter"
        title="Varighed i minutter"
        className="sm:col-span-2"
      />
      <Input
        name="price"
        inputMode="decimal"
        defaultValue={service ? oreToInput(service.priceOre) : ""}
        placeholder="Pris kr."
        aria-label="Pris i kr. inkl. moms"
        className="sm:col-span-2"
      />
      <Input
        name="reminderMonths"
        type="number"
        min={1}
        max={60}
        defaultValue={service?.reminderMonths ?? ""}
        placeholder="Påmind (mdr.)"
        aria-label="Påmind kunden efter antal måneder"
        title="Påmind kunden om en ny behandling efter så mange måneder (valgfrit)"
        className="sm:col-span-2"
      />
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input
          type="checkbox"
          name="bookableOnline"
          defaultChecked={service?.bookableOnline ?? true}
          className="h-4 w-4"
          id={`online-${id}`}
        />
        Online
      </label>
      <Input
        name="description"
        maxLength={500}
        defaultValue={service?.description ?? ""}
        placeholder="Kort beskrivelse til kunden (valgfri)"
        aria-label="Beskrivelse"
        className="sm:col-span-12"
      />
    </div>
  );
}

export default async function BookingSettingsPage({ searchParams }: PageProps<"/indstillinger/booking">) {
  const { workspace } = await requireBookingModule();
  const sp = await searchParams;
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const [settings, services, appUrl] = await Promise.all([
    getBookingSettings(workspace.id),
    getServices(workspace.id, { includeInactive: true }),
    getAppUrl(),
  ]);
  const link = `${appUrl}/book/${settings.key}`;
  const [qrSvg, qrPng] = await Promise.all([
    QRCode.toString(link, { type: "svg", margin: 1, width: 160 }),
    QRCode.toDataURL(link, { margin: 2, width: 800 }),
  ]);

  return (
    <div className="space-y-6">
      {typeof sp.besked === "string" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {sp.besked}
        </p>
      )}
      {typeof sp.fejlbesked === "string" && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {sp.fejlbesked}
        </p>
      )}

      <Card
        title="Bookinglink"
        description="Del linket på hjemmesiden, i Instagram-bio og på Facebook. QR-koden kan printes til disken eller bilen."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div
            className="h-40 w-40 shrink-0 rounded-md border border-slate-200 bg-white"
            role="img"
            aria-label="QR-kode til bookinglinket"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="min-w-0 flex-1 space-y-3">
            <Input readOnly value={link} aria-label="Bookinglink" />
            <div className="flex flex-wrap gap-2">
              <CopyButton text={link} label="Kopiér link" />
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary", "px-2.5 py-1 text-xs")}
              >
                Åbn bookingsiden
              </a>
              <a href={qrPng} download="booking-qr.png" className={buttonClass("secondary", "px-2.5 py-1 text-xs")}>
                Hent QR-kode
              </a>
            </div>
            {isAdmin && (
              <form action={newBookingLink}>
                <ConfirmButton
                  variant="secondary"
                  className="px-2.5 py-1 text-xs"
                  message="Lav et nyt link? Det gamle link og den gamle QR-kode holder op med at virke."
                >
                  Lav nyt link
                </ConfirmButton>
              </form>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Ydelser"
        description="Varighed i minutter og pris i kr. inkl. moms. 'Påmind' sender kunden en påmindelse om en ny behandling efter et antal måneder."
      >
        {services.length > 0 && (
          <ul className="mb-5 space-y-4" aria-label="Ydelser">
            {services.map((s) => (
              <li key={s.id} aria-label={`Ydelse ${s.name}`} className="rounded-md border border-slate-200 p-3">
                {isAdmin ? (
                  <form action={updateService} className="space-y-2">
                    <input type="hidden" name="id" value={s.id} />
                    <ServiceFields service={s} />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="active" defaultChecked={s.active} className="h-4 w-4" />
                        Aktiv
                      </label>
                      <Button type="submit" variant="secondary" className="px-2.5 py-1 text-xs">
                        Gem
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="text-sm">{s.name}</p>
                )}
                {isAdmin && (
                  <form action={deleteService} className="mt-2">
                    <input type="hidden" name="id" value={s.id} />
                    <ConfirmButton
                      className="px-2.5 py-1 text-xs"
                      message={`Slet "${s.name}"? Tidligere bookinger bevares.`}
                    >
                      Slet
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <form action={addService} className="space-y-2 rounded-md bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">Ny ydelse</p>
            <ServiceFields />
            <Button type="submit">Tilføj ydelse</Button>
          </form>
        )}
      </Card>

      <Card title="Åbningstider og regler">
        {isAdmin ? (
          <RulesForm
            initial={{
              slotMinutes: settings.slotMinutes,
              capacity: settings.capacity,
              minNoticeHours: settings.minNoticeHours,
              maxDaysAhead: settings.maxDaysAhead,
              cancelHours: settings.cancelHours,
              intro: settings.intro ?? "",
              openingHours: settings.openingHours,
            }}
          />
        ) : (
          <p className="text-sm text-slate-600">Kun administratorer kan ændre åbningstider og regler.</p>
        )}
      </Card>
    </div>
  );
}
