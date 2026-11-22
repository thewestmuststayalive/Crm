"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { STARTER_REPLIES } from "@/lib/saved-replies";
import { isUuid } from "@/lib/validation";
import type { ActionState } from "./types";

const PATH = "/indstillinger/svar";

const replySchema = z.object({
  title: z.string().trim().min(1, "Giv skabelonen et kort navn").max(60),
  body: z.string().trim().min(1, "Skriv teksten").max(2000),
});

/** Opretter eller retter en svarskabelon. Kun administratorer. */
export async function saveReply(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireRole("ADMIN");
  const values = { title: String(formData.get("title") ?? ""), body: String(formData.get("body") ?? "") };
  const parsed = replySchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const id = formData.get("id");
  if (isUuid(id)) {
    await db
      .update(schema.savedReplies)
      .set(parsed.data)
      .where(and(eq(schema.savedReplies.workspaceId, workspace.id), eq(schema.savedReplies.id, id)));
  } else {
    const [{ pos }] = await db
      .select({ pos: max(schema.savedReplies.position) })
      .from(schema.savedReplies)
      .where(eq(schema.savedReplies.workspaceId, workspace.id));
    await db
      .insert(schema.savedReplies)
      .values({ workspaceId: workspace.id, ...parsed.data, position: (pos ?? -1) + 1 });
  }
  revalidatePath(PATH);
  return { success: `Skabelonen "${parsed.data.title}" er gemt.` };
}

export async function deleteReply(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await db
    .delete(schema.savedReplies)
    .where(and(eq(schema.savedReplies.workspaceId, workspace.id), eq(schema.savedReplies.id, id)));
  revalidatePath(PATH);
}

export async function addStarterReplies() {
  const { workspace } = await requireRole("ADMIN");
  await db
    .insert(schema.savedReplies)
    .values(STARTER_REPLIES.map((r, i) => ({ workspaceId: workspace.id, ...r, position: i })));
  revalidatePath(PATH);
}
