"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireRole, requireWorkspace } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getCompany, isMemberOf } from "@/lib/crm";
import { getCustomFields, parseCustomValues } from "@/lib/custom-fields";
import { isUuid, optionalEmail, optionalId, optionalText } from "@/lib/validation";
import { pickValues, type ActionState } from "./types";

const companySchema = z.object({
  name: z.string().trim().min(1, "Navn mangler").max(200),
  cvr: optionalText(20),
  email: optionalEmail,
  phone: optionalText(50),
  website: optionalText(200),
  address: optionalText(300),
  ownerId: optionalId,
});

const FIELDS = ["name", "cvr", "email", "phone", "website", "address", "ownerId"];

async function parseCompany(workspaceId: string, formData: FormData) {
  const parsed = companySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  if (parsed.data.ownerId && !(await isMemberOf(workspaceId, parsed.data.ownerId))) {
    return { error: "Den valgte ansvarlige er ikke medlem af firmaet" } as const;
  }
  const custom = parseCustomValues(await getCustomFields(workspaceId, "COMPANY"), formData);
  if ("error" in custom) return { error: custom.error } as const;
  return { values: { ...parsed.data, custom: custom.values } } as const;
}

export async function createCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const result = await parseCompany(workspace.id, formData);
  if ("error" in result) return { error: result.error, values: pickValues(formData, FIELDS) };

  const [company] = await db
    .insert(schema.companies)
    .values({ ...result.values, workspaceId: workspace.id })
    .returning({ id: schema.companies.id });
  redirect(`/virksomheder/${company.id}`);
}

export async function updateCompany(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  if (!(await getCompany(workspace.id, id))) return { error: "Virksomheden findes ikke" };

  const result = await parseCompany(workspace.id, formData);
  if ("error" in result) return { error: result.error, values: pickValues(formData, FIELDS) };

  await db
    .update(schema.companies)
    .set({ ...result.values, updatedAt: new Date() })
    .where(and(eq(schema.companies.workspaceId, workspace.id), eq(schema.companies.id, id)));
  revalidatePath(`/virksomheder/${id}`);
  redirect(`/virksomheder/${id}`);
}

/** Sletter virksomheden. Kontaktpersonerne bevares, men mister koblingen. */
export async function deleteCompany(formData: FormData) {
  const { user, workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const [deleted] = await db
    .delete(schema.companies)
    .where(and(eq(schema.companies.workspaceId, workspace.id), eq(schema.companies.id, id)))
    .returning({ name: schema.companies.name });
  if (deleted) await audit(workspace.id, user.id, "Virksomhed slettet", deleted.name);
  revalidatePath("/virksomheder");
  redirect("/virksomheder");
}
