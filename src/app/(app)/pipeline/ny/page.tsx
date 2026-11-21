import type { Metadata } from "next";
import { createDeal } from "@/app/actions/deals";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getCompanyOptions, getContactOptions, getMemberOptions } from "@/lib/crm";
import { getPipelines } from "@/lib/pipelines";
import { isUuid } from "@/lib/validation";
import { DealForm } from "../deal-form";

export const metadata: Metadata = { title: "Ny deal" };

export default async function NewDealPage({ searchParams }: PageProps<"/pipeline/ny">) {
  const { user, workspace } = await requireWorkspace();
  const { kontakt, virksomhed, pipeline } = await searchParams;
  const [contacts, companies, members, pipelines] = await Promise.all([
    getContactOptions(workspace.id),
    getCompanyOptions(workspace.id),
    getMemberOptions(workspace.id),
    getPipelines(workspace.id),
  ]);
  const chosen = pipelines.find((p) => p.id === pipeline) ?? pipelines[0];
  const entryStageId = (chosen.stages.find((s) => s.kind === "OPEN") ?? chosen.stages[0])?.id;
  const contactId = isUuid(kontakt) && contacts.some((c) => c.id === kontakt) ? kontakt : null;
  const companyId = isUuid(virksomhed) && companies.some((c) => c.id === virksomhed) ? virksomhed : null;
  const back = contactId ? `/kunder/${contactId}` : companyId ? `/virksomheder/${companyId}` : "/pipeline";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Ny deal" back={{ href: back, label: "Tilbage" }} />
      <Card>
        <DealForm
          action={createDeal}
          initial={{ ownerId: user.id, contactId, companyId, stageId: entryStageId }}
          pipelines={pipelines}
          contacts={contacts}
          companies={companies}
          members={members}
          submitLabel="Opret deal"
          cancelHref={back}
        />
      </Card>
    </div>
  );
}
