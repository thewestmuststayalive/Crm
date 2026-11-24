import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { cvrConfigured } from "@/lib/lead-sources/cvr-search";
import { googleConfigured } from "@/lib/lead-sources/google";
import { getProspectLists, getSearchUsage, PROSPECT_RETENTION_MONTHS } from "@/lib/prospects";
import { hasRole } from "@/lib/roles";
import { LeadSettingsForm, LeadTabs, NewListForm } from "./lead-forms";
import { CvrGuide, GoogleGuide } from "./setup-guides";

export const metadata: Metadata = { title: "Find leads" };

function SetupStatus({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Klar</span>
  ) : (
    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Ikke sat op</span>
  );
}

export default async function LeadsPage() {
  const { workspace } = await requireWorkspace();
  const [lists, usage] = await Promise.all([getProspectLists(workspace.id), getSearchUsage(workspace.id)]);
  const google = googleConfigured();
  const cvr = cvrConfigured();
  const isAdmin = hasRole(workspace.role, "ADMIN");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Find leads"
        subtitle="Find nye firmaer at kontakte i Google Maps og CVR, og følg op på dem i lister."
        actions={
          <>
            <Link href="/leads/google" className={buttonClass("secondary")}>
              Søg i Google Maps
            </Link>
            <Link href="/leads/cvr" className={buttonClass()}>
              Søg i CVR
            </Link>
          </>
        }
      />
      <LeadTabs />

      <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <span className="font-medium">Husk loven:</span> Kontakt leads på telefon, med brev eller på LinkedIn. Send ikke
        reklame på e-mail eller sms til firmaer, der ikke har sagt ja (markedsføringsloven § 10). Leads, der ikke er
        rørt i {PROSPECT_RETENTION_MONTHS} måneder, slettes automatisk.
      </p>

      {lists.length === 0 ? (
        <EmptyState>Ingen lister endnu. Søg i Google Maps eller CVR, eller opret en tom liste herunder.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Lead-lister">
          {lists.map((l) => (
            <li key={l.id}>
              <Link
                href={`/leads/${l.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
                aria-label={`Liste ${l.name}`}
              >
                <p className="truncate font-semibold text-slate-900">{l.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {l.total} {l.total === 1 ? "firma" : "firmaer"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{l.fresh} nye</span>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-800">{l.interested} interesserede</span>
                  <span className="rounded bg-brand-50 px-2 py-0.5 text-brand-800">{l.converted} kunder</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card title="Ny liste" description="Til firmaer, du selv tilføjer, eller til at samle resultater fra flere søgninger.">
        <NewListForm />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Google Maps">
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <SetupStatus ok={google} />
              {usage.used} af {usage.limit} søgninger brugt denne måned
            </p>
            {isAdmin && <LeadSettingsForm limit={usage.limit} />}
            {!google && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Sådan sætter du det op</summary>
                <div className="mt-2">
                  <GoogleGuide />
                </div>
              </details>
            )}
          </div>
        </Card>
        <Card title="CVR">
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <SetupStatus ok={cvr} />
              Gratis. Reklamebeskyttede firmaer sorteres altid fra.
            </p>
            {!cvr && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Sådan sætter du det op</summary>
                <div className="mt-2">
                  <CvrGuide />
                </div>
              </details>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
