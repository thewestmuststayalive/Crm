import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CustomFieldEntity } from "@/db/schema";
import { formatIsoDate } from "./labels";

export type CustomField = typeof schema.customFields.$inferSelect;
/** Den del af et felt, der sendes til formularerne i browseren. */
export type CustomFieldDef = Pick<CustomField, "id" | "label" | "type" | "options">;

export async function getCustomFields(workspaceId: string, entity: CustomFieldEntity): Promise<CustomFieldDef[]> {
  return db
    .select({
      id: schema.customFields.id,
      label: schema.customFields.label,
      type: schema.customFields.type,
      options: schema.customFields.options,
    })
    .from(schema.customFields)
    .where(and(eq(schema.customFields.workspaceId, workspaceId), eq(schema.customFields.entity, entity)))
    .orderBy(asc(schema.customFields.position), asc(schema.customFields.createdAt));
}

export const fieldInputName = (id: string) => `cf_${id}`;

/**
 * Læser og validerer værdier for egne felter fra en formular.
 * Tomme felter udelades, så `custom` kun indeholder udfyldte værdier.
 */
export function parseCustomValues(
  fields: CustomFieldDef[],
  formData: FormData,
): { values: Record<string, unknown> } | { error: string } {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = formData.get(fieldInputName(f.id));
    if (f.type === "CHECKBOX") {
      if (raw === "on") values[f.id] = true;
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") continue;
    if (text.length > 1000) return { error: `${f.label}: højst 1000 tegn` };
    switch (f.type) {
      case "NUMBER": {
        const n = Number(text.replace(/\./g, "").replace(",", "."));
        if (!Number.isFinite(n)) return { error: `${f.label} skal være et tal` };
        values[f.id] = n;
        break;
      }
      case "DATE":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: `${f.label} skal være en dato` };
        values[f.id] = text;
        break;
      case "SELECT":
        if (!f.options.includes(text)) return { error: `Ugyldigt valg i ${f.label}` };
        values[f.id] = text;
        break;
      default:
        values[f.id] = text;
    }
  }
  return { values };
}

/** Viser en værdi pænt på dansk. */
export function formatCustomValue(field: CustomFieldDef, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  switch (field.type) {
    case "CHECKBOX":
      return value ? "Ja" : null;
    case "NUMBER":
      return typeof value === "number" ? value.toLocaleString("da-DK") : String(value);
    case "DATE":
      return typeof value === "string" ? formatIsoDate(value) : null;
    default:
      return String(value);
  }
}
