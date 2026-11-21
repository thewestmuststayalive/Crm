"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { findCompanyInCvr, type CvrResult } from "@/app/actions/cvr";
import type { ActionState } from "@/app/actions/types";
import { buttonClass } from "@/components/styles";
import { Button, Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";

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
  const formRef = useRef<HTMLFormElement>(null);
  const [cvrQuery, setCvrQuery] = useState("");
  const [cvr, setCvr] = useState<CvrResult | null>(null);
  const [looking, startLookup] = useTransition();

  // Udfyld felterne med data fra CVR (overskriver det, der står).
  function lookup() {
    startLookup(async () => {
      const result = await findCompanyInCvr(cvrQuery);
      setCvr(result);
      const c = result.company;
      const form = formRef.current;
      if (!c || !form) return;
      const set = (name: string, value: string | null) => {
        const el = form.elements.namedItem(name) as HTMLInputElement | null;
        if (el && value) el.value = value;
      };
      set("name", c.name);
      set("cvr", c.cvr);
      set("phone", c.phone);
      set("email", c.email);
      set("address", c.address);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-brand-50 p-4">
        <label htmlFor="cvr-search" className="text-sm font-medium text-brand-900">
          Hent oplysninger fra CVR
        </label>
        <div className="mt-2 flex gap-2">
          <Input
            id="cvr-search"
            value={cvrQuery}
            onChange={(e) => setCvrQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                lookup();
              }
            }}
            placeholder="CVR-nummer eller firmanavn"
          />
          <Button type="button" variant="secondary" onClick={lookup} disabled={looking || cvrQuery.trim().length < 2}>
            {looking ? "Henter…" : "Hent"}
          </Button>
        </div>
        {cvr?.error && <p className="mt-2 text-sm text-red-700">{cvr.error}</p>}
        {cvr?.company && (
          <p role="status" className="mt-2 text-sm text-brand-800">
            Udfyldt med {cvr.company.name}
            {cvr.company.industry && ` · ${cvr.company.industry}`}
          </p>
        )}
        {cvr?.company?.protected && (
          <p className="mt-1 text-sm font-medium text-accent-700">
            Virksomheden er reklamebeskyttet: kontakt den ikke med markedsføring uden samtykke.
          </p>
        )}
      </div>
      <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-2" key={k}>
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
          <Input
            id="co-website"
            name="website"
            defaultValue={v.website ?? ""}
            placeholder="eksempel.dk"
            maxLength={200}
          />
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
    </div>
  );
}
