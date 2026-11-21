"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionState } from "@/app/actions/types";
import { buttonClass } from "@/components/styles";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";
import { SOURCE_LABELS, STAGE_LABELS } from "@/lib/labels";

type Option = { id: string; name: string };
export type DealFormValues = {
  title?: string;
  value?: number | string;
  stage?: string;
  source?: string;
  contactId?: string | null;
  companyId?: string | null;
  ownerId?: string | null;
  expectedCloseDate?: string | null;
  lostReason?: string | null;
};

export function DealForm({
  action,
  initial,
  contacts,
  companies,
  members,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: DealFormValues;
  contacts: Option[];
  companies: Option[];
  members: Option[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const v = { ...initial, ...state.values };
  const k = JSON.stringify(state.values ?? {});

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2" key={k}>
      <div className="sm:col-span-2">
        <Field label="Titel *" htmlFor="d-title">
          <Input id="d-title" name="title" defaultValue={v.title ?? ""} placeholder="Fx “Ny hjemmeside til Kunde ApS”" required maxLength={200} />
        </Field>
      </div>
      <Field label="Værdi (kr.)" htmlFor="d-value">
        <Input id="d-value" name="value" inputMode="decimal" defaultValue={v.value?.toString() ?? ""} placeholder="0" />
      </Field>
      <Field label="Fase" htmlFor="d-stage">
        <Select id="d-stage" name="stage" defaultValue={v.stage ?? "NEW"} className="w-full">
          {Object.entries(STAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kontaktperson" htmlFor="d-contact">
        <Select id="d-contact" name="contactId" defaultValue={v.contactId ?? ""} className="w-full">
          <option value="">Ingen</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Virksomhed" htmlFor="d-company">
        <Select id="d-company" name="companyId" defaultValue={v.companyId ?? ""} className="w-full">
          <option value="">Kontaktens virksomhed / ingen</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ansvarlig" htmlFor="d-owner">
        <Select id="d-owner" name="ownerId" defaultValue={v.ownerId ?? ""} className="w-full">
          <option value="">Ingen</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Forventet lukning" htmlFor="d-close">
        <Input id="d-close" name="expectedCloseDate" type="date" defaultValue={v.expectedCloseDate ?? ""} />
      </Field>
      <Field label="Kilde" htmlFor="d-source">
        <Select id="d-source" name="source" defaultValue={v.source ?? "MANUAL"} className="w-full">
          {Object.entries(SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Årsag hvis tabt" htmlFor="d-lost">
        <Input id="d-lost" name="lostReason" defaultValue={v.lostReason ?? ""} maxLength={500} />
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
