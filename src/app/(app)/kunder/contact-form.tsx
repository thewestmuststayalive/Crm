"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionState } from "@/app/actions/types";
import { buttonClass } from "@/components/styles";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";
import { SOURCE_LABELS, STATUS_LABELS } from "@/lib/labels";

type Option = { id: string; name: string };
export type ContactFormValues = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  status?: string;
  source?: string;
  companyId?: string | null;
  ownerId?: string | null;
};

export function ContactForm({
  action,
  initial,
  companies,
  members,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: ContactFormValues;
  companies: Option[];
  members: Option[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, {});
  // Efter en fejl udfyldes formularen med det, brugeren skrev.
  const v = { ...initial, ...state.values };
  const k = JSON.stringify(state.values ?? {});

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2" key={k}>
      <Field label="Navn *" htmlFor="c-name">
        <Input id="c-name" name="name" defaultValue={v.name ?? ""} required maxLength={200} />
      </Field>
      <Field label="Stilling" htmlFor="c-title">
        <Input id="c-title" name="title" defaultValue={v.title ?? ""} maxLength={100} />
      </Field>
      <Field label="E-mail" htmlFor="c-email">
        <Input id="c-email" name="email" type="email" defaultValue={v.email ?? ""} />
      </Field>
      <Field label="Telefon" htmlFor="c-phone">
        <Input id="c-phone" name="phone" type="tel" defaultValue={v.phone ?? ""} maxLength={50} />
      </Field>
      <Field label="Status" htmlFor="c-status">
        <Select id="c-status" name="status" defaultValue={v.status ?? "LEAD"} className="w-full">
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kilde" htmlFor="c-source">
        <Select id="c-source" name="source" defaultValue={v.source ?? "MANUAL"} className="w-full">
          {Object.entries(SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Virksomhed" htmlFor="c-company">
        <Select id="c-company" name="companyId" defaultValue={v.companyId ?? ""} className="w-full">
          <option value="">Ingen (privatkunde)</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="… eller opret ny virksomhed" htmlFor="c-newcompany">
        <Input id="c-newcompany" name="newCompanyName" placeholder="Virksomhedens navn" maxLength={200} />
      </Field>
      <Field label="Ansvarlig" htmlFor="c-owner">
        <Select id="c-owner" name="ownerId" defaultValue={v.ownerId ?? ""} className="w-full">
          <option value="">Ingen</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <div className="flex gap-2">
          <SubmitButton>{submitLabel}</SubmitButton>
          <Link href={cancelHref} className={buttonClass("secondary")}>
            Annuller
          </Link>
        </div>
      </div>
    </form>
  );
}
