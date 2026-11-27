import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getEconomicConnection, getInvoicePdf } from "@/lib/economic";
import { getInvoice } from "@/lib/invoices";
import { isUuid } from "@/lib/validation";

/** Fakturaens PDF hentet direkte fra e-conomic. */
export async function GET(_request: Request, { params }: RouteContext<"/fakturaer/[id]/pdf">) {
  const { workspace } = await requireWorkspace();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const row = await getInvoice(workspace.id, id);
  if (!row?.invoice.economicNumber) notFound();
  const conn = await getEconomicConnection(workspace.id);
  if (!conn) return new Response("e-conomic er ikke forbundet", { status: 409 });
  const pdf = await getInvoicePdf(conn, row.invoice.economicNumber);
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Faktura-${row.invoice.economicNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
