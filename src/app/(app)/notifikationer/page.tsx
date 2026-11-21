import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { markAllNotificationsRead, openNotification } from "@/app/actions/notifications";
import { EmptyState } from "@/components/display";
import { cx } from "@/components/styles";
import { Button } from "@/components/ui";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import { DesktopNotificationsToggle } from "./desktop-toggle";

export const metadata: Metadata = { title: "Notifikationer" };

export default async function NotificationsPage() {
  const { user, memberships } = await requireWorkspace();
  const items = await db
    .select({
      id: schema.notifications.id,
      title: schema.notifications.title,
      body: schema.notifications.body,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
      workspaceName: schema.workspaces.name,
    })
    .from(schema.notifications)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.notifications.workspaceId))
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50);
  const unread = items.filter((i) => !i.readAt).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Notifikationer</h1>
          <p className="mt-1 text-sm text-slate-500">{unread > 0 ? `${unread} ulæste` : "Alt er læst"}</p>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <Button variant="secondary" type="submit">
              Markér alle som læst
            </Button>
          </form>
        )}
      </div>

      <DesktopNotificationsToggle />

      {items.length === 0 ? (
        <EmptyState>Ingen notifikationer endnu. Du får besked her ved nye leads, nye beskeder og opgaver til dig.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <button
                  type="submit"
                  className={cx("flex w-full gap-3 p-4 text-left hover:bg-slate-50", !n.readAt && "bg-brand-50/60")}
                >
                  <span
                    className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent-400")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-sm", n.readAt ? "text-slate-700" : "font-semibold text-slate-900")}>
                      {n.title}
                    </span>
                    {n.body && <span className="mt-0.5 block truncate text-sm text-slate-500">{n.body}</span>}
                    <span className="mt-1 block text-xs text-slate-400">
                      {formatDateTime(n.createdAt)}
                      {memberships.length > 1 && ` · ${n.workspaceName}`}
                    </span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
