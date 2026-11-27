import "server-only";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AgreementInterval, AgreementStatus, InvoiceLine } from "@/db/schema";
import { getBookingSettings, getService } from "./booking";
import { createBooking, sendBookingEmail } from "./booking-flow";
import { getCompany, getContact, logEvent } from "./crm";
import { bookAndSendInvoice } from "./invoice-booking";
import { newInvoiceToken } from "./invoices";
import { formatIsoDate, todayIso } from "./labels";
import { notify } from "./notify";
import { sendBookingSms } from "./sms";
import { addDays, zonedToUtc } from "./time";
import { isUuid } from "./validation";

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  ACTIVE: "Aktiv",
  PAUSED: "Sat på pause",
  ENDED: "Afsluttet",
};

export const MONTH_NAMES = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** Bookinger oprettes en uge før, så kunden får bekræftelse og påmindelse i god tid. */
const BOOKING_LEAD_DAYS = 7;

export function intervalLabel(interval: AgreementInterval, count: number) {
  if (interval === "WEEK") return count === 1 ? "Hver uge" : `Hver ${count}. uge`;
  return count === 1 ? "Hver måned" : `Hver ${count}. måned`;
}

/** Næste dato efter `date`. Månedlige aftaler holder samme dag (eller sidste dag i måneden). */
export function nextPeriodDate(date: string, interval: AgreementInterval, count: number) {
  if (interval === "WEEK") return addDays(date, 7 * count);
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + count, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function inSeason(date: string, months: number[]) {
  return months.length === 0 || months.includes(Number(date.slice(5, 7)));
}

export function periodTotalOre(lines: InvoiceLine[]) {
  return lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceOre), 0);
}

export async function getAgreement(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      agreement: schema.agreements,
      companyName: schema.companies.name,
      contactName: schema.contacts.name,
      serviceName: schema.services.name,
    })
    .from(schema.agreements)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.agreements.companyId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.agreements.contactId))
    .leftJoin(schema.services, eq(schema.services.id, schema.agreements.serviceId))
    .where(and(eq(schema.agreements.workspaceId, workspaceId), eq(schema.agreements.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getAgreements(workspaceId: string, filter: { companyId?: string; contactId?: string } = {}) {
  return db
    .select({
      agreement: schema.agreements,
      companyName: schema.companies.name,
      contactName: schema.contacts.name,
      serviceName: schema.services.name,
    })
    .from(schema.agreements)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.agreements.companyId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.agreements.contactId))
    .leftJoin(schema.services, eq(schema.services.id, schema.agreements.serviceId))
    .where(
      and(
        eq(schema.agreements.workspaceId, workspaceId),
        filter.companyId ? eq(schema.agreements.companyId, filter.companyId) : undefined,
        filter.contactId ? eq(schema.agreements.contactId, filter.contactId) : undefined,
      ),
    )
    .orderBy(asc(schema.agreements.status), asc(schema.agreements.nextDate));
}

export async function getAgreementRuns(workspaceId: string, agreementId: string) {
  return db
    .select()
    .from(schema.agreementRuns)
    .where(and(eq(schema.agreementRuns.workspaceId, workspaceId), eq(schema.agreementRuns.agreementId, agreementId)))
    .orderBy(desc(schema.agreementRuns.periodDate))
    .limit(50);
}

type Agreement = typeof schema.agreements.$inferSelect;

/** Årlig prisregulering: i den valgte måned hæves priserne én gang pr. år. */
async function adjustPrices(a: Agreement, today: string) {
  const pct = Number(a.priceAdjustPct);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (!pct || !a.priceAdjustMonth || a.priceAdjustMonth !== month || (a.lastAdjustedYear ?? 0) >= year) return a;
  const lines = a.lines.map((l) => ({ ...l, unitPriceOre: Math.round(l.unitPriceOre * (1 + pct / 100)) }));
  const [updated] = await db
    .update(schema.agreements)
    .set({ lines, lastAdjustedYear: year, updatedAt: new Date() })
    .where(eq(schema.agreements.id, a.id))
    .returning();
  await logEvent(
    a.workspaceId,
    null,
    `Fast aftale "${a.name}": pris reguleret med ${String(pct).replace(".", ",")} %`,
    { contactId: a.contactId, companyId: a.companyId },
  );
  return updated;
}

async function alert(a: Agreement, title: string, body: string) {
  await notify({
    workspaceId: a.workspaceId,
    to: a.createdById ? { userIds: [a.createdById] } : "admins",
    type: "AGREEMENT_ALERT",
    title,
    body,
    href: `/aftaler/${a.id}`,
    email: true,
  });
}

/**
 * Udfører én periode af aftalen: opretter booking og/eller faktura, logger kørslen og rykker
 * næste dato frem. Perioder uden for sæsonen springes over. Kører højst én gang pr. periode.
 */
export async function runAgreementPeriod(agreement: Agreement, today = todayIso()) {
  const a = await adjustPrices(agreement, today);
  const period = a.nextDate;
  const [run] = await db
    .insert(schema.agreementRuns)
    .values({ workspaceId: a.workspaceId, agreementId: a.id, periodDate: period })
    .onConflictDoNothing()
    .returning({ id: schema.agreementRuns.id });
  const advance = async () => {
    const next = nextPeriodDate(period, a.interval, a.intervalCount);
    const ended = a.endDate !== null && next > a.endDate;
    await db
      .update(schema.agreements)
      .set({ nextDate: next, status: ended ? "ENDED" : a.status, updatedAt: new Date() })
      .where(eq(schema.agreements.id, a.id));
  };
  if (!run) {
    // Perioden er allerede udført (fx to kørsler samtidig): ryk blot frem.
    await advance();
    return { skipped: true as const };
  }
  if (!inSeason(period, a.seasonMonths)) {
    await db.update(schema.agreementRuns).set({ note: "Uden for sæsonen" }).where(eq(schema.agreementRuns.id, run.id));
    await advance();
    return { skipped: true as const };
  }

  let bookingId: string | null = null;
  let invoiceId: string | null = null;
  const notes: string[] = [];

  // Booking (bilpleje): fast ydelse og tidspunkt.
  if (a.serviceId && a.contactId && a.bookingTime) {
    const [service, settings, ws] = await Promise.all([
      getService(a.workspaceId, a.serviceId),
      getBookingSettings(a.workspaceId),
      db.select({ enabled: schema.workspaces.bookingEnabled }).from(schema.workspaces).where(eq(schema.workspaces.id, a.workspaceId)),
    ]);
    if (service && ws[0]?.enabled) {
      const priceOre = Math.round(periodTotalOre(a.lines) * 1.25) || service.priceOre;
      const booking = await createBooking({
        workspaceId: a.workspaceId,
        contactId: a.contactId,
        vehicleId: null,
        serviceId: service.id,
        serviceName: service.name,
        priceOre,
        startsAt: zonedToUtc(period, a.bookingTime),
        durationMinutes: service.durationMinutes,
        source: "MANUAL",
        internalNote: `Fast aftale: ${a.name}`,
        createdById: a.createdById,
        capacity: settings.capacity,
      });
      if (booking) {
        bookingId = booking.id;
        await sendBookingEmail(booking.id, "confirmation").catch(() => false);
        await sendBookingSms(booking.id, "confirmation").catch(() => false);
      } else {
        notes.push("Tiden var optaget – booking ikke oprettet");
        await alert(a, `Fast aftale: ${a.name} – tiden er optaget`, `Find en anden tid ${formatIsoDate(period)} kl. ${a.bookingTime}.`);
      }
    }
  }

  // Faktura: som kladde eller bogført og sendt via e-conomic.
  if (a.invoiceMode !== "NONE" && a.lines.length > 0) {
    const contact = a.contactId ? await getContact(a.workspaceId, a.contactId) : null;
    const company = a.companyId ? await getCompany(a.workspaceId, a.companyId) : null;
    const [invoice] = await db
      .insert(schema.invoices)
      .values({
        workspaceId: a.workspaceId,
        companyId: a.companyId,
        contactId: a.contactId,
        bookingId,
        heading: `${a.name} – ${formatIsoDate(period)}`,
        email: contact?.email ?? company?.email ?? null,
        lines: a.lines,
        token: newInvoiceToken(),
        createdById: a.createdById,
      })
      .returning({ id: schema.invoices.id });
    invoiceId = invoice.id;
    if (a.invoiceMode === "SEND") {
      const [ws] = await db
        .select({ id: schema.workspaces.id, name: schema.workspaces.name })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, a.workspaceId));
      const result = await bookAndSendInvoice({ workspace: ws, userId: null, invoiceId: invoice.id, mode: "send" });
      if (!result.ok) {
        notes.push(`Faktura ikke sendt: ${result.error}`);
        await alert(a, `Fast aftale: ${a.name} – fakturaen blev ikke sendt`, result.error);
      }
    }
  }

  await db
    .update(schema.agreementRuns)
    .set({ bookingId, invoiceId, note: notes.join(". ") || null })
    .where(eq(schema.agreementRuns.id, run.id));
  await advance();
  return { skipped: false as const, bookingId, invoiceId, notes };
}

/** Daglig kørsel: udfør alle aftaler, hvis næste dato er nået (bookinger en uge før). */
export async function processAgreements(now = new Date()) {
  const today = todayIso(now);
  const horizon = addDays(today, BOOKING_LEAD_DAYS);
  const due = await db
    .select()
    .from(schema.agreements)
    .where(and(eq(schema.agreements.status, "ACTIVE"), lte(schema.agreements.nextDate, horizon)))
    .limit(500);
  let runs = 0;
  for (const first of due) {
    let a: Agreement | undefined = first;
    // Indhent op til 12 perioder (fx efter en pause i den daglige kørsel).
    for (let i = 0; i < 12 && a && a.status === "ACTIVE"; i++) {
      const bookingAhead = Boolean(a.serviceId && a.bookingTime);
      if (a.nextDate > (bookingAhead ? horizon : today)) break;
      try {
        const r = await runAgreementPeriod(a, today);
        if (!r.skipped) runs++;
      } catch (error) {
        console.error("Fast aftale fejlede", a.id, error);
        break;
      }
      [a] = await db.select().from(schema.agreements).where(eq(schema.agreements.id, a.id));
    }
  }
  return runs;
}
