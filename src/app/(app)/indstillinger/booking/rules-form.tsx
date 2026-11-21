"use client";

import { useActionState } from "react";
import { saveBookingRules } from "@/app/actions/booking-settings";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import type { OpeningDay } from "@/db/schema";

const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
const INTERVALS = [15, 20, 30, 45, 60, 90, 120];

type Rules = {
  slotMinutes: number;
  capacity: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  cancelHours: number;
  intro: string;
  openingHours: OpeningDay[];
};

export function RulesForm({ initial }: { initial: Rules }) {
  const [state, action] = useActionState(saveBookingRules, {});
  const v = (k: keyof Omit<Rules, "openingHours">) => state.values?.[k] ?? String(initial[k]);
  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Åbningstider</legend>
        <div className="mt-2 space-y-2">
          {WEEKDAYS.map((day, i) => {
            const d = initial.openingHours[i];
            return (
              <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex w-28 items-center gap-2">
                  <input type="checkbox" name={`open_${i}`} defaultChecked={d.open} className="h-4 w-4" />
                  {day}
                </label>
                <Input
                  type="time"
                  name={`from_${i}`}
                  defaultValue={d.from}
                  aria-label={`${day} fra`}
                  className="w-28"
                />
                <span>–</span>
                <Input type="time" name={`to_${i}`} defaultValue={d.to} aria-label={`${day} til`} className="w-28" />
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ledige tider hvert" htmlFor="r-slot">
          <Select id="r-slot" name="slotMinutes" defaultValue={v("slotMinutes")} className="w-full">
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m} minutter
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Samtidige bookinger (fx pladser i hallen)" htmlFor="r-capacity">
          <Input id="r-capacity" name="capacity" type="number" min={1} max={50} defaultValue={v("capacity")} />
        </Field>
        <Field label="Kunden skal booke mindst (timer før)" htmlFor="r-notice">
          <Input
            id="r-notice"
            name="minNoticeHours"
            type="number"
            min={0}
            max={336}
            defaultValue={v("minNoticeHours")}
          />
        </Field>
        <Field label="Kunden kan booke op til (dage frem)" htmlFor="r-ahead">
          <Input id="r-ahead" name="maxDaysAhead" type="number" min={1} max={365} defaultValue={v("maxDaysAhead")} />
        </Field>
        <Field label="Kunden kan selv aflyse indtil (timer før)" htmlFor="r-cancel">
          <Input id="r-cancel" name="cancelHours" type="number" min={0} max={336} defaultValue={v("cancelHours")} />
        </Field>
      </div>
      <Field label="Tekst øverst på bookingsiden (valgfri)" htmlFor="r-intro">
        <Textarea
          id="r-intro"
          name="intro"
          rows={3}
          defaultValue={v("intro")}
          placeholder="Fx: Aflever bilen fra kl. 7.45. Vi ringer, når den er klar."
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Gem</SubmitButton>
    </form>
  );
}
