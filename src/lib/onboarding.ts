import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getModules } from "./modules";

export type OnboardingStep = { key: string; label: string; href: string; done: boolean };

/** Trinene i "Kom godt i gang" for et firma, og om de er klaret. */
export async function getOnboarding(workspaceId: string): Promise<OnboardingStep[]> {
  const modules = await getModules(workspaceId);
  const count = (table: string) =>
    sql<number>`(select count(*)::int from ${sql.raw(table)} t where t.workspace_id = ${workspaceId})`;
  const [row] = await db
    .select({
      contacts: count("contacts"),
      deals: count("deals"),
      members: count("memberships"),
      forms: count("lead_forms"),
      meta: count("meta_connections"),
      services: count("services"),
      projects: count("projects"),
      retainers: count("retainers"),
      cvr: schema.workspaces.cvr,
      address: schema.workspaces.address,
      logo: sql<boolean>`${schema.workspaces.logoData} is not null`,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  if (!row) return [];
  return [
    { key: "contact", label: "Tilføj din første kunde", href: "/kunder/ny", done: row.contacts > 0 },
    { key: "deal", label: "Opret en deal i pipelinen", href: "/pipeline/ny", done: row.deals > 0 },
    {
      key: "company",
      label: "Udfyld firmaoplysninger og logo",
      href: "/indstillinger",
      done: Boolean(row.cvr || row.address || row.logo),
    },
    { key: "team", label: "Inviter en kollega", href: "/indstillinger/medlemmer", done: row.members > 1 },
    {
      key: "form",
      label: "Sæt kontaktformularen på hjemmesiden",
      href: "/indstillinger/kontaktformular",
      done: row.forms > 0,
    },
    { key: "meta", label: "Forbind Facebook og Instagram", href: "/indstillinger/meta", done: row.meta > 0 },
    ...(modules.booking
      ? [
          {
            key: "booking",
            label: "Tilføj ydelser og del bookinglinket",
            href: "/indstillinger/booking",
            done: row.services > 0,
          },
        ]
      : []),
    ...(modules.agency
      ? [
          {
            key: "agency",
            label: "Opret et projekt eller en retainer",
            href: "/projekter",
            done: row.projects + row.retainers > 0,
          },
        ]
      : []),
  ];
}

export const onboardingCookie = (workspaceId: string) => `ks_onboarding_${workspaceId.slice(0, 8)}`;
