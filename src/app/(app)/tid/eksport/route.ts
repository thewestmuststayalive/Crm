import type { NextRequest } from "next/server";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatHM, isMonth, monthRange } from "@/lib/duration";
import { formatIsoDate } from "@/lib/labels";
import { requireAgencyModule } from "@/lib/modules";
import { getEntries } from "@/lib/time-tracking";

/** Al registreret tid i en måned som CSV – fx som bilag til fakturering. */
export async function GET(request: NextRequest) {
  const { workspace } = await requireAgencyModule();
  const raw = request.nextUrl.searchParams.get("maaned");
  if (!isMonth(raw)) return new Response("Ugyldig måned", { status: 400 });
  const { first, last } = monthRange(raw);
  const entries = await getEntries(workspace.id, first, last);
  const csv = toCsv(
    ["Dato", "Medarbejder", "Kunde", "Beskrivelse", "Tid (t:mm)", "Timer", "Fakturerbar"],
    entries.map((e) => [
      formatIsoDate(e.date),
      e.userName,
      e.companyName ?? "Intern tid",
      e.description,
      formatHM(e.minutes),
      (e.minutes / 60).toLocaleString("da-DK", { maximumFractionDigits: 2 }),
      e.billable ? "Ja" : "Nej",
    ]),
  );
  return csvResponse(`tid-${raw}.csv`, csv);
}
