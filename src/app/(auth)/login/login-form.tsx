"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function LoginForm() {
  const [state, action] = useActionState(login, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
      </Field>
      <Field label="Adgangskode" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Logger ind…">
        Log ind
      </SubmitButton>
    </form>
  );
}
