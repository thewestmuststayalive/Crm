import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, SourceBadge } from "@/components/display";
import { Stat } from "@/components/stat";
import { buttonClass, cx } from "@/components/styles";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";
import { formatDuration } from "@/lib/waiting";
import { formatDate, formatIsoDate, formatKr, SOURCE_LABELS, todayIso } from "@/lib/labels";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Link til data i et firma. Ligger det i et andet firma end det aktive, går linket via /skift,
 * og det skal være en fuld sideindlæsning (<a>), så menuen og firmavælgeren også opdateres.
 */
function WsLink({
  current,
  workspaceId,
  path,
  className,
  children,
}: {
  current: string;
  workspaceId: string;
  path: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (workspaceId === current) {
    return (
      <Link href={path} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={`/skift?firma=${workspaceId}&til=${encodeURIComponent(path)}`} className={className}>
      {children}
    </a>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user, workspace, memberships } = await requireWorkspace();
  const { fejl, visning } = await searchParams;
  const all = visning === "alle" && memberships.length > 1;
  const workspaceIds = all ? memberships.map((m) => m.id) : [workspace.id];
  const d = await getDashboard(workspaceIds, user.id);
  const today = todayIso();

  const totalSources = d.sources.reduce((s, r) => s + r.n, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Hej {user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {all ? `Samlet overblik over ${memberships.length} firmaer.` : `Du arbejder i ${workspace.name}.`}
          </p>
        </div>
        {memberships.length > 1 && (
          <div className="flex gap-2">
            <Link href="/dashboard" className={buttonClass(all ? "secondary" : "primary")}>
              {workspace.name}
            </Link>
            <Link href="/dashboard?visning=alle" className={buttonClass(all ? "primary" : "secondary")}>
              Alle firmaer
            </Link>
          </div>
        )}
      </header>

      {fejl === "adgang" && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Du har ikke adgang til den side i dette firma.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Nye kontakter" value={d.newLeads} hint="Seneste 7 dage" />
        <Stat label="Åben pipeline" value={formatKr(d.openPipeline.value)} hint={`${d.openPipeline.count} deals`} />
        <Stat label="Vundet i måneden" value={formatKr(d.wonMonth.value)} hint={`${d.wonMonth.count} deals`} />
        <Stat
          label="Forfaldne opgaver"
          value={<span className={cx(d.overdueTasks > 0 && "text-red-700")}>{d.overdueTasks}</span>}
          hint="Tildelt dig"
        />
        <Stat
          label="Venter på svar"
          value={
            <Link href="/venter" className={cx("hover:underline", d.waiting > 0 && "text-accent-700")}>
              {d.waiting}
            </Link>
          }
          hint={d.response.messages !== null ? `Median svartid ${formatDuration(d.response.messages)}` : "Beskeder og nye leads"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Dine opgaver i dag">
          {d.myTasks.length === 0 ? (
            <p className="text-sm text-slate-500">Intet forfaldent i dag.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.myTasks.map((t) => {
                const path = t.dealId ? `/pipeline/${t.dealId}` : t.contactId ? `/kunder/${t.contactId}` : "/opgaver";
                return (
                  <li key={t.id} className="py-2 text-sm">
                    <WsLink current={workspace.id} workspaceId={t.workspaceId} path={path} className="text-slate-900 hover:underline">
                      {t.title}
                    </WsLink>
                    <p className={cx("text-xs", t.dueDate && t.dueDate < today ? "text-red-700" : "text-amber-700")}>
                      {t.dueDate && (t.dueDate < today ? `Forfalden ${formatIsoDate(t.dueDate)}` : "I dag")}
                      {all && <span className="text-slate-400"> · {t.workspaceName}</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/opgaver" className="mt-3 inline-block text-sm text-slate-600 underline">
            Alle opgaver
          </Link>
        </Card>

        <Card title="Nyeste leads">
          {d.recentLeads.length === 0 ? (
            <p className="text-sm text-slate-500">Ingen leads endnu.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.recentLeads.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <WsLink current={workspace.id} workspaceId={c.workspaceId} path={`/kunder/${c.id}`} className="block truncate text-slate-900 hover:underline">
                      {c.name}
                    </WsLink>
                    <p className="text-xs text-slate-500">
                      {formatDate(c.createdAt)}
                      {all && ` · ${c.workspaceName}`}
                    </p>
                  </div>
                  <SourceBadge source={c.source} />
                </li>
              ))}
            </ul>
          )}
          <Link href="/kunder?status=LEAD" className="mt-3 inline-block text-sm text-slate-600 underline">
            Alle leads
          </Link>
        </Card>

        <Card title="Hvor kommer kunderne fra?" description="Nye kontakter de seneste 30 dage">
          {d.sources.length === 0 ? (
            <EmptyState>Ingen nye kontakter i perioden.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {d.sources.map((s) => {
                const pct = Math.round((s.n / totalSources) * 100);
                return (
                  <li key={s.source} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-700">{SOURCE_LABELS[s.source]}</span>
                      <span className="tabular-nums text-slate-500">
                        {s.n} ({pct} %)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100" aria-hidden>
                      <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
