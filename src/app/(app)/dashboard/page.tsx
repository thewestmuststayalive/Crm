import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, SourceBadge } from "@/components/display";
import { Stat } from "@/components/stat";
import { buttonClass, cx } from "@/components/styles";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { BOOKING_STATUS_LABELS, formatPlate, getTodaysBookings } from "@/lib/booking";
import { getDashboard } from "@/lib/dashboard";
import { getModules } from "@/lib/modules";
import { getOnboarding, onboardingCookie } from "@/lib/onboarding";
import { hideOnboarding } from "@/app/actions/workspace";
import { cookies } from "next/headers";
import { UsageBar } from "../tid/time-components";
import { currentMonth, formatHM, formatMonth } from "@/lib/duration";
import { getRetainerOverview } from "@/lib/time-tracking";
import { localTime } from "@/lib/time";
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
  const hidden = all || (await cookies()).get(onboardingCookie(workspace.id))?.value === "1";
  const month = currentMonth();
  // Forespørgslerne køres samtidig, så siden kun venter på den langsomste.
  const [d, modules] = await Promise.all([
    getDashboard(workspaceIds, user.id),
    all ? { booking: false, agency: false } : getModules(workspace.id),
  ]);
  const showBookings = modules.booking;
  const [steps, retainerList, bookingsToday] = await Promise.all([
    hidden ? [] : getOnboarding(workspace.id),
    modules.agency ? getRetainerOverview(workspace.id, month, true) : [],
    showBookings ? getTodaysBookings(workspace.id) : [],
  ]);
  const retainers = retainerList.slice(0, 6);
  const stepsDone = steps.filter((st) => st.done).length;
  const showOnboarding = steps.length > 0 && stepsDone < steps.length;
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

      {showOnboarding && (
        <section
          aria-label="Kom godt i gang"
          className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Kom godt i gang</h2>
              <p className="text-sm text-slate-600">
                {stepsDone} af {steps.length} klaret – så får du mest ud af Kundespor.
              </p>
            </div>
            <form action={hideOnboarding}>
              <button className="text-xs text-slate-500 underline hover:text-slate-800">Skjul</button>
            </form>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
            <div
              className="h-full bg-brand-600"
              style={{ width: `${Math.round((stepsDone / steps.length) * 100)}%` }}
            />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((st) => (
              <li key={st.key}>
                <Link
                  href={st.href}
                  className={cx(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    st.done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-800 hover:border-brand-300",
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                      st.done ? "bg-emerald-600 text-white" : "border border-slate-300",
                    )}
                  >
                    {st.done ? "✓" : ""}
                  </span>
                  <span className={st.done ? "line-through" : ""}>{st.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
          hint={
            d.response.messages !== null
              ? `Median svartid ${formatDuration(d.response.messages)}`
              : "Beskeder og nye leads"
          }
        />
      </div>

      {modules.agency && retainers.length > 0 && (
        <Card title={`Retainers i ${formatMonth(month)}`}>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Retainers">
            {retainers.map((r) => (
              <li key={r.id} className="space-y-1">
                <p className="flex justify-between gap-2 text-sm">
                  <Link
                    href={`/virksomheder/${r.companyId}`}
                    className="truncate font-medium text-slate-900 hover:underline"
                  >
                    {r.companyName}
                  </Link>
                  <span className="shrink-0 text-slate-600">
                    {formatHM(r.used)} / {formatHM(r.monthlyMinutes)}
                  </span>
                </p>
                <UsageBar pct={r.pct} label={`${r.companyName}: ${r.pct} % brugt`} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showBookings && (
        <Card title={`Dagens bookinger (${bookingsToday.length})`}>
          {bookingsToday.length === 0 ? (
            <p className="text-sm text-slate-500">Ingen bookinger i dag.</p>
          ) : (
            <ul className="divide-y divide-slate-100" aria-label="Dagens bookinger">
              {bookingsToday.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/kalender/${b.id}`}
                    className="flex flex-wrap items-center gap-x-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <span className="w-12 font-semibold text-slate-900">{localTime(b.startsAt)}</span>
                    <span className="text-slate-900">{b.serviceName}</span>
                    <span className="text-slate-600">{b.contactName}</span>
                    {b.plate && <span className="font-mono text-xs text-slate-500">{formatPlate(b.plate)}</span>}
                    {b.status !== "CONFIRMED" && (
                      <span className="text-xs text-slate-500">({BOOKING_STATUS_LABELS[b.status]})</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

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
                    <WsLink
                      current={workspace.id}
                      workspaceId={t.workspaceId}
                      path={path}
                      className="text-slate-900 hover:underline"
                    >
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
                    <WsLink
                      current={workspace.id}
                      workspaceId={c.workspaceId}
                      path={`/kunder/${c.id}`}
                      className="block truncate text-slate-900 hover:underline"
                    >
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
