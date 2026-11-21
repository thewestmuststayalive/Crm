import type { Metadata } from "next";
import { createContact } from "@/app/actions/contacts";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getCustomFields } from "@/lib/custom-fields";
import { getCompanyOptions, getMemberOptions } from "@/lib/crm";
import { isUuid } from "@/lib/validation";
import { ContactForm } from "../contact-form";

export const metadata: Metadata = { title: "Ny kontakt" };

export default async function NewContactPage({ searchParams }: PageProps<"/kunder/ny">) {
  const { user, workspace } = await requireWorkspace();
  const customFields = await getCustomFields(workspace.id, "CONTACT");
  const { virksomhed } = await searchParams;
  const [companies, members] = await Promise.all([getCompanyOptions(workspace.id), getMemberOptions(workspace.id)]);
  const companyId = isUuid(virksomhed) && companies.some((c) => c.id === virksomhed) ? virksomhed : null;
  const back = companyId ? `/virksomheder/${companyId}` : "/kunder";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Ny kontakt" back={{ href: back, label: "Tilbage" }} />
      <Card>
        <ContactForm
          customFields={customFields}
          action={createContact}
          initial={{ ownerId: user.id, companyId }}
          companies={companies}
          members={members}
          submitLabel="Opret kontakt"
          cancelHref={back}
        />
      </Card>
    </div>
  );
}
