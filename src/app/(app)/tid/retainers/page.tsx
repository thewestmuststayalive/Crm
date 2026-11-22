import type { Metadata } from "next";
import Link from "next/link";
import { deleteRetainer } from "@/app/actions/time";
import { PageHeader } from "@/components/display";
import { buttonClass, cx } from "@/components/styles";
import { Card, ConfirmButton } from "@/components/ui";
import { getCompanyOptions } from "@/lib/crm";
import { currentMonth, formatHM, formatMonth, isMonth, shiftMonth } from "@/lib/duration";
import { requireAgencyModule } from "@/lib/modules";
import { formatOre, oreToInput } from "@/lib/quote-math";
import { hasRole } from "@/lib/roles";
import { getRetainerOverview } from "@/lib/time-tracking";
import { RetainerForm, TimeTabs, UsageBar } from "../time-components";

export const metadata: Metadata = { title: "Retainers" };

export default async function RetainersPage({ searchParams }: PageProps<"/tid/retainers">) {
  const { workspace } = await requireAgencyModule();
  const sp = await searchParams;
  const month = isMonth(sp.maaned) ? sp.maaned : currentMonth();
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const [retainers, companies] = await Promise.all([
    getRetainerOverview(workspace.id, month),
    getCompanyOptions(workspace.id),
  ]);
  const free = companies.filter((c) => !retainers.some((r) => r.companyId === c.id));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Retainers"
        subtitle={`Forbrug i ${formatMonth(month)}`}
        actions={
          <>
            <Link
              href={`/tid/retainers?maaned=${shiftMonth(month, -1)}`}
              className={buttonClass("secondary")}
              aria-label="Forrige måned"
            >
              ←
            </Link>
            <Link href="/tid/retainers" className={buttonClass("secondary")}>
              Denne måned
            </Link>
            <Link
              href={`/tid/retainers?maaned=${shiftMonth(month, 1)}`}
              className={buttonClass("secondary")}
              aria-label="Næste måned"
            >
              →
            </Link>
          </>
        }
      />
      <TimeTabs />

      {retainers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Ingen retainers endnu. Opret den første herunder.
        </p>
      ) : (
        <ul className="space-y-3" aria-label="Retainers">
          {retainers.map((r) => (
            <li
              key={r.id}
              aria-label={`Retainer ${r.companyName}`}
              className={cx(
                "rounded-lg border bg-white p-4",
                r.active ? "border-slate-200" : "border-dashed border-slate-300 opacity-70",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <Link href={`/virksomheder/${r.companyId}`} className="font-semibold text-slate-900 hover:underline">
                    {r.companyName}
                  </Link>
                  <span className="ml-2 text-sm text-slate-500">
                    {r.name}
                    {!r.active && " · pauset"}
                  </span>
                </div>
                <p className="text-sm">
                  <span
                    className={cx(
                      "font-semibold",
                      r.pct >= 100 ? "text-red-700" : r.pct >= 80 ? "text-amber-700" : "text-slate-900",
                    )}
                  >
                    {formatHM(r.used)} af {formatHM(r.monthlyMinutes)} timer
                  </span>
                  <span className="text-slate-500"> ({r.pct} %)</span>
                </p>
              </div>
              <div className="mt-2">
                <UsageBar pct={r.pct} label={`${r.companyName}: ${r.pct} % brugt`} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {r.monthlyPriceOre !== null && `${formatOre(r.monthlyPriceOre)} pr. måned`}
                {r.overMinutes > 0 &&
                  ` · ${formatHM(r.overMinutes)} timer over budget${r.overValueOre !== null ? ` (${formatOre(r.overValueOre)} ekstra)` : ""}`}
              </p>
              {isAdmin && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-brand-800">Ret aftale</summary>
                  <div className="mt-3 space-y-3">
                    <RetainerForm
                      companies={companies}
                      submitLabel="Gem"
                      initial={{
                        companyId: r.companyId,
                        name: r.name,
                        hours: formatHM(r.monthlyMinutes),
                        price: r.monthlyPriceOre !== null ? oreToInput(r.monthlyPriceOre) : "",
                        rate: r.hourlyRateOre !== null ? oreToInput(r.hourlyRateOre) : "",
                        active: r.active,
                      }}
                    />
                    <form action={deleteRetainer}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton
                        className="px-2.5 py-1 text-xs"
                        message={`Slet retaineren for ${r.companyName}? Registreret tid bevares.`}
                      >
                        Slet retainer
                      </ConfirmButton>
                    </form>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <Card
          title="Ny retainer"
          description="Et fast antal timer pr. måned for en kunde. Fakturerbar tid på kunden tæller med."
        >
          {free.length === 0 ? (
            <p className="text-sm text-slate-500">
              Alle virksomheder har allerede en retainer. Opret kunden under Kunder → Virksomheder først.
            </p>
          ) : (
            <RetainerForm companies={free} submitLabel="Opret retainer" />
          )}
        </Card>
      )}
    </div>
  );
}
