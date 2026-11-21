"use client";

import { useActionState } from "react";
import { createLeadForm } from "@/app/actions/lead-forms";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";

export function CreateLeadFormForm({
  members,
  defaultAssigneeId,
}: {
  members: { id: string; name: string }[];
  defaultAssigneeId: string;
}) {
  const [state, action] = useActionState(createLeadForm, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Navn" htmlFor="lf-name">
        <Input id="lf-name" name="name" placeholder="Fx eksempel.dk" defaultValue={state.values?.name} required />
      </Field>
      <Field label="Nye leads tildeles" htmlFor="lf-assignee">
        <Select id="lf-assignee" name="assigneeId" defaultValue={state.values?.assigneeId ?? defaultAssigneeId} className="w-full">
          <option value="">Ingen</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Takkeside (valgfri)" htmlFor="lf-redirect">
          <Input
            id="lf-redirect"
            name="redirectUrl"
            placeholder="https://eksempel.dk/tak"
            defaultValue={state.values?.redirectUrl}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" name="createDeal" defaultChecked className="h-4 w-4" />
        Opret automatisk en deal i pipelinen for hver ny henvendelse
      </label>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pendingText="Opretter…">Opret formular</SubmitButton>
      </div>
    </form>
  );
}
