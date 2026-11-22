"use client";

import { useRef, useState } from "react";
import { bulkContacts } from "@/app/actions/contacts";
import { Button, Select } from "@/components/ui";

type Option = { id: string; name: string };

/**
 * Formular om kundelisten: afkrydsning af rækker og en handlingslinje, der dukker op,
 * når mindst én kontakt er valgt.
 */
export function BulkForm({
  children,
  members,
  isAdmin,
  back,
}: {
  children: React.ReactNode;
  members: Option[];
  isAdmin: boolean;
  back: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(0);
  const recount = () => setCount(ref.current?.querySelectorAll('input[name="ids"]:checked').length ?? 0);

  return (
    <form
      ref={ref}
      action={bulkContacts}
      onChange={recount}
      onSubmit={(e) => {
        const op = new FormData(e.currentTarget).get("op");
        if (
          op === "delete" &&
          !window.confirm(`Slet ${count} kontakter og alle deres noter? Det kan ikke fortrydes.`)
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="back" value={back} />
      {children}
      {count > 0 && (
        <div
          role="region"
          aria-label="Handlinger for valgte"
          className="sticky bottom-20 z-30 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-white p-3 shadow-lg md:bottom-4"
        >
          <span className="text-sm font-medium text-slate-800">{count} valgt</span>
          <label htmlFor="bulk-op" className="sr-only">
            Handling
          </label>
          <Select id="bulk-op" name="op" defaultValue="" required>
            <option value="" disabled>
              Vælg handling …
            </option>
            <optgroup label="Skift status">
              <option value="status:LEAD">Status: Lead</option>
              <option value="status:CUSTOMER">Status: Kunde</option>
              <option value="status:INACTIVE">Status: Inaktiv</option>
            </optgroup>
            <optgroup label="Ansvarlig">
              <option value="owner:mig">Gør mig ansvarlig</option>
              {members.map((m) => (
                <option key={m.id} value={`owner:${m.id}`}>
                  Ansvarlig: {m.name}
                </option>
              ))}
              <option value="owner:ingen">Ingen ansvarlig</option>
            </optgroup>
            {isAdmin && <option value="delete">Slet</option>}
          </Select>
          <Button type="submit">Udfør</Button>
          <button
            type="button"
            className="text-sm text-slate-500 underline"
            onClick={() => {
              ref.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((i) => (i.checked = false));
              setCount(0);
            }}
          >
            Fravælg alle
          </button>
        </div>
      )}
    </form>
  );
}

/** Afkrydsning i tabelhovedet, der vælger alle rækker på siden. */
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Vælg alle på siden"
      className="h-4 w-4"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form
          ?.querySelectorAll<HTMLInputElement>('input[name="ids"]')
          .forEach((i) => (i.checked = e.currentTarget.checked));
      }}
    />
  );
}
