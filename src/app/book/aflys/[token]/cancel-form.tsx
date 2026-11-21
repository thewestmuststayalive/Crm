"use client";

import { useActionState } from "react";
import { cancelBookingByCustomer } from "@/app/actions/booking-public";
import { ConfirmButton, FormMessage } from "@/components/ui";

export function CancelForm({ token }: { token: string }) {
  const [state, action] = useActionState(cancelBookingByCustomer, {});
  if (state.success) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <ConfirmButton message="Vil du aflyse din tid?">Aflys tid</ConfirmButton>
    </form>
  );
}
