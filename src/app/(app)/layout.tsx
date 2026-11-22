import { and, count, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/brand";
import { NotificationPoller } from "@/components/notification-poller";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { countBookingsToday } from "@/lib/booking";
import { getModules } from "@/lib/modules";
import { getRunningTimer } from "@/lib/time-tracking";
import { countWaiting } from "@/lib/waiting";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { NavigationProgress } from "./navigation-progress";
import { QuickCreate } from "./quick-create";
import { TimerBadge } from "./timer-badge";
import { Nav } from "./nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, memberships } = await requireWorkspace();
  // Alt hentes samtidig, så menuen kun koster én tur til databasen.
  const [modules, [{ unread }], [{ notes }], waiting, bookingsToday, running] = await Promise.all([
    getModules(workspace.id),
    db
      .select({ unread: sql<number>`coalesce(sum(${schema.conversations.unreadCount}), 0)::int` })
      .from(schema.conversations)
      .where(eq(schema.conversations.workspaceId, workspace.id)),
    db
      .select({ notes: count() })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))),
    countWaiting(workspace.id),
    countBookingsToday(workspace.id),
    getRunningTimer(workspace.id, user.id),
  ]);
  const badges = { "/indbakke": unread, "/venter": waiting, "/kalender": modules.booking ? bookingsToday : 0 };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-brand-950 text-brand-50 md:sticky md:top-0 md:h-screen md:w-60">
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <Link href="/dashboard" aria-label="Kundespor – til dashboard">
              <Logo tone="light" />
            </Link>
            <Link
              href="/notifikationer"
              className="relative rounded-md p-1.5 text-brand-100 hover:bg-white/10 hover:text-white"
              aria-label={notes > 0 ? `Notifikationer, ${notes} ulæste` : "Notifikationer"}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {notes > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent-400 px-1 text-center text-[10px] leading-4 font-semibold text-brand-950">
                  {notes > 99 ? "99+" : notes}
                </span>
              )}
            </Link>
          </div>
          <WorkspaceSwitcher current={workspace.id} workspaces={memberships.map((m) => ({ id: m.id, name: m.name }))} />
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <CommandPalette modules={modules} />
            </div>
            <QuickCreate modules={modules} />
          </div>
        </div>
        <div className="hidden md:block">
          <Nav badges={badges} modules={modules} />
        </div>
        {modules.agency && running?.startedAt && (
          <TimerBadge startedAt={running.startedAt.toISOString()} label={running.companyName ?? "Intern tid"} />
        )}
        <NotificationPoller initialUnread={notes} />
        <div className="hidden items-center justify-between gap-3 border-t border-white/10 px-4 py-2 text-sm md:mt-auto md:block md:py-4">
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{user.name}</p>
            <p className="hidden truncate text-brand-200/80 md:block">
              {user.email} · {ROLE_LABELS[workspace.role]}
            </p>
          </div>
          <form action={logout} className="md:mt-2">
            <button className="text-brand-200 underline hover:text-white">Log ud</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8">{children}</main>
      <MobileNav modules={modules} badges={badges} userName={user.name} logout={logout} />
      <Suspense>
        <NavigationProgress />
      </Suspense>
    </div>
  );
}
