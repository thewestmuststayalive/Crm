"use server";

import { and, eq, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { customFieldEntityEnum, customFieldTypeEnum } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { isUuid } from "@/lib/validation";

const PATH = "/indstillinger/felter";
const MAX_FIELDS_PER_ENTITY = 30;

function done(message: string, kind: "ok" | "fejl" = "ok"): never {
  revalidatePath("/", "layout");
  redirect(`${PATH}?${kind === "ok" ? "besked" : "fejlbesked"}=${encodeURIComponent(message)}`);
}

/** "Lille, Mellem, Stor" → ["Lille", "Mellem", "Stor"] */
function parseOptions(raw: FormDataEntryValue | null) {
  return [
    ...new Set(
      String(raw ?? "")
        .split(/[,\n]/)
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => o.slice(0, 80)),
    ),
  ].slice(0, 50);
}

export async function addCustomField(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const entity = z.enum(customFieldEntityEnum.enumValues).safeParse(formData.get("entity"));
  const type = z.enum(customFieldTypeEnum.enumValues).safeParse(formData.get("type"));
  const label = z.string().trim().min(1, "Feltet skal have et navn").max(60).safeParse(formData.get("label"));
  if (!entity.success || !type.success) return;
  if (!label.success) done(label.error.issues[0].message, "fejl");
  const options = type.data === "SELECT" ? parseOptions(formData.get("options")) : [];
  if (type.data === "SELECT" && options.length < 2) done("En valgliste skal have mindst to valgmuligheder.", "fejl");

  const [{ n, pos }] = await db
    .select({ n: sql<number>`count(*)::int`, pos: max(schema.customFields.position) })
    .from(schema.customFields)
    .where(and(eq(schema.customFields.workspaceId, workspace.id), eq(schema.customFields.entity, entity.data)));
  if (n >= MAX_FIELDS_PER_ENTITY) done(`Højst ${MAX_FIELDS_PER_ENTITY} egne felter pr. type.`, "fejl");

  await db.insert(schema.customFields).values({
    workspaceId: workspace.id,
    entity: entity.data,
    label: label.data,
    type: type.data,
    options,
    position: (pos ?? -1) + 1,
  });
  done(`Feltet "${label.data}" er oprettet.`);
}

export async function updateCustomField(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const label = z.string().trim().min(1, "Feltet skal have et navn").max(60).safeParse(formData.get("label"));
  if (!label.success) done(label.error.issues[0].message, "fejl");
  const [field] = await db
    .select()
    .from(schema.customFields)
    .where(and(eq(schema.customFields.workspaceId, workspace.id), eq(schema.customFields.id, id)))
    .limit(1);
  if (!field) return;
  const options = field.type === "SELECT" ? parseOptions(formData.get("options")) : [];
  if (field.type === "SELECT" && options.length < 2) done("En valgliste skal have mindst to valgmuligheder.", "fejl");
  await db.update(schema.customFields).set({ label: label.data, options }).where(eq(schema.customFields.id, field.id));
  done("Gemt.");
}

/** Sletter feltet og fjerner dets værdier fra alle kontakter, virksomheder og deals i firmaet. */
export async function deleteCustomField(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const [field] = await db
    .delete(schema.customFields)
    .where(and(eq(schema.customFields.workspaceId, workspace.id), eq(schema.customFields.id, id)))
    .returning();
  if (!field) return;
  const table = field.entity === "CONTACT" ? schema.contacts : field.entity === "COMPANY" ? schema.companies : schema.deals;
  await db
    .update(table)
    .set({ custom: sql`${table.custom} - ${field.id}::text` })
    .where(and(eq(table.workspaceId, workspace.id), sql`${table.custom} ? ${field.id}::text`));
  done(`Feltet "${field.label}" er slettet.`);
}
