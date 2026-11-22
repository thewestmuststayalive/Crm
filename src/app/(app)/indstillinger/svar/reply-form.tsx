"use client";

import { useActionState } from "react";
import { saveReply } from "@/app/actions/saved-replies";
import { Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui";

export function SavedReplyForm({ initial }: { initial?: { id: string; title: string; body: string } }) {
  const [state, action] = useActionState(saveReply, {});
  const v = { ...initial, ...(state.error ? state.values : {}) };
  const prefix = initial?.id ?? "new";
  return (
    <form action={action} className="space-y-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Navn" htmlFor={`sr-${prefix}-title`}>
        <Input
          id={`sr-${prefix}-title`}
          name="title"
          required
          maxLength={60}
          defaultValue={v.title}
          placeholder="Fx Åbningstider"
        />
      </Field>
      <Field label="Tekst" htmlFor={`sr-${prefix}-body`}>
        <Textarea id={`sr-${prefix}-body`} name="body" rows={4} required defaultValue={v.body} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant={initial ? "secondary" : "primary"}>{initial ? "Gem" : "Opret skabelon"}</SubmitButton>
    </form>
  );
}
