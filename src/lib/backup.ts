import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Alle firmaets data som ét JSON-dokument (sikkerhedskopi). Hemmeligheder udelades:
 * adgangskoder, adgangsnøgler til Facebook og hemmelige links (tokens).
 */
export async function exportWorkspace(workspaceId: string) {
  const byWs = <T extends { workspaceId: unknown }>(table: T) => eq(table.workspaceId as never, workspaceId);
  const [workspace] = await db
    .select({
      name: schema.workspaces.name,
      cvr: schema.workspaces.cvr,
      address: schema.workspaces.address,
      email: schema.workspaces.email,
      phone: schema.workspaces.phone,
      website: schema.workspaces.website,
      createdAt: schema.workspaces.createdAt,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  const [
    members,
    companies,
    contacts,
    pipelines,
    stages,
    deals,
    tasks,
    activities,
    customFields,
    quotes,
    services,
    vehicles,
    bookings,
    timeEntries,
    retainers,
    projects,
    templates,
    conversations,
  ] = await Promise.all([
    db
      .select({ name: schema.users.name, email: schema.users.email, role: schema.memberships.role })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.workspaceId, workspaceId)),
    db.select().from(schema.companies).where(byWs(schema.companies)),
    db.select().from(schema.contacts).where(byWs(schema.contacts)),
    db.select().from(schema.pipelines).where(byWs(schema.pipelines)),
    db.select().from(schema.pipelineStages).where(byWs(schema.pipelineStages)),
    db.select().from(schema.deals).where(byWs(schema.deals)),
    db.select().from(schema.tasks).where(byWs(schema.tasks)),
    db.select().from(schema.activities).where(byWs(schema.activities)),
    db.select().from(schema.customFields).where(byWs(schema.customFields)),
    db.select().from(schema.quotes).where(byWs(schema.quotes)),
    db.select().from(schema.services).where(byWs(schema.services)),
    db.select().from(schema.vehicles).where(byWs(schema.vehicles)),
    db.select().from(schema.bookings).where(byWs(schema.bookings)),
    db.select().from(schema.timeEntries).where(byWs(schema.timeEntries)),
    db.select().from(schema.retainers).where(byWs(schema.retainers)),
    db.select().from(schema.projects).where(byWs(schema.projects)),
    db.select().from(schema.projectTemplates).where(byWs(schema.projectTemplates)),
    db.select().from(schema.conversations).where(byWs(schema.conversations)),
  ]);
  const quoteLines = quotes.length
    ? await db
        .select()
        .from(schema.quoteLines)
        .where(
          inArray(
            schema.quoteLines.quoteId,
            quotes.map((q) => q.id),
          ),
        )
    : [];
  const messages = conversations.length
    ? await db
        .select()
        .from(schema.messages)
        .where(
          inArray(
            schema.messages.conversationId,
            conversations.map((c) => c.id),
          ),
        )
    : [];

  // Fjern hemmelige links og IP-spor.
  const strip = <T extends Record<string, unknown>>(rows: T[], keys: string[]) =>
    rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))));

  return {
    udtrukket: new Date().toISOString(),
    firma: workspace,
    medlemmer: members,
    virksomheder: strip(companies, ["reportToken"]),
    kontakter: contacts,
    pipelines,
    faser: stages,
    deals,
    opgaver: tasks,
    aktiviteter: activities,
    egneFelter: customFields,
    tilbud: strip(quotes, ["token", "acceptedIpHash"]),
    tilbudslinjer: quoteLines,
    ydelser: services,
    biler: vehicles,
    bookinger: strip(bookings, ["token", "ipHash"]),
    tidsregistreringer: timeEntries,
    retainers,
    projekter: projects,
    skabeloner: templates,
    samtaler: conversations,
    beskeder: messages,
  };
}
