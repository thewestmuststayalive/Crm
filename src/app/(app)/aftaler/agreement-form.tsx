"use client";

import { useActionState, useState } from "react";
import { saveAgreement } from "@/app/actions/agreements";
import { Button, Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";
import type { AgreementInterval, AgreementInvoiceMode, InvoiceLine } from "@/db/schema";
import { formatOre, oreToInput, parseAmountOre, parseDanishNumber } from "@/lib/quote-math";

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

type Option = { id: string; name: string };
type EditLine = { key: number; description: string; quantity: string; unitPrice: string };
let nextKey = 1;

export type AgreementInitial = {
  id?: string;
  name: string;
  companyId: string;
  contactId: string;
  interval: AgreementInterval;
  intervalCount: number;
  nextDate: string;
  endDate: string;
  seasonMonths: number[];
  priceAdjustPct: string;
  priceAdjustMonth: string;
  serviceId: string;
  bookingTime: string;
  invoiceMode: AgreementInvoiceMode;
  lines: InvoiceLine[];
};

export function AgreementForm({
  initial,
  companies,
  contacts,
  services,
}: {
  initial: AgreementInitial;
  companies: Option[];
  contacts: Option[];
  services: Option[] | null;
}) {
  const [state, action] = useActionState(saveAgreement, {});
  const [lines, setLines] = useState<EditLine[]>(() =>
    initial.lines.map((l) => ({
      key: nextKey++,
      description: l.description,
      quantity: String(l.quantity).replace(".", ","),
      unitPrice: oreToInput(l.unitPriceOre),
    })),
  );
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const parsed = lines.map((l) => {
    const q = parseDanishNumber(l.quantity || "1");
    return {
      description: l.description.trim(),
      quantity: Number.isFinite(q) ? q : 0,
      unitPriceOre: parseAmountOre(l.unitPrice || "0") ?? 0,
    };
  });
  const net = parsed.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceOre), 0);
  const update = (key: number, patch: Partial<EditLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="space-y-5" aria-label="Fast aftale">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(parsed)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Navn på aftalen" htmlFor="ag-name">
          <Input id="ag-name" name="name" required maxLength={120} defaultValue={initial.name} placeholder="Fx Vaskeabonnement" />
        </Field>
        <div />
        <Field label="Virksomhed" htmlFor="ag-company">
          <Select id="ag-company" name="companyId" defaultValue={initial.companyId}>
            <option value="">Ingen (privatkunde)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kontaktperson" htmlFor="ag-contact">
          <Select id="ag-contact" name="contactId" defaultValue={initial.contactId}>
            <option value="">Ingen</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Hvor ofte</legend>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Hver" htmlFor="ag-count">
            <Input id="ag-count" name="intervalCount" type="number" min={1} max={52} className="w-20" defaultValue={initial.intervalCount} />
          </Field>
          <Field label="Enhed" htmlFor="ag-interval">
            <Select id="ag-interval" name="interval" defaultValue={initial.interval}>
              <option value="WEEK">uge(r)</option>
              <option value="MONTH">måned(er)</option>
            </Select>
          </Field>
          <Field label="Første/næste dato" htmlFor="ag-next">
            <Input id="ag-next" name="nextDate" type="date" required defaultValue={initial.nextDate} />
          </Field>
          <Field label="Slutdato (valgfri)" htmlFor="ag-end">
            <Input id="ag-end" name="endDate" type="date" defaultValue={initial.endDate} />
          </Field>
        </div>
        <div>
          <p className="mb-1 text-sm text-slate-700">Sæson – kun disse måneder (ingen valgt = hele året)</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sæson">
            {MONTHS.map((m, i) => (
              <label key={m} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs">
                <input type="checkbox" name="seasonMonths" value={i + 1} defaultChecked={initial.seasonMonths.includes(i + 1)} />
                {m}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      {services && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Fast booking (valgfri)</legend>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Ydelse" htmlFor="ag-service">
              <Select id="ag-service" name="serviceId" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Ingen booking</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            {serviceId && (
              <Field label="Tidspunkt" htmlFor="ag-time">
                <Input id="ag-time" name="bookingTime" type="time" step={900} required defaultValue={initial.bookingTime || "09:00"} />
              </Field>
            )}
          </div>
          <p className="text-xs text-slate-500">Bookingen oprettes automatisk en uge før, og kunden får bekræftelse.</p>
        </fieldset>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Pris pr. gang</legend>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-1 font-medium">Beskrivelse</th>
              <th className="w-20 pb-1 font-medium">Antal</th>
              <th className="w-32 pb-1 font-medium">Pris ekskl. moms</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td className="py-1 pr-2">
                  <Input aria-label={`Linje ${i + 1} beskrivelse`} value={l.description} maxLength={500} onChange={(e) => update(l.key, { description: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input aria-label={`Linje ${i + 1} antal`} value={l.quantity} inputMode="decimal" onChange={(e) => update(l.key, { quantity: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input aria-label={`Linje ${i + 1} pris`} value={l.unitPrice} inputMode="decimal" onChange={(e) => update(l.key, { unitPrice: e.target.value })} />
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`Fjern linje ${i + 1}`}
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    className="rounded px-2 py-2 text-slate-400 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => setLines((prev) => [...prev, { key: nextKey++, description: "", quantity: "1", unitPrice: "" }])}
          >
            + Tilføj linje
          </Button>
          <p className="text-sm text-slate-700" aria-label="Pris pr. gang">
            {formatOre(net)} ekskl. moms · {formatOre(Math.round(net * 1.25))} inkl. moms
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Prisregulering pr. år (%)" htmlFor="ag-pct">
            <Input id="ag-pct" name="priceAdjustPct" inputMode="decimal" className="w-28" defaultValue={initial.priceAdjustPct} />
          </Field>
          <Field label="Reguleres i" htmlFor="ag-pct-month">
            <Select id="ag-pct-month" name="priceAdjustMonth" defaultValue={initial.priceAdjustMonth}>
              <option value="">Ingen regulering</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <Field label="Fakturering" htmlFor="ag-invoice">
        <Select id="ag-invoice" name="invoiceMode" defaultValue={initial.invoiceMode}>
          <option value="NONE">Ingen faktura</option>
          <option value="DRAFT">Opret faktura som kladde (I sender selv)</option>
          <option value="SEND">Bogfør og send fakturaen automatisk (e-conomic)</option>
        </Select>
      </Field>

      <div className="flex items-center gap-3">
        <SubmitButton>{initial.id ? "Gem aftalen" : "Opret aftalen"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
