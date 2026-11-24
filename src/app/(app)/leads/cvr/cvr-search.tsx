"use client";

import { useState, useTransition } from "react";
import { runCvrSearch, type CvrSearchInput, type SearchResult } from "@/app/actions/leads";
import { Button, Field, Input, Select } from "@/components/ui";
import { SearchResults } from "../search-results";

const INDUSTRY_SUGGESTIONS = [
  "Restauranter",
  "Frisør",
  "Tømrer",
  "Murer",
  "Elinstallation",
  "VVS",
  "Tandlæge",
  "Fysioterapi",
  "Ejendomsmægler",
  "Revision",
  "Advokat",
  "Rengøring",
  "Detailhandel",
];

type Options = {
  forms: { code: string; label: string }[];
  sizes: { key: string; label: string }[];
};

export function CvrSearch({ lists, options }: { lists: { id: string; name: string }[]; options: Options }) {
  const [filters, setFilters] = useState<Required<{ [K in keyof CvrSearchInput]: string }>>({
    industry: "",
    postcodes: "",
    form: "",
    size: "",
    foundedMonths: "",
    name: "",
  });
  const [applied, setApplied] = useState(filters);
  const [rows, setRows] = useState<NonNullable<SearchResult["results"]>>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextFrom, setNextFrom] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof filters) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));

  const search = (more: boolean) =>
    startTransition(async () => {
      const input = more ? applied : filters;
      const result = await runCvrSearch(input as CvrSearchInput, more ? (nextFrom ?? 0) : 0);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setApplied(input);
      setTotal(result.total ?? 0);
      setNextFrom(result.nextFrom ?? null);
      if (!more) setRound((r) => r + 1);
      setRows((prev) => (more ? [...prev, ...(result.results ?? [])] : (result.results ?? [])));
    });

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          search(false);
        }}
      >
        <Field label="Branche (tekst eller branchekode)" htmlFor="cvr-industry">
          <Input
            id="cvr-industry"
            list="cvr-industries"
            value={filters.industry}
            onChange={set("industry")}
            placeholder="Fx frisør eller 561010"
            maxLength={120}
          />
          <datalist id="cvr-industries">
            {INDUSTRY_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Postnummer" htmlFor="cvr-post">
          <Input
            id="cvr-post"
            value={filters.postcodes}
            onChange={set("postcodes")}
            placeholder="Fx 8000 eller 8000-8270"
            inputMode="numeric"
            maxLength={20}
          />
        </Field>
        <Field label="Nystartede" htmlFor="cvr-founded">
          <Select id="cvr-founded" value={filters.foundedMonths} onChange={set("foundedMonths")}>
            <option value="">Alle</option>
            <option value="1">Stiftet den seneste måned</option>
            <option value="3">Stiftet de seneste 3 måneder</option>
            <option value="6">Stiftet de seneste 6 måneder</option>
            <option value="12">Stiftet det seneste år</option>
            <option value="24">Stiftet de seneste 2 år</option>
          </Select>
        </Field>
        <Field label="Virksomhedsform" htmlFor="cvr-form">
          <Select id="cvr-form" value={filters.form} onChange={set("form")}>
            <option value="">Alle</option>
            {options.forms.map((f) => (
              <option key={f.code} value={f.code}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Størrelse" htmlFor="cvr-size">
          <Select id="cvr-size" value={filters.size} onChange={set("size")}>
            <option value="">Alle</option>
            {options.sizes.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Navn (valgfrit)" htmlFor="cvr-name">
          <Input id="cvr-name" value={filters.name} onChange={set("name")} maxLength={120} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Søger…" : "Søg i CVR"}
          </Button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {total !== null && !error && (
        <p className="text-sm text-slate-600">
          {total === 0
            ? "Ingen aktive firmaer matcher. Prøv med færre filtre."
            : `Fandt ${total.toLocaleString("da-DK")} aktive firmaer – viser ${rows.length}. Reklamebeskyttede firmaer er sorteret fra.`}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <SearchResults key={round} rows={rows} lists={lists} />
          {nextFrom !== null && (
            <Button variant="secondary" onClick={() => search(true)} disabled={pending}>
              {pending ? "Henter…" : "Hent 50 flere"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
