import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProject, setProjectStatus, updateProject } from "@/app/actions/projects";
import { Badge, PageHeader } from "@/components/display";
import { Button, Card, ConfirmButton } from "@/components/ui";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { getCompany, getCompanyOptions, getMemberOptions, getTasks } from "@/lib/crm";
import { formatIsoDate } from "@/lib/labels";
import { requireAgencyModule } from "@/lib/modules";
import { getProject } from "@/lib/projects";
import { hasRole } from "@/lib/roles";
import { EditProjectForm } from "../project-forms";

export const metadata: Metadata = { title: "Projekt" };

export default async function ProjectPage({ params }: PageProps<"/projekter/[id]">) {
  const { id } = await params;
  const { user, workspace } = await requireAgencyModule();
  const project = await getProject(workspace.id, id);
  if (!project) notFound();
  const [company, tasks, companies, members] = await Promise.all([
    project.companyId ? getCompany(workspace.id, project.companyId) : null,
    getTasks(workspace.id, { projectId: project.id }),
    getCompanyOptions(workspace.id),
    getMemberOptions(workspace.id),
  ]);
  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={project.name}
        back={{ href: "/projekter", label: "Projekter" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {company ? (
              <Link href={`/virksomheder/${company.id}`} className="underline">
                {company.name}
              </Link>
            ) : (
              <span>Internt</span>
            )}
            {project.dueDate && <span>· Deadline {formatIsoDate(project.dueDate)}</span>}
            <Badge
              className={project.status === "DONE" ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-800"}
            >
              {project.status === "DONE" ? "Afsluttet" : "Aktivt"}
            </Badge>
          </span>
        }
        actions={
          <>
            <form action={setProjectStatus}>
              <input type="hidden" name="id" value={project.id} />
              <input type="hidden" name="status" value={project.status === "DONE" ? "ACTIVE" : "DONE"} />
              <Button type="submit" variant="secondary">
                {project.status === "DONE" ? "Genåbn" : "Afslut projekt"}
              </Button>
            </form>
            {hasRole(workspace.role, "ADMIN") && (
              <form action={deleteProject}>
                <input type="hidden" name="id" value={project.id} />
                <ConfirmButton message={`Slet projektet "${project.name}" og dets opgaver?`}>Slet</ConfirmButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={`Opgaver (${done.length}/${tasks.length} udført)`}>
            <div
              className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Fremdrift"
            >
              <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
            </div>
            <TaskForm
              members={members}
              defaultAssigneeId={project.ownerId ?? user.id}
              projectId={project.id}
              companyId={project.companyId ?? undefined}
            />
            {open.length > 0 && (
              <div className="mt-3">
                <TaskList tasks={open} showLinks={false} />
              </div>
            )}
            {done.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-slate-500">Udførte ({done.length})</summary>
                <TaskList tasks={done} showLinks={false} />
              </details>
            )}
          </Card>
        </div>
        <Card title="Oplysninger">
          <EditProjectForm
            action={updateProject.bind(null, project.id)}
            companies={companies}
            members={members}
            initial={{
              name: project.name,
              companyId: project.companyId ?? "",
              ownerId: project.ownerId ?? "",
              dueDate: project.dueDate ?? "",
              description: project.description ?? "",
            }}
          />
        </Card>
      </div>
    </div>
  );
}
