"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireRole, requireWorkspace } from "@/lib/auth";
import { getContact, logEvent } from "@/lib/crm";
import { deletePersonData, RETENTION_OPTIONS } from "@/lib/gdpr";
import { isUuid } from "@/lib/validation";

/** Sletter en person og alle data om personen (retten til sletning). Kun administratorer. */
export async function deletePersonCompletely(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const contact = await getContact(workspace.id, id);
  if (!contact) return;
  await deletePersonData(workspace.id, contact.id);
  revalidatePath("/", "layout");
  redirect(`/kunder?besked=${encodeURIComponent("Alle data om personen er slettet.")}`);
}

/** Markerer at personen ikke ønsker e-mails (eller fjerner markeringen igen). */
export async function setEmailOptOut(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const contact = await getContact(workspace.id, id);
  if (!contact) return;
  const optOut = formData.get("optOut") === "1";
  await db
    .update(schema.contacts)
    .set({ emailOptOutAt: optOut ? new Date() : null })
    .where(and(eq(schema.contacts.workspaceId, workspace.id), eq(schema.contacts.id, contact.id)));
  if (optOut) {
    await db
      .update(schema.reviewRequests)
      .set({ status: "SKIPPED", skipReason: "Kontakten har frabedt sig e-mails" })
      .where(and(eq(schema.reviewRequests.contactId, contact.id), eq(schema.reviewRequests.status, "SCHEDULED")));
  }
  await logEvent(
    workspace.id,
    user.id,
    optOut ? "Markeret: ønsker ikke e-mails" : "Markering fjernet: ønsker igen e-mails",
    { contactId: contact.id, companyId: contact.companyId },
  );
  revalidatePath(`/kunder/${contact.id}`);
}

/** Automatisk sletning af gamle leads. 0 = slået fra. */
export async function saveLeadRetention(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const months = z.coerce
    .number()
    .refine((n) => n === 0 || (RETENTION_OPTIONS as readonly number[]).includes(n))
    .safeParse(formData.get("months"));
  if (!months.success) return;
  await db
    .update(schema.workspaces)
    .set({ leadRetentionMonths: months.data || null })
    .where(eq(schema.workspaces.id, workspace.id));
  revalidatePath("/indstillinger/persondata");
  redirect(
    `/indstillinger/persondata?besked=${encodeURIComponent(months.data ? "Automatisk sletning er slået til." : "Automatisk sletning er slået fra.")}`,
  );
}
