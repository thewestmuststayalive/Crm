import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkListWebsites, deleteList } from "@/app/actions/leads";
import { Badge, EmptyState, PageHeader } from "@/components/display";
import { buttonClass, cx } from "@/components/styles";
import { Card, ConfirmButton, SubmitButton } from "@/components/ui";
import type { ProspectStatus } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { formatIsoDate } from "@/lib/labels";
import {
  domainOf,
  getProspectList,
  getProspects,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_STYLES,
  PROSPECT_STATUSES,
  websiteHref,
} from "@/lib/prospects";
import { hasRole } from "@/lib/roles";
import { isUuid } from "@/lib/validation";
import { ManualProspectForm } from "../lead-forms";
import { ScoreBadge } from "../score-badge";
import { StatusSelect } from "./status-select";

export const metadata: Metadata = { title: "Lead-liste" };

export default async function ProspectListPage({ params, searchParams }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace();
  if (!isUuid(id)) notFound();
  const filter = PROSPECT_STATUSES.includes(sp.status as ProspectStatus) ? (sp.status as ProspectStatus) : undefined;
  const [list, all] = await Promise.all([getProspectList(workspace.id, id), getProspects(workspace.id, id)]);
  if (!list) notFound();
  const rows = filter ? all.filter((p) => p.status === filter) : all;
  const counts = Object.fromEntries(PROSPECT_STATUSES.map((s) => [s, all.filter((p) => p.status === s).length]));
  const unchecked = all.filter((p) => p.score === null).length;
  const checked = typeof sp.tjekket === "string" ? Number(sp.tjekket) : null;
  const missing = typeof sp.mangler === "string" ? Number(sp.mangler) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={list.name}
        subtitle={`${all.length} ${all.length === 1 ? "firma" : "firmaer"}`}
        back={{ href: "/leads", label: "Find leads" }}
        actions={
          <>
            {unchecked > 0 && (
              <form action={checkListWebsites}>
                <input type="hidden" name="listId" value={list.id} />
                <SubmitButton variant="secondary" pendingText="Tjekker hjemmesider…">
                  Tjek hjemmesider ({unchecked})
                </SubmitButton>
              </form>
            )}
            <a href={`/leads/${list.id}/eksport`} className={buttonClass("secondary")}>
              Eksportér til Excel
            </a>
          </>
        }
      />

      {checked !== null && Number.isFinite(checked) && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {checked} {checked === 1 ? "hjemmeside" : "hjemmesider"} tjekket.
          {missing > 0 ? ` ${missing} mangler – klik "Tjek hjemmesider" igen for at fortsætte.` : ""}
        </p>
      )}

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filtrér efter status">
        <Link
          href={`/leads/${list.id}`}
          className={cx("rounded-full px-3 py-1", !filter ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}
        >
          Alle ({all.length})
        </Link>
        {PROSPECT_STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <Link
            key={s}
            href={`/leads/${list.id}?status=${s}`}
            className={cx(
              "rounded-full px-3 py-1",
              filter === s ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200",
            )}
          >
            {PROSPECT_STATUS_LABELS[s]} ({counts[s]})
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState>
          {all.length === 0 ? (
            <>
              Listen er tom. <Link href="/leads/google" className="underline">Søg i Google Maps</Link> eller{" "}
              <Link href="/leads/cvr" className="underline">i CVR</Link>, eller tilføj et firma herunder.
            </>
          ) : (
            "Ingen firmaer med den status."
          )}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label="Firmaer i listen">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/leads/firma/${p.id}`} className="font-medium text-slate-900 hover:underline">
                    {p.name}
                  </Link>
                  {p.known && p.status !== "CONVERTED" && (
                    <Badge className="bg-emerald-50 text-emerald-800">Findes i CRM&apos;et</Badge>
                  )}
                  <ScoreBadge score={p.score} />
                </div>
                <p className="truncate text-slate-500">
                  {[p.industry, p.address].filter(Boolean).join(" · ")}
                  {p.rating !== null && ` · ★ ${p.rating.toLocaleString("da-DK")} (${p.reviewCount ?? 0})`}
                </p>
              </div>
              <div className="flex basis-56 flex-col gap-0.5">
                {p.phone ? (
                  <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="font-medium text-brand-700 underline">
                    {p.phone}
                  </a>
                ) : (
                  <span className="text-slate-400">Intet telefonnummer</span>
                )}
                {p.website ? (
                  <a href={websiteHref(p.website)} target="_blank" rel="noopener noreferrer" className="truncate text-slate-600 underline">
                    {domainOf(p.website) ?? p.website}
                  </a>
                ) : (
                  <span className="text-amber-700">Ingen hjemmeside</span>
                )}
              </div>
              <div className="flex basis-48 flex-col items-start gap-1">
                <StatusSelect
                  id={p.id}
                  name={p.name}
                  status={p.status}
                  label={PROSPECT_STATUS_LABELS[p.status]}
                  className={PROSPECT_STATUS_STYLES[p.status]}
                />
                <span className="text-xs text-slate-500">
                  {p.status === "CALL_BACK" && p.callBackDate ? `Ring ${formatIsoDate(p.callBackDate)}` : (p.ownerName ?? "")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card title="Tilføj firma manuelt">
        <ManualProspectForm listId={list.id} />
      </Card>

      {hasRole(workspace.role, "ADMIN") && (
        <form action={deleteList}>
          <input type="hidden" name="id" value={list.id} />
          <ConfirmButton className="px-3 py-1.5 text-xs" message={`Slet listen "${list.name}" og alle firmaer i den?`}>
            Slet listen
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
