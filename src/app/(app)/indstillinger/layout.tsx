import { requireWorkspace } from "@/lib/auth";
import { getModules } from "@/lib/modules";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { workspace } = await requireWorkspace();
  const modules = await getModules(workspace.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Indstillinger</h1>
      <SettingsNav booking={modules.booking} />
      {children}
    </div>
  );
}
