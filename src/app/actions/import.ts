"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import { IMPORT_FIELDS, suggestMapping, type Mapping } from "@/lib/import/fields";
import { ImportError, readTable } from "@/lib/import/parse";
import { runImport, type ImportResult } from "@/lib/import/run";

export type PreviewResult = {
  error?: string;
  headers?: string[];
  sample?: string[][];
  rowCount?: number;
  mapping?: Mapping;
};

function getFile(formData: FormData) {
  const file = formData.get("file");
  return file instanceof File ? file : null;
}

/** Læser filen og foreslår, hvilke kolonner der hører til hvilke felter. Gemmer intet. */
export async function previewImport(formData: FormData): Promise<PreviewResult> {
  await requireWorkspace();
  const file = getFile(formData);
  if (!file) return { error: "Vælg en fil." };
  try {
    const table = await readTable(file);
    return {
      headers: table.headers,
      sample: table.rows.slice(0, 5),
      rowCount: table.rows.length,
      mapping: suggestMapping(table.headers),
    };
  } catch (error) {
    return { error: error instanceof ImportError ? error.message : "Filen kunne ikke læses." };
  }
}

export async function importContacts(formData: FormData): Promise<{ error?: string; result?: ImportResult }> {
  const { user, workspace } = await requireWorkspace();
  const file = getFile(formData);
  if (!file) return { error: "Vælg en fil." };

  let table;
  try {
    table = await readTable(file);
  } catch (error) {
    return { error: error instanceof ImportError ? error.message : "Filen kunne ikke læses." };
  }

  // Valider kolonnevalget fra browseren: kun kendte felter og eksisterende kolonner.
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(String(formData.get("mapping") ?? "{}"));
  } catch {
    return { error: "Ugyldigt kolonnevalg." };
  }
  const mapping: Mapping = {};
  for (const field of IMPORT_FIELDS) {
    const idx = raw[field.key];
    if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < table.headers.length) {
      mapping[field.key] = idx;
    }
  }
  const identifying = ["name", "firstName", "lastName", "email", "phone"] as const;
  if (!identifying.some((k) => mapping[k] !== undefined)) {
    return { error: "Vælg mindst én kolonne for navn, e-mail eller telefon." };
  }

  const result = await runImport({ workspaceId: workspace.id, userId: user.id, table, mapping });
  revalidatePath("/kunder");
  revalidatePath("/virksomheder");
  return { result };
}
