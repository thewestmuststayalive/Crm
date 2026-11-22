"use client";

import { useActionState, useState } from "react";
import { deleteWorkspace } from "@/app/actions/workspace";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function DeleteWorkspaceForm({ name }: { name: string }) {
  const [state, action] = useActionState(deleteWorkspace, {});
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-slate-700">
        Download gerne alle data først. Skriv <strong>{name}</strong> for at bekræfte.
      </p>
      <Field label="Firmanavn" htmlFor="confirm-name">
        <Input
          id="confirm-name"
          name="confirmName"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="danger" disabled={typed.trim() !== name} pendingText="Sletter…">
        Slet firmaet for altid
      </SubmitButton>
    </form>
  );
}
