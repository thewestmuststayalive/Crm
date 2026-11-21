import type { Metadata } from "next";
import { createDeal } from "@/app/actions/deals";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getCompanyOptions, getContactOptions, getMemberOptions } from "@/lib/crm";
import { isUuid } from "@/lib/validation";
import { DealForm } from "../deal-form";

export const metadata: Metadata = { title: "Ny deal" };

export default async function NewDealPage({ searchParams }: PageProps<"/pipeline/ny">) {
  const { user, workspace } = await requireWorkspace();
  const { kontakt, virksomhed } = await searchParams;
  const [contacts, companies, members] = await Promise.all([
    getContactOptions(workspace.id),
    getCompanyOptions(workspace.id),
    getMemberOptions(workspace.id),
  ]);
  const contactId = isUuid(kontakt) && contacts.some((c) => c.id === kontakt) ? kontakt : null;
  const companyId = isUuid(virksomhed) && companies.some((c) => c.id === virksomhed) ? virksomhed : null;
  const back = contactId ? `/kunder/${contactId}` : companyId ? `/virksomheder/${companyId}` : "/pipeline";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Ny deal" back={{ href: back, label: "Tilbage" }} />
      <Card>
        <DealForm
          action={createDeal}
          initial={{ ownerId: user.id, contactId, companyId }}
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
