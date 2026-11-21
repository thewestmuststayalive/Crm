import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/brand";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { Nav } from "./nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, memberships } = await requireWorkspace();
  const [{ unread }] = await db
    .select({ unread: sql<number>`coalesce(sum(${schema.conversations.unreadCount}), 0)::int` })
    .from(schema.conversations)
    .where(eq(schema.conversations.workspaceId, workspace.id));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-brand-950 text-brand-50 md:sticky md:top-0 md:h-screen md:w-60">
        <div className="space-y-3 p-4">
          <Link href="/dashboard" aria-label="Kundespor – til dashboard">
            <Logo tone="light" />
          </Link>
          <WorkspaceSwitcher
            current={workspace.id}
            workspaces={memberships.map((m) => ({ id: m.id, name: m.name }))}
          />
        </div>
        <Nav badges={{ "/indbakke": unread }} />
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2 text-sm md:mt-auto md:block md:py-4">
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
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
