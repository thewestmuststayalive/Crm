import Link from "next/link";
import { createInvoice } from "@/app/actions/invoices";
import { Badge } from "@/components/display";
import { SubmitButton } from "@/components/ui";
import { getInvoices, previewTotals, statusLabel, statusStyle } from "@/lib/invoices";
import { formatOre } from "@/lib/quote-math";

/** Knap, der opretter en fakturakladde ud fra det, den står på. */
export function CreateInvoiceButton({
  fields,
  label = "Opret faktura",
  variant = "secondary",
}: {
  fields: Record<string, string>;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <form action={createInvoice}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} pendingText="Opretter…">
        {label}
      </SubmitButton>
    </form>
  );
}

/** Fakturaer knyttet til en virksomhed, kontakt eller deal. */
export async function InvoiceList({
  workspaceId,
  filter,
}: {
  workspaceId: string;
  filter: { companyId?: string; contactId?: string; dealId?: string };
}) {
  const rows = await getInvoices(workspaceId, filter);
  if (rows.length === 0) return <p className="text-sm text-slate-500">Ingen fakturaer endnu.</p>;
  return (
    <ul className="space-y-2 text-sm" aria-label="Fakturaer">
      {rows.slice(0, 10).map((r) => (
        <li key={r.id}>
          <Link href={`/fakturaer/${r.id}`} className="flex items-center justify-between gap-2 hover:underline">
            <span>{r.economicNumber ? `Faktura ${r.economicNumber}` : "Kladde"}</span>
            <span className="flex items-center gap-2">
              <span className="whitespace-nowrap">{formatOre(r.grossOre ?? previewTotals(r.lines).gross)}</span>
              <Badge className={statusStyle(r)}>{statusLabel(r)}</Badge>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
