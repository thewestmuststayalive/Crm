import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { buildClientReport, getCompanyByReportToken } from "@/lib/client-report";
import { currentMonth, formatHM, formatMonth, isMonth, shiftMonth } from "@/lib/duration";
import { formatDate } from "@/lib/labels";

export const metadata: Metadata = {
  title: "Månedsrapport",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const kr = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("da-DK");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function ClientReportPage({ params, searchParams }: PageProps<"/rapport/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const found = await getCompanyByReportToken(token);
  if (!found) notFound();
  const now = currentMonth();
  const month = isMonth(sp.maaned) && sp.maaned <= now ? sp.maaned : shiftMonth(now, -1);
  const { company, workspaceName } = found;
  const r = await buildClientReport(company.workspaceId, company.id, month);
  const cpl = r.ads && r.ads.leads > 0 ? r.ads.spend / r.ads.leads : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 print:bg-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{workspaceName}</p>
            <h1 className="font-display text-2xl font-bold text-slate-900">Månedsrapport for {company.name}</h1>
            <p className="text-slate-600 capitalize">{formatMonth(month)}</p>
          </div>
          <nav className="flex gap-2 text-sm print:hidden" aria-label="Måned">
            <Link
              href={`/rapport/${token}?maaned=${shiftMonth(month, -1)}`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5"
            >
              ← Forrige
            </Link>
            {month < now && (
              <Link
                href={`/rapport/${token}?maaned=${shiftMonth(month, 1)}`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5"
              >
                Næste →
              </Link>
            )}
          </nav>
        </header>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Nøgletal">
          <Stat label="Timer brugt" value={formatHM(r.totalMinutes)} hint="Fakturerbar tid" />
          {r.retainer && (
            <Stat
              label="Aftale"
              value={`${r.retainer.pct} %`}
              hint={`${formatHM(r.retainer.used)} af ${formatHM(r.retainer.monthlyMinutes)} timer (${r.retainer.name})`}
            />
          )}
          <Stat label="Udførte opgaver" value={num.format(r.doneTasks.length)} />
        </section>

        {r.ads && (
          <section className="rounded-xl border border-slate-200 bg-white p-6" aria-label="Annoncer">
            <h2 className="text-base font-semibold text-slate-900">Annoncer</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <Stat label="Forbrug" value={kr.format(r.ads.spend)} />
              <Stat label="Leads" value={num.format(r.ads.leads)} />
              <Stat label="Pris pr. lead" value={cpl === null ? "–" : kr.format(cpl)} />
              <Stat label="Klik" value={num.format(r.ads.clicks)} hint={`${num.format(r.ads.impressions)} visninger`} />
            </div>
            {r.ads.campaigns.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                    <th className="py-2 font-medium">Kampagne</th>
                    <th className="py-2 text-right font-medium">Forbrug</th>
                    <th className="py-2 text-right font-medium">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {r.ads.campaigns.map((c) => (
                    <tr key={c.name} className="border-b border-slate-100">
                      <td className="py-2 text-slate-900">{c.name}</td>
                      <td className="py-2 text-right">{kr.format(c.spend)}</td>
                      <td className="py-2 text-right">{num.format(c.leads)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {r.work.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-6" aria-label="Arbejde">
            <h2 className="text-base font-semibold text-slate-900">Det har vi arbejdet med</h2>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {r.work.map((w) => (
                <li key={w.description} className="flex justify-between gap-3 py-2">
                  <span className="text-slate-800">{w.description}</span>
                  <span className="font-mono text-slate-600">{formatHM(w.minutes)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.doneTasks.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-6" aria-label="Udførte opgaver">
            <h2 className="text-base font-semibold text-slate-900">Udførte opgaver</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {r.doneTasks.map((t, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-slate-800">
                    ✓ {t.title}
                    {t.project && <span className="text-slate-400"> · {t.project}</span>}
                  </span>
                  {t.completedAt && (
                    <span className="shrink-0 text-xs text-slate-500">{formatDate(t.completedAt)}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.work.length === 0 && r.doneTasks.length === 0 && !r.ads && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            Der er ikke registreret noget for denne måned.
          </p>
        )}

        <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
          Rapport via <Logo size={18} />
        </p>
      </div>
    </main>
  );
}
