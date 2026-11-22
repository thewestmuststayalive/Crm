import type { Metadata } from "next";
import { BrandHeader } from "@/components/brand-header";
import { brandStyle, getBranding } from "@/lib/branding";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth";
import { isMemberOf } from "@/lib/crm";
import { formatDate, formatDateTime, formatIsoDate, todayIso } from "@/lib/labels";
import { formatOre, lineTotalOre, quoteTotals } from "@/lib/quote-math";
import { getPublicQuote, isExpired, markQuoteViewed } from "@/lib/quotes";
import { PrintButton, QuoteResponse } from "./quote-response";

// Linket er hemmeligt: siden må ikke indekseres, og adressen må ikke sendes videre som referer.
export const metadata: Metadata = {
  title: "Tilbud",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

export default async function PublicQuotePage({ params }: PageProps<"/tilbud/[token]">) {
  const { token } = await params;
  const user = await getCurrentUser();
  const draft = await getPublicQuote(token, { includeDrafts: true });
  if (!draft) notFound();
  // Firmaets egne medlemmer kan forhåndsvise kladder og åbner uden at tælle som kunden.
  const isMember = user ? await isMemberOf(draft.quote.workspaceId, user.id) : false;
  if (draft.quote.status === "DRAFT" && !isMember) notFound();
  if (!isMember) await markQuoteViewed(draft.quote, draft.deal);

  const { quote, lines, seller } = draft;
  const totals = quoteTotals(lines, quote.vatRate);
  const expired = quote.status === "SENT" && isExpired(quote, todayIso());
  const sellerLines = [
    seller.address,
    seller.cvr && `CVR ${seller.cvr}`,
    seller.phone,
    seller.email,
    seller.website,
  ].filter(Boolean) as string[];
  const customer = draft.companyName ?? draft.contactName;

  const brand = await getBranding(quote.workspaceId);
  return (
    <main style={brandStyle(brand.color)} className="min-h-screen bg-slate-50 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-4">
        {quote.status === "DRAFT" && (
          <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
            Forhåndsvisning af en kladde. Kunden kan først se tilbuddet, når det er sendt.
          </p>
        )}
        {isMember && quote.status !== "DRAFT" && (
          <p className="rounded-md bg-sky-50 px-4 py-3 text-sm text-sky-900 print:hidden">
            Du ser tilbuddet som kunden ser det. Din visning tæller ikke som åbnet af kunden.
          </p>
        )}

        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 print:border-0 print:shadow-none">
          <header className="flex flex-col gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:justify-between">
            <div>
              <BrandHeader brand={brand} className="mb-3" />
              <p className="text-lg font-semibold text-slate-900">{seller.name}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                {sellerLines.map((l) => (
                  <li key={l} className="whitespace-pre-line">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-sm text-slate-600 sm:text-right">
              <p className="font-display text-2xl font-bold text-slate-900">Tilbud #{quote.number}</p>
              {quote.sentAt && <p className="mt-1">Dato: {formatDate(quote.sentAt)}</p>}
              {quote.validUntil && <p>Gyldigt til: {formatIsoDate(quote.validUntil)}</p>}
            </div>
          </header>

          {customer && (
            <section className="mt-6 text-sm text-slate-700">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Til</p>
              {draft.companyName && <p className="font-medium text-slate-900">{draft.companyName}</p>}
              {draft.contactName && <p>{draft.companyName ? `Att. ${draft.contactName}` : draft.contactName}</p>}
              {draft.companyAddress && <p className="whitespace-pre-line">{draft.companyAddress}</p>}
            </section>
          )}

          <h1 className="mt-8 text-xl font-semibold text-slate-900">{quote.title}</h1>
          {quote.intro && (
            <div className="mt-3">
              <Paragraphs text={quote.intro} />
            </div>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <th className="py-2 pr-3 font-medium">Beskrivelse</th>
                  <th className="py-2 pr-3 text-right font-medium">Antal</th>
                  <th className="py-2 pr-3 text-right font-medium">Pris</th>
                  <th className="py-2 pr-3 text-right font-medium">Rabat</th>
                  <th className="py-2 text-right font-medium">Beløb</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 align-top">
                    <td className="py-2.5 pr-3 whitespace-pre-line text-slate-900">{l.description}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      {Number(l.quantity).toLocaleString("da-DK")} {l.unit}
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">{formatOre(l.unitPriceOre)}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      {Number(l.discountPct) > 0 ? `${Number(l.discountPct).toLocaleString("da-DK")} %` : ""}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">{formatOre(lineTotalOre(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm" aria-label="Total">
            <div className="flex justify-between">
              <dt className="text-slate-600">Subtotal</dt>
              <dd>{formatOre(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">{quote.vatRate > 0 ? `Moms ${quote.vatRate} %` : "Moms"}</dt>
              <dd>{quote.vatRate > 0 ? formatOre(totals.vat) : "Fritaget"}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <dt>Total{quote.vatRate > 0 ? " inkl. moms" : ""}</dt>
              <dd data-testid="quote-total">{formatOre(totals.total)}</dd>
            </div>
          </dl>

          {quote.terms && (
            <section className="mt-8 border-t border-slate-200 pt-6">
              <h2 className="text-sm font-semibold text-slate-900">Betingelser</h2>
              <div className="mt-2">
                <Paragraphs text={quote.terms} />
              </div>
            </section>
          )}

          {quote.status === "ACCEPTED" && quote.acceptedAt && (
            <p className="mt-8 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Accepteret af {quote.acceptedName} den {formatDateTime(quote.acceptedAt)}.
            </p>
          )}
          {quote.status === "DECLINED" && (
            <p className="mt-8 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">Tilbuddet er afvist.</p>
          )}
        </article>

        {quote.status === "ACCEPTED" && (
          <section
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 print:hidden"
          >
            <p className="text-base font-semibold">Tilbuddet er accepteret. Tak!</p>
            <p className="mt-1 text-sm">{seller.name} kontakter dig om det videre forløb.</p>
          </section>
        )}
        {quote.status === "DECLINED" && (
          <section
            role="status"
            className="rounded-xl border border-slate-200 bg-white p-6 text-slate-800 print:hidden"
          >
            <p className="text-base font-semibold">Tilbuddet er afvist. Tak for dit svar.</p>
            <p className="mt-1 text-sm">Har du spørgsmål, er du velkommen til at kontakte {seller.name}.</p>
          </section>
        )}
        {quote.status === "SENT" && !expired && !isMember && (
          <QuoteResponse token={quote.token} defaultName={draft.contactName ?? ""} total={formatOre(totals.total)} />
        )}
        {expired && (
          <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Tilbuddet er udløbet. Kontakt {seller.name} for et opdateret tilbud.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 print:hidden">
          <PrintButton />
          <p className="flex items-center gap-2 text-xs text-slate-500">
            Sendt via <Logo size={18} />
          </p>
        </div>
      </div>
    </main>
  );
}
