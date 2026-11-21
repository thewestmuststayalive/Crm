"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { logEvent } from "@/lib/crm";
import { getReviewRequestByToken } from "@/lib/reviews";
import type { ActionState } from "./types";

// Offentlig afmelding fra linket i e-mailen. Linket (token på 192 bit) er adgangen.

export async function unsubscribeFromEmails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const row = await getReviewRequestByToken(String(formData.get("token") ?? ""));
  if (!row) return { error: "Linket er ikke gyldigt." };
  const { request } = row;
  const [updated] = await db
    .update(schema.contacts)
    .set({ emailOptOutAt: new Date() })
    .where(
      and(
        eq(schema.contacts.workspaceId, request.workspaceId),
        eq(schema.contacts.id, request.contactId),
        isNull(schema.contacts.emailOptOutAt),
      ),
    )
    .returning({ companyId: schema.contacts.companyId });
  await db
    .update(schema.reviewRequests)
    .set({ status: "SKIPPED", skipReason: "Kontakten har frabedt sig e-mails" })
    .where(and(eq(schema.reviewRequests.contactId, request.contactId), eq(schema.reviewRequests.status, "SCHEDULED")));
  if (updated) {
    await logEvent(request.workspaceId, null, "Kontakten har frabedt sig e-mails via afmeldingslinket", {
      contactId: request.contactId,
      companyId: updated.companyId,
    });
  }
  return { success: `Du er afmeldt og får ikke flere e-mails som denne fra ${row.workspaceName}.` };
}
