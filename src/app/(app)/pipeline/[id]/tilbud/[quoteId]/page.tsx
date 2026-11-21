import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteQuote } from "@/app/actions/quotes";
import { Badge, DetailRow, PageHeader } from "@/components/display";
import { Card, ConfirmButton } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getContact, getDeal } from "@/lib/crm";
import { formatDateTime, todayIso } from "@/lib/labels";
import { numericToInput, oreToInput } from "@/lib/quote-math";
import { getQuote, getQuoteLines, isExpired, QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES } from "@/lib/quotes";
import { getAppUrl } from "@/lib/url";
import { QuoteEditor } from "./quote-editor";

export const metadata: Metadata = { title: "Tilbud" };

export default async function QuotePage({ params }: PageProps<"/pipeline/[id]/tilbud/[quoteId]">) {
  const { id, quoteId } = await params;
  const { workspace } = await requireWorkspace();
  const deal = await getDeal(workspace.id, id);
  const quote = await getQuote(workspace.id, quoteId);
  if (!deal || !quote || quote.dealId !== deal.id) notFound();
  const [lines, contact, appUrl] = await Promise.all([
    getQuoteLines(quote.id),
    deal.contactId ? getContact(workspace.id, deal.contactId) : null,
    getAppUrl(),
  ]);
  const publicUrl = `${appUrl}/tilbud/${quote.token}`;
  const answered = quote.status === "ACCEPTED" || quote.status === "DECLINED";
  const expired = quote.status === "SENT" && isExpired(quote, todayIso());

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={`Tilbud #${quote.number}`}
        back={{ href: `/pipeline/${deal.id}`, label: deal.title }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={QUOTE_STATUS_STYLES[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>
            {expired && <Badge className="bg-amber-50 text-amber-800">Udløbet</Badge>}
          </span>
        }
        actions={
          quote.status !== "ACCEPTED" && (
            <form action={deleteQuote}>
              <input type="hidden" name="id" value={quote.id} />
              <ConfirmButton message={`Slet tilbud #${quote.number}? Linket holder op med at virke.`}>
                Slet
              </ConfirmButton>
            </form>
          )
        }
      />

      {quote.status !== "DRAFT" && (
        <Card title="Status">
          <dl className="divide-y divide-slate-100">
            {quote.sentAt && <DetailRow label="Sendt">{formatDateTime(quote.sentAt)}</DetailRow>}
            <DetailRow label="Åbnet af kunden">
              {quote.viewedAt ? formatDateTime(quote.viewedAt) : "Ikke endnu"}
            </DetailRow>
            {quote.acceptedAt && (
              <DetailRow label="Accepteret">
                {formatDateTime(quote.acceptedAt)} af {quote.acceptedName}
              </DetailRow>
            )}
            {quote.declinedAt && <DetailRow label="Afvist">{formatDateTime(quote.declinedAt)}</DetailRow>}
            {quote.declineReason && <DetailRow label="Begrundelse">{quote.declineReason}</DetailRow>}
          </dl>
        </Card>
      )}

      <QuoteEditor
        quoteId={quote.id}
        status={quote.status}
        readOnly={answered}
        publicUrl={publicUrl}
        contactEmail={contact?.email ?? null}
        initial={{
          title: quote.title,
          intro: quote.intro ?? "",
          terms: quote.terms ?? "",
          validUntil: quote.validUntil ?? "",
          vatRate: quote.vatRate === 0 ? 0 : 25,
          lines: lines.map((l) => ({
            description: l.description,
            quantity: numericToInput(l.quantity),
            unit: l.unit ?? "",
            unitPrice: oreToInput(l.unitPriceOre),
            discountPct: numericToInput(l.discountPct),
          })),
        }}
      />
    </div>
  );
}
