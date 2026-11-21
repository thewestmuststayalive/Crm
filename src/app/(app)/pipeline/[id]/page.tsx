import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDeal } from "@/app/actions/deals";
import { ActivityForm } from "@/components/activity-form";
import { Badge, DetailRow, PageHeader, SourceBadge } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { Card, ConfirmButton } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getCompany, getContact, getDeal, getMemberOptions, getTasks, getTimeline, getUserName } from "@/lib/crm";
import { formatDateTime, formatIsoDate, formatKr, STAGE_LABELS, STAGE_STYLES } from "@/lib/labels";
import { hasRole } from "@/lib/roles";
import { StageSelect } from "../stage-select";

export const metadata: Metadata = { title: "Deal" };

export default async function DealPage({ params }: PageProps<"/pipeline/[id]">) {
  const { id } = await params;
  const { user, workspace } = await requireWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();

  const [contact, company, ownerName, timeline, tasks, members] = await Promise.all([
    deal.contactId ? getContact(workspace.id, deal.contactId) : null,
    deal.companyId ? getCompany(workspace.id, deal.companyId) : null,
    getUserName(deal.ownerId),
    getTimeline(workspace.id, { dealId: deal.id }),
    getTasks(workspace.id, { dealId: deal.id }),
    getMemberOptions(workspace.id),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={deal.title}
        back={{ href: "/pipeline", label: "Pipeline" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-slate-800">{formatKr(deal.value)}</span>
            <Badge className={STAGE_STYLES[deal.stage]}>{STAGE_LABELS[deal.stage]}</Badge>
          </span>
        }
        actions={
          <>
            <StageSelect dealId={deal.id} stage={deal.stage} />
            <Link href={`/pipeline/${deal.id}/rediger`} className={buttonClass("secondary")}>
              Redigér
            </Link>
            {hasRole(workspace.role, "ADMIN") && (
              <form action={deleteDeal}>
                <input type="hidden" name="id" value={deal.id} />
                <ConfirmButton message={`Slet dealen "${deal.title}"? Det kan ikke fortrydes.`}>Slet</ConfirmButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card title="Oplysninger">
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Kontakt">
                {contact && (
                  <Link href={`/kunder/${contact.id}`} className="underline">
                    {contact.name}
                  </Link>
                )}
              </DetailRow>
              <DetailRow label="Virksomhed">
                {company && (
                  <Link href={`/virksomheder/${company.id}`} className="underline">
                    {company.name}
                  </Link>
                )}
              </DetailRow>
              <DetailRow label="Ansvarlig">{ownerName}</DetailRow>
              <DetailRow label="Forventet lukning">
                {deal.expectedCloseDate && formatIsoDate(deal.expectedCloseDate)}
              </DetailRow>
              <DetailRow label="Kilde">
                <SourceBadge source={deal.source} />
              </DetailRow>
              {deal.closedAt && <DetailRow label="Lukket">{formatDateTime(deal.closedAt)}</DetailRow>}
              {deal.stage === "LOST" && <DetailRow label="Årsag">{deal.lostReason}</DetailRow>}
              <DetailRow label="Oprettet">{formatDateTime(deal.createdAt)}</DetailRow>
            </dl>
          </Card>
          <Card title="Opgaver">
            <TaskForm members={members} defaultAssigneeId={user.id} dealId={deal.id} />
            {tasks.length > 0 && (
              <div className="mt-3">
                <TaskList tasks={tasks} showLinks={false} />
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card title="Aktiviteter">
            <ActivityForm dealId={deal.id} />
          </Card>
          <Timeline items={timeline} userId={user.id} role={workspace.role} back={`/pipeline/${deal.id}`} />
        </div>
      </div>
    </div>
  );
}
