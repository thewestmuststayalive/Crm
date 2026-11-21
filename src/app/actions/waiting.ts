"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { respondToContact, respondToConversation } from "@/lib/awaiting";
import { requireWorkspace } from "@/lib/auth";
import { getContact } from "@/lib/crm";
import { isUuid } from "@/lib/validation";
import { and, eq } from "drizzle-orm";

/** "Jeg har kontaktet": registrerer kontakten (som opkald) og stopper ventetiden. */
export async function markContacted(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const id = formData.get("id");
  if (!isUuid(id) || !(await getContact(workspace.id, id))) return;
  await db.insert(schema.activities).values({
    workspaceId: workspace.id,
    contactId: id,
    authorId: user.id,
    type: "CALL",
    body: "Kontaktet (markeret fra Venter på svar).",
  });
  await respondToContact(workspace.id, id, { log: true, userId: user.id });
  revalidatePath("/", "layout");
}

/** "Kræver ikke svar": fjerner henvendelsen fra listen uden at tælle med i svartiden. */
export async function dismissWaiting(formData: FormData) {
  const { workspace } = await requireWorkspace();
  const id = formData.get("id");
  const kind = formData.get("kind");
  if (!isUuid(id)) return;
  if (kind === "contact") {
    await respondToContact(workspace.id, id, { log: false });
  } else if (kind === "conversation") {
    const [c] = await db
      .select({ platform: schema.conversations.platform })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.workspaceId, workspace.id), eq(schema.conversations.id, id)))
      .limit(1);
    if (c) await respondToConversation(workspace.id, id, c.platform, { log: false });
  }
  revalidatePath("/", "layout");
}
