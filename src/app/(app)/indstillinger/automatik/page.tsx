import type { Metadata } from "next";
import { saveAutomation } from "@/app/actions/automations";
import { Button, Card, Select } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { AUTOMATIONS, getRules } from "@/lib/automations";
import { formatDateTime } from "@/lib/labels";
import { hasRole } from "@/lib/roles";
import { RunNowButton } from "./run-now";

export const metadata: Metadata = { title: "Automatik" };

export default async function AutomationPage() {
  const { workspace } = await requireWorkspace();
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const rules = await getRules(workspace.id);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Kundespor holder øje med leads og deals, der er ved at blive glemt, og opretter en opgave til den ansvarlige.
        Reglerne kører hver morgen. Der oprettes aldrig en ny opgave, hvis der allerede er en åben.
      </p>

      {rules.map((rule) => {
        const def = AUTOMATIONS[rule.type];
        return (
          <Card key={rule.type} title={def.title} description={def.description(rule.days)}>
            {isAdmin ? (
              <form action={saveAutomation} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="type" value={rule.type} />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="enabled" defaultChecked={rule.enabled} className="h-4 w-4" />
                  Slået til
                </label>
                {def.dayOptions.length > 1 && (
                  <>
                    <label htmlFor={`days-${rule.type}`} className="text-sm text-slate-700">
                      Efter
                    </label>
                    <Select id={`days-${rule.type}`} name="days" defaultValue={String(rule.days)}>
                      {def.dayOptions.map((d) => (
                        <option key={d} value={d}>
                          {d} {d === 1 ? "dag" : "dage"}
                        </option>
                      ))}
                    </Select>
                  </>
                )}
                <Button variant="secondary" type="submit">
                  Gem
                </Button>
              </form>
            ) : (
              <p className="text-sm text-slate-700">{rule.enabled ? "Slået til" : "Slået fra"}</p>
            )}
            {rule.lastRunAt && <p className="mt-2 text-xs text-slate-400">Sidst kørt {formatDateTime(rule.lastRunAt)}</p>}
          </Card>
        );
      })}

      {isAdmin && (
        <Card title="Kør nu" description="Reglerne kører automatisk hver morgen, men du kan også køre dem med det samme.">
          <RunNowButton />
        </Card>
      )}
    </div>
  );
}
