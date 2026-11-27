import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteAgreement, runAgreementNow, setAgreementStatus } from "@/app/actions/agreements";
import { PageHeader } from "@/components/display";
import { Card, ConfirmButton, SubmitButton } from "@/components/ui";
import { AGREEMENT_STATUS_LABELS, getAgreement, getAgreementRuns, intervalLabel, MONTH_NAMES } from "@/lib/agreements";
import { requireWorkspace } from "@/lib/auth";
import { getServices } from "@/lib/booking";
import { getCompanyOptions, getContactOptions } from "@/lib/crm";
import { formatIsoDate } from "@/lib/labels";
import { getModules } from "@/lib/modules";
import { hasRole } from "@/lib/roles";
import { isUuid } from "@/lib/validation";
import { AgreementForm } from "../agreement-form";

export const metadata: Metadata = { title: "Fast aftale" };

export default async function AgreementPage({ params, searchParams }: PageProps<"/aftaler/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace();
  if (!isUuid(id)) notFound();
  const row = await getAgreement(workspace.id, id);
  if (!row) notFound();
  const a = row.agreement;
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const [runs, companies, contacts, modules] = await Promise.all([
    getAgreementRuns(workspace.id, a.id),
    isAdmin ? getCompanyOptions(workspace.id) : [],
    isAdmin ? getContactOptions(workspace.id) : [],
    getModules(workspace.id),
  ]);
  const services = modules.booking ? (await getServices(workspace.id)).map((s) => ({ id: s.id, name: s.name })) : null;
  const customer = row.companyName ?? row.contactName;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={a.name}
        back={{ href: "/aftaler", label: "Faste aftaler" }}
        subtitle={`${customer ?? ""} · ${intervalLabel(a.interval, a.intervalCount)} · ${AGREEMENT_STATUS_LABELS[a.status]}${
          a.seasonMonths.length ? ` · sæson: ${a.seasonMonths.map((m) => MONTH_NAMES[m - 1]).join(", ")}` : ""
        }`}
        actions={
          isAdmin && (
            <>
              {a.status === "ACTIVE" && (
                <form action={runAgreementNow}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton variant="secondary" pendingText="Kører…">
                    Udfør næste periode nu
                  </SubmitButton>
                </form>
              )}
              <form action={setAgreementStatus}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="status" value={a.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
                <SubmitButton variant="secondary">{a.status === "ACTIVE" ? "Sæt på pause" : "Genoptag"}</SubmitButton>
              </form>
            </>
          )
        }
      />
      {sp.gemt === "1" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Aftalen er gemt. Næste gang: {formatIsoDate(a.nextDate)}.
        </p>
      )}
      {sp.koert === "1" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Perioden er udført. Næste gang: {formatIsoDate(a.nextDate)}.
        </p>
      )}

      <Card title="Historik" description="Hver gang aftalen er udført.">
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500">Ikke udført endnu. Næste gang: {formatIsoDate(a.nextDate)}.</p>
        ) : (
          <ul className="space-y-1 text-sm" aria-label="Historik">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3">
                <span className="w-28 font-medium">{formatIsoDate(r.periodDate)}</span>
                {r.bookingId && (
                  <Link href={`/kalender/${r.bookingId}`} className="text-brand-700 underline">
                    Booking
                  </Link>
                )}
                {r.invoiceId && (
                  <Link href={`/fakturaer/${r.invoiceId}`} className="text-brand-700 underline">
                    Faktura
                  </Link>
                )}
                {r.note && <span className="text-slate-500">{r.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAdmin && (
        <Card title="Ret aftalen">
          <AgreementForm
            companies={companies}
            contacts={contacts}
            services={services}
            initial={{
              id: a.id,
              name: a.name,
              companyId: a.companyId ?? "",
              contactId: a.contactId ?? "",
              interval: a.interval,
              intervalCount: a.intervalCount,
              nextDate: a.nextDate,
              endDate: a.endDate ?? "",
              seasonMonths: a.seasonMonths,
              priceAdjustPct: String(Number(a.priceAdjustPct)).replace(".", ","),
              priceAdjustMonth: a.priceAdjustMonth ? String(a.priceAdjustMonth) : "",
              serviceId: a.serviceId ?? "",
              bookingTime: a.bookingTime ?? "",
              invoiceMode: a.invoiceMode,
              lines: a.lines,
            }}
          />
          <form action={deleteAgreement} className="mt-4 border-t border-slate-100 pt-4">
            <input type="hidden" name="id" value={a.id} />
            <ConfirmButton className="px-3 py-1.5 text-xs" message={`Slet aftalen "${a.name}"? Bookinger og fakturaer bevares.`}>
              Slet aftalen
            </ConfirmButton>
          </form>
        </Card>
      )}
    </div>
  );
}
