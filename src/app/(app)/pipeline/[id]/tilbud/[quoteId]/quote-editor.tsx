"use client";

import { useRef, useState, useTransition } from "react";
import { saveQuote, sendQuote, type QuoteInput } from "@/app/actions/quotes";
import type { ActionState } from "@/app/actions/types";
import { CopyButton } from "@/components/copy-button";
import { buttonClass } from "@/components/styles";
import { Button, Card, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import type { QuoteStatus } from "@/db/schema";
import { formatOre, lineTotalOre, parseAmountOre, parseDanishNumber, quoteTotals } from "@/lib/quote-math";

type Line = QuoteInput["lines"][number] & { key: number };
type Initial = Omit<QuoteInput, "lines" | "vatRate"> & {
  vatRate: 0 | 25;
  lines: QuoteInput["lines"];
};

const EMPTY_LINE = {
  description: "",
  quantity: "1",
  unit: "",
  unitPrice: "",
  discountPct: "0",
};

/** Beløb for en linje mens der tastes – ugyldige tal tæller som 0. */
function liveAmounts(l: Line) {
  const quantity = parseDanishNumber(l.quantity || "1");
  const discount = parseDanishNumber(l.discountPct || "0");
  return {
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitPriceOre: parseAmountOre(l.unitPrice ?? "") ?? 0,
    discountPct: Number.isFinite(discount) ? Math.min(Math.max(discount, 0), 100) : 0,
  };
}

export function QuoteEditor({
  quoteId,
  status,
  readOnly,
  publicUrl,
  contactEmail,
  initial,
}: {
  quoteId: string;
  status: QuoteStatus;
  readOnly: boolean;
  publicUrl: string;
  contactEmail: string | null;
  initial: Initial;
}) {
  const nextKey = useRef(initial.lines.length);
  const [title, setTitle] = useState(initial.title);
  const [intro, setIntro] = useState(initial.intro ?? "");
  const [terms, setTerms] = useState(initial.terms ?? "");
  const [validUntil, setValidUntil] = useState(initial.validUntil ?? "");
  const [vatRate, setVatRate] = useState<0 | 25>(initial.vatRate);
  const [lines, setLines] = useState<Line[]>(() =>
    (initial.lines.length > 0 ? initial.lines : [EMPTY_LINE]).map((l, i) => ({
      ...EMPTY_LINE,
      ...l,
      key: i,
    })),
  );
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  const totals = quoteTotals(lines.map(liveAmounts), vatRate);
  const input = (): QuoteInput => ({
    title,
    intro,
    terms,
    validUntil,
    vatRate,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
    })),
  });

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { ...EMPTY_LINE, key: nextKey.current++ }]);
  const removeLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const move = (index: number, dir: -1 | 1) =>
    setLines((ls) => {
      const target = index + dir;
      if (target < 0 || target >= ls.length) return ls;
      const copy = [...ls];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  const save = (thenSend: boolean) =>
    startTransition(async () => {
      const saved = await saveQuote(quoteId, input());
      if (saved.error || !thenSend) return setState(saved);
      setState(await sendQuote(quoteId));
    });

  const sendLabel = status === "DRAFT" ? "Gem og send" : "Gem og send igen";

  return (
    <div className="space-y-6">
      {status !== "DRAFT" && (
        <Card title="Link til kunden" description="Kunden ser, accepterer eller afviser tilbuddet via dette link.">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              readOnly
              value={publicUrl}
              aria-label="Link til tilbuddet"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex shrink-0 gap-2">
              <CopyButton text={publicUrl} label="Kopiér link" />
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary", "px-2.5 py-1 text-xs")}
              >
                Åbn
              </a>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <fieldset disabled={readOnly || pending} className="space-y-5">
          {readOnly && (
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
              Tilbuddet er besvaret og kan ikke ændres. Opret et nyt tilbud på dealen, hvis der skal laves et nyt.
            </p>
          )}
          <Field label="Titel" htmlFor="q-title">
            <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Indledning (valgfri)" htmlFor="q-intro">
            <Textarea
              id="q-intro"
              rows={3}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="Tak for en god snak. Her er vores tilbud på …"
            />
          </Field>

          <div>
            <h2 className="text-sm font-medium text-slate-700">Linjer</h2>
            <div className="mt-2 hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
              <span className="col-span-5">Beskrivelse</span>
              <span className="col-span-1">Antal</span>
              <span className="col-span-1">Enhed</span>
              <span className="col-span-2">Pris ekskl. moms</span>
              <span className="col-span-1">Rabat %</span>
              <span className="col-span-2 text-right">Beløb</span>
            </div>
            <ol className="mt-1 space-y-2">
              {lines.map((l, i) => (
                <li
                  key={l.key}
                  aria-label={`Linje ${i + 1}`}
                  className="grid grid-cols-6 items-start gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-12 sm:border-0 sm:p-0"
                >
                  <Textarea
                    aria-label={`Beskrivelse, linje ${i + 1}`}
                    rows={1}
                    value={l.description}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                    className="col-span-6 min-h-[38px] sm:col-span-5"
                  />
                  <Input
                    aria-label={`Antal, linje ${i + 1}`}
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    className="col-span-2 sm:col-span-1"
                  />
                  <Input
                    aria-label={`Enhed, linje ${i + 1}`}
                    placeholder="stk."
                    value={l.unit}
                    maxLength={20}
                    onChange={(e) => update(l.key, { unit: e.target.value })}
                    className="col-span-2 sm:col-span-1"
                  />
                  <Input
                    aria-label={`Pris, linje ${i + 1}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={l.unitPrice}
                    onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                    className="col-span-2 sm:col-span-2"
                  />
                  <Input
                    aria-label={`Rabat i procent, linje ${i + 1}`}
                    inputMode="decimal"
                    value={l.discountPct}
                    onChange={(e) => update(l.key, { discountPct: e.target.value })}
                    className="col-span-2 sm:col-span-1"
                  />
                  <span className="col-span-2 self-center text-right text-sm font-medium text-slate-900 sm:col-span-1">
                    {formatOre(lineTotalOre(liveAmounts(l)))}
                  </span>
                  <span className="col-span-2 flex justify-end gap-1 self-center sm:col-span-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`Flyt linje ${i + 1} op`}
                      className="rounded px-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      disabled={lines.length === 1}
                      aria-label={`Fjern linje ${i + 1}`}
                      className="rounded px-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <Button type="button" variant="secondary" onClick={addLine} className="mt-3">
              + Tilføj linje
            </Button>
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Moms" htmlFor="q-vat">
                <Select
                  id="q-vat"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value === "0" ? 0 : 25)}
                  className="w-full"
                >
                  <option value={25}>25 % moms</option>
                  <option value={0}>Uden moms (momsfritaget)</option>
                </Select>
              </Field>
              <Field label="Gyldigt til" htmlFor="q-valid">
                <Input id="q-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
            </div>
            <dl className="w-full max-w-xs space-y-1 text-sm sm:text-right" aria-label="Beløb i alt">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">Subtotal</dt>
                <dd>{formatOre(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">Moms</dt>
                <dd>{formatOre(totals.vat)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-1 text-base font-semibold">
                <dt>Total</dt>
                <dd data-testid="editor-total">{formatOre(totals.total)}</dd>
              </div>
            </dl>
          </div>

          <Field label="Betingelser" htmlFor="q-terms">
            <Textarea
              id="q-terms"
              rows={4}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Fx betalingsbetingelser, levering og forbehold."
            />
          </Field>
        </fieldset>

        {!readOnly && (
          <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
            <FormMessage state={state} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => save(true)} disabled={pending}>
                {pending ? "Gemmer…" : sendLabel}
              </Button>
              <Button type="button" variant="secondary" onClick={() => save(false)} disabled={pending}>
                Gem
              </Button>
              <a href={publicUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                Forhåndsvis
              </a>
            </div>
            <p className="text-xs text-slate-500">
              {contactEmail
                ? `Når du sender, får ${contactEmail} en e-mail med linket, hvis e-mail er sat op. Ellers kopierer du linket.`
                : "Dealen har ingen kontakt med e-mail. Når du sender, kopierer du linket og giver det til kunden."}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
