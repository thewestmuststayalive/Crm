import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteContact } from "@/app/actions/contacts";
import { ActivityForm } from "@/components/activity-form";
import { DetailRow, PageHeader, SourceBadge, StatusBadge } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { Timeline } from "@/components/timeline";
import { Card, ConfirmButton } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { DealsCard } from "@/components/deals-card";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { getCompany, getContact, getDealsFor, getMemberOptions, getTasks, getTimeline, getUserName } from "@/lib/crm";
import { formatDateTime } from "@/lib/labels";
import { hasRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Kontakt" };

export default async function ContactPage({ params }: PageProps<"/kunder/[id]">) {
  const { id } = await params;
  const { user, workspace } = await requireWorkspace();
  const contact = await getContact(workspace.id, id);
  if (!contact) notFound();

  const [company, ownerName, timeline, deals, tasks, members] = await Promise.all([
    contact.companyId ? getCompany(workspace.id, contact.companyId) : null,
    getUserName(contact.ownerId),
    getTimeline(workspace.id, { contactId: contact.id }),
    getDealsFor(workspace.id, { contactId: contact.id }),
    getTasks(workspace.id, { contactId: contact.id }),
    getMemberOptions(workspace.id),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={contact.name}
        back={{ href: "/kunder", label: "Kunder" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {contact.title && <span>{contact.title}</span>}
            {company && (
              <Link href={`/virksomheder/${company.id}`} className="underline">
                {company.name}
              </Link>
            )}
            <StatusBadge status={contact.status} />
          </span>
        }
        actions={
          <>
            <Link href={`/kunder/${contact.id}/rediger`} className={buttonClass("secondary")}>
              Redigér
            </Link>
            {hasRole(workspace.role, "ADMIN") && (
              <form action={deleteContact}>
                <input type="hidden" name="id" value={contact.id} />
                <ConfirmButton message={`Slet ${contact.name} og alle noter? Det kan ikke fortrydes.`}>Slet</ConfirmButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card title="Oplysninger">
            <dl className="divide-y divide-slate-100">
              <DetailRow label="E-mail">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="underline">
                    {contact.email}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Telefon">
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="underline">
                    {contact.phone}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Kilde">
                <SourceBadge source={contact.source} />
              </DetailRow>
              <DetailRow label="Ansvarlig">{ownerName}</DetailRow>
              <DetailRow label="Oprettet">{formatDateTime(contact.createdAt)}</DetailRow>
              <DetailRow label="Opdateret">{formatDateTime(contact.updatedAt)}</DetailRow>
            </dl>
          </Card>
          <DealsCard deals={deals} newHref={`/pipeline/ny?kontakt=${contact.id}`} />
          <Card title="Opgaver">
            <TaskForm members={members} defaultAssigneeId={user.id} contactId={contact.id} />
            {tasks.length > 0 && (
              <div className="mt-3">
                <TaskList tasks={tasks} showLinks={false} />
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card title="Aktiviteter">
            <ActivityForm contactId={contact.id} />
          </Card>
          <Timeline items={timeline} userId={user.id} role={workspace.role} back={`/kunder/${contact.id}`} />
        </div>
      </div>
    </div>
  );
}
