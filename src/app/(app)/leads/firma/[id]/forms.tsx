"use client";

import { useActionState, useState } from "react";
import { convertProspect, updateProspect } from "@/app/actions/leads";
import type { ProspectStatus } from "@/db/schema";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui";

const STATUS_OPTIONS: { value: ProspectStatus; label: string }[] = [
  { value: "NEW", label: "Ny" },
  { value: "CALLED", label: "Ringet op" },
  { value: "CALL_BACK", label: "Ring igen" },
  { value: "INTERESTED", label: "Interesseret" },
  { value: "NOT_INTERESTED", label: "Ikke interesseret" },
];

export function FollowUpForm({
  prospect,
  members,
  tomorrow,
}: {
  prospect: { id: string; status: ProspectStatus; notes: string | null; callBackDate: string | null; ownerId: string | null };
  members: { id: string; name: string }[];
  tomorrow: string;
}) {
  const [state, action] = useActionState(updateProspect, {});
  const v = state.error ? (state.values ?? {}) : {};
  const [status, setStatus] = useState<string>(v.status ?? prospect.status);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={prospect.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status" htmlFor="pf-status">
          <Select id="pf-status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {prospect.status === "CONVERTED" && <option value="CONVERTED">Gjort til kunde</option>}
          </Select>
        </Field>
        {status === "CALL_BACK" && (
          <Field label="Ring igen den" htmlFor="pf-callback">
            <Input
              id="pf-callback"
              name="callBackDate"
              type="date"
              required
              defaultValue={v.callBackDate ?? prospect.callBackDate ?? tomorrow}
            />
          </Field>
        )}
        <Field label="Ansvarlig" htmlFor="pf-owner">
          <Select id="pf-owner" name="ownerId" defaultValue={v.ownerId ?? prospect.ownerId ?? ""}>
            <option value="">Ingen</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Noter fra samtalen" htmlFor="pf-notes">
        <Textarea
          id="pf-notes"
          name="notes"
          rows={4}
          maxLength={5000}
          defaultValue={v.notes ?? prospect.notes ?? ""}
          placeholder="Fx talte med indehaveren, ring tilbage efter sommerferien"
        />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton>Gem</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ConvertForm({ id }: { id: string }) {
  const [state, action] = useActionState(convertProspect, {});
  const v = state.values ?? {};
  const [deal, setDeal] = useState(true);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kontaktperson (valgfrit)" htmlFor="cv-name">
          <Input id="cv-name" name="contactName" maxLength={200} defaultValue={v.contactName} />
        </Field>
        <Field label="E-mail (valgfrit)" htmlFor="cv-email">
          <Input id="cv-email" name="contactEmail" type="email" maxLength={200} defaultValue={v.contactEmail} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="createDeal" checked={deal} onChange={(e) => setDeal(e.target.checked)} />
        Opret også en deal i pipelinen
      </label>
      {deal && (
        <div className="w-48">
          <Field label="Forventet værdi (kr.)" htmlFor="cv-value">
            <Input id="cv-value" name="dealValue" inputMode="decimal" maxLength={30} defaultValue={v.dealValue} />
          </Field>
        </div>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Opretter…">Gør til kunde</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
