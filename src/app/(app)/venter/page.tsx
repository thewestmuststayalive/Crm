import type { Metadata } from "next";
import Link from "next/link";
import { dismissWaiting, markContacted } from "@/app/actions/waiting";
import { Badge, EmptyState, SourceBadge } from "@/components/display";
import { Stat } from "@/components/stat";
import { cx } from "@/components/styles";
import { Button } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { formatDuration, getResponseStats, getResponseTargetSeconds, getWaiting } from "@/lib/waiting";

export const metadata: Metadata = { title: "Venter på svar" };

/** Hvor længe har henvendelsen ventet? (beregnes på serveren ved hver visning) */
function waitedSeconds(since: Date) {
  return Math.max(0, Math.round((Date.now() - since.getTime()) / 1000));
}

export default async function WaitingPage() {
  const { workspace } = await requireWorkspace();
  const [items, stats, target] = await Promise.all([
    getWaiting(workspace.id),
    getResponseStats([workspace.id]),
    getResponseTargetSeconds(workspace.id),
  ]);
  const overdue = items.filter((i) => waitedSeconds(i.since) > target).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Venter på svar</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kunder der har skrevet eller udfyldt en formular, og som endnu ikke har fået svar. Målet er svar inden for{" "}
          {formatDuration(target)}.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Venter nu" value={items.length} hint={overdue > 0 ? `${overdue} over målet` : "Alle inden for målet"} />
        <Stat
          label="Svartid, beskeder"
          value={stats.messages === null ? "–" : formatDuration(stats.messages)}
          hint="Median, seneste 30 dage"
        />
        <Stat
          label="Tid til første kontakt, leads"
          value={stats.leads === null ? "–" : formatDuration(stats.leads)}
          hint="Median, seneste 30 dage"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState>Ingen venter på svar. Godt arbejde.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label="Venter på svar">
          {items.map((item) => {
            const waited = waitedSeconds(item.since);
            const late = waited > target;
            const href = item.kind === "contact" ? `/kunder/${item.id}` : `/indbakke/${item.id}`;
            return (
              <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link href={href} className="font-medium text-slate-900 hover:underline">
                    {item.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {item.kind === "contact" ? (
                      <SourceBadge source={item.source} />
                    ) : (
                      <Badge className={item.platform === "INSTAGRAM" ? "bg-pink-50 text-pink-800" : "bg-sky-50 text-sky-800"}>
                        {item.platform === "INSTAGRAM" ? "Instagram" : "Messenger"}
                      </Badge>
                    )}
                    {item.kind === "conversation" && item.preview && <span className="truncate">“{item.preview}”</span>}
                    {item.kind === "contact" && item.ownerName && <span>Ansvarlig: {item.ownerName}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cx(
                      "rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                      late ? "bg-red-50 text-red-700" : "bg-accent-100 text-accent-700",
                    )}
                  >
                    {late ? "Over målet · " : ""}venter {formatDuration(waited)}
                  </span>
                  {item.kind === "contact" ? (
                    <form action={markContacted}>
                      <input type="hidden" name="id" value={item.id} />
                      <Button type="submit" className="px-2.5 py-1 text-xs">
                        Jeg har kontaktet
                      </Button>
                    </form>
                  ) : (
                    <Link href={href} className="rounded-md bg-brand-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800">
                      Svar
                    </Link>
                  )}
                  <form action={dismissWaiting}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="kind" value={item.kind} />
                    <Button variant="secondary" type="submit" className="px-2.5 py-1 text-xs">
                      Kræver ikke svar
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
