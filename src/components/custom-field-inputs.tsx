"use client";

import type { CustomFieldDef } from "@/lib/custom-fields";
import { Field, Input, Select } from "./ui";

/**
 * Formularfelter for firmaets egne felter. `values` er de gemte værdier;
 * `submitted` er det brugeren skrev, hvis formularen kom tilbage med en fejl.
 */
export function CustomFieldInputs({
  fields,
  values,
  submitted,
}: {
  fields: CustomFieldDef[];
  values?: Record<string, unknown> | null;
  submitted?: Record<string, string>;
}) {
  if (fields.length === 0) return null;
  return (
    <>
      {fields.map((f) => {
        const name = `cf_${f.id}`;
        const id = `cf-${f.id}`;
        const saved = values?.[f.id];
        const value = submitted?.[name] ?? (saved === undefined || saved === null ? "" : String(saved));
        if (f.type === "CHECKBOX") {
          return (
            <label key={f.id} className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                id={id}
                name={name}
                defaultChecked={submitted ? submitted[name] === "on" : saved === true}
                className="h-4 w-4"
              />
              {f.label}
            </label>
          );
        }
        return (
          <Field key={f.id} label={f.label} htmlFor={id}>
            {f.type === "SELECT" ? (
              <Select id={id} name={name} defaultValue={value} className="w-full">
                <option value="">—</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={id}
                name={name}
                type={f.type === "DATE" ? "date" : "text"}
                inputMode={f.type === "NUMBER" ? "decimal" : undefined}
                defaultValue={value}
                maxLength={1000}
              />
            )}
          </Field>
        );
      })}
    </>
  );
}
