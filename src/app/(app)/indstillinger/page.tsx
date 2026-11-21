import type { Metadata } from "next";
import { saveModules } from "@/app/actions/booking-settings";
import { Button, Card } from "@/components/ui";
import { getModules } from "@/lib/modules";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";
import { requireWorkspace } from "@/lib/auth";
import { getResponseTargetSeconds } from "@/lib/waiting";
import { hasRole } from "@/lib/roles";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { QuoteSettingsForm } from "./quote-settings-form";
import { RenameWorkspaceForm } from "./rename-form";

export const metadata: Metadata = { title: "Firma" };

export default async function WorkspaceSettingsPage({ searchParams }: PageProps<"/indstillinger">) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const modules = await getModules(workspace.id);
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
      {typeof sp.besked === "string" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {sp.besked}
        </p>
      )}
      <Card title="Firmaoplysninger" description="Navnet vises i firmavælgeren og på tværs af Kundespor.">
        {canEdit ? (
          <RenameWorkspaceForm name={workspace.name} responseTargetMinutes={targetMinutes} />
        ) : (
          <p className="text-sm text-slate-700">{workspace.name}</p>
        )}
      </Card>
      <Card title="Moduler" description="Slå de dele til, som firmaet bruger. De vises kun i dette firma.">
        {canEdit ? (
          <form action={saveModules} className="space-y-3">
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" name="booking" defaultChecked={modules.booking} className="mt-0.5 h-4 w-4" />
              <span>
                <strong>Booking og biler</strong> – kalender, onlinebooking med link og QR-kode, biler på kundekortet
                (fx bilpleje og værksteder)
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" name="agency" disabled className="mt-0.5 h-4 w-4" />
              <span className="text-slate-500">
                <strong>Tid og projekter</strong> – tidsregistrering, retainers og projekter (fx bureauer). Kommer
                snart.
              </span>
            </label>
            <Button type="submit" variant="secondary">
              Gem moduler
            </Button>
          </form>
        ) : (
          <p className="text-sm text-slate-700">{modules.booking ? "Booking og biler" : "Ingen moduler slået til"}</p>
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
