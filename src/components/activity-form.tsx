"use client";

import { useActionState } from "react";
import { addActivity } from "@/app/actions/activities";
import { ACTIVITY_LABELS, USER_ACTIVITY_TYPES } from "@/lib/labels";
import { FormMessage, Select, SubmitButton, Textarea } from "./ui";

export function ActivityForm({
  contactId,
  companyId,
  dealId,
}: {
  contactId?: string;
  companyId?: string;
  dealId?: string;
}) {
  const [state, action] = useActionState(addActivity, {});
  return (
    <form action={action} className="space-y-3">
      {contactId && <input type="hidden" name="contactId" value={contactId} />}
      {companyId && <input type="hidden" name="companyId" value={companyId} />}
      {dealId && <input type="hidden" name="dealId" value={dealId} />}
      <label htmlFor="activity-body" className="sr-only">
        Ny aktivitet
      </label>
      <Textarea id="activity-body" name="body" rows={3} placeholder="Skriv en note, et referat af et opkald …" required />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="activity-type" className="sr-only">
          Type
        </label>
        <Select id="activity-type" name="type" defaultValue="NOTE">
          {USER_ACTIVITY_TYPES.map((value) => (
            <option key={value} value={value}>
              {ACTIVITY_LABELS[value]}
            </option>
          ))}
        </Select>
        <SubmitButton>Tilføj</SubmitButton>
      </div>
      {state.error && <FormMessage state={state} />}
    </form>
  );
}
