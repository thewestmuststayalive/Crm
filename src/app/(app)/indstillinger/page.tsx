import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";
import { requireWorkspace } from "@/lib/auth";
import { getResponseTargetSeconds } from "@/lib/waiting";
import { hasRole } from "@/lib/roles";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { QuoteSettingsForm } from "./quote-settings-form";
import { RenameWorkspaceForm } from "./rename-form";

export const metadata: Metadata = { title: "Firma" };

export default async function WorkspaceSettingsPage() {
  const { workspace } = await requireWorkspace();
  const canEdit = hasRole(workspace.role, "ADMIN");
  const targetMinutes = (await getResponseTargetSeconds(workspace.id)) / 60;
  const [seller] = await db
    .select({
      cvr: schema.workspaces.cvr,
      address: schema.workspaces.address,
      email: schema.workspaces.email,
      phone: schema.workspaces.phone,
      website: schema.workspaces.website,
      quoteTerms: schema.workspaces.quoteTerms,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.id))
    .limit(1);

  return (
    <div className="space-y-6">
      <Card title="Firmaoplysninger" description="Navnet vises i firmavælgeren og på tværs af Kundespor.">
        {canEdit ? (
          <RenameWorkspaceForm name={workspace.name} responseTargetMinutes={targetMinutes} />
        ) : (
          <p className="text-sm text-slate-700">{workspace.name}</p>
        )}
      </Card>
      {canEdit && (
        <Card
          title="Oplysninger på tilbud"
          description="Vises øverst på dine tilbud. Standardbetingelserne sættes ind på nye tilbud."
        >
          <QuoteSettingsForm
            initial={{
              cvr: seller?.cvr ?? "",
              address: seller?.address ?? "",
              email: seller?.email ?? "",
              phone: seller?.phone ?? "",
              website: seller?.website ?? "",
              quoteTerms: seller?.quoteTerms ?? "",
            }}
          />
        </Card>
      )}
      <Card
        title="Tilføj et nyt firma"
        description="Hvert firma har sine egne kunder, deals og medlemmer. Du bliver ejer af det nye firma."
      >
        <CreateWorkspaceForm />
      </Card>
    </div>
  );
}
