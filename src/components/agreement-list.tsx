import Link from "next/link";
import { AGREEMENT_STATUS_LABELS, getAgreements, intervalLabel } from "@/lib/agreements";

/** Faste aftaler for en virksomhed eller kontakt. */
export async function AgreementList({
  workspaceId,
  filter,
  newHref,
}: {
  workspaceId: string;
  filter: { companyId?: string; contactId?: string };
  newHref: string;
}) {
  const rows = await getAgreements(workspaceId, filter);
  return (
    <div className="space-y-2 text-sm">
      {rows.length === 0 ? (
        <p className="text-slate-500">Ingen faste aftaler.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(({ agreement: a }) => (
            <li key={a.id}>
              <Link href={`/aftaler/${a.id}`} className="hover:underline">
                {a.name} · {intervalLabel(a.interval, a.intervalCount)}
                {a.status !== "ACTIVE" && ` · ${AGREEMENT_STATUS_LABELS[a.status]}`}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={newHref} className="text-brand-700 underline">
        + Ny fast aftale
      </Link>
    </div>
  );
}
