"use client";

import { useActionState } from "react";
import { setPasswordWithToken } from "@/app/actions/password";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function SetPasswordForm({ token, submitLabel }: { token: string; submitLabel: string }) {
  const [state, action] = useActionState(setPasswordWithToken.bind(null, token), {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Ny adgangskode (min. 8 tegn)" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Gentag adgangskode" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Gemmer…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
