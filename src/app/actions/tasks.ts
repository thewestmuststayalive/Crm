"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { getCompany, getContact, getDeal, isMemberOf } from "@/lib/crm";
import { hasRole } from "@/lib/roles";
import { isUuid, optionalId } from "@/lib/validation";
import { pickValues, type ActionState } from "./types";

const taskSchema = z.object({
  title: z.string().trim().min(1, "Skriv hvad der skal gøres").max(300),
  dueDate: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Ugyldig dato")
    .nullable()
    .default(null),
  assigneeId: optionalId,
  contactId: optionalId,
  companyId: optionalId,
  dealId: optionalId,
});

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  const values = pickValues(formData, ["title", "dueDate", "assigneeId"]);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const data = parsed.data;

  if (data.assigneeId && !(await isMemberOf(workspace.id, data.assigneeId))) {
    return { error: "Den valgte person er ikke medlem af firmaet", values };
  }
  if (data.contactId && !(await getContact(workspace.id, data.contactId))) return { error: "Kontakten findes ikke" };
  if (data.companyId && !(await getCompany(workspace.id, data.companyId))) return { error: "Virksomheden findes ikke" };
  if (data.dealId && !(await getDeal(workspace.id, data.dealId))) return { error: "Dealen findes ikke" };

  const assigneeId = data.assigneeId ?? user.id;
  await db.insert(schema.tasks).values({
    ...data,
    assigneeId,
    workspaceId: workspace.id,
    createdById: user.id,
  });
  if (assigneeId !== user.id) {
    const href = data.dealId ? `/pipeline/${data.dealId}` : data.contactId ? `/kunder/${data.contactId}` : data.companyId ? `/virksomheder/${data.companyId}` : "/opgaver";
    await notify({
      workspaceId: workspace.id,
      to: { userIds: [assigneeId] },
      type: "TASK_ASSIGNED",
      title: `${user.name} har givet dig en opgave`,
      body: data.dueDate ? `${data.title} (frist ${data.dueDate.split("-").reverse().join("-")})` : data.title,
      href,
    });
  }
  revalidatePath("/", "layout");
  return { success: "Opgaven er oprettet" };
}

async function getTask(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.workspaceId, workspaceId), eq(schema.tasks.id, id)))
    .limit(1);
  return task ?? null;
}

/** Markerer en opgave som udført, eller genåbner den. Alle i firmaet kan gøre det. */
export async function toggleTask(formData: FormData) {
  const { workspace } = await requireWorkspace();
  const task = await getTask(workspace.id, formData.get("id"));
  if (!task) return;
  await db
    .update(schema.tasks)
    .set({ completedAt: task.completedAt ? null : new Date() })
    .where(eq(schema.tasks.id, task.id));
  revalidatePath("/", "layout");
}

/** Opretteren, den ansvarlige eller en admin kan slette en opgave. */
export async function deleteTask(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const task = await getTask(workspace.id, formData.get("id"));
  if (!task) return;
  const allowed =
    hasRole(workspace.role, "ADMIN") || task.createdById === user.id || task.assigneeId === user.id;
  if (!allowed) return;
  await db.delete(schema.tasks).where(eq(schema.tasks.id, task.id));
  revalidatePath("/", "layout");
}
