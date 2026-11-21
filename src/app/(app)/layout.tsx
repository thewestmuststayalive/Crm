import { logout } from "@/app/actions/auth";
import { requireWorkspace } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { Nav } from "./nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, memberships } = await requireWorkspace();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white md:w-60 md:border-r md:border-b-0">
        <div className="space-y-3 p-4">
          <p className="text-lg font-bold tracking-tight text-slate-900">CRM</p>
          <WorkspaceSwitcher
            current={workspace.id}
            workspaces={memberships.map((m) => ({ id: m.id, name: m.name }))}
          />
        </div>
        <Nav />
        <div className="mt-auto border-t border-slate-200 p-4 text-sm">
          <p className="truncate font-medium text-slate-900">{user.name}</p>
          <p className="truncate text-slate-500">
            {user.email} · {ROLE_LABELS[workspace.role]}
          </p>
          <form action={logout} className="mt-2">
            <button className="text-slate-500 underline hover:text-slate-900">Log ud</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
