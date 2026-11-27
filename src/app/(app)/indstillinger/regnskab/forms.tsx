"use client";

import { useActionState } from "react";
import { saveEconomicSettings, saveEconomicToken } from "@/app/actions/economic";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";

type Option = { value: string; label: string };

export function TokenForm() {
  const [state, action] = useActionState(saveEconomicToken, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="min-w-60 flex-1">
        <Field label="Token fra e-conomic" htmlFor="economic-token">
          <Input id="economic-token" name="token" required autoComplete="off" spellCheck={false} />
        </Field>
      </div>
      <SubmitButton variant="secondary">Forbind med token</SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function EconomicSettingsForm({
  options,
  current,
}: {
  options: { layouts: Option[]; paymentTerms: Option[]; customerGroups: Option[]; vatZones: Option[]; products: Option[] };
  current: Record<string, string>;
}) {
  const [state, action] = useActionState(saveEconomicSettings, {});
  const field = (name: string, label: string, list: Option[], hint?: string) => (
    <Field label={label} htmlFor={`ec-${name}`}>
      <Select id={`ec-${name}`} name={name} defaultValue={current[name] ?? ""} required>
        <option value="" disabled>
          Vælg…
        </option>
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </Field>
  );
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("productNumber", "Vare på fakturalinjer", options.products, "Bestemmer konto og moms. Fx en vare \"Ydelser\".")}
        {field("paymentTermsNumber", "Betalingsbetingelse", options.paymentTerms)}
        {field("layoutNumber", "Fakturalayout", options.layouts)}
        {field("customerGroupNumber", "Kundegruppe for nye kunder", options.customerGroups)}
        {field("vatZoneNumber", "Momszone for nye kunder", options.vatZones)}
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>Gem standardvalg</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
