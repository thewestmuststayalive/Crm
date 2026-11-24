import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCompany } from "@/app/actions/companies";
import { ActivityForm } from "@/components/activity-form";
import { DetailRow, PageHeader, StatusBadge } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { Timeline } from "@/components/timeline";
import { Card, ConfirmButton } from "@/components/ui";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { getCustomFields } from "@/lib/custom-fields";
import { CustomFieldRows } from "@/components/custom-field-rows";
import { DealsCard } from "@/components/deals-card";
import { UsageBar } from "@/app/(app)/tid/time-components";
import { currentMonth, formatHM, formatMonth, monthRange } from "@/lib/duration";
import { getModules } from "@/lib/modules";
import { getCompanyRetainer, getEntries } from "@/lib/time-tracking";
import { getProjects } from "@/lib/projects";
import { ensureReportToken } from "@/lib/client-report";
import { shiftMonth } from "@/lib/duration";
import { hasRole } from "@/lib/roles";
import { getAppUrl } from "@/lib/url";
import { ReportControls } from "./report-card";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { getCompany, getDealsFor, getMemberOptions, getTasks, getTimeline, getUserName } from "@/lib/crm";

export const metadata: Metadata = { title: "Virksomhed" };

function websiteHref(website: string) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export default async function CompanyPage({ params }: PageProps<"/virksomheder/[id]">) {
  const { id } = await params;
  const { user, workspace } = await requireWorkspace();
  const [company, customFields, modules] = await Promise.all([
    getCompany(workspace.id, id),
    getCustomFields(workspace.id, "COMPANY"),
    getModules(workspace.id),
  ]);
  if (!company) notFound();

  const [contacts, ownerName] = await Promise.all([
    db
      .select({
        id: schema.contacts.id,
        name: schema.contacts.name,
        title: schema.contacts.title,
        email: schema.contacts.email,
        phone: schema.contacts.phone,
        status: schema.contacts.status,
      })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.workspaceId, workspace.id), eq(schema.contacts.companyId, company.id)))
      .orderBy(asc(schema.contacts.name)),
    getUserName(company.ownerId),
  ]);
  const agency = modules.agency;
  const month = currentMonth();
  const reportToken = agency ? await ensureReportToken(workspace.id, company.id) : null;
  const appUrl = agency ? await getAppUrl() : "";
  const [timeline, deals, tasks, members, retainer, monthEntries, projects] = await Promise.all([
    getTimeline(workspace.id, { companyId: company.id, contactIds: contacts.map((c) => c.id) }),
    getDealsFor(workspace.id, { companyId: company.id }),
    getTasks(workspace.id, { companyId: company.id }),
    getMemberOptions(workspace.id),
    agency ? getCompanyRetainer(workspace.id, company.id, month) : null,
    agency ? getEntries(workspace.id, monthRange(month).first, monthRange(month).last, { companyId: company.id }) : [],
    agency ? getProjects(workspace.id, { companyId: company.id }) : [],
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={company.name}
        back={{ href: "/virksomheder", label: "Virksomheder" }}
        subtitle={company.cvr ? `CVR ${company.cvr}` : undefined}
        actions={
          <>
            <Link href={`/virksomheder/${company.id}/rediger`} className={buttonClass("secondary")}>
              Redigér
            </Link>
            {hasRole(workspace.role, "ADMIN") && (
              <form action={deleteCompany}>
                <input type="hidden" name="id" value={company.id} />
                <ConfirmButton
                  message={`Slet ${company.name}? Kontaktpersonerne bevares, men virksomhedens egne noter slettes.`}
                >
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
                {company.email && (
                  <a href={`mailto:${company.email}`} className="underline">
                    {company.email}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Telefon">
                {company.phone && (
                  <a href={`tel:${company.phone}`} className="underline">
                    {company.phone}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Hjemmeside">
                {company.website && (
                  <a
                    href={websiteHref(company.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {company.website}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Adresse">{company.address}</DetailRow>
              <CustomFieldRows fields={customFields} values={company.custom} />
              <DetailRow label="Ansvarlig">{ownerName}</DetailRow>
            </dl>
          </Card>
          <Card title={`Kontaktpersoner (${contacts.length})`}>
            {contacts.length === 0 ? (
              <p className="text-sm text-slate-500">Ingen kontaktpersoner endnu.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link href={`/kunder/${c.id}`} className="block truncate text-sm font-medium hover:underline">
                        {c.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">{c.title ?? c.email ?? c.phone}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/kunder/ny?virksomhed=${company.id}`} className={buttonClass("secondary", "mt-3 w-full")}>
              Tilføj kontaktperson
            </Link>
          </Card>
          {agency && (
            <Card title={`Tid i ${formatMonth(month)}`}>
              <p className="text-sm text-slate-700">
                <span className="text-lg font-semibold text-slate-900">
                  {formatHM(monthEntries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0))}
                </span>{" "}
                fakturerbare timer
              </p>
              {retainer ? (
                <div className="mt-3 space-y-1">
                  <p className="text-sm text-slate-700">
                    {retainer.name}: {formatHM(retainer.used)} af {formatHM(retainer.monthlyMinutes)} ({retainer.pct} %)
                  </p>
                  <UsageBar pct={retainer.pct} label={`Retainer ${retainer.pct} % brugt`} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Ingen retainer på kunden.</p>
              )}
              <Link href="/tid/retainers" className="mt-3 inline-block text-sm text-brand-800 underline">
                Retainers
              </Link>
            </Card>
          )}
          {agency && (
            <Card title="Projekter">
              {projects.length > 0 && (
                <ul className="mb-3 divide-y divide-slate-100" aria-label="Projekter">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/projekter/${p.id}`}
                        className="flex justify-between gap-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <span
                          className={p.status === "DONE" ? "text-slate-400 line-through" : "font-medium text-slate-900"}
                        >
                          {p.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {p.done}/{p.total}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/projekter?kunde=${company.id}`} className="text-sm text-brand-800 underline">
                Nyt projekt
              </Link>
            </Card>
          )}
          {agency && reportToken && (
            <Card
              title="Månedsrapport"
              description="Tid, retainer, annoncer og udførte opgaver – som et link til kunden."
            >
              <ReportControls
                companyId={company.id}
                link={`${appUrl}/rapport/${reportToken}`}
                lastMonth={shiftMonth(month, -1)}
                lastMonthLabel={formatMonth(shiftMonth(month, -1))}
                isAdmin={hasRole(workspace.role, "ADMIN")}
                initial={{
                  enabled: company.reportEnabled,
                  email: company.reportEmail ?? "",
                  fallbackEmail: company.email,
                }}
              />
            </Card>
          )}
          <DealsCard deals={deals} newHref={`/pipeline/ny?virksomhed=${company.id}`} />
          <Card title="Opgaver">
            <TaskForm members={members} defaultAssigneeId={user.id} companyId={company.id} />
            {tasks.length > 0 && (
              <div className="mt-3">
                <TaskList tasks={tasks} showLinks={false} />
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card title="Aktiviteter" description="Noter på virksomheden og alle dens kontaktpersoner.">
            <ActivityForm companyId={company.id} />
          </Card>
          <Timeline
            items={timeline}
            userId={user.id}
            role={workspace.role}
            back={`/virksomheder/${company.id}`}
            showContact
          />
        </div>
      </div>
    </div>
  );
}
