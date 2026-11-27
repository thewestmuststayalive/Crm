import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteInvoice, markPaid, refreshInvoice } from "@/app/actions/invoices";
import { CopyButton } from "@/components/copy-button";
import { Badge, DetailRow, PageHeader } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { Card, ConfirmButton, SubmitButton } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getEconomicConnection, isReadOnlyPlan, missingSettings } from "@/lib/economic";
import { getInvoice, statusLabel, statusStyle } from "@/lib/invoices";
import { formatIsoDate } from "@/lib/labels";
import { formatOre } from "@/lib/quote-math";
import { hasRole } from "@/lib/roles";
import { getAppUrl } from "@/lib/url";
import { isUuid } from "@/lib/validation";
import { InvoiceEditor, ResendForm } from "./invoice-editor";

export const metadata: Metadata = { title: "Faktura" };

export default async function InvoicePage({ params, searchParams }: PageProps<"/fakturaer/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace();
  if (!isUuid(id)) notFound();
  const [row, conn] = await Promise.all([getInvoice(workspace.id, id), getEconomicConnection(workspace.id)]);
  if (!row) notFound();
  const inv = row.invoice;
  const customer = row.companyName ?? row.contactName ?? "Ingen kunde";
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const editable = inv.status === "DRAFT" || inv.status === "ECONOMIC_DRAFT";
  const economicReady = Boolean(conn && !isReadOnlyPlan(conn.planLevel) && missingSettings(conn.settings).length === 0);
  const publicUrl = `${await getAppUrl()}/faktura/${inv.token}`;
  const customerHref = inv.companyId ? `/virksomheder/${inv.companyId}` : inv.contactId ? `/kunder/${inv.contactId}` : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={inv.economicNumber ? `Faktura ${inv.economicNumber}` : "Ny faktura"}
        back={{ href: "/fakturaer", label: "Fakturaer" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={statusStyle(inv)}>{statusLabel(inv)}</Badge>
            {customerHref ? (
              <Link href={customerHref} className="underline">
                {customer}
              </Link>
            ) : (
              customer
            )}
          </span>
        }
      />

      {sp.bogfoert === "1" && inv.economicNumber && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Faktura {inv.economicNumber} er bogført i e-conomic
          {inv.sentAt ? ` og sendt til ${inv.email}.` : ". Den er ikke sendt på e-mail – send den herunder, eller del linket."}
        </p>
      )}

      {inv.status === "PAID" && inv.paidVia !== "economic" && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Betalingen er registreret i Kundespor. Husk at registrere den i e-conomic, så bogføringen stemmer.
        </p>
      )}

      {editable ? (
        <Card title={`Faktura til ${customer}`}>
          {!economicReady && (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {!conn
                ? "Forbind e-conomic under Indstillinger → Regnskab for at bogføre og sende fakturaen."
                : isReadOnlyPlan(conn.planLevel)
                  ? "Jeres e-conomic-abonnement tillader ikke, at Kundespor opretter fakturaer (kræver Plus eller højere)."
                  : `Vælg ${missingSettings(conn.settings).join(", ")} under Indstillinger → Regnskab.`}{" "}
              {isAdmin && (
                <Link href="/indstillinger/regnskab" className="font-medium underline">
                  Gå til Regnskab
                </Link>
              )}
            </p>
          )}
          {inv.status === "ECONOMIC_DRAFT" && (
            <p className="mb-4 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
              Fakturaen ligger som kladde {inv.economicDraftNumber} i e-conomic. Ret den dér, og bogfør den herfra eller i
              e-conomic.
            </p>
          )}
          <InvoiceEditor
            id={inv.id}
            initial={{ heading: inv.heading ?? "", email: inv.email ?? "", lines: inv.lines }}
            canBook={isAdmin}
            economicReady={economicReady}
            alreadyInEconomic={inv.status === "ECONOMIC_DRAFT"}
          />
          {!isAdmin && <p className="mt-3 text-sm text-slate-500">En administrator bogfører og sender fakturaen.</p>}
          <form action={deleteInvoice} className="mt-4">
            <input type="hidden" name="id" value={inv.id} />
            <ConfirmButton
              className="px-3 py-1.5 text-xs"
              message={
                inv.status === "ECONOMIC_DRAFT"
                  ? "Slet fakturaen i Kundespor? Kladden i e-conomic skal slettes dér."
                  : "Slet kladden?"
              }
            >
              Slet kladde
            </ConfirmButton>
          </form>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <Card title="Fakturaen">
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Fakturanummer">{inv.economicNumber}</DetailRow>
              <DetailRow label="Dato">{inv.date ? formatIsoDate(inv.date) : null}</DetailRow>
              <DetailRow label="Forfald">{inv.dueDate ? formatIsoDate(inv.dueDate) : null}</DetailRow>
              <DetailRow label="Beløb inkl. moms">{inv.grossOre !== null ? formatOre(inv.grossOre) : null}</DetailRow>
              <DetailRow label="Heraf moms">{inv.vatOre !== null ? formatOre(inv.vatOre) : null}</DetailRow>
              <DetailRow label="Mangler at betale">
                {inv.status === "PAID"
                  ? `Betalt${inv.paidVia === "stripe" ? " online (MobilePay/kort)" : inv.paidVia === "manual" ? " (markeret manuelt)" : ""}`
                  : inv.remainderOre !== null
                    ? formatOre(inv.remainderOre)
                    : null}
              </DetailRow>
              <DetailRow label="Sendt">
                {inv.sentAt ? `${formatIsoDate(inv.sentAt.toISOString().slice(0, 10))} til ${inv.email}` : "Ikke sendt på e-mail"}
              </DetailRow>
            </dl>
            <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm" aria-label="Linjer">
              {inv.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {l.description} <span className="text-slate-500">× {String(l.quantity).replace(".", ",")}</span>
                  </span>
                  <span className="whitespace-nowrap">{formatOre(Math.round(l.quantity * l.unitPriceOre))}</span>
                </li>
              ))}
            </ul>
          </Card>
          <div className="space-y-4">
            <Card title="Handlinger">
              <div className="space-y-3">
                <a href={`/fakturaer/${inv.id}/pdf`} className={buttonClass("secondary", "w-full justify-center")}>
                  Hent PDF
                </a>
                <div className="flex gap-2">
                  <CopyButton text={publicUrl} label="Kopiér link til kunden" />
                </div>
                {inv.status === "BOOKED" && (
                  <form action={refreshInvoice}>
                    <input type="hidden" name="id" value={inv.id} />
                    <SubmitButton variant="secondary" pendingText="Henter…" className="w-full justify-center">
                      Opdater betalingsstatus
                    </SubmitButton>
                  </form>
                )}
                {inv.status === "BOOKED" && isAdmin && (
                  <form action={markPaid}>
                    <input type="hidden" name="id" value={inv.id} />
                    <ConfirmButton
                      variant="secondary"
                      className="w-full justify-center"
                      message="Markér som betalt i Kundespor? Husk at registrere betalingen i e-conomic."
                    >
                      Markér som betalt
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </Card>
            {isAdmin && (
              <Card title="Send på e-mail">
                <ResendForm id={inv.id} email={inv.email ?? ""} />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
