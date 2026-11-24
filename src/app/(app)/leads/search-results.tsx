"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveResults, type SearchResult } from "@/app/actions/leads";
import { Badge } from "@/components/display";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui";

type Row = NonNullable<SearchResult["results"]>[number];

function domain(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Kun de felter, serveren gemmer (uden "gemt"/"kunde"-markeringerne). */
function toInput(r: Row) {
  return {
    source: r.source,
    externalId: r.externalId,
    name: r.name,
    cvr: r.cvr,
    address: r.address,
    phone: r.phone,
    website: r.website,
    industry: r.industry,
    employees: r.employees,
    companyForm: r.companyForm,
    foundedAt: r.foundedAt,
    rating: r.rating,
    reviewCount: r.reviewCount,
    mapsUrl: r.mapsUrl,
  };
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.${y}`;
}

/** Søgeresultater med afkrydsning og gem-i-liste. Bruges af både Google- og CVR-søgningen. */
export function SearchResults({ rows, lists }: { rows: Row[]; lists: { id: string; name: string }[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [savedNow, setSavedNow] = useState<Set<string>>(new Set());
  const keyOf = (r: Row) => r.externalId ?? r.name;
  const isSaved = (r: Row) => r.saved || savedNow.has(keyOf(r));
  // Gemte firmaer markeres med det samme, så de ikke kan vælges igen.
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveResults>>, fd: FormData) => {
    const keys = [...selected];
    const result = await saveResults(prev, fd);
    if (result.success) {
      setSavedNow((old) => new Set([...old, ...keys]));
      setSelected(new Set());
    }
    return result;
  }, {});
  const selectable = rows.filter((r) => !isSaved(r));
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(keyOf(r)));
  const chosen = rows.filter((r) => selected.has(keyOf(r)) && !isSaved(r));

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <label className="flex items-center gap-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(keyOf)))}
              aria-label="Vælg alle"
            />
            Vælg alle
          </label>
          <span className="text-slate-500">{chosen.length} valgt</span>
        </div>
        <ul className="divide-y divide-slate-100" aria-label="Søgeresultater">
          {rows.map((r) => {
            const key = keyOf(r);
            return (
              <li key={key} className="flex gap-3 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(key)}
                  disabled={isSaved(r)}
                  onChange={() => toggle(key)}
                  aria-label={`Vælg ${r.name}`}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{r.name}</span>
                    {isSaved(r) && <Badge>Gemt i en liste</Badge>}
                    {r.customer && <Badge className="bg-emerald-50 text-emerald-800">Findes i CRM&apos;et</Badge>}
                    {r.rating !== null && (
                      <span className="text-xs text-slate-600">
                        ★ {r.rating.toLocaleString("da-DK")} ({r.reviewCount ?? 0})
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500">
                    {[r.address, r.industry, r.employees ? `${r.employees} ansatte` : null, r.companyForm]
                      .filter(Boolean)
                      .join(" · ")}
                    {r.foundedAt && ` · Stiftet ${formatDate(r.foundedAt)}`}
                  </p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1">
                    {r.phone ? (
                      <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="text-brand-700 underline">
                        {r.phone}
                      </a>
                    ) : (
                      <span className="text-slate-400">Intet telefonnummer</span>
                    )}
                    {r.website ? (
                      <a
                        href={/^https?:\/\//i.test(r.website) ? r.website : `https://${r.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-700 underline"
                      >
                        {domain(r.website)}
                      </a>
                    ) : (
                      <span className="text-amber-700">Ingen hjemmeside</span>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <form action={action} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <input type="hidden" name="items" value={JSON.stringify(chosen.map(toInput))} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <Field label="Gem i liste" htmlFor="save-list">
              <Select id="save-list" name="listId" value={listId} onChange={(e) => setListId(e.target.value)}>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
                <option value="">+ Ny liste</option>
              </Select>
            </Field>
          </div>
          {listId === "" && (
            <div className="min-w-48 flex-1">
              <Field label="Navn på ny liste" htmlFor="save-new-list">
                <Input id="save-new-list" name="newList" maxLength={80} required placeholder="Fx Frisører i Aarhus" />
              </Field>
            </div>
          )}
          <SubmitButton disabled={chosen.length === 0} pendingText="Gemmer…">
            Gem {chosen.length} valgte
          </SubmitButton>
        </div>
        <FormMessage state={state} />
        {state.success && state.values?.listId && (
          <Link href={`/leads/${state.values.listId}`} className="text-sm font-medium text-brand-700 underline">
            Åbn listen →
          </Link>
        )}
      </form>
    </div>
  );
}
