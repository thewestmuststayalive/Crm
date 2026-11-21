"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/password";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordReset, {});
  if (state.success) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Sender…">
        Send link
      </SubmitButton>
    </form>
  );
}
