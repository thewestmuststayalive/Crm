import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ReviewRequestStatus } from "@/db/schema";
import { logEvent } from "./crm";
import { brandedEmail, isEmailConfigured, sendEmail } from "./email";
import { emailBrand } from "./branding";
import { getAppUrl } from "./url";

// Anmodning om anmeldelse: når en deal vindes, planlægges en venlig e-mail til kontakten
// efter et antal dage. Den daglige kørsel sender dem. Hver e-mail har et afmeldingslink.

/** En kontakt bliver højst bedt om en anmeldelse én gang inden for dette antal dage. */
const MIN_DAYS_BETWEEN = 180;

export const REVIEW_DELAY_OPTIONS = [0, 1, 3, 7, 14] as const;

export const REVIEW_STATUS_LABELS: Record<ReviewRequestStatus, string> = {
  SCHEDULED: "Planlagt",
  SENT: "Sendt",
  CLICKED: "Klikket",
  SKIPPED: "Ikke sendt",
};

export function defaultReviewMessage(company: string) {
  return `Tak fordi du valgte ${company}. Vi håber, du er tilfreds. Har du to minutter til at fortælle andre om din oplevelse? Det betyder rigtig meget for en virksomhed som vores.`;
}

export async function getReviewSettings(workspaceId: string) {
  const [ws] = await db
    .select({
      name: schema.workspaces.name,
      enabled: schema.workspaces.reviewEnabled,
      url: schema.workspaces.reviewUrl,
      delayDays: schema.workspaces.reviewDelayDays,
      message: schema.workspaces.reviewMessage,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  return ws ?? null;
}

/** Kaldes når en deal vindes. Planlægger en anmodning, hvis det er slået til og giver mening. */
export async function scheduleReviewRequest(deal: { workspaceId: string; id: string; contactId: string | null }) {
  if (!deal.contactId) return;
  const settings = await getReviewSettings(deal.workspaceId);
  if (!settings?.enabled || !settings.url) return;
  const [contact] = await db
    .select({ email: schema.contacts.email, optOut: schema.contacts.emailOptOutAt })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.workspaceId, deal.workspaceId), eq(schema.contacts.id, deal.contactId)))
    .limit(1);
  if (!contact?.email || contact.optOut) return;

  const [recent] = await db
    .select({ n: count() })
    .from(schema.reviewRequests)
    .where(
      and(
        eq(schema.reviewRequests.contactId, deal.contactId),
        inArray(schema.reviewRequests.status, ["SCHEDULED", "SENT", "CLICKED"]),
        gt(schema.reviewRequests.createdAt, sql`now() - make_interval(days => ${MIN_DAYS_BETWEEN})`),
      ),
    );
  if (recent.n > 0) return;

  await db.insert(schema.reviewRequests).values({
    workspaceId: deal.workspaceId,
    contactId: deal.contactId,
    dealId: deal.id,
    token: randomBytes(24).toString("base64url"),
    sendAt: sql`now() + make_interval(days => ${settings.delayDays})`,
  });
}

/** Sender forfaldne anmodninger (daglig kørsel). Returnerer antal sendte. */
export async function sendDueReviewRequests() {
  const due = await db
    .select({
      request: schema.reviewRequests,
      contactName: schema.contacts.name,
      email: schema.contacts.email,
      optOut: schema.contacts.emailOptOutAt,
      companyId: schema.contacts.companyId,
      settings: {
        name: schema.workspaces.name,
        enabled: schema.workspaces.reviewEnabled,
        url: schema.workspaces.reviewUrl,
        message: schema.workspaces.reviewMessage,
      },
    })
    .from(schema.reviewRequests)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.reviewRequests.contactId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.reviewRequests.workspaceId))
    .where(and(eq(schema.reviewRequests.status, "SCHEDULED"), lte(schema.reviewRequests.sendAt, sql`now()`)))
    .orderBy(schema.reviewRequests.sendAt)
    .limit(500);
  if (due.length === 0) return 0;

  const appUrl = await getAppUrl();
  let sent = 0;
  for (const row of due) {
    const { request: r, settings } = row;
    const skip = !settings.enabled
      ? "Anmeldelser er slået fra"
      : !settings.url
        ? "Intet link til anmeldelser"
        : !row.email
          ? "Kontakten har ingen e-mail"
          : row.optOut
            ? "Kontakten har frabedt sig e-mails"
            : !isEmailConfigured()
              ? "E-mail er ikke sat op"
              : null;
    if (skip) {
      await db
        .update(schema.reviewRequests)
        .set({ status: "SKIPPED", skipReason: skip })
        .where(eq(schema.reviewRequests.id, r.id));
      continue;
    }

    const result = await sendEmail({
      to: row.email!,
      subject: `Hvordan var din oplevelse med ${settings.name}?`,
      headers: { "List-Unsubscribe": `<${appUrl}/anmeld/${r.token}/afmeld>` },
      ...brandedEmail({
        ...(await emailBrand(r.workspaceId)),
        heading: `Hej ${row.contactName.split(" ")[0]}`,
        paragraphs: (settings.message || defaultReviewMessage(settings.name)).split(/\n{2,}/),
        button: { label: "Skriv en anmeldelse", url: `${appUrl}/anmeld/${r.token}` },
        footer: `Sendt af ${settings.name}.`,
        unsubscribeUrl: `${appUrl}/anmeld/${r.token}/afmeld`,
      }),
    });
    if (!result.sent) continue; // Prøves igen ved næste kørsel.
    await db
      .update(schema.reviewRequests)
      .set({ status: "SENT", sentAt: new Date() })
      .where(eq(schema.reviewRequests.id, r.id));
    await logEvent(r.workspaceId, null, "Anmodning om anmeldelse sendt", {
      contactId: r.contactId,
      companyId: row.companyId,
    });
    sent++;
  }
  return sent;
}

export async function getReviewOverview(workspaceId: string) {
  const [counts, recent] = await Promise.all([
    db
      .select({ status: schema.reviewRequests.status, n: count() })
      .from(schema.reviewRequests)
      .where(
        and(
          eq(schema.reviewRequests.workspaceId, workspaceId),
          gt(schema.reviewRequests.createdAt, sql`now() - interval '90 days'`),
        ),
      )
      .groupBy(schema.reviewRequests.status),
    db
      .select({
        id: schema.reviewRequests.id,
        status: schema.reviewRequests.status,
        sendAt: schema.reviewRequests.sendAt,
        sentAt: schema.reviewRequests.sentAt,
        clickedAt: schema.reviewRequests.clickedAt,
        skipReason: schema.reviewRequests.skipReason,
        contactId: schema.contacts.id,
        contactName: schema.contacts.name,
      })
      .from(schema.reviewRequests)
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.reviewRequests.contactId))
      .where(eq(schema.reviewRequests.workspaceId, workspaceId))
      .orderBy(desc(schema.reviewRequests.createdAt))
      .limit(15),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<ReviewRequestStatus, number>>;
  return {
    scheduled: by.SCHEDULED ?? 0,
    sent: (by.SENT ?? 0) + (by.CLICKED ?? 0),
    clicked: by.CLICKED ?? 0,
    recent,
  };
}

/** Finder en anmodning ud fra linket i e-mailen. */
export async function getReviewRequestByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({ request: schema.reviewRequests, workspaceName: schema.workspaces.name, url: schema.workspaces.reviewUrl })
    .from(schema.reviewRequests)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.reviewRequests.workspaceId))
    .where(eq(schema.reviewRequests.token, token))
    .limit(1);
  return row ?? null;
}
