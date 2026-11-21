import Link from "next/link";
import type { DealSummary } from "@/lib/crm";
import { DEAL_STATUS_STYLES, formatKr } from "@/lib/labels";
import { Badge } from "./display";
import { buttonClass } from "./styles";
import { Card } from "./ui";

export function DealsCard({ deals, newHref }: { deals: DealSummary[]; newHref: string }) {
  return (
    <Card title={`Deals (${deals.length})`}>
      {deals.length === 0 ? (
        <p className="text-sm text-slate-500">Ingen deals endnu.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {deals.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link href={`/pipeline/${d.id}`} className="block truncate text-sm font-medium hover:underline">
                  {d.title}
                </Link>
                <p className="text-xs text-slate-500">{formatKr(d.value)}</p>
              </div>
              <Badge className={DEAL_STATUS_STYLES[d.status]}>{d.stageName}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Link href={newHref} className={buttonClass("secondary", "mt-3 w-full")}>
        Ny deal
      </Link>
    </Card>
  );
}
