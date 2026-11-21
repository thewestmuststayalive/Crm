"use client";

import { useActionState } from "react";
import { createWorkspace } from "@/app/actions/workspace";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function CreateWorkspaceForm() {
  const [state, action] = useActionState(createWorkspace, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Firmanavn" htmlFor="ws-name">
        <Input id="ws-name" name="name" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Opretter…">Opret firma</SubmitButton>
    </form>
  );
}
