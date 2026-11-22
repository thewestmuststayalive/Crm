"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { contactStatusEnum, leadSourceEnum, type ContactStatus } from "@/db/schema";
import { respondToContact } from "@/lib/awaiting";
import { audit } from "@/lib/audit";
import { requireRole, requireWorkspace } from "@/lib/auth";
import { getCompany, getContact, isMemberOf } from "@/lib/crm";
import { getCustomFields, parseCustomValues } from "@/lib/custom-fields";
import { STATUS_LABELS } from "@/lib/labels";
import { hasRole } from "@/lib/roles";
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
  const custom = parseCustomValues(await getCustomFields(workspaceId, "CONTACT"), formData);
  if ("error" in custom) return { error: custom.error } as const;

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
      custom: custom.values,
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
  // Er kontakten ikke længere et lead, venter den ikke på at blive kontaktet.
  if (result.values.status !== "LEAD") await respondToContact(workspace.id, id, { log: false });
  revalidatePath(`/kunder/${id}`);
  redirect(`/kunder/${id}`);
}

export async function deleteContact(formData: FormData) {
  const { user, workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const [deleted] = await db
    .delete(schema.contacts)
    .where(and(eq(schema.contacts.workspaceId, workspace.id), eq(schema.contacts.id, id)))
    .returning({ name: schema.contacts.name });
  if (deleted) await audit(workspace.id, user.id, "Kontakt slettet", deleted.name);
  revalidatePath("/kunder");
  redirect("/kunder");
}

/**
 * Masse-handling på valgte kontakter: skift status, skift ansvarlig eller slet (kun administratorer).
 * Kun kontakter i det aktive firma påvirkes.
 */
export async function bulkContacts(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const ids = formData.getAll("ids").filter(isUuid).slice(0, 500);
  const op = String(formData.get("op") ?? "");
  const back = String(formData.get("back") ?? "/kunder");
  const backPath = back.startsWith("/kunder") ? back : "/kunder";
  const done = (message: string): never => {
    revalidatePath("/kunder");
    const sep = backPath.includes("?") ? "&" : "?";
    redirect(`${backPath}${sep}besked=${encodeURIComponent(message)}`);
  };
  if (ids.length === 0) done("Vælg mindst én kontakt.");
  const scope = and(eq(schema.contacts.workspaceId, workspace.id), inArray(schema.contacts.id, ids));
  const n = (count: number) => `${count} ${count === 1 ? "kontakt" : "kontakter"}`;

  const statusMatch = /^status:(LEAD|CUSTOMER|INACTIVE)$/.exec(op);
  if (statusMatch) {
    const status = statusMatch[1] as ContactStatus;
    const rows = await db
      .update(schema.contacts)
      .set({ status, updatedAt: new Date() })
      .where(scope)
      .returning({ id: schema.contacts.id });
    await audit(workspace.id, user.id, "Masse-handling: status", `${n(rows.length)} → ${STATUS_LABELS[status]}`);
    done(`${n(rows.length)} har fået status ${STATUS_LABELS[status]}.`);
  }
  if (op.startsWith("owner:")) {
    const ownerId = op.slice(6) === "mig" ? user.id : op.slice(6);
    if (ownerId !== "ingen" && !(isUuid(ownerId) && (await isMemberOf(workspace.id, ownerId)))) done("Ukendt person.");
    const rows = await db
      .update(schema.contacts)
      .set({ ownerId: ownerId === "ingen" ? null : ownerId, updatedAt: new Date() })
      .where(scope)
      .returning({ id: schema.contacts.id });
    await audit(workspace.id, user.id, "Masse-handling: ansvarlig", n(rows.length));
    done(`${n(rows.length)} har fået ny ansvarlig.`);
  }
  if (op === "delete") {
    if (!hasRole(workspace.role, "ADMIN")) done("Kun administratorer kan slette kontakter.");
    const rows = await db.delete(schema.contacts).where(scope).returning({ id: schema.contacts.id });
    await audit(workspace.id, user.id, "Masse-handling: kontakter slettet", n(rows.length));
    done(`${n(rows.length)} er slettet.`);
  }
  done("Vælg hvad der skal ske med de valgte kontakter.");
}
