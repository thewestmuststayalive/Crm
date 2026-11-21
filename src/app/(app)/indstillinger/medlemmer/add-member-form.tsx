"use client";

import { useActionState } from "react";
import { addMember } from "@/app/actions/members";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";

export function AddMemberForm({ roles }: { roles: { value: string; label: string }[] }) {
  const [state, action] = useActionState(addMember, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Navn" htmlFor="m-name">
        <Input id="m-name" name="name" defaultValue={state.values?.name} required />
      </Field>
      <Field label="E-mail" htmlFor="m-email">
        <Input id="m-email" name="email" type="email" defaultValue={state.values?.email} required />
      </Field>
      <Field label="Midlertidig adgangskode" htmlFor="m-password">
        <Input id="m-password" name="password" type="text" minLength={8} autoComplete="off" required />
      </Field>
      <Field label="Rolle" htmlFor="m-role">
        <Select id="m-role" name="role" defaultValue={state.values?.role ?? "MEMBER"} key={state.values?.role} className="w-full">
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pendingText="Tilføjer…">Tilføj medlem</SubmitButton>
      </div>
    </form>
  );
}
