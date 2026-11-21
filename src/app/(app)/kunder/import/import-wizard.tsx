"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { importContacts, previewImport, type PreviewResult } from "@/app/actions/import";
import { buttonClass } from "@/components/styles";
import { Button, Select } from "@/components/ui";
import { IMPORT_FIELDS, type Mapping } from "@/lib/import/fields";
import type { ImportResult } from "@/lib/import/run";

/** Trin 1: vælg fil. Trin 2: tjek kolonner. Trin 3: resultat. */
export function ImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function fileData() {
    const data = new FormData();
    const file = fileRef.current?.files?.[0];
    if (file) data.set("file", file);
    return data;
  }

  function onFile() {
    setResult(null);
    setError(null);
    start(async () => {
      const p = await previewImport(fileData());
      setPreview(p);
      setMapping(p.mapping ?? {});
      if (p.error) setError(p.error);
    });
  }

  function onImport() {
    setError(null);
    start(async () => {
      const data = fileData();
      data.set("mapping", JSON.stringify(mapping));
      const r = await importContacts(data);
      if (r.error) setError(r.error);
      if (r.result) setResult(r.result);
    });
  }

  if (result) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-lg font-semibold text-brand-900">
          {result.created} kontakter importeret
        </p>
        <ul className="space-y-1 text-sm text-slate-600">
          {result.companiesCreated > 0 && <li>{result.companiesCreated} nye virksomheder oprettet</li>}
          {result.skipped > 0 && <li>{result.skipped} sprunget over, fordi de allerede findes (samme e-mail eller telefon)</li>}
        </ul>
        {result.problems.length > 0 && (
          <details className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <summary className="cursor-pointer font-medium">{result.problems.length} rækker med bemærkninger</summary>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
              {result.problems.slice(0, 200).map((p, i) => (
                <li key={i}>
                  Række {p.row}: {p.message}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex gap-2">
          <Link href="/kunder" className={buttonClass()}>
            Se kunderne
          </Link>
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setResult(null);
              setPreview(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            Importér en fil mere
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="import-file" className="block text-sm font-medium text-slate-700">
          Vælg fil (Excel .xlsx eller CSV, højst 4 MB)
        </label>
        <input
          ref={fileRef}
          id="import-file"
          type="file"
          accept=".csv,.xlsx,.txt"
          onChange={onFile}
          className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-medium file:text-brand-800 hover:file:bg-brand-100"
        />
        <p className="mt-1 text-xs text-slate-500">
          Første række skal være overskrifter, fx Navn, E-mail, Telefon, Virksomhed.
        </p>
      </div>

      {pending && !preview && <p className="text-sm text-slate-500">Læser filen …</p>}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {preview?.headers && (
        <>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Tjek kolonnerne</h2>
            <p className="text-sm text-slate-500">
              {preview.rowCount} rækker fundet. Vi har gættet, hvilke kolonner der hører til hvad – ret hvis noget er forkert.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2">
                  <label htmlFor={`map-${f.key}`} className="text-sm text-slate-700">
                    {f.label}
                  </label>
                  <Select
                    id={`map-${f.key}`}
                    value={mapping[f.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? undefined : Number(e.target.value) }))
                    }
                    className="w-48"
                  >
                    <option value="">— ikke med —</option>
                    {preview.headers!.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Forhåndsvisning af de første rækker</caption>
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.sample!.map((row, r) => (
                  <tr key={r}>
                    {row.map((v, c) => (
                      <td key={c} className="max-w-48 truncate px-3 py-2 text-slate-700">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button type="button" onClick={onImport} disabled={pending}>
            {pending ? "Importerer …" : `Importér ${preview.rowCount} rækker`}
          </Button>
        </>
      )}
    </div>
  );
}
