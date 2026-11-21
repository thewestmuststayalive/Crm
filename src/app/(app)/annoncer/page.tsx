import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/display";
import { Stat } from "@/components/stat";
import { buttonClass } from "@/components/styles";
import { db, schema } from "@/db";
import { getCampaignReport } from "@/lib/ads-report";
import { requireWorkspace } from "@/lib/auth";
import { formatKr } from "@/lib/labels";

export const metadata: Metadata = { title: "Annoncer" };

const PERIODS = [7, 30] as const;

function money(value: number, currency: string) {
  return currency === "DKK"
    ? formatKr(value)
    : new Intl.NumberFormat("da-DK", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default async function AdsPage({ searchParams }: PageProps<"/annoncer">) {
  const { workspace } = await requireWorkspace();
  const { dage } = await searchParams;
  const days = PERIODS.includes(Number(dage) as (typeof PERIODS)[number]) ? Number(dage) : 30;

  const [accounts, report] = await Promise.all([
    db.select().from(schema.metaAdAccounts).where(eq(schema.metaAdAccounts.workspaceId, workspace.id)),
    getCampaignReport(workspace.id, days),
  ]);
  const currency = accounts[0]?.currency ?? "DKK";
  const { rows, totals } = report;
  const cpl = totals.crmLeads > 0 ? totals.spend / totals.crmLeads : null;
  const roas = totals.spend > 0 ? totals.wonValue / totals.spend : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Annoncer</h1>
          <p className="mt-1 text-sm text-slate-500">
            Meta-annoncer de seneste {days} dage: forbrug, leads og hvad de blev til i Kundespor.
          </p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <Link key={p} href={`/annoncer?dage=${p}`} className={buttonClass(p === days ? "primary" : "secondary")}>
              {p} dage
            </Link>
          ))}
        </div>
      </div>

      {accounts.length === 0 && rows.length === 0 ? (
        <EmptyState>
          Ingen annoncekonto er koblet på endnu.{" "}
          <Link href="/indstillinger/meta" className="underline">
            Kobl Facebook og din annoncekonto på
          </Link>{" "}
          for at se forbrug og afkast.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Forbrug" value={money(totals.spend, currency)} />
            <Stat label="Leads i CRM" value={totals.crmLeads} hint="Fra Meta Lead Ads" />
            <Stat label="Pris pr. lead" value={cpl === null ? "–" : money(cpl, currency)} />
            <Stat label="Vundet" value={formatKr(totals.wonValue)} hint={`${totals.wonDeals} deals`} />
            <Stat
              label="Afkast (ROAS)"
              value={roas === null ? "–" : `${roas.toLocaleString("da-DK", { maximumFractionDigits: 1 })}x`}
              hint="Vundet værdi ÷ forbrug"
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState>Ingen kampagnedata i perioden endnu.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Kampagne</th>
                    <th className="px-4 py-3 text-right font-medium">Forbrug</th>
                    <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Klik</th>
                    <th className="px-4 py-3 text-right font-medium">Leads</th>
                    <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Pris/lead</th>
                    <th className="px-4 py-3 text-right font-medium">Vundet</th>
                    <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {rows.map((r) => (
                    <tr key={r.campaignId}>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.campaignName}</td>
                      <td className="px-4 py-3 text-right">{money(r.spend, currency)}</td>
                      <td className="hidden px-4 py-3 text-right md:table-cell">{r.clicks.toLocaleString("da-DK")}</td>
                      <td className="px-4 py-3 text-right">{r.crmLeads}</td>
                      <td className="hidden px-4 py-3 text-right sm:table-cell">
                        {r.crmLeads > 0 ? money(r.spend / r.crmLeads, currency) : "–"}
                      </td>
                      <td className="px-4 py-3 text-right">{formatKr(r.wonValue)}</td>
                      <td className="hidden px-4 py-3 text-right sm:table-cell">
                        {r.spend > 0 ? `${(r.wonValue / r.spend).toLocaleString("da-DK", { maximumFractionDigits: 1 })}x` : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Forbrug hentes fra Meta én gang i døgnet (og når du trykker “Opdatér annoncedata nu” under Indstillinger).
            Leads tælles, når de er importeret i Kundespor via Lead Ads.
          </p>
        </>
      )}
    </div>
  );
}
