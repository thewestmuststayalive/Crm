"use client";

import { useActionState } from "react";
import { payDeposit, payInvoice } from "@/app/actions/payment-public";
import { FormMessage, SubmitButton } from "@/components/ui";

/** "Betal med MobilePay eller kort" – sender kunden videre til Stripes betalingsside. */
export function PayButton({ token, kind, label }: { token: string; kind: "invoice" | "deposit"; label: string }) {
  const [state, action] = useActionState(kind === "invoice" ? payInvoice : payDeposit, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Åbner betaling…">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
