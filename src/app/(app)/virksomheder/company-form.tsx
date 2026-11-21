"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionState } from "@/app/actions/types";
import { buttonClass } from "@/components/styles";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";

type Option = { id: string; name: string };
export type CompanyFormValues = {
  name?: string;
  cvr?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  ownerId?: string | null;
};

export function CompanyForm({
  action,
  initial,
  members,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: CompanyFormValues;
  members: Option[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const v = { ...initial, ...state.values };
  const k = JSON.stringify(state.values ?? {});

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2" key={k}>
      <Field label="Navn *" htmlFor="co-name">
        <Input id="co-name" name="name" defaultValue={v.name ?? ""} required maxLength={200} />
      </Field>
      <Field label="CVR-nummer" htmlFor="co-cvr">
        <Input id="co-cvr" name="cvr" defaultValue={v.cvr ?? ""} maxLength={20} inputMode="numeric" />
      </Field>
      <Field label="E-mail" htmlFor="co-email">
        <Input id="co-email" name="email" type="email" defaultValue={v.email ?? ""} />
      </Field>
      <Field label="Telefon" htmlFor="co-phone">
        <Input id="co-phone" name="phone" type="tel" defaultValue={v.phone ?? ""} maxLength={50} />
      </Field>
      <Field label="Hjemmeside" htmlFor="co-website">
        <Input id="co-website" name="website" defaultValue={v.website ?? ""} placeholder="eksempel.dk" maxLength={200} />
      </Field>
      <Field label="Ansvarlig" htmlFor="co-owner">
        <Select id="co-owner" name="ownerId" defaultValue={v.ownerId ?? ""} className="w-full">
          <option value="">Ingen</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Adresse" htmlFor="co-address">
          <Input id="co-address" name="address" defaultValue={v.address ?? ""} maxLength={300} />
        </Field>
      </div>
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
