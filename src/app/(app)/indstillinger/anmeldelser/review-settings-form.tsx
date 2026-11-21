"use client";

import { useActionState } from "react";
import { saveReviewSettings } from "@/app/actions/reviews";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui";

const DELAYS: Record<number, string> = {
  0: "Ved næste morgenkørsel",
  1: "1 dag efter",
  3: "3 dage efter",
  7: "1 uge efter",
  14: "2 uger efter",
};

export function ReviewSettingsForm({
  initial,
  defaultMessage,
}: {
  initial: { enabled: boolean; url: string; delayDays: number; message: string };
  defaultMessage: string;
}) {
  const [state, action] = useActionState(saveReviewSettings, {});
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={state.values ? state.values.enabled === "on" : initial.enabled}
          className="h-4 w-4"
        />
        Send en anmodning om anmeldelse, når en deal er vundet
      </label>
      <Field label="Link til jeres anmeldelsesside" htmlFor="r-url">
        <Input
          id="r-url"
          name="url"
          type="url"
          defaultValue={state.values?.url ?? initial.url}
          placeholder="https://g.page/r/... eller https://dk.trustpilot.com/evaluate/..."
        />
      </Field>
      <p className="-mt-2 text-xs text-slate-500">
        Google: find &quot;Få flere anmeldelser&quot; i jeres Google-virksomhedsprofil og kopiér linket. Trustpilot:
        brug jeres evaluate-link.
      </p>
      <Field label="Hvornår" htmlFor="r-delay">
        <Select
          id="r-delay"
          name="delayDays"
          defaultValue={state.values?.delayDays ?? String(initial.delayDays)}
          className="w-full"
        >
          {Object.entries(DELAYS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Besked (valgfri)" htmlFor="r-message">
        <Textarea
          id="r-message"
          name="message"
          rows={4}
          defaultValue={state.values?.message ?? initial.message}
          placeholder={defaultMessage}
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Gem</SubmitButton>
    </form>
  );
}
