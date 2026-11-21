import type { Metadata } from "next";
import { createCompany } from "@/app/actions/companies";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getMemberOptions } from "@/lib/crm";
import { CompanyForm } from "../company-form";

export const metadata: Metadata = { title: "Ny virksomhed" };

export default async function NewCompanyPage() {
  const { user, workspace } = await requireWorkspace();
  const members = await getMemberOptions(workspace.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Ny virksomhed" back={{ href: "/virksomheder", label: "Virksomheder" }} />
      <Card>
        <CompanyForm
          action={createCompany}
          initial={{ ownerId: user.id }}
          members={members}
          submitLabel="Opret virksomhed"
          cancelHref="/virksomheder"
        />
      </Card>
    </div>
  );
}
