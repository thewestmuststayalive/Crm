import { notFound } from "next/navigation";
import { getEconomicConnection, getInvoicePdf } from "@/lib/economic";
import { getPublicInvoice } from "@/lib/invoices";

/** Kundens adgang til PDF'en via det hemmelige link. */
export async function GET(_request: Request, { params }: RouteContext<"/faktura/[token]/pdf">) {
  const { token } = await params;
  const row = await getPublicInvoice(token);
  if (!row?.invoice.economicNumber) notFound();
  const conn = await getEconomicConnection(row.workspace.id);
  if (!conn) notFound();
  const pdf = await getInvoicePdf(conn, row.invoice.economicNumber);
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Faktura-${row.invoice.economicNumber}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
