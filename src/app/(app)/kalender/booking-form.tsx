"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/app/actions/types";
import { buttonClass } from "@/components/styles";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import Link from "next/link";

type Option = { id: string; name: string };
type ServiceOption = Option & { durationMinutes: number; price: string };

export type BookingFormInitial = {
  contactId?: string;
  plate?: string;
  serviceId?: string;
  date?: string;
  time?: string;
  duration?: string;
  price?: string;
  assigneeId?: string;
  internalNote?: string;
};

/** Formular til at oprette (med kundevalg) eller rette en booking. */
export function BookingForm({
  action,
  mode,
  contacts,
  services,
  members,
  initial,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  mode: "create" | "edit";
  contacts?: Option[];
  services: ServiceOption[];
  members: Option[];
  initial: BookingFormInitial;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const v = { ...initial, ...state.values } as Record<string, string | undefined>;
  const [contactId, setContactId] = useState(v.contactId ?? "");
  const [duration, setDuration] = useState(v.duration ?? "");
  const [price, setPrice] = useState(v.price ?? "");

  return (
    <form action={formAction} className="space-y-5">
      {mode === "create" && (
        <fieldset className="space-y-3">
          <Field label="Kunde" htmlFor="bk-contact">
            <Select
              id="bk-contact"
              name="contactId"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full"
            >
              <option value="">Ny kunde …</option>
              {contacts?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {!contactId && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Navn" htmlFor="bk-name">
                <Input id="bk-name" name="newName" defaultValue={v.newName} />
              </Field>
              <Field label="Telefon" htmlFor="bk-phone">
                <Input id="bk-phone" name="newPhone" type="tel" defaultValue={v.newPhone} />
              </Field>
              <Field label="E-mail" htmlFor="bk-email">
                <Input id="bk-email" name="newEmail" type="email" defaultValue={v.newEmail} />
              </Field>
            </div>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "create" ? (
          <Field label="Ydelse" htmlFor="bk-service">
            <Select
              id="bk-service"
              name="serviceId"
              defaultValue={v.serviceId ?? ""}
              className="w-full"
              onChange={(e) => {
                const s = services.find((x) => x.id === e.target.value);
                if (s) {
                  setDuration(String(s.durationMinutes));
                  setPrice(s.price);
                }
              }}
            >
              <option value="">Vælg ydelse …</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="serviceId" value={v.serviceId ?? ""} />
        )}
        <Field label="Nummerplade" htmlFor="bk-plate">
          <Input id="bk-plate" name="plate" defaultValue={v.plate} placeholder="AB 12 345" className="uppercase" />
        </Field>
        <Field label="Dato" htmlFor="bk-date">
          <Input id="bk-date" name="date" type="date" required defaultValue={v.date} />
        </Field>
        <Field label="Tidspunkt" htmlFor="bk-time">
          <Input id="bk-time" name="time" type="time" required step={300} defaultValue={v.time} />
        </Field>
        <Field label="Varighed (minutter)" htmlFor="bk-duration">
          <Input
            id="bk-duration"
            name="duration"
            type="number"
            min={5}
            step={5}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>
        <Field label="Pris (kr.)" htmlFor="bk-price">
          <Input
            id="bk-price"
            name="price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label="Medarbejder" htmlFor="bk-assignee">
          <Select id="bk-assignee" name="assigneeId" defaultValue={v.assigneeId ?? ""} className="w-full">
            <option value="">Ingen</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Intern note" htmlFor="bk-note">
        <Textarea id="bk-note" name="internalNote" rows={2} defaultValue={v.internalNote} />
      </Field>

      <div className="space-y-2 text-sm text-slate-700">
        {mode === "create" ? (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="sendConfirmation" defaultChecked className="h-4 w-4" />
              Send bekræftelse til kunden på e-mail
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="allowOverlap" className="h-4 w-4" />
              Book alligevel, selvom tiden er fuld
            </label>
          </>
        ) : (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="notifyCustomer" defaultChecked className="h-4 w-4" />
            Send ny tid til kunden, hvis tiden ændres
          </label>
        )}
      </div>

      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton>{mode === "create" ? "Opret booking" : "Gem ændringer"}</SubmitButton>
        <Link href={cancelHref} className={buttonClass("secondary")}>
          Annullér
        </Link>
      </div>
    </form>
  );
}
