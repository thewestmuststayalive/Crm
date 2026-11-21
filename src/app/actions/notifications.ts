"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/validation";

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  revalidatePath("/", "layout");
}

/** Markerer notifikationen som læst og åbner det, den handler om (i det rigtige firma). */
export async function openNotification(formData: FormData) {
  const user = await requireUser();
  const id = formData.get("id");
  if (!isUuid(id)) redirect("/notifikationer");
  const [n] = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, user.id)))
    .returning({ href: schema.notifications.href, workspaceId: schema.notifications.workspaceId });
  if (!n?.href || !n.href.startsWith("/")) redirect("/notifikationer");
  redirect(`/skift?firma=${n.workspaceId}&til=${encodeURIComponent(n.href)}`);
}
