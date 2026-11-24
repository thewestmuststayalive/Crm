import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkProspectWebsite, deleteProspect } from "@/app/actions/leads";
import { Badge, DetailRow, PageHeader } from "@/components/display";
import { buttonClass, cx } from "@/components/styles";
import { Card, ConfirmButton, SubmitButton } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getMemberOptions } from "@/lib/crm";
import { formatIsoDate, todayIso } from "@/lib/labels";
import {
  domainOf,
  getProspect,
  PROSPECT_SOURCE_LABELS,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_STYLES,
  websiteHref,
} from "@/lib/prospects";
import { addDays } from "@/lib/time";
import { isUuid } from "@/lib/validation";
import { ScoreBadge } from "../../score-badge";
import { ConvertForm, FollowUpForm } from "./forms";

export const metadata: Metadata = { title: "Lead" };

function Check({ ok, label }: { ok: boolean | undefined; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className={cx(
          "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
          ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
        )}
      >
        {ok ? "✓" : "✕"}
      </span>
      <span>
        {label}: {ok ? "Ja" : "Nej"}
      </span>
    </li>
  );
}

export default async function ProspectPage({ params }: PageProps<"/leads/firma/[id]">) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  if (!isUuid(id)) notFound();
  const [row, members] = await Promise.all([getProspect(workspace.id, id), getMemberOptions(workspace.id)]);
  if (!row) notFound();
  const p = row.prospect;
  const check = p.websiteCheck;
  const converted = p.status === "CONVERTED";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={p.name}
        back={{ href: `/leads/${p.listId}`, label: row.listName }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={PROSPECT_STATUS_STYLES[p.status]}>{PROSPECT_STATUS_LABELS[p.status]}</Badge>
            <Badge>{PROSPECT_SOURCE_LABELS[p.source]}</Badge>
            {p.industry && <span>{p.industry}</span>}
          </span>
        }
        actions={
          p.phone ? (
            <a href={`tel:${p.phone.replace(/\s/g, "")}`} className={buttonClass()}>
              Ring {p.phone}
            </a>
          ) : undefined
        }
      />

      {row.known && !converted && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Firmaet findes allerede i CRM&apos;et (samme CVR, telefon eller hjemmeside). Tjek kunden, før du ringer.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card title="Oplysninger">
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Telefon">
                {p.phone && (
                  <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="text-brand-700 underline">
                    {p.phone}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Hjemmeside">
                {p.website && (
                  <a href={websiteHref(p.website)} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                    {domainOf(p.website) ?? p.website}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Adresse">{p.address}</DetailRow>
              <DetailRow label="CVR">{p.cvr}</DetailRow>
              <DetailRow label="Ansatte">{p.employees}</DetailRow>
              <DetailRow label="Virksomhedsform">{p.companyForm}</DetailRow>
              <DetailRow label="Stiftet">{p.foundedAt ? formatIsoDate(p.foundedAt) : null}</DetailRow>
              <DetailRow label="Google">
                {p.rating !== null && (
                  <span>
                    ★ {p.rating.toLocaleString("da-DK")} ({p.reviewCount ?? 0} anmeldelser)
                    {p.mapsUrl && (
                      <>
                        {" · "}
                        <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                          Åbn i Google Maps
                        </a>
                      </>
                    )}
                  </span>
                )}
              </DetailRow>
            </dl>
          </Card>

          <Card title="Hjemmeside-tjek">
            <div className="space-y-3 text-sm">
              {check ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <ScoreBadge score={check.score} />
                    {check.error && <span className="text-rose-700">{check.error}</span>}
                    {check.platform && <Badge>{check.platform}</Badge>}
                    {p.websiteCheckedAt && (
                      <span className="text-xs text-slate-500">
                        Tjekket {formatIsoDate(p.websiteCheckedAt.toISOString().slice(0, 10))}
                      </span>
                    )}
                  </div>
                  {check.ok && (
                    <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Resultat af hjemmeside-tjek">
                      <Check ok={check.https} label="Sikker (https)" />
                      <Check ok={check.mobile} label="Mobilvenlig" />
                      <Check ok={(check.responseMs ?? 99999) <= 3000} label="Hurtig" />
                      <Check ok={check.metaPixel} label="Meta Pixel" />
                      <Check ok={check.googleTag} label="Google-sporing" />
                      <Check ok={check.booking} label="Online booking" />
                    </ul>
                  )}
                  {check.angles.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-slate-900">Det kan I sælge:</p>
                      <ul className="list-disc space-y-1 pl-5 text-slate-700" aria-label="Salgsvinkler">
                        {check.angles.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-600">
                  Tjek hjemmesiden for sikkerhed, mobilvenlighed, hastighed, annoncesporing og booking – og få forslag til,
                  hvad I kan sælge.
                </p>
              )}
              <form action={checkProspectWebsite}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton variant="secondary" pendingText="Tjekker…">
                  {check ? "Tjek igen" : "Tjek hjemmeside"}
                </SubmitButton>
              </form>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Opfølgning">
            <FollowUpForm
              prospect={{ id: p.id, status: p.status, notes: p.notes, callBackDate: p.callBackDate, ownerId: p.ownerId }}
              members={members}
              tomorrow={addDays(todayIso(), 1)}
            />
          </Card>

          {converted && p.convertedCompanyId ? (
            <Card title="Gjort til kunde">
              <Link href={`/virksomheder/${p.convertedCompanyId}`} className={buttonClass("secondary")}>
                Åbn virksomheden i CRM&apos;et
              </Link>
            </Card>
          ) : (
            <Card
              title="Gør til kunde"
              description="Opretter firmaet som virksomhed i CRM'et med noter og hjemmeside-tjek – og evt. en kontakt og en deal."
            >
              <ConvertForm id={p.id} />
            </Card>
          )}

          <form action={deleteProspect}>
            <input type="hidden" name="id" value={p.id} />
            <ConfirmButton className="px-3 py-1.5 text-xs" message={`Fjern ${p.name} fra listen?`}>
              Fjern fra listen
            </ConfirmButton>
          </form>
        </div>
      </div>
    </div>
  );
}
