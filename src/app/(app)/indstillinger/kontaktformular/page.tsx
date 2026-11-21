import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { deleteLeadForm, toggleLeadForm } from "@/app/actions/lead-forms";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/display";
import { Button, Card, ConfirmButton } from "@/components/ui";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { getMemberOptions } from "@/lib/crm";
import { formatDateTime } from "@/lib/labels";
import { hasRole } from "@/lib/roles";
import { getAppUrl } from "@/lib/url";
import { CreateLeadFormForm } from "./create-form";

export const metadata: Metadata = { title: "Kontaktformular" };

function embedSnippet(endpoint: string) {
  return `<form action="${endpoint}" method="POST">
  <input name="name" placeholder="Navn" required>
  <input name="email" type="email" placeholder="E-mail">
  <input name="phone" type="tel" placeholder="Telefon">
  <input name="company" placeholder="Firma (valgfrit)">
  <textarea name="message" placeholder="Besked"></textarea>
  <!-- Spam-fælde: skal være tom og skjult -->
  <input name="_hp" tabindex="-1" autocomplete="off" style="display:none">
  <input type="hidden" name="_page">
  <button type="submit">Send</button>
</form>
<script>
  document.querySelectorAll('input[name="_page"]').forEach(function (el) { el.value = location.href; });
</script>`;
}

export default async function LeadFormsPage() {
  const { user, workspace } = await requireWorkspace();
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const appUrl = await getAppUrl();

  const [forms, members, submissions] = await Promise.all([
    db
      .select()
      .from(schema.leadForms)
      .where(eq(schema.leadForms.workspaceId, workspace.id))
      .orderBy(desc(schema.leadForms.createdAt)),
    getMemberOptions(workspace.id),
    db
      .select({
        id: schema.leadSubmissions.id,
        createdAt: schema.leadSubmissions.createdAt,
        contactId: schema.leadSubmissions.contactId,
        contactName: schema.contacts.name,
        formName: schema.leadForms.name,
      })
      .from(schema.leadSubmissions)
      .leftJoin(schema.contacts, eq(schema.contacts.id, schema.leadSubmissions.contactId))
      .leftJoin(schema.leadForms, eq(schema.leadForms.id, schema.leadSubmissions.formId))
      .where(and(eq(schema.leadSubmissions.workspaceId, workspace.id)))
      .orderBy(desc(schema.leadSubmissions.createdAt))
      .limit(20),
  ]);
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Sæt en kontaktformular ind på dine hjemmesider. Hver henvendelse bliver automatisk til en kontakt (eller
        tilføjes til en eksisterende med samme e-mail/telefon), og den ansvarlige får en opfølgningsopgave.
      </p>

      {forms.map((f) => {
        const endpoint = `${appUrl}/api/leads/${f.key}`;
        const snippet = embedSnippet(endpoint);
        return (
          <Card key={f.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  {f.name}
                  {f.active ? (
                    <Badge className="bg-emerald-50 text-emerald-800">Aktiv</Badge>
                  ) : (
                    <Badge>Slået fra</Badge>
                  )}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tildeles: {f.assigneeId ? (memberName.get(f.assigneeId) ?? "–") : "Ingen"} ·{" "}
                  {f.createDeal ? "Opretter deal" : "Opretter ikke deal"}
                  {f.redirectUrl && <> · Takkeside: {f.redirectUrl}</>}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <form action={toggleLeadForm}>
                    <input type="hidden" name="id" value={f.id} />
                    <Button variant="secondary" type="submit">
                      {f.active ? "Slå fra" : "Slå til"}
                    </Button>
                  </form>
                  <form action={deleteLeadForm}>
                    <input type="hidden" name="id" value={f.id} />
                    <ConfirmButton message={`Slet formularen "${f.name}"? Formularer på hjemmesiden holder op med at virke.`}>
                      Slet
                    </ConfirmButton>
                  </form>
                </div>
              )}
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">Kode til hjemmesiden</p>
                <CopyButton text={snippet} />
              </div>
              <pre className="max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                <code>{snippet}</code>
              </pre>
              <p className="text-xs text-slate-500">
                Adresse til udviklere (POST, form-data eller JSON): <code className="break-all">{endpoint}</code>
              </p>
            </div>
          </Card>
        );
      })}

      {isAdmin ? (
        <Card title="Ny kontaktformular">
          <CreateLeadFormForm members={members} defaultAssigneeId={user.id} />
        </Card>
      ) : (
        forms.length === 0 && <p className="text-sm text-slate-500">Bed en administrator om at oprette en formular.</p>
      )}

      {submissions.length > 0 && (
        <Card title="Seneste henvendelser">
          <ul className="divide-y divide-slate-100">
            {submissions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                {s.contactId ? (
                  <Link href={`/kunder/${s.contactId}`} className="font-medium underline">
                    {s.contactName}
                  </Link>
                ) : (
                  <span className="text-slate-500">Slettet kontakt</span>
                )}
                <span className="text-slate-500">
                  {s.formName ?? "Slettet formular"} · {formatDateTime(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
