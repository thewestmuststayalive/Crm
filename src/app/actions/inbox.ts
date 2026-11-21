"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { getContact } from "@/lib/crm";
import { ReplyError, sendReply } from "@/lib/meta/inbox";
import { getWorkspacePage } from "@/lib/meta/store";
import { isUuid } from "@/lib/validation";
import type { ActionState } from "./types";

async function getConversation(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.workspaceId, workspaceId), eq(schema.conversations.id, id)))
    .limit(1);
  return row ?? null;
}

export async function replyToConversation(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  const conversation = await getConversation(workspace.id, id);
  if (!conversation) return { error: "Samtalen findes ikke" };
  const parsed = z.string().trim().min(1, "Skriv en besked").max(2000, "Højst 2000 tegn").safeParse(formData.get("text"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const page = await getWorkspacePage(workspace.id, conversation.metaPageId);
  if (!page) return { error: "Siden er ikke længere koblet på" };
  try {
    await sendReply(page, conversation, parsed.data, user.id);
  } catch (error) {
    if (error instanceof ReplyError) return { error: error.message, values: { text: parsed.data } };
    console.error("Svar fejlede", error);
    return { error: "Beskeden kunne ikke sendes. Prøv igen.", values: { text: parsed.data } };
  }
  revalidatePath(`/indbakke/${id}`);
  revalidatePath("/indbakke");
  return { success: "Sendt" };
}

/** Opretter en kontakt (lead) ud fra samtalen og knytter dem sammen. */
export async function createContactFromConversation(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const conversation = await getConversation(workspace.id, formData.get("id"));
  if (!conversation || conversation.contactId) return;

  const [contact] = await db
    .insert(schema.contacts)
    .values({
      workspaceId: workspace.id,
      name: conversation.name ?? (conversation.platform === "INSTAGRAM" ? "Instagram-bruger" : "Messenger-bruger"),
      source: conversation.platform,
      status: "LEAD",
      ownerId: user.id,
    })
    .returning({ id: schema.contacts.id });
  await db
    .update(schema.conversations)
    .set({ contactId: contact.id })
    .where(eq(schema.conversations.id, conversation.id));
  await db.insert(schema.activities).values({
    workspaceId: workspace.id,
    contactId: contact.id,
    authorId: user.id,
    type: "SYSTEM",
    body: `Oprettet fra en samtale på ${conversation.platform === "INSTAGRAM" ? "Instagram" : "Messenger"}.`,
  });
  revalidatePath(`/indbakke/${conversation.id}`);
}

/** Nulstiller antal ulæste, når en samtale åbnes. */
export async function markConversationRead(id: string) {
  const { workspace } = await requireWorkspace();
  const conversation = await getConversation(workspace.id, id);
  if (!conversation || conversation.unreadCount === 0) return;
  await db.update(schema.conversations).set({ unreadCount: 0 }).where(eq(schema.conversations.id, conversation.id));
  revalidatePath("/indbakke", "layout");
}

export async function linkConversationToContact(formData: FormData) {
  const { workspace } = await requireWorkspace();
  const conversation = await getConversation(workspace.id, formData.get("id"));
  const contactId = String(formData.get("contactId") ?? "");
  if (!conversation) return;
  if (contactId && !(await getContact(workspace.id, contactId))) return;
  await db
    .update(schema.conversations)
    .set({ contactId: contactId || null })
    .where(eq(schema.conversations.id, conversation.id));
  revalidatePath(`/indbakke/${conversation.id}`);
}
