"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { getCompany, getContact, getDeal } from "@/lib/crm";
import { USER_ACTIVITY_TYPES } from "@/lib/labels";
import { hasRole } from "@/lib/roles";
import { isUuid } from "@/lib/validation";
import type { ActionState } from "./types";

const activitySchema = z.object({
  type: z.enum(USER_ACTIVITY_TYPES),
  body: z.string().trim().min(1, "Skriv en tekst").max(5000, "Højst 5000 tegn"),
});

type Target = { contactId?: string | null; companyId?: string | null; dealId?: string };

export async function addActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  const parsed = activitySchema.safeParse({ type: formData.get("type"), body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const contactId = String(formData.get("contactId") ?? "");
  const companyId = String(formData.get("companyId") ?? "");
  const dealId = String(formData.get("dealId") ?? "");
  let target: Target;
  let path: string;

  if (dealId) {
    const deal = await getDeal(workspace.id, dealId);
    if (!deal) return { error: "Dealen findes ikke" };
    // Knyt også til dealens kontakt/virksomhed, så noten vises på deres tidslinjer.
    target = { dealId, contactId: deal.contactId, companyId: deal.contactId ? null : deal.companyId };
    path = `/pipeline/${dealId}`;
  } else if (contactId && (await getContact(workspace.id, contactId))) {
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

/** Forfatteren eller en admin kan slette en aktivitet. Automatiske hændelser kan kun slettes af admins. */
export async function deleteActivity(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const id = formData.get("id");
  if (!isUuid(id)) return;

  const [activity] = await db
    .select({ authorId: schema.activities.authorId, type: schema.activities.type })
    .from(schema.activities)
    .where(and(eq(schema.activities.workspaceId, workspace.id), eq(schema.activities.id, id)))
    .limit(1);
  if (!activity) return;
  const isAdmin = hasRole(workspace.role, "ADMIN");
  if (!isAdmin && (activity.authorId !== user.id || activity.type === "SYSTEM")) return;

  await db.delete(schema.activities).where(eq(schema.activities.id, id));
  const back = String(formData.get("back") ?? "");
  if (/^\/(kunder|virksomheder|pipeline)\//.test(back)) revalidatePath(back);
}
