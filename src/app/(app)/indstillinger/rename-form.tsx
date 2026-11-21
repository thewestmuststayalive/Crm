"use client";

import { useActionState } from "react";
import { renameWorkspace } from "@/app/actions/workspace";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";

const TARGETS = [
  [15, "15 minutter"],
  [30, "30 minutter"],
  [60, "1 time"],
  [120, "2 timer"],
  [240, "4 timer"],
  [480, "8 timer"],
  [1440, "1 døgn"],
] as const;

export function RenameWorkspaceForm({ name, responseTargetMinutes }: { name: string; responseTargetMinutes: number }) {
  const [state, action] = useActionState(renameWorkspace, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Firmanavn" htmlFor="rename">
        <Input id="rename" name="name" defaultValue={name} required />
      </Field>
      <Field label="Mål for svartid" htmlFor="response-target">
        <Select id="response-target" name="responseTargetMinutes" defaultValue={String(responseTargetMinutes)} className="w-full">
          {TARGETS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          {!TARGETS.some(([v]) => v === responseTargetMinutes) && (
            <option value={responseTargetMinutes}>{responseTargetMinutes} minutter</option>
          )}
        </Select>
      </Field>
      <p className="-mt-2 text-xs text-slate-500">Henvendelser der har ventet længere, markeres med rødt under Venter på svar.</p>
      <FormMessage state={state} />
      <SubmitButton>Gem</SubmitButton>
    </form>
  );
}
