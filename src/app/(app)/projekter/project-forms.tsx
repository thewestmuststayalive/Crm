"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { createProject, saveTemplate } from "@/app/actions/projects";
import type { ActionState } from "@/app/actions/types";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui";

type Option = { id: string; name: string };

export function ProjectTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/projekter", label: "Projekter" },
    { href: "/projekter/skabeloner", label: "Skabeloner" },
  ];
  return (
    <nav className="flex gap-4 border-b border-slate-200">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
            pathname === tab.href
              ? "border-brand-700 text-brand-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function CompanySelect({ id, companies, value }: { id: string; companies: Option[]; value?: string }) {
  return (
    <Select id={id} name="companyId" defaultValue={value ?? ""} className="w-full">
      <option value="">Ingen kunde (internt)</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

function OwnerSelect({ id, members, value }: { id: string; members: Option[]; value?: string }) {
  return (
    <Select id={id} name="ownerId" defaultValue={value ?? ""} className="w-full">
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </Select>
  );
}

export function NewProjectForm({
  companies,
  members,
  templates,
  defaults,
}: {
  companies: Option[];
  members: Option[];
  templates: Option[];
  defaults: { ownerId: string; startDate: string; companyId?: string };
}) {
  const [state, action] = useActionState(createProject, {});
  const v: Record<string, string | undefined> = { ...defaults, ...state.values };
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Projektnavn" htmlFor="p-name">
          <Input id="p-name" name="name" required defaultValue={v.name} placeholder="Fx Ny hjemmeside" />
        </Field>
        <Field label="Kunde" htmlFor="p-company">
          <CompanySelect id="p-company" companies={companies} value={v.companyId} />
        </Field>
        <Field label="Skabelon" htmlFor="p-template">
          <Select id="p-template" name="templateId" defaultValue={v.templateId ?? ""} className="w-full">
            <option value="">Ingen – tom opgaveliste</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ansvarlig" htmlFor="p-owner">
          <OwnerSelect id="p-owner" members={members} value={v.ownerId} />
        </Field>
        <Field label="Start" htmlFor="p-start">
          <Input id="p-start" name="startDate" type="date" defaultValue={v.startDate} />
        </Field>
        <Field label="Deadline (valgfri)" htmlFor="p-due">
          <Input id="p-due" name="dueDate" type="date" defaultValue={v.dueDate} />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Opret projekt</SubmitButton>
    </form>
  );
}

export function EditProjectForm({
  action,
  companies,
  members,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  companies: Option[];
  members: Option[];
  initial: { name: string; companyId: string; ownerId: string; dueDate: string; description: string };
}) {
  const [state, formAction] = useActionState(action, {});
  const v = { ...initial, ...state.values };
  return (
    <form action={formAction} className="space-y-3">
      <Field label="Projektnavn" htmlFor="pe-name">
        <Input id="pe-name" name="name" required defaultValue={v.name} />
      </Field>
      <Field label="Kunde" htmlFor="pe-company">
        <CompanySelect id="pe-company" companies={companies} value={v.companyId} />
      </Field>
      <Field label="Ansvarlig" htmlFor="pe-owner">
        <OwnerSelect id="pe-owner" members={members} value={v.ownerId} />
      </Field>
      <Field label="Deadline" htmlFor="pe-due">
        <Input id="pe-due" name="dueDate" type="date" defaultValue={v.dueDate} />
      </Field>
      <Field label="Beskrivelse" htmlFor="pe-desc">
        <Textarea id="pe-desc" name="description" rows={3} defaultValue={v.description} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Gem</SubmitButton>
    </form>
  );
}

export function TemplateForm({ initial }: { initial?: { id: string; name: string; items: string } }) {
  const [state, action] = useActionState(saveTemplate, {});
  const v = { ...initial, ...(state.error ? state.values : {}) };
  const prefix = initial?.id ?? "new";
  return (
    <form action={action} className="space-y-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Navn" htmlFor={`t-${prefix}-name`}>
        <Input id={`t-${prefix}-name`} name="name" required defaultValue={v.name} placeholder="Fx Ny hjemmeside" />
      </Field>
      <Field label="Opgaver – én pr. linje, evt. med dage efter start: Titel | 7" htmlFor={`t-${prefix}-items`}>
        <Textarea
          id={`t-${prefix}-items`}
          name="items"
          rows={6}
          required
          defaultValue={v.items}
          placeholder={"Opstartsmøde | 0\nFørste udkast | 7\nKunden godkender | 10"}
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant={initial ? "secondary" : "primary"}>{initial ? "Gem" : "Opret skabelon"}</SubmitButton>
    </form>
  );
}
