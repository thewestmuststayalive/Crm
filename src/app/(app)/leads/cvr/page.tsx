import type { Metadata } from "next";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { COMPANY_FORMS, COMPANY_SIZES, cvrConfigured } from "@/lib/lead-sources/cvr-search";
import { getProspectLists } from "@/lib/prospects";
import { LeadTabs } from "../lead-forms";
import { CvrGuide } from "../setup-guides";
import { CvrSearch } from "./cvr-search";

export const metadata: Metadata = { title: "Søg i CVR" };

export default async function CvrLeadsPage() {
  const { workspace } = await requireWorkspace();
  const lists = await getProspectLists(workspace.id);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Søg i CVR"
        subtitle="Find danske firmaer efter branche, område, størrelse – og nystartede firmaer, der mangler alt fra hjemmeside til bilpleje."
        back={{ href: "/leads", label: "Find leads" }}
      />
      <LeadTabs />
      {cvrConfigured() ? (
        <CvrSearch
          lists={lists.map((l) => ({ id: l.id, name: l.name }))}
          options={{
            forms: COMPANY_FORMS.map((f) => ({ code: f.code, label: f.label })),
            sizes: Object.entries(COMPANY_SIZES).map(([key, s]) => ({ key, label: s.label })),
          }}
        />
      ) : (
        <Card title="CVR-søgning er ikke sat op endnu" description="Adgangen er gratis. Følg trinene:">
          <CvrGuide />
        </Card>
      )}
    </div>
  );
}
