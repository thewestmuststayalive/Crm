"use client";

import { useActionState } from "react";
import { connectStripe, saveDeposit } from "@/app/actions/payments";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function StripeKeyForm() {
  const [state, action] = useActionState(connectStripe, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1">
        <Field label="Hemmelig nøgle fra Stripe" htmlFor="stripe-key">
          <Input
            id="stripe-key"
            name="secretKey"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="sk_live_…"
          />
        </Field>
      </div>
      <SubmitButton pendingText="Forbinder…">Forbind Stripe</SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DepositForm({ current }: { current: string }) {
  const [state, action] = useActionState(saveDeposit, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="w-48">
        <Field label="Depositum (kr.)" htmlFor="deposit">
          <Input id="deposit" name="deposit" inputMode="decimal" defaultValue={state.values?.deposit ?? current} placeholder="0" />
        </Field>
      </div>
      <SubmitButton variant="secondary">Gem depositum</SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
