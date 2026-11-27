import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/display";
import { cx } from "@/components/styles";
import { requireWorkspace } from "@/lib/auth";
import { getEconomicConnection } from "@/lib/economic";
import { getInvoices, getInvoiceSummary, previewTotals, statusLabel, statusStyle, type InvoiceFilter } from "@/lib/invoices";
import { formatIsoDate } from "@/lib/labels";
import { formatOre } from "@/lib/quote-math";

export const metadata: Metadata = { title: "Fakturaer" };

const FILTERS: { key: InvoiceFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "drafts", label: "Kladder" },
  { key: "open", label: "Ubetalte" },
  { key: "overdue", label: "Forfaldne" },
  { key: "paid", label: "Betalte" },
];

export default async function InvoicesPage({ searchParams }: PageProps<"/fakturaer">) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.key === sp.vis) ? (sp.vis as InvoiceFilter) : "all";
  const [rows, summary, conn] = await Promise.all([
    getInvoices(workspace.id, { filter }),
    getInvoiceSummary(workspace.id),
    getEconomicConnection(workspace.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Fakturaer"
        subtitle="Opret en faktura fra en deal, en booking eller en kunde. Fakturaen bogføres i e-conomic."
      />
      {!conn && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          e-conomic er ikke forbundet endnu. En administrator kan gøre det under{" "}
          <Link href="/indstillinger/regnskab" className="font-medium underline">
            Indstillinger → Regnskab
          </Link>
          .
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Udestående</p>
          <p className="text-xl font-semibold text-slate-900">{formatOre(summary.open)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Heraf forfaldent</p>
          <p className={cx("text-xl font-semibold", summary.overdue > 0 ? "text-rose-700" : "text-slate-900")}>
            {formatOre(summary.overdue)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Kladder</p>
          <p className="text-xl font-semibold text-slate-900">{summary.drafts}</p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filtrér fakturaer">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/fakturaer" : `/fakturaer?vis=${f.key}`}
            className={cx(
              "rounded-full px-3 py-1",
              filter === f.key ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState>Ingen fakturaer her endnu.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label="Fakturaer">
          {rows.map((r) => {
            const amount = r.grossOre ?? previewTotals(r.lines).gross;
            return (
              <li key={r.id}>
                <Link href={`/fakturaer/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-slate-50">
                  <span className="w-24 font-medium text-slate-900">{r.economicNumber ? `Nr. ${r.economicNumber}` : "Kladde"}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.customer}
                    {r.heading && <span className="text-slate-500"> · {r.heading}</span>}
                  </span>
                  <span className="text-slate-500">{r.dueDate ? `Forfald ${formatIsoDate(r.dueDate)}` : ""}</span>
                  <span className="w-28 text-right font-medium whitespace-nowrap">{formatOre(amount)}</span>
                  <Badge className={statusStyle(r)}>{statusLabel(r)}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
