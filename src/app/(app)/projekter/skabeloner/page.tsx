import type { Metadata } from "next";
import { addStarterTemplates, deleteTemplate } from "@/app/actions/projects";
import { PageHeader } from "@/components/display";
import { Button, Card, ConfirmButton } from "@/components/ui";
import { requireAgencyModule } from "@/lib/modules";
import { getTemplates, templateItemsToText } from "@/lib/projects";
import { hasRole } from "@/lib/roles";
import { ProjectTabs, TemplateForm } from "../project-forms";

export const metadata: Metadata = { title: "Skabeloner" };

export default async function TemplatesPage() {
  const { workspace } = await requireAgencyModule();
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const templates = await getTemplates(workspace.id);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Skabeloner" subtitle="Faste opgavelister, der oprettes med ét klik på nye projekter." />
      <ProjectTabs />

      {templates.length === 0 && isAdmin && (
        <Card
          title="Kom hurtigt i gang"
          description="Læg to færdige skabeloner ind: onboarding af ny kunde og månedlig annonce-kampagne."
        >
          <form action={addStarterTemplates}>
            <Button type="submit" variant="secondary">
              Tilføj startskabeloner
            </Button>
          </form>
        </Card>
      )}

      <ul className="space-y-4" aria-label="Skabeloner">
        {templates.map((t) => (
          <li key={t.id} aria-label={`Skabelon ${t.name}`}>
            <Card title={t.name} description={`${t.items.length} opgaver`}>
              {isAdmin ? (
                <div className="space-y-3">
                  <TemplateForm initial={{ id: t.id, name: t.name, items: templateItemsToText(t.items) }} />
                  <form action={deleteTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmButton className="px-2.5 py-1 text-xs" message={`Slet skabelonen "${t.name}"?`}>
                      Slet skabelon
                    </ConfirmButton>
                  </form>
                </div>
              ) : (
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  {t.items.map((i, n) => (
                    <li key={n}>
                      {i.title}
                      {i.offsetDays > 0 && <span className="text-slate-400"> · dag {i.offsetDays}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </li>
        ))}
      </ul>

      {isAdmin && (
        <Card title="Ny skabelon">
          <TemplateForm />
        </Card>
      )}
    </div>
  );
}
