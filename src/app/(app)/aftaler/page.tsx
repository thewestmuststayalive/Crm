import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { AGREEMENT_STATUS_LABELS, getAgreements, intervalLabel, periodTotalOre } from "@/lib/agreements";
import { requireWorkspace } from "@/lib/auth";
import { formatIsoDate } from "@/lib/labels";
import { formatOre } from "@/lib/quote-math";
import { hasRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Faste aftaler" };

const STATUS_STYLES = { ACTIVE: "bg-emerald-50 text-emerald-800", PAUSED: "bg-amber-50 text-amber-800", ENDED: "bg-slate-100 text-slate-600" };

export default async function AgreementsPage() {
  const { workspace } = await requireWorkspace();
  const rows = await getAgreements(workspace.id);
  const active = rows.filter((r) => r.agreement.status === "ACTIVE");
  const monthly = active.reduce((sum, r) => {
    const a = r.agreement;
    const perYear = a.interval === "WEEK" ? 52 / a.intervalCount : 12 / a.intervalCount;
    const seasonShare = a.seasonMonths.length ? a.seasonMonths.length / 12 : 1;
    return sum + (periodTotalOre(a.lines) * perYear * seasonShare) / 12;
  }, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Faste aftaler"
        subtitle={`${active.length} aktive · ca. ${formatOre(Math.round(monthly))} ekskl. moms pr. måned`}
        actions={
          hasRole(workspace.role, "ADMIN") && (
            <Link href="/aftaler/ny" className={buttonClass()}>
              Ny aftale
            </Link>
          )
        }
      />
      <p className="text-sm text-slate-600">
        Abonnementer og faste aftaler: fx vask hver 4. uge eller et fast månedligt beløb. Kundespor opretter bookinger og
        fakturaer automatisk.
      </p>
      {rows.length === 0 ? (
        <EmptyState>Ingen faste aftaler endnu.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label="Faste aftaler">
          {rows.map(({ agreement: a, companyName, contactName, serviceName }) => (
            <li key={a.id}>
              <Link href={`/aftaler/${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-900">{a.name}</span>
                  <span className="text-slate-500"> · {companyName ?? contactName}</span>
                </span>
                <span className="text-slate-600">
                  {intervalLabel(a.interval, a.intervalCount)}
                  {serviceName && ` · ${serviceName} kl. ${a.bookingTime}`}
                </span>
                <span className="text-slate-500">Næste: {formatIsoDate(a.nextDate)}</span>
                <span className="w-28 text-right font-medium">{formatOre(periodTotalOre(a.lines))}</span>
                <Badge className={STATUS_STYLES[a.status]}>{AGREEMENT_STATUS_LABELS[a.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
