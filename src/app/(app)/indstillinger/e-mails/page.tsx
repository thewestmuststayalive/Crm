import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { EMAIL_TEXTS } from "@/lib/branding";
import { hasRole } from "@/lib/roles";
import { EmailTextsForm } from "./email-texts-form";

export const metadata: Metadata = { title: "E-mails" };

export default async function EmailTextsPage() {
  const { workspace } = await requireWorkspace();
  const [row] = await db
    .select({ texts: schema.workspaces.emailTexts })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.id))
    .limit(1);
  const fields = Object.entries(EMAIL_TEXTS).map(([key, def]) => ({
    key,
    label: def.label,
    placeholder: def.default,
    vars: [...def.vars],
    value: row?.texts?.[key] ?? "",
  }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Skriv jeres egne tekster i de e-mails, kunderne får. Lad et felt stå tomt for at bruge standardteksten (vist i
        feltet). Ord i krøllede parenteser, fx {"{tid}"}, bliver erstattet automatisk.
      </p>
      <Card title="Tekster i e-mails til kunder">
        {hasRole(workspace.role, "ADMIN") ? (
          <EmailTextsForm fields={fields} />
        ) : (
          <p className="text-sm text-slate-600">Kun administratorer kan ændre teksterne.</p>
        )}
      </Card>
    </div>
  );
}
