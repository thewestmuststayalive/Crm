"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { activityTypeEnum } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { getCompany, getContact } from "@/lib/crm";
import { hasRole } from "@/lib/roles";
import { isUuid } from "@/lib/validation";
import type { ActionState } from "./types";

const activitySchema = z.object({
  type: z.enum(activityTypeEnum.enumValues),
  body: z.string().trim().min(1, "Skriv en tekst").max(5000, "Højst 5000 tegn"),
});

export async function addActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  const parsed = activitySchema.safeParse({ type: formData.get("type"), body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const contactId = String(formData.get("contactId") ?? "");
  const companyId = String(formData.get("companyId") ?? "");
  let target: { contactId: string } | { companyId: string };
  let path: string;

  if (contactId && (await getContact(workspace.id, contactId))) {
    target = { contactId };
    path = `/kunder/${contactId}`;
  } else if (companyId && (await getCompany(workspace.id, companyId))) {
    target = { companyId };
    path = `/virksomheder/${companyId}`;
  } else {
    return { error: "Kontakten eller virksomheden findes ikke" };
  }

  await db.insert(schema.activities).values({
    workspaceId: workspace.id,
    authorId: user.id,
    ...target,
    ...parsed.data,
  });
  revalidatePath(path);
  return { success: "Gemt" };
}

/** Forfatteren eller en admin kan slette en aktivitet. */
export async function deleteActivity(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const id = formData.get("id");
  if (!isUuid(id)) return;

  const [activity] = await db
    .select({ authorId: schema.activities.authorId })
    .from(schema.activities)
    .where(and(eq(schema.activities.workspaceId, workspace.id), eq(schema.activities.id, id)))
    .limit(1);
  if (!activity) return;
  if (activity.authorId !== user.id && !hasRole(workspace.role, "ADMIN")) return;

  await db.delete(schema.activities).where(eq(schema.activities.id, id));
  const back = String(formData.get("back") ?? "");
  if (back.startsWith("/kunder/") || back.startsWith("/virksomheder/")) revalidatePath(back);
}
