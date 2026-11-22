import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { buttonClass } from "@/components/styles";
import { Card } from "@/components/ui";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import { hasRole } from "@/lib/roles";
import { DeleteWorkspaceForm } from "./delete-form";

export const metadata: Metadata = { title: "Data og log" };

export default async function DataPage() {
  const { workspace } = await requireRole("ADMIN");
  const log = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      details: schema.auditLog.details,
      createdAt: schema.auditLog.createdAt,
      user: schema.users.name,
    })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .where(eq(schema.auditLog.workspaceId, workspace.id))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(200);

  return (
    <div className="space-y-6">
      <Card
        title="Aktivitetslog"
        description="Vigtige handlinger i firmaet: sletninger, eksporter, ændrede indstillinger og adgang. De seneste 200 vises."
      >
        {log.length === 0 ? (
          <p className="text-sm text-slate-500">Intet logget endnu.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm" aria-label="Aktivitetslog">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{l.action}</span>
                  {l.details && <span className="text-slate-600"> · {l.details}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {l.user ?? "Systemet"} · {formatDateTime(l.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Download alle data"
        description="Én fil med alle firmaets kunder, deals, opgaver, noter, bookinger, tid, projekter og beskeder – fx som sikkerhedskopi eller hvis I vil skifte system. Adgangskoder og hemmelige links er ikke med."
      >
        <a href="/indstillinger/data/eksport" className={buttonClass("secondary")} download>
          Download alle data (JSON)
        </a>
      </Card>

      {hasRole(workspace.role, "OWNER") && (
        <Card title="Slet firma" description="Sletter firmaet og alle dets data for altid. Det kan ikke fortrydes.">
          <DeleteWorkspaceForm name={workspace.name} />
        </Card>
      )}
    </div>
  );
}
