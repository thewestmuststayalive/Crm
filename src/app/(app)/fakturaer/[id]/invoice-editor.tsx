"use client";

import { useActionState, useState } from "react";
import { bookInvoice, resendInvoice, saveInvoice } from "@/app/actions/invoices";
import { Button, Field, FormMessage, Input, SubmitButton } from "@/components/ui";
import type { InvoiceLine } from "@/db/schema";
import { formatOre, oreToInput, parseAmountOre, parseDanishNumber } from "@/lib/quote-math";

type EditLine = { key: number; description: string; quantity: string; unitPrice: string };

let nextKey = 1;
const toEdit = (l: InvoiceLine): EditLine => ({
  key: nextKey++,
  description: l.description,
  quantity: String(l.quantity).replace(".", ","),
  unitPrice: oreToInput(l.unitPriceOre),
});

function toLine(l: EditLine): InvoiceLine {
  const q = parseDanishNumber(l.quantity || "1");
  return {
    description: l.description.trim(),
    quantity: Number.isFinite(q) ? q : 0,
    unitPriceOre: parseAmountOre(l.unitPrice || "0") ?? 0,
  };
}

/** Kladde-editor: linjer, overskrift og e-mail – og knapperne til at gemme eller bogføre. */
export function InvoiceEditor({
  id,
  initial,
  canBook,
  economicReady,
  alreadyInEconomic,
}: {
  id: string;
  initial: { heading: string; email: string; lines: InvoiceLine[] };
  canBook: boolean;
  economicReady: boolean;
  alreadyInEconomic: boolean;
}) {
  const [lines, setLines] = useState<EditLine[]>(() =>
    initial.lines.length ? initial.lines.map(toEdit) : [toEdit({ description: "", quantity: 1, unitPriceOre: 0 })],
  );
  const [saveState, saveAction] = useActionState(saveInvoice, {});
  const [bookState, bookAction] = useActionState(bookInvoice, {});
  const parsed = lines.map(toLine);
  const net = parsed.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceOre), 0);
  const vat = Math.round(net * 0.25);
  const update = (key: number, patch: Partial<EditLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form className="space-y-4" aria-label="Faktura">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="lines" value={JSON.stringify(parsed)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Overskrift (valgfri)" htmlFor="inv-heading">
          <Input id="inv-heading" name="heading" maxLength={250} defaultValue={initial.heading} readOnly={alreadyInEconomic} />
        </Field>
        <Field label="Kundens e-mail" htmlFor="inv-email">
          <Input id="inv-email" name="email" type="email" maxLength={200} defaultValue={initial.email} />
        </Field>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">Beskrivelse</th>
              <th className="w-24 pb-2 font-medium">Antal</th>
              <th className="w-36 pb-2 font-medium">Pris ekskl. moms</th>
              <th className="w-28 pb-2 text-right font-medium">Beløb</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="align-top">
                <td className="py-1 pr-2">
                  <Input
                    aria-label={`Linje ${i + 1} beskrivelse`}
                    value={l.description}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                    maxLength={500}
                    readOnly={alreadyInEconomic}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label={`Linje ${i + 1} antal`}
                    value={l.quantity}
                    inputMode="decimal"
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    readOnly={alreadyInEconomic}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label={`Linje ${i + 1} pris`}
                    value={l.unitPrice}
                    inputMode="decimal"
                    onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                    readOnly={alreadyInEconomic}
                  />
                </td>
                <td className="py-3 text-right whitespace-nowrap text-slate-700">
                  {formatOre(Math.round(parsed[i].quantity * parsed[i].unitPriceOre))}
                </td>
                <td className="py-1 pl-1">
                  {!alreadyInEconomic && lines.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Fjern linje ${i + 1}`}
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      className="rounded px-2 py-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!alreadyInEconomic && (
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => setLines((prev) => [...prev, toEdit({ description: "", quantity: 1, unitPriceOre: 0 })])}
        >
          + Tilføj linje
        </Button>
      )}

      <dl className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Subtotal</dt>
          <dd>{formatOre(net)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Moms 25 %</dt>
          <dd>{formatOre(vat)}</dd>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
          <dt>I alt</dt>
          <dd aria-label="I alt">{formatOre(net + vat)}</dd>
        </div>
        <p className="text-xs text-slate-500">Det endelige momsbeløb beregnes af e-conomic.</p>
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {!alreadyInEconomic && (
          <SubmitButton variant="secondary" formAction={saveAction}>
            Gem kladde
          </SubmitButton>
        )}
        {canBook && economicReady && (
          <>
            <SubmitButton
              formAction={bookAction}
              name="mode"
              value="send"
              pendingText="Bogfører…"
              onClick={(e) => {
                if (!window.confirm("Bogfør fakturaen i e-conomic og send den til kunden? Det kan ikke fortrydes.")) {
                  e.preventDefault();
                }
              }}
            >
              Bogfør og send
            </SubmitButton>
            {!alreadyInEconomic && (
              <SubmitButton variant="secondary" formAction={bookAction} name="mode" value="draft" pendingText="Sender…">
                Læg i e-conomic som kladde
              </SubmitButton>
            )}
          </>
        )}
      </div>
      <FormMessage state={bookState.error || bookState.success ? bookState : saveState} />
    </form>
  );
}

/** Send fakturaen igen, evt. til en anden e-mail. */
export function ResendForm({ id, email }: { id: string; email: string }) {
  const [state, action] = useActionState(resendInvoice, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="min-w-56 flex-1">
        <Field label="Send til" htmlFor="resend-email">
          <Input id="resend-email" name="email" type="email" defaultValue={email} required />
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingText="Sender…">
        Send fakturaen
      </SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
