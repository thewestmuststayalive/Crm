"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { getPublicSlots, submitPublicBooking, type PublicBookingState } from "@/app/actions/booking-public";
import { Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui";
import { cx } from "@/components/styles";
import { PayButton } from "@/app/faktura/[token]/pay-button";
import { formatOre } from "@/lib/quote-math";

type ServiceOption = { id: string; name: string; description: string | null; duration: string; price: string | null };

const dayLabel = new Intl.DateTimeFormat("da-DK", { weekday: "short", timeZone: "UTC" });
const dateLabel = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" });
const longLabel = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const asUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-xs text-white">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BookingForm({
  bookingKey,
  services,
  days,
  companyName,
}: {
  bookingKey: string;
  services: ServiceOption[];
  days: { date: string; open: boolean }[];
  companyName: string;
}) {
  const [state, action] = useActionState<PublicBookingState, FormData>(submitPublicBooking, {});
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (!serviceId || !date) return;
    startLoading(async () => {
      const result = await getPublicSlots(bookingKey, serviceId, date);
      setSlots(result);
      setTime((t) => (result.includes(t) ? t : ""));
    });
  }, [bookingKey, serviceId, date]);

  if (state.booked) {
    return (
      <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <p className="text-lg font-semibold">Din tid er booket</p>
        <p className="mt-2">
          {state.booked.service} {state.booked.when}.
        </p>
        <p className="mt-2 text-sm">
          {state.booked.emailed
            ? "Du har fået en bekræftelse på e-mail med et link, hvis du skal aflyse."
            : `Gem gerne tidspunktet. Kontakt ${companyName}, hvis du skal aflyse.`}
        </p>
        {state.booked.deposit && (
          <div className="mt-4 space-y-2 border-t border-emerald-200 pt-4">
            <p className="text-sm font-medium">
              Betal venligst depositum på {formatOre(state.booked.deposit.ore)}. Det trækkes fra prisen.
            </p>
            <PayButton token={state.booked.deposit.token} kind="deposit" label="Betal depositum med MobilePay eller kort" />
          </div>
        )}
      </section>
    );
  }

  const v = state.values ?? {};
  const chosenService = services.find((s) => s.id === serviceId);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="key" value={bookingKey} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />
      <div className="hidden" aria-hidden>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <Step n={1} title="Vælg behandling">
        <div className="grid gap-2" role="radiogroup" aria-label="Behandling">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={serviceId === s.id}
              onClick={() => setServiceId(s.id)}
              className={cx(
                "flex items-start justify-between gap-4 rounded-lg border p-3 text-left",
                serviceId === s.id
                  ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                  : "border-slate-200 hover:bg-slate-50",
              )}
            >
              <span>
                <span className="block font-medium text-slate-900">{s.name}</span>
                {s.description && <span className="mt-0.5 block text-sm text-slate-600">{s.description}</span>}
                <span className="mt-0.5 block text-xs text-slate-500">{s.duration}</span>
              </span>
              {s.price && <span className="shrink-0 font-semibold text-slate-900">{s.price}</span>}
            </button>
          ))}
        </div>
      </Step>

      {serviceId && (
        <Step n={2} title="Vælg dag og tid">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="radiogroup" aria-label="Dag">
            {days.map((d) => (
              <button
                key={d.date}
                type="button"
                role="radio"
                aria-checked={date === d.date}
                aria-label={longLabel.format(asUtc(d.date))}
                disabled={!d.open}
                onClick={() => setDate(d.date)}
                className={cx(
                  "flex w-16 shrink-0 flex-col items-center rounded-lg border px-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40",
                  date === d.date
                    ? "border-brand-600 bg-brand-700 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <span className="text-xs capitalize">{dayLabel.format(asUtc(d.date))}</span>
                <span className="font-medium">{dateLabel.format(asUtc(d.date))}</span>
              </button>
            ))}
          </div>
          {date && (
            <div className="mt-3" aria-live="polite">
              {loading || slots === null ? (
                <p className="text-sm text-slate-500">Finder ledige tider…</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-slate-600">Ingen ledige tider denne dag. Prøv en anden dag.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Tidspunkt">
                  {slots.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={time === t}
                      onClick={() => setTime(t)}
                      className={cx(
                        "rounded-md border px-2 py-2 text-sm font-medium",
                        time === t ? "border-brand-600 bg-brand-700 text-white" : "border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Step>
      )}

      {serviceId && date && time && (
        <Step n={3} title="Dine oplysninger">
          <p className="mb-4 text-sm text-slate-600">
            {chosenService?.name}, {longLabel.format(asUtc(date))} kl. {time}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Navn" htmlFor="b-name">
              <Input id="b-name" name="name" autoComplete="name" required defaultValue={v.name} />
            </Field>
            <Field label="Telefon" htmlFor="b-phone">
              <Input id="b-phone" name="phone" type="tel" autoComplete="tel" required defaultValue={v.phone} />
            </Field>
            <Field label="E-mail (til bekræftelse)" htmlFor="b-email">
              <Input id="b-email" name="email" type="email" autoComplete="email" defaultValue={v.email} />
            </Field>
            <Field label="Nummerplade" htmlFor="b-plate">
              <Input id="b-plate" name="plate" placeholder="AB 12 345" defaultValue={v.plate} className="uppercase" />
            </Field>
            <Field label="Bil (mærke og model)" htmlFor="b-car">
              <Input id="b-car" name="car" placeholder="Fx VW Golf" defaultValue={v.car} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Besked (valgfri)" htmlFor="b-note">
              <Textarea id="b-note" name="note" rows={2} maxLength={1000} defaultValue={v.note} />
            </Field>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4" />
            <span>
              Jeg accepterer, at {companyName} gemmer mine oplysninger for at håndtere bookingen og kontakte mig om den.
            </span>
          </label>
          <div className="mt-4 space-y-3">
            <FormMessage state={state} />
            <SubmitButton pendingText="Booker…">Book tid</SubmitButton>
          </div>
        </Step>
      )}
    </form>
  );
}
