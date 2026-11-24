import type { Metadata } from "next";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { googleConfigured } from "@/lib/lead-sources/google";
import { getProspectLists, getSearchUsage } from "@/lib/prospects";
import { LeadTabs } from "../lead-forms";
import { GoogleGuide } from "../setup-guides";
import { GoogleSearch } from "./google-search";

export const metadata: Metadata = { title: "Søg i Google Maps" };

export default async function GoogleLeadsPage() {
  const { workspace } = await requireWorkspace();
  const [lists, usage] = await Promise.all([getProspectLists(workspace.id), getSearchUsage(workspace.id)]);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Søg i Google Maps"
        subtitle="Find lokale firmaer med telefon, hjemmeside og anmeldelser – fx til hjemmesider, annoncer eller firmabiler."
        back={{ href: "/leads", label: "Find leads" }}
      />
      <LeadTabs />
      {googleConfigured() ? (
        <GoogleSearch lists={lists.map((l) => ({ id: l.id, name: l.name }))} initialUsage={usage} />
      ) : (
        <Card title="Google Maps-søgning er ikke sat op endnu" description="Det tager ca. 10 minutter. Følg trinene:">
          <GoogleGuide />
        </Card>
      )}
    </div>
  );
}
