"use server";

import { createHash } from "node:crypto";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db, schema } from "@/db";
import { availableSlots, canCustomerCancel, findOrCreateVehicle, getPublicBooking, getService } from "@/lib/booking";
import { changeBookingStatus, createBooking, formatWhen, sendBookingEmail } from "@/lib/booking-flow";
import { logEvent } from "@/lib/crm";
import { findExistingContact } from "@/lib/leads";
import { notify } from "@/lib/notify";
import { isIsoDate, isTime, zonedToUtc } from "@/lib/time";
import type { ActionState } from "./types";

// Offentlige handlinger på bookingsiden og aflysningssiden. Kunden er ikke logget ind:
// bookinglinket (firmaets nøgle) og aflysningslinket (192-bit token) er adgangen.

const MAX_BOOKINGS_PER_IP_PER_HOUR = 5;

async function ipHash(workspaceId: string) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "ukendt";
  return createHash("sha256").update(`${workspaceId}:${ip}`).digest("hex");
}

/** Ledige tider for en ydelse på en dato. */
export async function getPublicSlots(key: string, serviceId: string, date: string): Promise<string[]> {
  const pub = await getPublicBooking(String(key));
  if (!pub || !isIsoDate(date)) return [];
  const service = await getService(pub.workspace.id, serviceId);
  if (!service?.active || !service.bookableOnline) return [];
  return availableSlots(pub.workspace.id, pub.settings, service.durationMinutes, date, new Date());
}

const bookingSchema = z.object({
  name: z.string().trim().min(2, "Skriv dit navn").max(120),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v.replace(/\D/g, "").length >= 8, "Skriv et telefonnummer med mindst 8 cifre"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Ugyldig e-mail"),
  plate: z.string().trim().max(20),
  car: z.string().trim().max(80),
  note: z.string().trim().max(1000),
});

export type PublicBookingState = ActionState & { booked?: { service: string; when: string; emailed: boolean } };

const VALUE_KEYS = ["name", "phone", "email", "plate", "car", "note"] as const;

export async function submitPublicBooking(_prev: PublicBookingState, formData: FormData): Promise<PublicBookingState> {
  const values = Object.fromEntries(VALUE_KEYS.map((k) => [k, String(formData.get(k) ?? "")]));
  const fail = (error: string): PublicBookingState => ({ error, values });

  const pub = await getPublicBooking(String(formData.get("key") ?? ""));
  if (!pub) return fail("Bookingsiden er ikke aktiv.");
  // Skjult felt, som kun robotter udfylder.
  if (String(formData.get("website") ?? "") !== "") return fail("Bookingen kunne ikke gennemføres.");
  const workspaceId = pub.workspace.id;

  const service = await getService(workspaceId, formData.get("serviceId"));
  if (!service?.active || !service.bookableOnline) return fail("Vælg en ydelse.");
  const date = formData.get("date");
  const time = formData.get("time");
  if (!isIsoDate(date) || !isTime(time)) return fail("Vælg en dato og et tidspunkt.");
  if (formData.get("consent") !== "on") return fail("Sæt flueben ved samtykket for at booke.");
  const parsed = bookingSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;

  const slots = await availableSlots(workspaceId, pub.settings, service.durationMinutes, date, new Date());
  if (!slots.includes(time)) return fail("Tiden er desværre ikke længere ledig. Vælg en anden tid.");

  const hash = await ipHash(workspaceId);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.ipHash, hash), gt(schema.bookings.createdAt, sql`now() - interval '1 hour'`)));
  if (n >= MAX_BOOKINGS_PER_IP_PER_HOUR)
    return fail("For mange bookinger på kort tid. Prøv igen senere eller ring til os.");

  // Find kunden på e-mail eller telefon, ellers opret en ny.
  const existing = await findExistingContact(workspaceId, d.email || null, d.phone);
  let contactId = existing?.id;
  if (!contactId) {
    const [created] = await db
      .insert(schema.contacts)
      .values({ workspaceId, name: d.name, email: d.email || null, phone: d.phone, source: "BOOKING", status: "LEAD" })
      .returning({ id: schema.contacts.id });
    contactId = created.id;
  }
  const vehicleId = d.plate
    ? await findOrCreateVehicle(workspaceId, contactId, d.plate, { model: d.car || null })
    : null;

  const booking = await createBooking({
    workspaceId,
    contactId,
    vehicleId,
    serviceId: service.id,
    serviceName: service.name,
    priceOre: service.priceOre,
    startsAt: zonedToUtc(date, time),
    durationMinutes: service.durationMinutes,
    source: "ONLINE",
    customerNote: d.note || (d.car && !d.plate ? `Bil: ${d.car}` : null),
    ipHash: hash,
    capacity: pub.settings.capacity,
  });
  if (!booking) return fail("Tiden er desværre lige blevet booket af en anden. Vælg en anden tid.");

  const when = formatWhen(booking.startsAt);
  await logEvent(workspaceId, null, `Booket online: ${service.name} ${when}${d.note ? `\nBesked: ${d.note}` : ""}`, {
    contactId,
  });
  await notify({
    workspaceId,
    to: "admins",
    type: "NEW_BOOKING",
    title: `Ny booking: ${d.name}`,
    body: `${service.name} ${when}${d.plate ? ` (${d.plate.toUpperCase()})` : ""}.`,
    href: `/kalender/${booking.id}`,
    email: true,
  });
  const emailed = await sendBookingEmail(booking.id, "confirmation");
  return { success: "Din tid er booket.", booked: { service: service.name, when, emailed } };
}

/** Kunden aflyser selv via linket i bekræftelsen. */
export async function cancelBookingByCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { error: "Linket er ikke gyldigt." };
  const [row] = await db
    .select({ booking: schema.bookings, cancelHours: schema.bookingSettings.cancelHours, name: schema.contacts.name })
    .from(schema.bookings)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.bookings.contactId))
    .leftJoin(schema.bookingSettings, eq(schema.bookingSettings.workspaceId, schema.bookings.workspaceId))
    .where(eq(schema.bookings.token, token))
    .limit(1);
  if (!row) return { error: "Linket er ikke gyldigt." };
  const { booking } = row;
  if (booking.status !== "CONFIRMED") return { error: "Tiden er allerede aflyst eller afsluttet." };
  if (!canCustomerCancel(booking, row.cancelHours ?? 24)) {
    return { error: "Det er for sent at aflyse online. Kontakt os direkte." };
  }

  await changeBookingStatus(booking, "CANCELLED", null, "aflyst af kunden via linket");
  await notify({
    workspaceId: booking.workspaceId,
    to: booking.assigneeId ? { userIds: [booking.assigneeId] } : "admins",
    type: "BOOKING_CANCELLED",
    title: `Aflyst: ${row.name}`,
    body: `${booking.serviceName} ${formatWhen(booking.startsAt)} er aflyst af kunden.`,
    href: `/kalender/${booking.id}`,
    email: true,
  });
  return { success: "Din tid er aflyst." };
}

/** Afmelding fra påmindelser via linket i e-mailen (bookingens token). */
export async function unsubscribeByBookingToken(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { error: "Linket er ikke gyldigt." };
  const [booking] = await db
    .select({ workspaceId: schema.bookings.workspaceId, contactId: schema.bookings.contactId })
    .from(schema.bookings)
    .where(eq(schema.bookings.token, token))
    .limit(1);
  if (!booking) return { error: "Linket er ikke gyldigt." };
  const [updated] = await db
    .update(schema.contacts)
    .set({ emailOptOutAt: new Date() })
    .where(
      and(
        eq(schema.contacts.workspaceId, booking.workspaceId),
        eq(schema.contacts.id, booking.contactId),
        sql`${schema.contacts.emailOptOutAt} is null`,
      ),
    )
    .returning({ id: schema.contacts.id });
  if (updated) {
    await logEvent(booking.workspaceId, null, "Kontakten har frabedt sig e-mails via afmeldingslinket", {
      contactId: booking.contactId,
    });
  }
  return { success: "Du er afmeldt og får ikke flere påmindelser fra os." };
}
