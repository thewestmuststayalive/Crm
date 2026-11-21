"use client";

import { useActionState } from "react";
import { createTask } from "@/app/actions/tasks";
import { FormMessage, Input, Select, SubmitButton } from "./ui";

/** Hurtig oprettelse af en opgave, evt. knyttet til en kontakt, virksomhed eller deal. */
export function TaskForm({
  members,
  defaultAssigneeId,
  contactId,
  companyId,
  dealId,
}: {
  members: { id: string; name: string }[];
  defaultAssigneeId: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
}) {
  const [state, action] = useActionState(createTask, {});
  return (
    <form action={action} className="space-y-2">
      {contactId && <input type="hidden" name="contactId" value={contactId} />}
      {companyId && <input type="hidden" name="companyId" value={companyId} />}
      {dealId && <input type="hidden" name="dealId" value={dealId} />}
      <label htmlFor="task-title" className="sr-only">
        Ny opgave
      </label>
      <Input id="task-title" name="title" placeholder="Ny opgave, fx “Ring tilbage om tilbud”" defaultValue={state.values?.title} required />
      <div className="flex flex-wrap gap-2">
        <label htmlFor="task-due" className="sr-only">
          Frist
        </label>
        <Input id="task-due" name="dueDate" type="date" className="w-auto" defaultValue={state.values?.dueDate} />
        <label htmlFor="task-assignee" className="sr-only">
          Ansvarlig
        </label>
        <Select id="task-assignee" name="assigneeId" defaultValue={state.values?.assigneeId ?? defaultAssigneeId}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <SubmitButton pendingText="Opretter…">Opret opgave</SubmitButton>
      </div>
      {state.error && <FormMessage state={state} />}
    </form>
  );
}
