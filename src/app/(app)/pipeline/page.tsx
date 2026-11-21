import { and, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/styles";
import { db, schema } from "@/db";
import { dealStageEnum } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { formatKr, OPEN_STAGES } from "@/lib/labels";
import { Kanban } from "./kanban";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const { user, workspace } = await requireWorkspace();
  const { mine } = await searchParams;
  const onlyMine = mine === "1";

  // Åbne deals + deals lukket inden for de seneste 30 dage.
  const filters: (SQL | undefined)[] = [
    eq(schema.deals.workspaceId, workspace.id),
    or(inArray(schema.deals.stage, [...OPEN_STAGES]), gte(schema.deals.closedAt, sql`now() - interval '30 days'`)),
  ];
  if (onlyMine) filters.push(eq(schema.deals.ownerId, user.id));

  const owner = alias(schema.users, "owner");
  const deals = await db
    .select({
      id: schema.deals.id,
      title: schema.deals.title,
      value: schema.deals.value,
      stage: schema.deals.stage,
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

  const openValue = deals.filter((d) => (OPEN_STAGES as readonly string[]).includes(d.stage)).reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            Åben pipeline: <span className="font-medium text-slate-800">{formatKr(openValue)}</span> · Træk et kort for at skifte fase. Vundne og tabte vises i 30 dage.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={onlyMine ? "/pipeline" : "/pipeline?mine=1"} className={buttonClass("secondary")}>
            {onlyMine ? "Vis alle" : "Kun mine"}
          </Link>
          <Link href="/pipeline/ny" className={buttonClass()}>
            Ny deal
          </Link>
        </div>
      </div>
      <Kanban deals={deals} stages={[...dealStageEnum.enumValues]} />
    </div>
  );
}
