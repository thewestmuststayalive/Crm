import type { Metadata } from "next";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importér kunder" };

export default async function ImportPage() {
  const { workspace } = await requireWorkspace();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Importér kunder"
        subtitle={`Kontakterne importeres til ${workspace.name}. Kontakter, der allerede findes (samme e-mail eller telefon), springes over.`}
        back={{ href: "/kunder", label: "Kunder" }}
      />
      <Card>
        <ImportWizard />
      </Card>
    </div>
  );
}
