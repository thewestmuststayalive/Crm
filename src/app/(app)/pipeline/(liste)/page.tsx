import { and, desc, eq, gte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, cx } from "@/components/styles";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { formatKr } from "@/lib/labels";
import { getPipelines } from "@/lib/pipelines";
import { hasRole } from "@/lib/roles";
import { Kanban } from "../kanban";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const { user, workspace } = await requireWorkspace();
  const sp = await searchParams;
  const onlyMine = sp.mine === "1";
  const pipelines = await getPipelines(workspace.id);
  const pipeline = pipelines.find((p) => p.id === sp.pipeline) ?? pipelines[0];

  const href = (params: { pipeline?: string; mine?: boolean }) => {
    const q = new URLSearchParams();
    if (params.pipeline && params.pipeline !== pipelines[0]?.id) q.set("pipeline", params.pipeline);
    if (params.mine) q.set("mine", "1");
    const s = q.toString();
    return s ? `/pipeline?${s}` : "/pipeline";
  };

  // Åbne deals + deals lukket inden for de seneste 30 dage, i den valgte pipeline.
  const filters: (SQL | undefined)[] = [
    eq(schema.deals.workspaceId, workspace.id),
    eq(schema.deals.pipelineId, pipeline.id),
    or(eq(schema.deals.status, "OPEN"), gte(schema.deals.closedAt, sql`now() - interval '30 days'`)),
  ];
  if (onlyMine) filters.push(eq(schema.deals.ownerId, user.id));

  const owner = alias(schema.users, "owner");
  const deals = await db
    .select({
      id: schema.deals.id,
      title: schema.deals.title,
      value: schema.deals.value,
      stageId: schema.deals.stageId,
      status: schema.deals.status,
      expectedCloseDate: schema.deals.expectedCloseDate,
      contactName: schema.contacts.name,
      companyName: schema.companies.name,
      ownerName: owner.name,
    })
    .from(schema.deals)
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.deals.contactId))
    .leftJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .leftJoin(owner, eq(owner.id, schema.deals.ownerId))
    .where(and(...filters))
    .orderBy(desc(schema.deals.updatedAt))
    .limit(500);

  const openValue = deals.filter((d) => d.status === "OPEN").reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            Åben pipeline: <span className="font-medium text-slate-800">{formatKr(openValue)}</span> · Træk et kort for
            at skifte fase. Vundne og tabte vises i 30 dage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasRole(workspace.role, "ADMIN") && (
            <Link href="/indstillinger/salgsfaser" className={buttonClass("secondary")}>
              Tilpas faser
            </Link>
          )}
          <Link href={href({ pipeline: pipeline.id, mine: !onlyMine })} className={buttonClass("secondary")}>
            {onlyMine ? "Vis alle" : "Kun mine"}
          </Link>
          <Link href={`/pipeline/ny?pipeline=${pipeline.id}`} className={buttonClass()}>
            Ny deal
          </Link>
        </div>
      </div>

      {pipelines.length > 1 && (
        <nav className="flex gap-4 overflow-x-auto border-b border-slate-200 whitespace-nowrap" aria-label="Pipelines">
          {pipelines.map((p) => (
            <Link
              key={p.id}
              href={href({ pipeline: p.id, mine: onlyMine })}
              className={cx(
                "-mb-px border-b-2 px-1 pb-2 text-sm font-medium",
                p.id === pipeline.id ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      <Kanban
        key={pipeline.id}
        deals={deals}
        stages={pipeline.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))}
      />
    </div>
  );
}
