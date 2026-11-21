"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { addTimeEntry, saveRetainer, startTimer, stopTimer } from "@/app/actions/time";
import { Button, Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";
import { formatHM } from "@/lib/duration";

type Option = { id: string; name: string };

export function TimeTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/tid", label: "Tidsregistrering" },
    { href: "/tid/retainers", label: "Retainers" },
  ];
  return (
    <nav className="flex gap-4 border-b border-slate-200">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
            pathname === tab.href
              ? "border-brand-700 text-brand-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** Minutter siden start, opdateret hvert 15. sekund. */
function useElapsed(startedAt: string | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt || now === null) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
}

export function RunningTimer({
  running,
  companies,
}: {
  running: { startedAt: string; description: string | null; companyName: string | null } | null;
  companies: Option[];
}) {
  const elapsed = useElapsed(running?.startedAt ?? null);
  if (running) {
    return (
      <form action={stopTimer} className="flex flex-wrap items-center gap-3" aria-label="Stopur">
        <span className="font-mono text-2xl font-semibold text-slate-900" data-testid="timer-elapsed">
          {formatHM(elapsed)}
        </span>
        <span className="min-w-0 flex-1 text-sm text-slate-700">
          {running.companyName ?? "Intern tid"}
          {running.description && <span className="text-slate-500"> · {running.description}</span>}
        </span>
        <Button type="submit">Stop</Button>
      </form>
    );
  }
  return (
    <form action={startTimer} className="flex flex-wrap items-end gap-2" aria-label="Stopur">
      <div className="min-w-48 flex-1">
        <label htmlFor="timer-company" className="mb-1 block text-xs text-slate-500">
          Kunde
        </label>
        <Select id="timer-company" name="companyId" className="w-full">
          <option value="">Intern tid</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-48 flex-[2]">
        <label htmlFor="timer-desc" className="mb-1 block text-xs text-slate-500">
          Hvad laver du?
        </label>
        <Input id="timer-desc" name="description" placeholder="Fx Annoncer til november" />
      </div>
      <Button type="submit">Start stopur</Button>
    </form>
  );
}

export function EntryForm({ companies, today }: { companies: Option[]; today: string }) {
  const [state, action] = useActionState(addTimeEntry, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-12">
        <div className="sm:col-span-3">
          <Field label="Dato" htmlFor="te-date">
            <Input id="te-date" name="date" type="date" required defaultValue={v.date || today} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Tid" htmlFor="te-duration">
            <Input id="te-duration" name="duration" required placeholder="1:30" defaultValue={v.duration} />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Kunde" htmlFor="te-company">
            <Select id="te-company" name="companyId" defaultValue={v.companyId ?? ""} className="w-full">
              <option value="">Intern tid</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-4">
          <Field label="Beskrivelse" htmlFor="te-desc">
            <Input id="te-desc" name="description" defaultValue={v.description} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="billable" defaultChecked className="h-4 w-4" />
          Fakturerbar (tæller med i retaineren)
        </label>
        <SubmitButton variant="secondary">Registrér tid</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function RetainerForm({
  companies,
  initial,
  submitLabel,
}: {
  companies: Option[];
  initial?: { companyId: string; name: string; hours: string; price: string; rate: string; active: boolean };
  submitLabel: string;
}) {
  const [state, action] = useActionState(saveRetainer, {});
  const v = { ...initial, ...state.values };
  const prefix = initial?.companyId ?? "new";
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {initial ? (
          <input type="hidden" name="companyId" value={initial.companyId} />
        ) : (
          <Field label="Kunde" htmlFor={`rt-${prefix}-company`}>
            <Select
              id={`rt-${prefix}-company`}
              name="companyId"
              defaultValue={v.companyId ?? ""}
              className="w-full"
              required
            >
              <option value="">Vælg kunde …</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Aftale" htmlFor={`rt-${prefix}-name`}>
          <Input id={`rt-${prefix}-name`} name="name" required defaultValue={v.name} placeholder="Fx SoMe-pakke" />
        </Field>
        <Field label="Timer pr. måned" htmlFor={`rt-${prefix}-hours`}>
          <Input
            id={`rt-${prefix}-hours`}
            name="hours"
            required
            inputMode="decimal"
            defaultValue={v.hours}
            placeholder="20"
          />
        </Field>
        <Field label="Pris pr. måned (kr., valgfri)" htmlFor={`rt-${prefix}-price`}>
          <Input id={`rt-${prefix}-price`} name="price" inputMode="decimal" defaultValue={v.price} />
        </Field>
        <Field label="Timepris ud over budget (kr., valgfri)" htmlFor={`rt-${prefix}-rate`}>
          <Input id={`rt-${prefix}-rate`} name="rate" inputMode="decimal" defaultValue={v.rate} />
        </Field>
      </div>
      {initial && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="hidden" name="hasActive" value="1" />
          <input type="checkbox" name="active" defaultChecked={initial.active} className="h-4 w-4" />
          Aktiv
        </label>
      )}
      <FormMessage state={state} />
      <SubmitButton variant={initial ? "secondary" : "primary"}>{submitLabel}</SubmitButton>
    </form>
  );
}

/** Forbrugsbjælke: grøn under 80 %, gul fra 80 %, rød over 100 %. */
export function UsageBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
      role="meter"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={Math.max(100, pct)}
    >
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}
