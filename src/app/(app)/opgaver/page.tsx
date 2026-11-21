import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { EmptyState } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { requireWorkspace } from "@/lib/auth";
import { getMemberOptions, getTasks, type TaskItem } from "@/lib/crm";
import { todayIso } from "@/lib/labels";

export const metadata: Metadata = { title: "Opgaver" };

export default async function TasksPage({ searchParams }: PageProps<"/opgaver">) {
  const { user, workspace } = await requireWorkspace();
  const { alle } = await searchParams;
  const showAll = alle === "1";
  const assigneeId = showAll ? undefined : user.id;

  const [open, done, members] = await Promise.all([
    getTasks(workspace.id, { open: true, assigneeId }),
    getTasks(workspace.id, { open: false, assigneeId, limit: 20 }),
    getMemberOptions(workspace.id),
  ]);

  const today = todayIso();
  const groups: { title: string; tasks: TaskItem[]; tone?: string }[] = [
    { title: "Forfaldne", tasks: open.filter((t) => t.dueDate !== null && t.dueDate < today), tone: "text-red-700" },
    { title: "I dag", tasks: open.filter((t) => t.dueDate === today), tone: "text-amber-700" },
    { title: "Kommende", tasks: open.filter((t) => t.dueDate !== null && t.dueDate > today) },
    { title: "Uden frist", tasks: open.filter((t) => t.dueDate === null) },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Opgaver</h1>
          <p className="mt-1 text-sm text-slate-500">
            {showAll ? "Alle opgaver i firmaet" : "Dine opgaver"} · {open.length} åbne
          </p>
        </div>
        <Link href={showAll ? "/opgaver" : "/opgaver?alle=1"} className={buttonClass("secondary")}>
          {showAll ? "Kun mine" : "Vis alle"}
        </Link>
      </div>

      <Card title="Ny opgave">
        <TaskForm members={members} defaultAssigneeId={user.id} />
      </Card>

      {open.length === 0 && <EmptyState>Ingen åbne opgaver. Godt gået.</EmptyState>}

      {groups
        .filter((g) => g.tasks.length > 0)
        .map((g) => (
          <section key={g.title}>
            <h2 className={`text-sm font-semibold uppercase tracking-wide ${g.tone ?? "text-slate-500"}`}>
              {g.title} ({g.tasks.length})
            </h2>
            <div className="mt-2 rounded-lg border border-slate-200 bg-white px-4">
              <TaskList tasks={g.tasks} />
            </div>
          </section>
        ))}

      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Senest udført</h2>
          <div className="mt-2 rounded-lg border border-slate-200 bg-white px-4">
            <TaskList tasks={done} />
          </div>
        </section>
      )}
    </div>
  );
}
