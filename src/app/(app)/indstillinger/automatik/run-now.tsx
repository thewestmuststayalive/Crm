"use client";

import { useActionState } from "react";
import { runAutomationsNow } from "@/app/actions/automations";
import { FormMessage, SubmitButton } from "@/components/ui";

export function RunNowButton() {
  const [state, action] = useActionState(runAutomationsNow, {});
  return (
    <form action={action} className="space-y-3">
      <SubmitButton pendingText="Kører…">Kør reglerne nu</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
