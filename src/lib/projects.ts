import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { TemplateItem } from "@/db/schema";
import { isUuid } from "./validation";

/** Projekter med kunde og fremdrift (udførte/alle opgaver). */
export async function getProjects(
  workspaceId: string,
  filter: { status?: "ACTIVE" | "DONE"; companyId?: string } = {},
) {
  return db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      status: schema.projects.status,
      dueDate: schema.projects.dueDate,
      companyId: schema.projects.companyId,
      companyName: schema.companies.name,
      ownerName: schema.users.name,
      total: sql<number>`(select count(*)::int from ${schema.tasks} t where t.project_id = ${schema.projects.id})`,
      done: sql<number>`(select count(*)::int from ${schema.tasks} t where t.project_id = ${schema.projects.id} and t.completed_at is not null)`,
    })
    .from(schema.projects)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.projects.companyId))
    .leftJoin(schema.users, eq(schema.users.id, schema.projects.ownerId))
    .where(
      and(
        eq(schema.projects.workspaceId, workspaceId),
        filter.status ? eq(schema.projects.status, filter.status) : undefined,
        filter.companyId ? eq(schema.projects.companyId, filter.companyId) : undefined,
      ),
    )
    .orderBy(
      asc(schema.projects.status),
      sql`${schema.projects.dueDate} asc nulls last`,
      desc(schema.projects.createdAt),
    )
    .limit(300);
}

export type ProjectRow = Awaited<ReturnType<typeof getProjects>>[number];

export async function getProject(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.workspaceId, workspaceId), eq(schema.projects.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getTemplates(workspaceId: string) {
  return db
    .select()
    .from(schema.projectTemplates)
    .where(eq(schema.projectTemplates.workspaceId, workspaceId))
    .orderBy(asc(schema.projectTemplates.name));
}

export async function getTemplate(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.projectTemplates)
    .where(and(eq(schema.projectTemplates.workspaceId, workspaceId), eq(schema.projectTemplates.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * Læser skabelonens opgaver fra tekst – én pr. linje, evt. med antal dage efter start:
 * "Kickoff-møde | 0", "Første udkast | 7". Uden tal = dag 0.
 */
export function parseTemplateItems(text: string): TemplateItem[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((line) => {
      const m = /^(.*?)\s*\|\s*(-?\d{1,3})\s*$/.exec(line);
      const title = (m ? m[1] : line).trim().slice(0, 300);
      return { title, offsetDays: m ? Math.max(0, Math.min(365, Number(m[2]))) : 0 };
    })
    .filter((i) => i.title.length > 0);
}

export function templateItemsToText(items: TemplateItem[]) {
  return items.map((i) => (i.offsetDays ? `${i.title} | ${i.offsetDays}` : i.title)).join("\n");
}

/** Standardskabeloner, som et firma kan starte med. */
export const STARTER_TEMPLATES: { name: string; items: TemplateItem[] }[] = [
  {
    name: "Onboarding af ny kunde",
    items: [
      { title: "Velkomstmail og opstartsmøde", offsetDays: 0 },
      { title: "Få adgang til Meta Business, Google Analytics og hjemmeside", offsetDays: 2 },
      { title: "Gennemgå mål, målgruppe og budget", offsetDays: 3 },
      { title: "Lav plan for den første måned", offsetDays: 5 },
      { title: "Første opfølgning med kunden", offsetDays: 14 },
    ],
  },
  {
    name: "Månedlig annonce-kampagne",
    items: [
      { title: "Brief og budskab på plads", offsetDays: 0 },
      { title: "Tekster og billeder klar", offsetDays: 3 },
      { title: "Kunden godkender", offsetDays: 5 },
      { title: "Kampagnen går live", offsetDays: 7 },
      { title: "Tjek resultater og justér", offsetDays: 14 },
    ],
  },
];
