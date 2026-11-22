import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { formatPlate } from "@/lib/booking";
import { getModules } from "@/lib/modules";
import { likePattern } from "@/lib/validation";

export type SearchHit = { type: string; label: string; detail: string | null; href: string };

/** Søgning på tværs af det aktive firma (til søgefeltet / Ctrl+K). */
export async function GET(request: NextRequest) {
  const { workspace } = await requireWorkspace();
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return Response.json({ hits: [] });
  const p = likePattern(q);
  const plate = q.toUpperCase().replace(/[^A-Z0-9ÆØÅ]/g, "");
  const modules = await getModules(workspace.id);

  const [contacts, companies, deals, vehicles, projects] = await Promise.all([
    db
      .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, workspace.id),
          or(ilike(schema.contacts.name, p), ilike(schema.contacts.email, p), ilike(schema.contacts.phone, p)),
        ),
      )
      .orderBy(desc(schema.contacts.updatedAt))
      .limit(6),
    db
      .select({ id: schema.companies.id, name: schema.companies.name, cvr: schema.companies.cvr })
      .from(schema.companies)
      .where(
        and(
          eq(schema.companies.workspaceId, workspace.id),
          or(ilike(schema.companies.name, p), ilike(schema.companies.cvr, p)),
        ),
      )
      .limit(5),
    db
      .select({ id: schema.deals.id, title: schema.deals.title, value: schema.deals.value })
      .from(schema.deals)
      .where(and(eq(schema.deals.workspaceId, workspace.id), ilike(schema.deals.title, p)))
      .orderBy(desc(schema.deals.updatedAt))
      .limit(5),
    modules.booking && plate.length >= 2
      ? db
          .select({
            id: schema.vehicles.id,
            plate: schema.vehicles.plate,
            make: schema.vehicles.make,
            model: schema.vehicles.model,
            owner: schema.contacts.name,
          })
          .from(schema.vehicles)
          .innerJoin(schema.contacts, eq(schema.contacts.id, schema.vehicles.contactId))
          .where(and(eq(schema.vehicles.workspaceId, workspace.id), ilike(schema.vehicles.plate, likePattern(plate))))
          .limit(5)
      : [],
    modules.agency
      ? db
          .select({ id: schema.projects.id, name: schema.projects.name, status: schema.projects.status })
          .from(schema.projects)
          .where(and(eq(schema.projects.workspaceId, workspace.id), ilike(schema.projects.name, p)))
          .orderBy(sql`${schema.projects.status} asc`)
          .limit(5)
      : [],
  ]);

  const hits: SearchHit[] = [
    ...contacts.map((c) => ({
      type: "Kontakt",
      label: c.name,
      detail: [c.email, c.phone].filter(Boolean).join(" · ") || null,
      href: `/kunder/${c.id}`,
    })),
    ...companies.map((c) => ({ type: "Virksomhed", label: c.name, detail: c.cvr ? `CVR ${c.cvr}` : null, href: `/virksomheder/${c.id}` })),
    ...deals.map((d) => ({
      type: "Deal",
      label: d.title,
      detail: `${d.value.toLocaleString("da-DK")} kr.`,
      href: `/pipeline/${d.id}`,
    })),
    ...vehicles.map((v) => ({
      type: "Bil",
      label: formatPlate(v.plate) || "Bil",
      detail: [[v.make, v.model].filter(Boolean).join(" "), v.owner].filter(Boolean).join(" · "),
      href: `/biler/${v.id}`,
    })),
    ...projects.map((pr) => ({
      type: "Projekt",
      label: pr.name,
      detail: pr.status === "DONE" ? "Afsluttet" : "Aktivt",
      href: `/projekter/${pr.id}`,
    })),
  ];
  return Response.json({ hits });
}
