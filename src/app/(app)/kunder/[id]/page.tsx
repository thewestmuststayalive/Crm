import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteContact } from "@/app/actions/contacts";
import { addVehicle } from "@/app/actions/bookings";
import { deletePersonCompletely, setEmailOptOut } from "@/app/actions/gdpr";
import { VehicleForm } from "@/components/vehicle-form";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_STYLES,
  formatPlate,
  getBookingsFor,
  getVehiclesFor,
} from "@/lib/booking";
import { formatWhen } from "@/lib/booking-flow";
import { getModules } from "@/lib/modules";
import { ActivityForm } from "@/components/activity-form";
import { Badge, DetailRow, PageHeader, SourceBadge, StatusBadge } from "@/components/display";
import { CreateInvoiceButton, InvoiceList } from "@/components/invoice-widgets";
import { buttonClass } from "@/components/styles";
import { Timeline } from "@/components/timeline";
import { Card, ConfirmButton, SubmitButton } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getCustomFields } from "@/lib/custom-fields";
import { CustomFieldRows } from "@/components/custom-field-rows";
import { DealsCard } from "@/components/deals-card";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { getCompany, getContact, getDealsFor, getMemberOptions, getTasks, getTimeline, getUserName } from "@/lib/crm";
import { formatDate, formatDateTime } from "@/lib/labels";
import { hasRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Kontakt" };

export default async function ContactPage({ params }: PageProps<"/kunder/[id]">) {
  const { id } = await params;
  const { user, workspace } = await requireWorkspace();
  const [contact, customFields, modules] = await Promise.all([
    getContact(workspace.id, id),
    getCustomFields(workspace.id, "CONTACT"),
    getModules(workspace.id),
  ]);
  if (!contact) notFound();

  const [company, ownerName, timeline, deals, tasks, members, vehicles, bookings] = await Promise.all([
    contact.companyId ? getCompany(workspace.id, contact.companyId) : null,
    getUserName(contact.ownerId),
    getTimeline(workspace.id, { contactId: contact.id }),
    getDealsFor(workspace.id, { contactId: contact.id }),
    getTasks(workspace.id, { contactId: contact.id }),
    getMemberOptions(workspace.id),
    modules.booking ? getVehiclesFor(workspace.id, [contact.id]) : [],
    modules.booking ? getBookingsFor(workspace.id, { contactId: contact.id }) : [],
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
            <CreateInvoiceButton fields={{ contactId: contact.id }} />
            <Link href={`/kunder/${contact.id}/rediger`} className={buttonClass("secondary")}>
              Redigér
            </Link>
            {hasRole(workspace.role, "ADMIN") && (
              <form action={deleteContact}>
                <input type="hidden" name="id" value={contact.id} />
                <ConfirmButton message={`Slet ${contact.name} og alle noter? Det kan ikke fortrydes.`}>
                  Slet
                </ConfirmButton>
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
                {contact.emailOptOutAt && (
                  <Badge className="ml-2 bg-amber-50 text-amber-800">Ønsker ikke e-mails</Badge>
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
              <CustomFieldRows fields={customFields} values={contact.custom} />
              <DetailRow label="Oprettet">{formatDateTime(contact.createdAt)}</DetailRow>
              <DetailRow label="Opdateret">{formatDateTime(contact.updatedAt)}</DetailRow>
            </dl>
          </Card>
          {modules.booking && (
            <>
              <Card title="Biler">
                {vehicles.length > 0 && (
                  <ul className="mb-4 divide-y divide-slate-100" aria-label="Biler">
                    {vehicles.map((v) => (
                      <li key={v.id}>
                        <Link
                          href={`/biler/${v.id}`}
                          className="flex items-center gap-3 py-2 text-sm hover:bg-slate-50"
                        >
                          {v.plate && (
                            <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-semibold">
                              {formatPlate(v.plate)}
                            </span>
                          )}
                          <span className="text-slate-700">
                            {[v.make, v.model, v.color].filter(Boolean).join(" · ") || "Bil"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-brand-800">Tilføj bil</summary>
                  <div className="mt-3">
                    <VehicleForm idPrefix="v-new" action={addVehicle.bind(null, contact.id)} submitLabel="Tilføj bil" />
                  </div>
                </details>
              </Card>
              <Card title="Bookinger">
                {bookings.length > 0 && (
                  <ul className="mb-3 divide-y divide-slate-100" aria-label="Bookinger">
                    {bookings.slice(0, 10).map((b) => (
                      <li key={b.id}>
                        <Link
                          href={`/kalender/${b.id}`}
                          className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-slate-50"
                        >
                          <span>
                            <span className="block font-medium text-slate-900">{b.serviceName}</span>
                            <span className="text-xs text-slate-500">{formatWhen(b.startsAt)}</span>
                          </span>
                          <Badge className={BOOKING_STATUS_STYLES[b.status]}>{BOOKING_STATUS_LABELS[b.status]}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`/kalender/ny?kontakt=${contact.id}`} className={buttonClass("secondary")}>
                  Ny booking
                </Link>
              </Card>
            </>
          )}
          <DealsCard deals={deals} newHref={`/pipeline/ny?kontakt=${contact.id}`} />
          <Card title="Fakturaer">
            <InvoiceList workspaceId={workspace.id} filter={{ contactId: contact.id }} />
          </Card>
          <Card title="Opgaver">
            <TaskForm members={members} defaultAssigneeId={user.id} contactId={contact.id} />
            {tasks.length > 0 && (
              <div className="mt-3">
                <TaskList tasks={tasks} showLinks={false} />
              </div>
            )}
          </Card>
          <Card title="Persondata">
            <div className="space-y-3 text-sm">
              <form action={setEmailOptOut}>
                <input type="hidden" name="id" value={contact.id} />
                <input type="hidden" name="optOut" value={contact.emailOptOutAt ? "0" : "1"} />
                {contact.emailOptOutAt && (
                  <p className="mb-2 text-slate-600">
                    Har frabedt sig e-mails den {formatDate(contact.emailOptOutAt)}.
                  </p>
                )}
                <SubmitButton variant="secondary" pendingText="Gemmer…">
                  {contact.emailOptOutAt ? "Fjern markering: ønsker ikke e-mails" : "Markér: ønsker ikke e-mails"}
                </SubmitButton>
              </form>
              <a href={`/kunder/${contact.id}/persondata`} className={buttonClass("secondary")} download>
                Eksportér data
              </a>
              {hasRole(workspace.role, "ADMIN") && (
                <form action={deletePersonCompletely}>
                  <input type="hidden" name="id" value={contact.id} />
                  <ConfirmButton
                    message={`Slet ${contact.name} og ALLE data om personen: noter, opgaver, beskeder, henvendelser og private deals med tilbud? Det kan ikke fortrydes.`}
                  >
                    Slet alle data om personen
                  </ConfirmButton>
                </form>
              )}
            </div>
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
