import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { BookingStatus, OpeningDay } from "@/db/schema";
import { addDays, localDate, timeToMinutes, minutesToTime, weekdayIndex, zonedToUtc } from "./time";
import { isUuid } from "./validation";

export type BookingSettings = typeof schema.bookingSettings.$inferSelect;
export type Service = typeof schema.services.$inferSelect;

export const DEFAULT_OPENING_HOURS: OpeningDay[] = [
  { open: true, from: "08:00", to: "16:00" },
  { open: true, from: "08:00", to: "16:00" },
  { open: true, from: "08:00", to: "16:00" },
  { open: true, from: "08:00", to: "16:00" },
  { open: true, from: "08:00", to: "16:00" },
  { open: false, from: "09:00", to: "13:00" },
  { open: false, from: "09:00", to: "13:00" },
];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: "Booket",
  COMPLETED: "Gennemført",
  CANCELLED: "Aflyst",
  NO_SHOW: "Udeblev",
};

export const BOOKING_STATUS_STYLES: Record<BookingStatus, string> = {
  CONFIRMED: "bg-sky-50 text-sky-800 border-sky-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200 line-through",
  NO_SHOW: "bg-red-50 text-red-700 border-red-200",
};

export function newBookingToken() {
  return randomBytes(24).toString("base64url");
}

/** Firmaets bookingregler. Oprettes med standardværdier første gang. */
export async function getBookingSettings(workspaceId: string): Promise<BookingSettings> {
  const [row] = await db
    .select()
    .from(schema.bookingSettings)
    .where(eq(schema.bookingSettings.workspaceId, workspaceId))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(schema.bookingSettings)
    .values({ workspaceId, key: randomBytes(9).toString("base64url"), openingHours: DEFAULT_OPENING_HOURS })
    .onConflictDoNothing()
    .returning();
  return created ?? (await getBookingSettings(workspaceId));
}

/** Firmaet bag et offentligt bookinglink – kun hvis booking er slået til. */
export async function getPublicBooking(key: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(key)) return null;
  const [row] = await db
    .select({
      settings: schema.bookingSettings,
      workspace: {
        id: schema.workspaces.id,
        name: schema.workspaces.name,
        address: schema.workspaces.address,
        phone: schema.workspaces.phone,
        email: schema.workspaces.email,
        website: schema.workspaces.website,
        enabled: schema.workspaces.bookingEnabled,
      },
    })
    .from(schema.bookingSettings)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookingSettings.workspaceId))
    .where(eq(schema.bookingSettings.key, key))
    .limit(1);
  if (!row || !row.workspace.enabled) return null;
  return row;
}

export async function getServices(workspaceId: string, opts: { onlineOnly?: boolean; includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(schema.services)
    .where(eq(schema.services.workspaceId, workspaceId))
    .orderBy(asc(schema.services.position), asc(schema.services.createdAt));
  return rows.filter((s) => (opts.includeInactive || s.active) && (!opts.onlineOnly || s.bookableOnline));
}

export async function getService(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.services)
    .where(and(eq(schema.services.workspaceId, workspaceId), eq(schema.services.id, id)))
    .limit(1);
  return row ?? null;
}

type Interval = { startsAt: Date; endsAt: Date };

/** Aktive bookinger (status Booket) der overlapper perioden. */
async function busyIntervals(workspaceId: string, from: Date, to: Date, exceptId?: string): Promise<Interval[]> {
  const rows = await db
    .select({ id: schema.bookings.id, startsAt: schema.bookings.startsAt, endsAt: schema.bookings.endsAt })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.workspaceId, workspaceId),
        eq(schema.bookings.status, "CONFIRMED"),
        lt(schema.bookings.startsAt, to),
        gt(schema.bookings.endsAt, from),
      ),
    );
  return rows.filter((r) => r.id !== exceptId);
}

function overlapCount(busy: Interval[], start: Date, end: Date) {
  return busy.filter((b) => b.startsAt < end && b.endsAt > start).length;
}

/** Første og sidste dato kunden kan booke (dansk tid). */
export function bookableRange(settings: BookingSettings, now: Date) {
  const first = localDate(new Date(now.getTime() + settings.minNoticeHours * 3_600_000));
  return { first, last: addDays(localDate(now), settings.maxDaysAhead) };
}

/** Dagene kunden kan vælge imellem på bookingsiden, og om firmaet har åbent. */
export function bookableDays(settings: BookingSettings, now = new Date()) {
  const { first, last } = bookableRange(settings, now);
  const days: { date: string; open: boolean }[] = [];
  for (let d = first; d <= last && days.length < 120; d = addDays(d, 1)) {
    days.push({ date: d, open: settings.openingHours[weekdayIndex(d)]?.open ?? false });
  }
  return days;
}

/** Kan kunden stadig selv aflyse? */
export function canCustomerCancel(
  booking: { status: BookingStatus; startsAt: Date },
  cancelHours: number,
  now = new Date(),
) {
  return booking.status === "CONFIRMED" && now.getTime() < booking.startsAt.getTime() - cancelHours * 3_600_000;
}

/**
 * Ledige starttider ("HH:MM") for en ydelse på en dato. En tid er ledig, når den ligger inden
 * for åbningstiden, respekterer varsel og antallet af samtidige bookinger.
 */
export async function availableSlots(
  workspaceId: string,
  settings: BookingSettings,
  durationMinutes: number,
  dateIso: string,
  now: Date,
): Promise<string[]> {
  const { first, last } = bookableRange(settings, now);
  if (dateIso < first || dateIso > last) return [];
  const day = settings.openingHours[weekdayIndex(dateIso)];
  if (!day?.open) return [];
  const open = timeToMinutes(day.from);
  const close = timeToMinutes(day.to);
  const step = Math.max(5, settings.slotMinutes);
  const earliest = now.getTime() + settings.minNoticeHours * 3_600_000;

  const busy = await busyIntervals(workspaceId, zonedToUtc(dateIso, "00:00"), zonedToUtc(addDays(dateIso, 1), "00:00"));
  const slots: string[] = [];
  for (let t = open; t + durationMinutes <= close; t += step) {
    const time = minutesToTime(t);
    const start = zonedToUtc(dateIso, time);
    if (start.getTime() < earliest) continue;
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    if (overlapCount(busy, start, end) < Math.max(1, settings.capacity)) slots.push(time);
  }
  return slots;
}

/** Er der stadig plads i perioden? Bruges lige før en booking gemmes. */
export async function hasCapacity(workspaceId: string, capacity: number, start: Date, end: Date, exceptId?: string) {
  const busy = await busyIntervals(workspaceId, start, end, exceptId);
  return overlapCount(busy, start, end) < Math.max(1, capacity);
}

/** Normaliserer en dansk nummerplade: "ab 12 345" → "AB12345". */
export function normalizePlate(input: string) {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9ÆØÅ]/g, "")
    .slice(0, 10);
}

/** "AB12345" → "AB 12 345" (dansk standardformat); andre plader vises som de er. */
export function formatPlate(plate: string | null) {
  if (!plate) return "";
  const m = /^([A-ZÆØÅ]{2})(\d{2})(\d{3})$/.exec(plate);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : plate;
}

/** Finder kontaktens bil med nummerpladen, eller opretter den. */
export async function findOrCreateVehicle(
  workspaceId: string,
  contactId: string,
  plateInput: string,
  details: { make?: string | null; model?: string | null } = {},
) {
  const plate = normalizePlate(plateInput);
  if (!plate) return null;
  const [existing] = await db
    .select({ id: schema.vehicles.id })
    .from(schema.vehicles)
    .where(
      and(
        eq(schema.vehicles.workspaceId, workspaceId),
        eq(schema.vehicles.contactId, contactId),
        eq(schema.vehicles.plate, plate),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(schema.vehicles)
    .values({ workspaceId, contactId, plate, make: details.make || null, model: details.model || null })
    .returning({ id: schema.vehicles.id });
  return created.id;
}

export async function getVehiclesFor(workspaceId: string, contactIds: string[]) {
  if (contactIds.length === 0) return [];
  return db
    .select()
    .from(schema.vehicles)
    .where(and(eq(schema.vehicles.workspaceId, workspaceId), inArray(schema.vehicles.contactId, contactIds)))
    .orderBy(asc(schema.vehicles.createdAt));
}

export async function getVehicle(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.vehicles)
    .where(and(eq(schema.vehicles.workspaceId, workspaceId), eq(schema.vehicles.id, id)))
    .limit(1);
  return row ?? null;
}

/** Bookinger med kunde, bil og medarbejder i et tidsrum (til kalenderen). */
export async function getBookingsBetween(workspaceId: string, from: Date, to: Date) {
  return db
    .select({
      id: schema.bookings.id,
      startsAt: schema.bookings.startsAt,
      endsAt: schema.bookings.endsAt,
      status: schema.bookings.status,
      serviceName: schema.bookings.serviceName,
      contactId: schema.bookings.contactId,
      contactName: schema.contacts.name,
      plate: schema.vehicles.plate,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      assignee: schema.users.name,
    })
    .from(schema.bookings)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.bookings.contactId))
    .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.bookings.vehicleId))
    .leftJoin(schema.users, eq(schema.users.id, schema.bookings.assigneeId))
    .where(
      and(
        eq(schema.bookings.workspaceId, workspaceId),
        lt(schema.bookings.startsAt, to),
        gt(schema.bookings.endsAt, from),
      ),
    )
    .orderBy(asc(schema.bookings.startsAt));
}

export type CalendarBooking = Awaited<ReturnType<typeof getBookingsBetween>>[number];

/** Bookinger for en kontakt eller en bil, nyeste først. */
export async function getBookingsFor(workspaceId: string, target: { contactId: string } | { vehicleId: string }) {
  return db
    .select({
      id: schema.bookings.id,
      startsAt: schema.bookings.startsAt,
      status: schema.bookings.status,
      serviceName: schema.bookings.serviceName,
      priceOre: schema.bookings.priceOre,
      plate: schema.vehicles.plate,
    })
    .from(schema.bookings)
    .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.bookings.vehicleId))
    .where(
      and(
        eq(schema.bookings.workspaceId, workspaceId),
        "contactId" in target
          ? eq(schema.bookings.contactId, target.contactId)
          : eq(schema.bookings.vehicleId, target.vehicleId),
      ),
    )
    .orderBy(sql`${schema.bookings.startsAt} desc`)
    .limit(50);
}

export async function getBooking(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.workspaceId, workspaceId), eq(schema.bookings.id, id)))
    .limit(1);
  return row ?? null;
}

/** Antal aktive bookinger i dag (dansk tid) – til menuen. */
export async function countBookingsToday(workspaceId: string, now = new Date()) {
  const today = localDate(now);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.workspaceId, workspaceId),
        eq(schema.bookings.status, "CONFIRMED"),
        gte(schema.bookings.startsAt, zonedToUtc(today, "00:00")),
        lt(schema.bookings.startsAt, zonedToUtc(addDays(today, 1), "00:00")),
      ),
    );
  return n;
}

/** Dagens bookinger (dansk tid) – til dashboardet. */
export async function getTodaysBookings(workspaceId: string, now = new Date()) {
  const today = localDate(now);
  const rows = await getBookingsBetween(
    workspaceId,
    zonedToUtc(today, "00:00"),
    zonedToUtc(addDays(today, 1), "00:00"),
  );
  return rows.filter((b) => b.status !== "CANCELLED");
}
