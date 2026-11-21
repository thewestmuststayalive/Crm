import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { formatDate } from "@/lib/labels";
import { defaultReviewMessage, getReviewOverview, getReviewSettings, REVIEW_STATUS_LABELS } from "@/lib/reviews";
import { hasRole } from "@/lib/roles";
import { ReviewSettingsForm } from "./review-settings-form";

export const metadata: Metadata = { title: "Anmeldelser" };

const STATUS_STYLES = {
  SCHEDULED: "bg-slate-100 text-slate-700",
  SENT: "bg-sky-50 text-sky-800",
  CLICKED: "bg-emerald-50 text-emerald-800",
  SKIPPED: "bg-amber-50 text-amber-800",
} as const;

export default async function ReviewsSettingsPage() {
  const { workspace } = await requireWorkspace();
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const [settings, overview] = await Promise.all([getReviewSettings(workspace.id), getReviewOverview(workspace.id)]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Glade kunder glemmer at anmelde. Når en deal er vundet, sender Kundespor automatisk en venlig e-mail med et link
        til jeres Google- eller Trustpilot-side. Hver kunde bliver højst spurgt én gang pr. halve år, og alle e-mails
        har et afmeldingslink.
      </p>

      {!isEmailConfigured() && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          E-mail er ikke sat op endnu, så anmodningerne kan ikke sendes. Se docs/drift.md (RESEND_API_KEY).
        </p>
      )}

      <Card title="Opsætning">
        {isAdmin ? (
          <ReviewSettingsForm
            initial={{
              enabled: settings?.enabled ?? false,
              url: settings?.url ?? "",
              delayDays: settings?.delayDays ?? 3,
              message: settings?.message ?? "",
            }}
            defaultMessage={defaultReviewMessage(workspace.name)}
          />
        ) : (
          <p className="text-sm text-slate-700">{settings?.enabled ? "Slået til" : "Slået fra"}</p>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Godt at vide: Fortæl kunderne i jeres handelsbetingelser eller ordrebekræftelse, at de kan få en e-mail om at
          anmelde jer. Personer markeret med &quot;Ønsker ikke e-mails&quot; får aldrig en anmodning.
        </p>
      </Card>

      <Card title="Seneste 90 dage">
        <dl className="grid grid-cols-3 gap-4 text-center">
          <div>
            <dt className="text-xs text-slate-500">Planlagt</dt>
            <dd className="text-2xl font-semibold text-slate-900">{overview.scheduled}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Sendt</dt>
            <dd className="text-2xl font-semibold text-slate-900">{overview.sent}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Klikket</dt>
            <dd className="text-2xl font-semibold text-slate-900">{overview.clicked}</dd>
          </div>
        </dl>
        {overview.recent.length > 0 && (
          <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100" aria-label="Seneste anmodninger">
            {overview.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <Link href={`/kunder/${r.contactId}`} className="font-medium text-slate-900 underline">
                    {r.contactName}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">
                    {r.status === "SCHEDULED" && `sendes ${formatDate(r.sendAt)}`}
                    {r.sentAt && `sendt ${formatDate(r.sentAt)}`}
                    {r.status === "SKIPPED" && r.skipReason}
                  </span>
                </span>
                <Badge className={STATUS_STYLES[r.status]}>{REVIEW_STATUS_LABELS[r.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
