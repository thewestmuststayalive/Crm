"use client";

import { useState, useTransition } from "react";
import { runGoogleSearch, type SearchResult } from "@/app/actions/leads";
import { Button, Input } from "@/components/ui";
import { SearchResults } from "../search-results";

export function GoogleSearch({
  lists,
  initialUsage,
}: {
  lists: { id: string; name: string }[];
  initialUsage: { used: number; limit: number };
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<NonNullable<SearchResult["results"]>>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState(initialUsage);
  const [searched, setSearched] = useState("");
  const [pending, startTransition] = useTransition();

  const search = (more: boolean) =>
    startTransition(async () => {
      const q = more ? searched : query;
      const result = await runGoogleSearch(q, more ? next : null);
      if (result.usage) setUsage(result.usage);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSearched(q);
      setNext(result.nextPageToken ?? null);
      setRows((prev) => {
        const incoming = result.results ?? [];
        if (!more) return incoming;
        const seen = new Set(prev.map((r) => r.externalId));
        return [...prev, ...incoming.filter((r) => !seen.has(r.externalId))];
      });
    });

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(false);
        }}
      >
        <Input
          aria-label="Søg i Google Maps"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Fx frisør Aarhus, bilforhandler Odense, tandlæge 2100"
          className="min-w-60 flex-1"
          maxLength={120}
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Søger…" : "Søg"}
        </Button>
      </form>
      <p className="text-xs text-slate-500">
        Hver søgning giver op til 20 firmaer og tæller som én af månedens {usage.limit} søgninger ({usage.used} brugt).
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {searched && !error && rows.length === 0 && !pending && (
        <p className="text-sm text-slate-500">Ingen firmaer fundet. Prøv en anden søgning.</p>
      )}
      {rows.length > 0 && (
        <>
          <p className="text-sm text-slate-600">
            {rows.length} firmaer for &quot;{searched}&quot;
          </p>
          <SearchResults key={searched} rows={rows} lists={lists} />
          {next && (
            <Button variant="secondary" onClick={() => search(true)} disabled={pending}>
              {pending ? "Henter…" : "Hent 20 flere"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
