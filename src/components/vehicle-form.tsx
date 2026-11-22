"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/types";
import { Field, FormMessage, Input, SubmitButton, Textarea } from "./ui";

type VehicleValues = { plate?: string; make?: string; model?: string; year?: string; color?: string; notes?: string };

/** Tilføj eller ret en bil. Formularen tømmes efter en tilføjelse. */
export function VehicleForm({
  action,
  initial = {},
  submitLabel,
  idPrefix,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: VehicleValues;
  submitLabel: string;
  idPrefix: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const v: VehicleValues = state.error ? { ...initial, ...state.values } : initial;
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nummerplade" htmlFor={`${idPrefix}-plate`}>
          <Input
            id={`${idPrefix}-plate`}
            name="plate"
            defaultValue={v.plate}
            placeholder="AB 12 345"
            className="uppercase"
          />
        </Field>
        <Field label="Mærke" htmlFor={`${idPrefix}-make`}>
          <Input id={`${idPrefix}-make`} name="make" defaultValue={v.make} placeholder="Fx Tesla" />
        </Field>
        <Field label="Model" htmlFor={`${idPrefix}-model`}>
          <Input id={`${idPrefix}-model`} name="model" defaultValue={v.model} placeholder="Fx Model Y" />
        </Field>
        <Field label="Årgang" htmlFor={`${idPrefix}-year`}>
          <Input id={`${idPrefix}-year`} name="year" inputMode="numeric" defaultValue={v.year} />
        </Field>
        <Field label="Farve" htmlFor={`${idPrefix}-color`}>
          <Input id={`${idPrefix}-color`} name="color" defaultValue={v.color} />
        </Field>
      </div>
      <Field label="Noter (fx lakskader, coating)" htmlFor={`${idPrefix}-notes`}>
        <Textarea id={`${idPrefix}-notes`} name="notes" rows={2} defaultValue={v.notes} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">{submitLabel}</SubmitButton>
    </form>
  );
}
