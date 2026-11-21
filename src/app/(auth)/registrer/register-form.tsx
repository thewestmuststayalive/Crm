"use client";

import { useActionState } from "react";
import { register } from "@/app/actions/auth";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function RegisterForm() {
  const [state, action] = useActionState(register, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Dit navn" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" defaultValue={state.values?.name} required />
      </Field>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
      </Field>
      <Field label="Adgangskode (min. 8 tegn)" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Firmanavn" htmlFor="company">
        <Input id="company" name="company" defaultValue={state.values?.company} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Opretter…">
        Opret konto
      </SubmitButton>
    </form>
  );
}
