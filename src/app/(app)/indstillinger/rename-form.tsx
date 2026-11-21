"use client";

import { useActionState } from "react";
import { renameWorkspace } from "@/app/actions/workspace";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function RenameWorkspaceForm({ name }: { name: string }) {
  const [state, action] = useActionState(renameWorkspace, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Firmanavn" htmlFor="rename">
        <Input id="rename" name="name" defaultValue={name} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Gem</SubmitButton>
    </form>
  );
}
