import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateDeal } from "@/app/actions/deals";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getCustomFields } from "@/lib/custom-fields";
import { getCompanyOptions, getContactOptions, getDeal, getMemberOptions } from "@/lib/crm";
import { getPipelines } from "@/lib/pipelines";
import { DealForm } from "../../deal-form";

export const metadata: Metadata = { title: "Redigér deal" };

export default async function EditDealPage({ params }: PageProps<"/pipeline/[id]/rediger">) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  const customFields = await getCustomFields(workspace.id, "DEAL");
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();
  const [contacts, companies, members, pipelines] = await Promise.all([
    getContactOptions(workspace.id),
    getCompanyOptions(workspace.id),
    getMemberOptions(workspace.id),
    getPipelines(workspace.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Redigér ${deal.title}`} back={{ href: `/pipeline/${id}`, label: deal.title }} />
      <Card>
        <DealForm
          customFields={customFields}
          action={updateDeal.bind(null, id)}
          initial={deal}
          contacts={contacts}
          companies={companies}
          members={members}
          pipelines={pipelines}
          submitLabel="Gem ændringer"
          cancelHref={`/pipeline/${id}`}
        />
      </Card>
    </div>
  );
}
