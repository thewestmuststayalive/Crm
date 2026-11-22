"use client";

import { useActionState } from "react";
import { saveEmailTexts } from "@/app/actions/workspace";
import { Field, FormMessage, SubmitButton, Textarea } from "@/components/ui";

type TextField = { key: string; label: string; placeholder: string; vars: string[]; value: string };

export function EmailTextsForm({ fields }: { fields: TextField[] }) {
  const [state, action] = useActionState(saveEmailTexts, {});
  return (
    <form action={action} className="space-y-5">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <Field label={f.label} htmlFor={`txt-${f.key}`}>
            <Textarea id={`txt-${f.key}`} name={f.key} rows={3} defaultValue={f.value} placeholder={f.placeholder} />
          </Field>
          <p className="text-xs text-slate-500">Kan bruge: {f.vars.map((v) => `{${v}}`).join(", ")}</p>
        </div>
      ))}
      <FormMessage state={state} />
      <SubmitButton>Gem tekster</SubmitButton>
    </form>
  );
}
