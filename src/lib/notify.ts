import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { NotificationType } from "@/db/schema";
import { brandedEmail, isEmailConfigured, sendEmail } from "./email";
import { getAppUrl } from "./url";

type Recipients = { userIds: string[] } | "admins" | "all";

async function resolveRecipients(workspaceId: string, recipients: Recipients) {
  if (typeof recipients === "object") return [...new Set(recipients.userIds)];
  const rows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.workspaceId, workspaceId),
        recipients === "admins" ? inArray(schema.memberships.role, ["OWNER", "ADMIN"]) : undefined,
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * Opretter en notifikation til de valgte brugere i firmaet. Med `email` sendes den også
 * på e-mail til dem, der har e-mailnotifikationer slået til. Fejl stopper aldrig hovedhandlingen.
 */
export async function notify(input: {
  workspaceId: string;
  to: Recipients;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  excludeUserId?: string | null;
  email?: boolean;
}) {
  try {
    const userIds = (await resolveRecipients(input.workspaceId, input.to)).filter((id) => id !== input.excludeUserId);
    if (userIds.length === 0) return;
    await db.insert(schema.notifications).values(
      userIds.map((userId) => ({
        workspaceId: input.workspaceId,
        userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 500) ?? null,
        href: input.href ?? null,
      })),
    );

    if (input.email && isEmailConfigured()) {
      const users = await db
        .select({ email: schema.users.email, name: schema.users.name, wants: schema.users.emailNotifications })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds));
      const appUrl = await getAppUrl();
      for (const u of users.filter((x) => x.wants)) {
        await sendEmail({
          to: u.email,
          subject: input.title,
          ...brandedEmail({
            heading: input.title,
            paragraphs: input.body ? [input.body] : [],
            button: input.href ? { label: "Åbn i Kundespor", url: `${appUrl}${input.href}` } : undefined,
            footer: "Du får denne e-mail, fordi du har e-mailnotifikationer slået til under Min profil i Kundespor.",
          }),
        });
      }
    }
  } catch (error) {
    console.error("Notifikation fejlede", error);
  }
}
