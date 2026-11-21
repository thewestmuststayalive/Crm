"use client";

import { useActionState, useState } from "react";
import { acceptQuote, declineQuote } from "@/app/actions/quote-public";
import { Button, Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui";

export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      Udskriv / gem som PDF
    </Button>
  );
}

export function QuoteResponse({ token, defaultName, total }: { token: string; defaultName: string; total: string }) {
  const [accepted, accept] = useActionState(acceptQuote, {});
  const [declined, decline] = useActionState(declineQuote, {});
  const [showDecline, setShowDecline] = useState(false);

  return (
    <section
      aria-label="Svar på tilbuddet"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 print:hidden"
    >
      <h2 className="text-base font-semibold text-slate-900">Accepter tilbuddet</h2>
      <form action={accept} className="mt-4 space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="Dit fulde navn" htmlFor="accept-name">
          <Input
            id="accept-name"
            name="name"
            autoComplete="name"
            required
            defaultValue={accepted.values?.name ?? defaultName}
          />
        </Field>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>Jeg accepterer tilbuddet på {total} inkl. moms og de anførte betingelser.</span>
        </label>
        <FormMessage state={accepted} />
        <SubmitButton pendingText="Sender…">Accepter tilbud</SubmitButton>
      </form>

      <div className="mt-6 border-t border-slate-200 pt-4">
        {showDecline ? (
          <form action={decline} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <Field label="Fortæl os gerne hvorfor (valgfrit)" htmlFor="decline-reason">
              <Textarea id="decline-reason" name="reason" rows={3} maxLength={1000} />
            </Field>
            <FormMessage state={declined} />
            <div className="flex gap-2">
              <SubmitButton variant="secondary" pendingText="Sender…">
                Afvis tilbud
              </SubmitButton>
              <Button type="button" variant="secondary" onClick={() => setShowDecline(false)}>
                Fortryd
              </Button>
            </div>
          </form>
        ) : (
          <button type="button" className="text-sm text-slate-600 underline" onClick={() => setShowDecline(true)}>
            Ønsker du ikke tilbuddet? Afvis det her
          </button>
        )}
      </div>
    </section>
  );
}
