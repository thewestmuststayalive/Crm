import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/display";
import { cx } from "@/components/styles";
import { Card } from "@/components/ui";
import { getCompanyOptions, getMemberOptions } from "@/lib/crm";
import { formatIsoDate, todayIso } from "@/lib/labels";
import { requireAgencyModule } from "@/lib/modules";
import { getProjects, getTemplates, type ProjectRow } from "@/lib/projects";
import { isUuid } from "@/lib/validation";
import { NewProjectForm, ProjectTabs } from "../project-forms";

export const metadata: Metadata = { title: "Projekter" };

function ProjectCard({ p, today }: { p: ProjectRow; today: string }) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const late = p.status === "ACTIVE" && p.dueDate !== null && p.dueDate < today;
  return (
    <li>
      <Link
        href={`/projekter/${p.id}`}
        className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
        aria-label={`Projekt ${p.name}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{p.name}</p>
            <p className="truncate text-sm text-slate-500">{p.companyName ?? "Internt"}</p>
          </div>
          {p.dueDate && (
            <span className={cx("shrink-0 text-xs", late ? "font-medium text-red-700" : "text-slate-500")}>
              {late ? "Forsinket · " : ""}
              {formatIsoDate(p.dueDate)}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cx("h-full", p.status === "DONE" ? "bg-slate-400" : "bg-brand-600")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-slate-600">
            {p.done}/{p.total} opgaver
          </span>
        </div>
        {p.ownerName && <p className="mt-2 text-xs text-slate-500">Ansvarlig: {p.ownerName}</p>}
      </Link>
    </li>
  );
}

export default async function ProjectsPage({ searchParams }: PageProps<"/projekter">) {
  const { user, workspace } = await requireAgencyModule();
  const sp = await searchParams;
  const [active, done, companies, members, templates] = await Promise.all([
    getProjects(workspace.id, { status: "ACTIVE" }),
    getProjects(workspace.id, { status: "DONE" }),
    getCompanyOptions(workspace.id),
    getMemberOptions(workspace.id),
    getTemplates(workspace.id),
  ]);
  const today = todayIso();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Projekter" subtitle={`${active.length} aktive projekter`} />
      <ProjectTabs />

      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Ingen aktive projekter. Opret det første herunder – gerne fra en skabelon.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Aktive projekter">
          {active.map((p) => (
            <ProjectCard key={p.id} p={p} today={today} />
          ))}
        </ul>
      )}

      <Card title="Nyt projekt">
        <NewProjectForm
          companies={companies}
          members={members}
          templates={templates.map((t) => ({ id: t.id, name: t.name }))}
          defaults={{
            ownerId: user.id,
            startDate: today,
            companyId: isUuid(sp.kunde) ? sp.kunde : undefined,
          }}
        />
      </Card>

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            Afsluttede projekter ({done.length})
          </summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Afsluttede projekter">
            {done.map((p) => (
              <ProjectCard key={p.id} p={p} today={today} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
