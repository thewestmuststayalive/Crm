import { notFound } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatIsoDate } from "@/lib/labels";
import { getProspectList, getProspects, PROSPECT_SOURCE_LABELS, PROSPECT_STATUS_LABELS } from "@/lib/prospects";
import { isUuid } from "@/lib/validation";

/** Hele listen som CSV til Excel. */
export async function GET(_request: Request, { params }: RouteContext<"/leads/[id]/eksport">) {
  const { user, workspace } = await requireWorkspace();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const list = await getProspectList(workspace.id, id);
  if (!list) notFound();
  const rows = await getProspects(workspace.id, id);
  await audit(workspace.id, user.id, "Eksporterede lead-liste", list.name);
  const csv = toCsv(
    ["Firma", "Telefon", "Hjemmeside", "Adresse", "Branche", "Status", "Ring igen", "Ansvarlig", "Hjemmeside-score", "Kilde"],
    rows.map((p) => [
      p.name,
      p.phone,
      p.website,
      p.address,
      p.industry,
      PROSPECT_STATUS_LABELS[p.status],
      p.callBackDate ? formatIsoDate(p.callBackDate) : "",
      p.ownerName,
      p.score === null ? "" : String(p.score),
      PROSPECT_SOURCE_LABELS[p.source],
    ]),
  );
  const slug = list.name.toLowerCase().replace(/[^a-z0-9æøå]+/g, "-").replace(/^-|-$/g, "") || "leads";
  return csvResponse(`leads-${slug}.csv`, csv);
}
