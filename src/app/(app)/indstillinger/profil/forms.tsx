"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "@/app/actions/auth";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function ProfileForm({
  name,
  emailNotifications,
  types,
  muted,
}: {
  name: string;
  emailNotifications: boolean;
  types: { key: string; label: string }[];
  muted: string[];
}) {
  const [state, action] = useActionState(updateProfile, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Navn" htmlFor="p-name">
        <Input id="p-name" name="name" defaultValue={name} required />
      </Field>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <input type="checkbox" name="emailNotifications" defaultChecked={emailNotifications} className="h-4 w-4" />
        Send mig notifikationer på e-mail
      </label>
      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-xs text-slate-500">Hvilke vil du have på e-mail? (De vises altid i appen.)</legend>
        <input type="hidden" name="prefs" value="1" />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {types.map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name={`email_${t.key}`}
                defaultChecked={!muted.includes(t.key)}
                className="h-4 w-4"
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
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
