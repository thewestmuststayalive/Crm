"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { contactStatusEnum, leadSourceEnum } from "@/db/schema";
import { requireRole, requireWorkspace } from "@/lib/auth";
import { getCompany, getContact, isMemberOf } from "@/lib/crm";
import { isUuid, optionalEmail, optionalId, optionalText } from "@/lib/validation";
import { pickValues, type ActionState } from "./types";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Navn mangler").max(200),
  email: optionalEmail,
  phone: optionalText(50),
  title: optionalText(100),
  status: z.enum(contactStatusEnum.enumValues),
  source: z.enum(leadSourceEnum.enumValues),
  companyId: optionalId,
  newCompanyName: optionalText(200),
  ownerId: optionalId,
});

const FIELDS = ["name", "email", "phone", "title", "status", "source", "companyId", "newCompanyName", "ownerId"];

/** Validerer formularen og sikrer at virksomhed og ansvarlig hører til workspacet. */
async function parseContact(workspaceId: string, formData: FormData) {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const data = parsed.data;

  if (data.companyId && !(await getCompany(workspaceId, data.companyId))) {
    return { error: "Den valgte virksomhed findes ikke" } as const;
  }
  if (data.ownerId && !(await isMemberOf(workspaceId, data.ownerId))) {
    return { error: "Den valgte ansvarlige er ikke medlem af firmaet" } as const;
  }

  let companyId = data.companyId;
  if (data.newCompanyName) {
    const [company] = await db
      .insert(schema.companies)
      .values({ workspaceId, name: data.newCompanyName, ownerId: data.ownerId })
      .returning({ id: schema.companies.id });
    companyId = company.id;
  }

  return {
    values: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      title: data.title,
      status: data.status,
      source: data.source,
      companyId,
      ownerId: data.ownerId,
    },
  } as const;
}

export async function createContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const result = await parseContact(workspace.id, formData);
  if ("error" in result) return { error: result.error, values: pickValues(formData, FIELDS) };

  const [contact] = await db
    .insert(schema.contacts)
    .values({ ...result.values, workspaceId: workspace.id })
    .returning({ id: schema.contacts.id });
  redirect(`/kunder/${contact.id}`);
}

export async function updateContact(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  if (!(await getContact(workspace.id, id))) return { error: "Kontakten findes ikke" };

  const result = await parseContact(workspace.id, formData);
  if ("error" in result) return { error: result.error, values: pickValues(formData, FIELDS) };

  await db
    .update(schema.contacts)
    .set({ ...result.values, updatedAt: new Date() })
    .where(and(eq(schema.contacts.workspaceId, workspace.id), eq(schema.contacts.id, id)));
  revalidatePath(`/kunder/${id}`);
  redirect(`/kunder/${id}`);
}

export async function deleteContact(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await db
    .delete(schema.contacts)
    .where(and(eq(schema.contacts.workspaceId, workspace.id), eq(schema.contacts.id, id)));
  revalidatePath("/kunder");
  redirect("/kunder");
}
