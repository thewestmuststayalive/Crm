"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { addManualProspect, createList, updateLeadSettings } from "@/app/actions/leads";
import { cx } from "@/components/styles";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

const TABS = [
  { href: "/leads", label: "Lister" },
  { href: "/leads/google", label: "Søg i Google Maps" },
  { href: "/leads/cvr", label: "Søg i CVR" },
];

export function LeadTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Find leads">
      {TABS.map((t) => {
        const active = t.href === "/leads" ? pathname === "/leads" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-brand-600 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-900",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NewListForm() {
  const [state, action] = useActionState(createList, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1">
        <Field label="Navn på listen" htmlFor="list-name">
          <Input
            id="list-name"
            name="name"
            required
            maxLength={80}
            placeholder="Fx Frisører i Aarhus"
            defaultValue={state.values?.name}
          />
        </Field>
      </div>
      <SubmitButton pendingText="Opretter…">Opret liste</SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function LeadSettingsForm({ limit }: { limit: number }) {
  const [state, action] = useActionState(updateLeadSettings, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="w-48">
        <Field label="Loft pr. måned (Google)" htmlFor="lead-limit">
          <Input
            id="lead-limit"
            name="limit"
            type="number"
            min={0}
            max={5000}
            required
            defaultValue={state.values?.limit ?? limit}
          />
        </Field>
      </div>
      <SubmitButton variant="secondary">Gem loft</SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ManualProspectForm({ listId }: { listId: string }) {
  const [state, action] = useActionState(addManualProspect, {});
  const v = state.error ? (state.values ?? {}) : {};
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" key={state.success}>
      <input type="hidden" name="listId" value={listId} />
      <Field label="Firmanavn" htmlFor="mp-name">
        <Input id="mp-name" name="name" required maxLength={200} defaultValue={v.name} />
      </Field>
      <Field label="Telefon" htmlFor="mp-phone">
        <Input id="mp-phone" name="phone" type="tel" maxLength={40} defaultValue={v.phone} />
      </Field>
      <Field label="Hjemmeside" htmlFor="mp-website">
        <Input id="mp-website" name="website" maxLength={500} placeholder="eksempel.dk" defaultValue={v.website} />
      </Field>
      <Field label="CVR-nummer" htmlFor="mp-cvr">
        <Input id="mp-cvr" name="cvr" inputMode="numeric" maxLength={11} defaultValue={v.cvr} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Adresse" htmlFor="mp-address">
          <Input id="mp-address" name="address" maxLength={300} defaultValue={v.address} />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton variant="secondary">Tilføj firma</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
