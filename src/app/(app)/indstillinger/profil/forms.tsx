"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "@/app/actions/auth";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function ProfileForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateProfile, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Navn" htmlFor="p-name">
        <Input id="p-name" name="name" defaultValue={name} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Gem</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Nuværende adgangskode" htmlFor="p-current">
        <Input id="p-current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Ny adgangskode (min. 8 tegn)" htmlFor="p-next">
        <Input id="p-next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Skift adgangskode</SubmitButton>
    </form>
  );
}
