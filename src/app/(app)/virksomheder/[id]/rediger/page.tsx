import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateCompany } from "@/app/actions/companies";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getCompany, getMemberOptions } from "@/lib/crm";
import { CompanyForm } from "../../company-form";

export const metadata: Metadata = { title: "Redigér virksomhed" };

export default async function EditCompanyPage({ params }: PageProps<"/virksomheder/[id]/rediger">) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  const company = await getCompany(workspace.id, id);
  if (!company) notFound();
  const members = await getMemberOptions(workspace.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Redigér ${company.name}`} back={{ href: `/virksomheder/${id}`, label: company.name }} />
      <Card>
        <CompanyForm
          action={updateCompany.bind(null, id)}
          initial={company}
          members={members}
          submitLabel="Gem ændringer"
          cancelHref={`/virksomheder/${id}`}
        />
      </Card>
    </div>
  );
}
