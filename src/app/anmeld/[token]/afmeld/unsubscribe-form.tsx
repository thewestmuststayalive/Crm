"use client";

import { useActionState } from "react";
import { unsubscribeFromEmails } from "@/app/actions/review-public";
import { FormMessage, SubmitButton } from "@/components/ui";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action] = useActionState(unsubscribeFromEmails, {});
  if (state.success) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton pendingText="Afmelder…">Afmeld</SubmitButton>
    </form>
  );
}
