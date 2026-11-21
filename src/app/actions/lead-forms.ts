"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { isMemberOf } from "@/lib/crm";
import { isUuid, optionalId } from "@/lib/validation";
import { pickValues, type ActionState } from "./types";

const formSchema = z.object({
  name: z.string().trim().min(1, "Giv formularen et navn, fx hjemmesidens adresse").max(100),
  redirectUrl: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), "Takkesiden skal være en fuld adresse, der starter med https://")
    .nullable()
    .default(null),
  assigneeId: optionalId,
  createDeal: z.preprocess((v) => v === "on", z.boolean()),
});

const PATH = "/indstillinger/kontaktformular";

export async function createLeadForm(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireRole("ADMIN");
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  const values = pickValues(formData, ["name", "redirectUrl", "assigneeId"]);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (parsed.data.assigneeId && !(await isMemberOf(workspace.id, parsed.data.assigneeId))) {
    return { error: "Den valgte person er ikke medlem af firmaet", values };
  }

  await db.insert(schema.leadForms).values({
    ...parsed.data,
    workspaceId: workspace.id,
    key: randomBytes(18).toString("base64url"),
  });
  revalidatePath(PATH);
  return { success: "Formularen er oprettet. Kopiér koden nedenfor ind på din hjemmeside." };
}

export async function toggleLeadForm(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const [form] = await db
    .select({ active: schema.leadForms.active })
    .from(schema.leadForms)
    .where(and(eq(schema.leadForms.workspaceId, workspace.id), eq(schema.leadForms.id, id)))
    .limit(1);
  if (!form) return;
  await db
    .update(schema.leadForms)
    .set({ active: !form.active })
    .where(and(eq(schema.leadForms.workspaceId, workspace.id), eq(schema.leadForms.id, id)));
  revalidatePath(PATH);
}

export async function deleteLeadForm(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await db
    .delete(schema.leadForms)
    .where(and(eq(schema.leadForms.workspaceId, workspace.id), eq(schema.leadForms.id, id)));
  revalidatePath(PATH);
}
