import type { Metadata } from "next";
import Link from "next/link";
import { deleteTimeEntry } from "@/app/actions/time";
import { PageHeader } from "@/components/display";
import { buttonClass, cx } from "@/components/styles";
import { Card } from "@/components/ui";
import { getCompanyOptions, getMemberOptions } from "@/lib/crm";
import { formatHM } from "@/lib/duration";
import { requireAgencyModule } from "@/lib/modules";
import { hasRole } from "@/lib/roles";
import { addDays, formatLongDate, formatShortDate, isIsoDate, localDate, startOfWeek } from "@/lib/time";
import { getEntries, getRunningTimer, weekDates } from "@/lib/time-tracking";
import { isUuid } from "@/lib/validation";
import { EntryForm, RunningTimer, TimeTabs } from "./time-components";

export const metadata: Metadata = { title: "Tid" };

function todayDate() {
  return localDate(new Date());
}

export default async function TimePage({ searchParams }: PageProps<"/tid">) {
  const { user, workspace } = await requireAgencyModule();
  const sp = await searchParams;
  const today = todayDate();
  const monday = startOfWeek(isIsoDate(sp.uge) ? sp.uge : today);
  const days = weekDates(monday);
  const isAdmin = hasRole(workspace.role, "ADMIN");
  // "person=alle" viser hele teamet; ellers en bestemt medarbejder (standard: dig selv).
  const person = sp.person === "alle" ? "alle" : isUuid(sp.person) ? sp.person : user.id;

  const [companies, members, running, entries] = await Promise.all([
    getCompanyOptions(workspace.id),
    getMemberOptions(workspace.id),
    getRunningTimer(workspace.id, user.id),
    getEntries(workspace.id, days[0], days[6], person === "alle" ? {} : { userId: person }),
  ]);
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const billable = entries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0);
  const query = (p: Record<string, string>) => {
    const params = new URLSearchParams({ uge: monday, ...(person !== user.id ? { person } : {}), ...p });
    return `/tid?${params}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Tid"
        subtitle={`Uge med ${formatShortDate(days[0])} – ${formatShortDate(days[6])}`}
        actions={
          <>
            <Link
              href={query({ uge: addDays(monday, -7) })}
              className={buttonClass("secondary")}
              aria-label="Forrige uge"
            >
              ←
            </Link>
            <Link href={query({ uge: startOfWeek(today) })} className={buttonClass("secondary")}>
              Denne uge
            </Link>
            <Link href={query({ uge: addDays(monday, 7) })} className={buttonClass("secondary")} aria-label="Næste uge">
              →
            </Link>
            <a href={`/tid/eksport?maaned=${monday.slice(0, 7)}`} className={buttonClass("secondary")}>
              Eksportér måned (CSV)
            </a>
          </>
        }
      />
      <TimeTabs />

      <Card title="Stopur">
        <RunningTimer
          running={
            running?.startedAt
              ? {
                  startedAt: running.startedAt.toISOString(),
                  description: running.description,
                  companyName: running.companyName,
                }
              : null
          }
          companies={companies}
        />
      </Card>

      <Card title="Registrér tid" description="Skriv tiden som 1:30, 1,5 (timer) eller 45m.">
        <EntryForm companies={companies} today={today} />
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Ugen: {formatHM(total)} timer{" "}
            <span className="font-normal text-slate-500">({formatHM(billable)} fakturerbare)</span>
          </h2>
          <div className="flex flex-wrap gap-1 text-sm">
            <Link
              href={query({ person: user.id })}
              className={cx(
                "rounded-md px-2 py-1",
                person === user.id ? "bg-brand-100 text-brand-900" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              Min tid
            </Link>
            <Link
              href={query({ person: "alle" })}
              className={cx(
                "rounded-md px-2 py-1",
                person === "alle" ? "bg-brand-100 text-brand-900" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              Hele teamet
            </Link>
            {members
              .filter((m) => m.id !== user.id)
              .map((m) => (
                <Link
                  key={m.id}
                  href={query({ person: m.id })}
                  className={cx(
                    "rounded-md px-2 py-1",
                    person === m.id ? "bg-brand-100 text-brand-900" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {m.name}
                </Link>
              ))}
          </div>
        </div>

        {days.map((d) => {
          const list = entries.filter((e) => e.date === d);
          if (list.length === 0 && d !== today) return null;
          const sum = list.reduce((s, e) => s + e.minutes, 0);
          return (
            <section
              key={d}
              aria-label={`Tid ${formatLongDate(d)}`}
              className="rounded-lg border border-slate-200 bg-white"
            >
              <h3 className="flex justify-between border-b border-slate-100 px-4 py-2 text-sm font-medium capitalize text-slate-700">
                <span>{formatLongDate(d)}</span>
                <span className="font-mono">{formatHM(sum)}</span>
              </h3>
              {list.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">Ingen tid registreret i dag.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {list.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                      <span className="w-12 font-mono font-semibold text-slate-900">{formatHM(e.minutes)}</span>
                      <span className="min-w-0 flex-1">
                        {e.companyId ? (
                          <Link
                            href={`/virksomheder/${e.companyId}`}
                            className="font-medium text-slate-900 hover:underline"
                          >
                            {e.companyName}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-900">Intern tid</span>
                        )}
                        {e.description && <span className="text-slate-600"> · {e.description}</span>}
                        {!e.billable && <span className="text-xs text-slate-400"> (ikke fakturerbar)</span>}
                      </span>
                      {person === "alle" && <span className="text-xs text-slate-500">{e.userName}</span>}
                      {(e.userId === user.id || isAdmin) && (
                        <form action={deleteTimeEntry}>
                          <input type="hidden" name="id" value={e.id} />
                          <button
                            className="text-xs text-red-700 hover:underline"
                            aria-label={`Slet ${formatHM(e.minutes)} ${e.description ?? ""}`}
                          >
                            Slet
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}
