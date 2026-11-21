import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { addCustomField, deleteCustomField, updateCustomField } from "@/app/actions/custom-fields";
import { Button, Card, ConfirmButton, Input, Select } from "@/components/ui";
import { db, schema } from "@/db";
import type { CustomFieldEntity, CustomFieldType } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { hasRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Egne felter" };

const ENTITIES: { key: CustomFieldEntity; title: string; example: string }[] = [
  { key: "CONTACT", title: "Kontaktpersoner", example: "Fx Fødselsdag, Nyhedsbrev, Foretrukken kontaktform" },
  { key: "COMPANY", title: "Virksomheder", example: "Fx Branche, Antal ansatte, Kundenummer" },
  { key: "DEAL", title: "Deals", example: "Fx Projekttype, Leveringsdato, Antal m²" },
];

const TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: "Tekst",
  NUMBER: "Tal",
  DATE: "Dato",
  SELECT: "Valgliste",
  CHECKBOX: "Afkrydsning (ja/nej)",
};

export default async function CustomFieldsPage({ searchParams }: PageProps<"/indstillinger/felter">) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const fields = await db
    .select()
    .from(schema.customFields)
    .where(eq(schema.customFields.workspaceId, workspace.id))
    .orderBy(asc(schema.customFields.position), asc(schema.customFields.createdAt));

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Tilføj de oplysninger, dit firma har brug for, som ikke er standard. Felterne vises i formularerne og på
        kundekortet, og de er kun synlige i {workspace.name}.
      </p>
      {typeof sp.besked === "string" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {sp.besked}
        </p>
      )}
      {typeof sp.fejlbesked === "string" && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {sp.fejlbesked}
        </p>
      )}

      {ENTITIES.map((entity) => {
        const list = fields.filter((f) => f.entity === entity.key);
        return (
          <Card key={entity.key} title={entity.title} description={entity.example}>
            <section aria-label={`Felter for ${entity.title}`} className="space-y-4">
              {list.length === 0 && <p className="text-sm text-slate-500">Ingen egne felter endnu.</p>}
              {list.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {list.map((f) => (
                    <li key={f.id} className="p-3" aria-label={`Felt ${f.label}`}>
                      {isAdmin ? (
                        <form action={updateCustomField} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={f.id} />
                          <label className="sr-only" htmlFor={`l-${f.id}`}>
                            Navn
                          </label>
                          <Input id={`l-${f.id}`} name="label" defaultValue={f.label} className="max-w-52" />
                          <span className="text-xs text-slate-500">{TYPE_LABELS[f.type]}</span>
                          {f.type === "SELECT" && (
                            <>
                              <label className="sr-only" htmlFor={`o-${f.id}`}>
                                Valgmuligheder
                              </label>
                              <Input id={`o-${f.id}`} name="options" defaultValue={f.options.join(", ")} className="max-w-72" />
                            </>
                          )}
                          <Button variant="secondary" type="submit" className="px-2.5 py-1 text-xs">
                            Gem
                          </Button>
                          <ConfirmButton
                            message={`Slet feltet "${f.label}"? Værdierne slettes fra alle ${entity.title.toLowerCase()}.`}
                            formAction={deleteCustomField}
                            className="px-2.5 py-1 text-xs"
                          >
                            Slet
                          </ConfirmButton>
                        </form>
                      ) : (
                        <span className="text-sm text-slate-800">
                          {f.label} <span className="text-slate-400">· {TYPE_LABELS[f.type]}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {isAdmin && (
                <form action={addCustomField} className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                  <input type="hidden" name="entity" value={entity.key} />
                  <label className="sr-only" htmlFor={`new-${entity.key}`}>
                    Nyt felt
                  </label>
                  <Input id={`new-${entity.key}`} name="label" placeholder="Navn på nyt felt" required />
                  <Select name="type" defaultValue="TEXT" aria-label="Felttype">
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Input name="options" placeholder="Valgmuligheder (kun valgliste), adskilt med komma" aria-label="Valgmuligheder" />
                  <Button type="submit">Tilføj felt</Button>
                </form>
              )}
            </section>
          </Card>
        );
      })}
    </div>
  );
}
