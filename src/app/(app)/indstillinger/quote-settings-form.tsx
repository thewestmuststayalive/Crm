"use client";

import { useActionState } from "react";
import { updateQuoteSettings } from "@/app/actions/workspace";
import { Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui";

type Seller = { cvr: string; address: string; email: string; phone: string; website: string; quoteTerms: string };

export function QuoteSettingsForm({ initial }: { initial: Seller }) {
  const [state, action] = useActionState(updateQuoteSettings, {});
  const v = (k: keyof Seller) => state.values?.[k] ?? initial[k];
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CVR-nummer" htmlFor="s-cvr">
          <Input id="s-cvr" name="cvr" inputMode="numeric" defaultValue={v("cvr")} />
        </Field>
        <Field label="Telefon" htmlFor="s-phone">
          <Input id="s-phone" name="phone" type="tel" defaultValue={v("phone")} />
        </Field>
        <Field label="E-mail" htmlFor="s-email">
          <Input id="s-email" name="email" type="email" defaultValue={v("email")} />
        </Field>
        <Field label="Hjemmeside" htmlFor="s-website">
          <Input id="s-website" name="website" defaultValue={v("website")} placeholder="www.ditfirma.dk" />
        </Field>
      </div>
      <Field label="Adresse" htmlFor="s-address">
        <Textarea id="s-address" name="address" rows={2} defaultValue={v("address")} />
      </Field>
      <Field label="Standardbetingelser på nye tilbud" htmlFor="s-terms">
        <Textarea
          id="s-terms"
          name="quoteTerms"
          rows={4}
          defaultValue={v("quoteTerms")}
          placeholder="Fx: Betaling netto 8 dage. Alle priser er ekskl. moms, medmindre andet er angivet."
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Gem</SubmitButton>
    </form>
  );
}
