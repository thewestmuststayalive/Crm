import "server-only";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { brandedEmail, isEmailConfigured, sendEmail } from "./email";
import { todayIso } from "./labels";
import { getAppUrl } from "./url";

/**
 * Daglig e-mail til hver bruger (med e-mailnotifikationer slået til): hvem venter på svar,
 * dagens og forfaldne opgaver, og nye leads siden i går – på tværs af brugerens firmaer.
 * Der sendes kun, hvis der er noget at fortælle.
 */
export async function sendDailyDigests() {
  if (!isEmailConfigured()) return { sent: 0 };
  const appUrl = await getAppUrl();
  const today = todayIso();
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.emailNotifications, true));

  let sent = 0;
  for (const user of users) {
    const memberships = await db
      .select({ id: schema.workspaces.id, name: schema.workspaces.name })
      .from(schema.memberships)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
      .where(eq(schema.memberships.userId, user.id));
    if (memberships.length === 0) continue;
    const ids = memberships.map((m) => m.id);

    const [waitingRows, tasks, leadRows] = await Promise.all([
      db.execute<{ n: number }>(sql`
        select
          (select count(*) from contacts where workspace_id in ${ids} and awaiting_since is not null) +
          (select count(*) from conversations where workspace_id in ${ids} and awaiting_since is not null) as n`),
      db
        .select({ title: schema.tasks.title, dueDate: schema.tasks.dueDate })
        .from(schema.tasks)
        .where(
          and(
            inArray(schema.tasks.workspaceId, ids),
            eq(schema.tasks.assigneeId, user.id),
            isNull(schema.tasks.completedAt),
            lte(schema.tasks.dueDate, today),
          ),
        )
        .orderBy(schema.tasks.dueDate)
        .limit(50),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.contacts)
        .where(
          and(
            inArray(schema.contacts.workspaceId, ids),
            gte(schema.contacts.createdAt, sql`now() - interval '1 day'`),
            sql`${schema.contacts.source} <> 'IMPORT'`,
          ),
        ),
    ]);
    const waiting = Number(waitingRows.rows[0]?.n ?? 0);
    const newLeads = leadRows[0]?.n ?? 0;
    if (waiting === 0 && tasks.length === 0 && newLeads === 0) continue;

    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today).length;
    const paragraphs = [
      waiting > 0 ? `${waiting} ${waiting === 1 ? "kunde venter" : "kunder venter"} på svar.` : "Ingen kunder venter på svar.",
      tasks.length > 0
        ? `Du har ${tasks.length} ${tasks.length === 1 ? "opgave" : "opgaver"} i dag${overdue ? `, heraf ${overdue} forfaldne` : ""}: ${tasks
            .slice(0, 5)
            .map((t) => t.title)
            .join(" · ")}${tasks.length > 5 ? " …" : ""}`
        : "Du har ingen opgaver i dag.",
      ...(newLeads > 0 ? [`${newLeads} ${newLeads === 1 ? "nyt lead" : "nye leads"} siden i går.`] : []),
    ];
    const { sent: ok } = await sendEmail({
      to: user.email,
      subject: waiting > 0 ? `${waiting} venter på svar – din dag i Kundespor` : "Din dag i Kundespor",
      ...brandedEmail({
        heading: `Godmorgen ${user.name.split(" ")[0]}`,
        paragraphs,
        button: { label: waiting > 0 ? "Se hvem der venter" : "Åbn Kundespor", url: `${appUrl}${waiting > 0 ? "/venter" : "/dashboard"}` },
        footer: "Daglig oversigt fra Kundespor. Slå den fra under Min profil.",
      }),
    });
    if (ok) sent++;
  }
  return { sent };
}
