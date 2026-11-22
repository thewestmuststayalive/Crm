"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCompany, isMemberOf } from "@/lib/crm";
import { requireAgencyModule } from "@/lib/modules";
import { getProject, getTemplate, parseTemplateItems, STARTER_TEMPLATES } from "@/lib/projects";
import { addDays, isIsoDate, localDate } from "@/lib/time";
import { isUuid } from "@/lib/validation";
import { pickValues, type ActionState } from "./types";

const nameSchema = z.string().trim().min(1, "Projektet skal have et navn").max(200);

function today() {
  return localDate(new Date());
}

/** Opretter et projekt – fra en skabelon oprettes opgaverne med frister fra startdatoen. */
export async function createProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireAgencyModule();
  const values = pickValues(formData, ["name", "companyId", "templateId", "startDate", "dueDate", "ownerId"]);
  const name = nameSchema.safeParse(values.name);
  if (!name.success) return { error: name.error.issues[0].message, values };
  const companyId = isUuid(values.companyId) ? ((await getCompany(workspace.id, values.companyId))?.id ?? null) : null;
  const ownerId = isUuid(values.ownerId) && (await isMemberOf(workspace.id, values.ownerId)) ? values.ownerId : user.id;
  const startDate = isIsoDate(values.startDate) ? values.startDate : today();
  const dueDate = isIsoDate(values.dueDate) ? values.dueDate : null;
  const template = values.templateId ? await getTemplate(workspace.id, values.templateId) : null;

  const projectId = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(schema.projects)
      .values({ workspaceId: workspace.id, name: name.data, companyId, ownerId, startDate, dueDate })
      .returning({ id: schema.projects.id });
    if (template && template.items.length > 0) {
      await tx.insert(schema.tasks).values(
        template.items.map((item) => ({
          workspaceId: workspace.id,
          projectId: project.id,
          companyId,
          title: item.title,
          dueDate: addDays(startDate, item.offsetDays),
          assigneeId: ownerId,
          createdById: user.id,
        })),
      );
    }
    return project.id;
  });
  revalidatePath("/projekter");
  redirect(`/projekter/${projectId}`);
}

export async function updateProject(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireAgencyModule();
  const project = await getProject(workspace.id, id);
  if (!project) return { error: "Projektet findes ikke" };
  const values = pickValues(formData, ["name", "companyId", "dueDate", "ownerId", "description"]);
  const name = nameSchema.safeParse(values.name);
  if (!name.success) return { error: name.error.issues[0].message, values };
  const companyId = isUuid(values.companyId) ? ((await getCompany(workspace.id, values.companyId))?.id ?? null) : null;
  const ownerId = isUuid(values.ownerId) && (await isMemberOf(workspace.id, values.ownerId)) ? values.ownerId : null;
  await db
    .update(schema.projects)
    .set({
      name: name.data,
      companyId,
      ownerId,
      dueDate: isIsoDate(values.dueDate) ? values.dueDate : null,
      description: values.description.trim().slice(0, 5000) || null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.projects.workspaceId, workspace.id), eq(schema.projects.id, project.id)));
  revalidatePath(`/projekter/${project.id}`);
  return { success: "Gemt." };
}

export async function setProjectStatus(formData: FormData) {
  const { workspace } = await requireAgencyModule();
  const project = await getProject(workspace.id, formData.get("id"));
  const status = z.enum(["ACTIVE", "DONE"]).safeParse(formData.get("status"));
  if (!project || !status.success) return;
  await db
    .update(schema.projects)
    .set({ status: status.data, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  revalidatePath("/projekter");
  revalidatePath(`/projekter/${project.id}`);
}

export async function deleteProject(formData: FormData) {
  const { workspace } = await requireAgencyModule("ADMIN");
  const project = await getProject(workspace.id, formData.get("id"));
  if (!project) return;
  await db.delete(schema.projects).where(eq(schema.projects.id, project.id));
  revalidatePath("/projekter");
  redirect("/projekter");
}

// ---------- Skabeloner ----------

const TEMPLATES_PATH = "/projekter/skabeloner";

export async function saveTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireAgencyModule("ADMIN");
  const values = pickValues(formData, ["id", "name", "items"]);
  const name = z.string().trim().min(1, "Skabelonen skal have et navn").max(100).safeParse(values.name);
  if (!name.success) return { error: name.error.issues[0].message, values };
  const items = parseTemplateItems(values.items);
  if (items.length === 0) return { error: "Skriv mindst én opgave (én pr. linje)", values };
  if (isUuid(values.id)) {
    const existing = await getTemplate(workspace.id, values.id);
    if (!existing) return { error: "Skabelonen findes ikke" };
    await db
      .update(schema.projectTemplates)
      .set({ name: name.data, items })
      .where(eq(schema.projectTemplates.id, existing.id));
  } else {
    await db.insert(schema.projectTemplates).values({ workspaceId: workspace.id, name: name.data, items });
  }
  revalidatePath(TEMPLATES_PATH);
  return { success: `Skabelonen "${name.data}" er gemt.` };
}

export async function deleteTemplate(formData: FormData) {
  const { workspace } = await requireAgencyModule("ADMIN");
  const template = await getTemplate(workspace.id, formData.get("id"));
  if (!template) return;
  await db.delete(schema.projectTemplates).where(eq(schema.projectTemplates.id, template.id));
  revalidatePath(TEMPLATES_PATH);
}

/** Lægger de indbyggede startskabeloner ind i firmaet. */
export async function addStarterTemplates() {
  const { workspace } = await requireAgencyModule("ADMIN");
  await db
    .insert(schema.projectTemplates)
    .values(STARTER_TEMPLATES.map((t) => ({ workspaceId: workspace.id, name: t.name, items: t.items })));
  revalidatePath(TEMPLATES_PATH);
}
