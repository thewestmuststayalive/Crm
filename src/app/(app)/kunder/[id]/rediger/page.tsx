import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateContact } from "@/app/actions/contacts";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getCompanyOptions, getContact, getMemberOptions } from "@/lib/crm";
import { ContactForm } from "../../contact-form";

export const metadata: Metadata = { title: "Redigér kontakt" };

export default async function EditContactPage({ params }: PageProps<"/kunder/[id]/rediger">) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  const contact = await getContact(workspace.id, id);
  if (!contact) notFound();
  const [companies, members] = await Promise.all([getCompanyOptions(workspace.id), getMemberOptions(workspace.id)]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Redigér ${contact.name}`} back={{ href: `/kunder/${id}`, label: contact.name }} />
      <Card>
        <ContactForm
          action={updateContact.bind(null, id)}
          initial={contact}
          companies={companies}
          members={members}
          submitLabel="Gem ændringer"
          cancelHref={`/kunder/${id}`}
        />
      </Card>
    </div>
  );
}
