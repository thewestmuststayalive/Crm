import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { saveLeadRetention } from "@/app/actions/gdpr";
import { Button, Card, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { countStaleLeads, RETENTION_OPTIONS } from "@/lib/gdpr";
import { hasRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Persondata" };

export default async function PersonalDataPage({ searchParams }: PageProps<"/indstillinger/persondata">) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const [ws] = await db
    .select({ months: schema.workspaces.leadRetentionMonths })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.id))
    .limit(1);
  const months = ws?.months ?? 0;
  const previews = await Promise.all(RETENTION_OPTIONS.map(async (m) => [m, await countStaleLeads(workspace.id, m)]));

  return (
    <div className="space-y-6">
      {typeof sp.besked === "string" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {sp.besked}
        </p>
      )}

      <Card title="Indsigt og sletning" description="Når en person beder om sine data eller om at blive slettet.">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Indsigt:</strong> Åbn kontakten og vælg &quot;Eksportér data&quot;. Du får én fil med alt, hvad
            Kundespor har om personen: oplysninger, deals, tilbud, noter, opgaver, beskeder fra Messenger og Instagram
            og henvendelser fra kontaktformularen.
          </li>
          <li>
            <strong>Sletning:</strong> Vælg &quot;Slet alle data om personen&quot; (kun administratorer). Private deals
            og tilbud slettes også. Deals med en virksomhed bevares, men kobles fra personen.
          </li>
          <li>
            <strong>Ingen e-mails:</strong> Markér kontakten med &quot;Ønsker ikke e-mails&quot;. Personen kan også selv
            afmelde sig via linket i e-mails om anmeldelser.
          </li>
        </ul>
      </Card>

      <Card
        title="Automatisk sletning af gamle leads"
        description="Persondata må ikke gemmes længere end nødvendigt. Leads, der aldrig blev kunder, og som der ikke er sket noget med i en periode, kan slettes automatisk hver morgen."
      >
        {isAdmin ? (
          <form action={saveLeadRetention} className="flex flex-wrap items-center gap-3">
            <label htmlFor="retention" className="text-sm text-slate-700">
              Slet leads uden aktivitet efter
            </label>
            <Select id="retention" name="months" defaultValue={String(months)}>
              <option value="0">Slået fra</option>
              {RETENTION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} måneder
                </option>
              ))}
            </Select>
            <Button variant="secondary" type="submit">
              Gem
            </Button>
          </form>
        ) : (
          <p className="text-sm text-slate-700">{months ? `Efter ${months} måneder` : "Slået fra"}</p>
        )}
        <ul className="mt-4 space-y-1 text-xs text-slate-500" aria-label="Leads der ville blive slettet nu">
          {previews.map(([m, n]) => (
            <li key={m}>
              Med {m} måneder ville {n} {n === 1 ? "lead" : "leads"} blive slettet i dag.
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Kun kontakter med status Lead slettes. Kunder, leads med åbne deals eller opgaver, og leads der venter på
          svar, bliver aldrig slettet automatisk.
        </p>
      </Card>
    </div>
  );
}
