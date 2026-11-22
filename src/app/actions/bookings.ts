"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { BookingStatus } from "@/db/schema";
import {
  findOrCreateVehicle,
  getBooking,
  getBookingSettings,
  getService,
  getVehicle,
  normalizePlate,
} from "@/lib/booking";
import { changeBookingStatus, createBooking, formatWhen, sendBookingEmail } from "@/lib/booking-flow";
import { getContact, isMemberOf, logEvent } from "@/lib/crm";
import { requireBookingModule } from "@/lib/modules";
import { parseAmountOre } from "@/lib/quote-math";
import { isIsoDate, isTime, zonedToUtc } from "@/lib/time";
import { isUuid } from "@/lib/validation";
import { pickValues, type ActionState } from "./types";

const BOOKING_KEYS = [
  "contactId",
  "newName",
  "newPhone",
  "newEmail",
  "plate",
  "serviceId",
  "date",
  "time",
  "duration",
  "price",
  "assigneeId",
  "internalNote",
];

const durationSchema = z.coerce
  .number()
  .int()
  .min(5, "Varigheden skal være mindst 5 minutter")
  .max(24 * 60 * 5);

async function resolveAssignee(workspaceId: string, raw: FormDataEntryValue | null) {
  return isUuid(raw) && (await isMemberOf(workspaceId, raw)) ? raw : null;
}

/** Personalet opretter en booking i kalenderen. */
export async function createManualBooking(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireBookingModule();
  const values = pickValues(formData, BOOKING_KEYS);
  const fail = (error: string): ActionState => ({ error, values });

  // Kunde: eksisterende kontakt eller en ny.
  let contactId: string;
  if (isUuid(values.contactId)) {
    const contact = await getContact(workspace.id, values.contactId);
    if (!contact) return fail("Vælg en kunde");
    contactId = contact.id;
  } else {
    const name = values.newName.trim();
    if (name.length < 2) return fail("Vælg en kunde eller skriv navnet på en ny");
    const [created] = await db
      .insert(schema.contacts)
      .values({
        workspaceId: workspace.id,
        name: name.slice(0, 200),
        phone: values.newPhone.trim().slice(0, 50) || null,
        email: values.newEmail.trim().toLowerCase().slice(0, 200) || null,
        ownerId: user.id,
      })
      .returning({ id: schema.contacts.id });
    contactId = created.id;
  }

  const service = values.serviceId ? await getService(workspace.id, values.serviceId) : null;
  const serviceName = service?.name ?? "Booking";
  if (!isIsoDate(values.date) || !isTime(values.time)) return fail("Vælg dato og tidspunkt");
  const duration = durationSchema.safeParse(values.duration || service?.durationMinutes);
  if (!duration.success) return fail(duration.error.issues[0].message);
  const price = values.price.trim() ? parseAmountOre(values.price) : (service?.priceOre ?? 0);
  if (price === null || price < 0) return fail("Ugyldig pris");

  const settings = await getBookingSettings(workspace.id);
  const vehicleId = values.plate.trim() ? await findOrCreateVehicle(workspace.id, contactId, values.plate) : null;
  const booking = await createBooking({
    workspaceId: workspace.id,
    contactId,
    vehicleId,
    serviceId: service?.id ?? null,
    serviceName,
    priceOre: price,
    startsAt: zonedToUtc(values.date, values.time),
    durationMinutes: duration.data,
    source: "MANUAL",
    internalNote: values.internalNote.trim().slice(0, 2000) || null,
    assigneeId: await resolveAssignee(workspace.id, values.assigneeId),
    createdById: user.id,
    capacity: formData.get("allowOverlap") === "on" ? null : settings.capacity,
  });
  if (!booking) {
    return fail(
      "Der er ikke flere ledige pladser på det tidspunkt. Vælg en anden tid, eller sæt flueben i 'Book alligevel'.",
    );
  }
  await logEvent(workspace.id, user.id, `Booket: ${serviceName} ${formatWhen(booking.startsAt)}`, { contactId });
  if (formData.get("sendConfirmation") === "on") await sendBookingEmail(booking.id, "confirmation");
  revalidatePath("/kalender");
  redirect(`/kalender/${booking.id}`);
}

/** Flyt eller ret en booking. */
export async function updateBooking(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireBookingModule();
  const booking = await getBooking(workspace.id, id);
  if (!booking) return { error: "Bookingen findes ikke" };
  const values = pickValues(formData, BOOKING_KEYS);
  if (!isIsoDate(values.date) || !isTime(values.time)) return { error: "Vælg dato og tidspunkt", values };
  const duration = durationSchema.safeParse(values.duration);
  if (!duration.success) return { error: duration.error.issues[0].message, values };
  const price = parseAmountOre(values.price);
  if (price === null || price < 0) return { error: "Ugyldig pris", values };

  const startsAt = zonedToUtc(values.date, values.time);
  const moved = startsAt.getTime() !== booking.startsAt.getTime();
  const vehicleId = values.plate.trim()
    ? await findOrCreateVehicle(workspace.id, booking.contactId, values.plate)
    : null;
  await db
    .update(schema.bookings)
    .set({
      startsAt,
      endsAt: new Date(startsAt.getTime() + duration.data * 60_000),
      priceOre: price,
      vehicleId,
      assigneeId: await resolveAssignee(workspace.id, values.assigneeId),
      internalNote: values.internalNote.trim().slice(0, 2000) || null,
      // En ny tid skal have en ny påmindelse.
      ...(moved ? { reminderSentAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.bookings.workspaceId, workspace.id), eq(schema.bookings.id, booking.id)));
  if (moved) {
    await logEvent(
      workspace.id,
      user.id,
      `${booking.serviceName} flyttet fra ${formatWhen(booking.startsAt)} til ${formatWhen(startsAt)}`,
      { contactId: booking.contactId },
    );
    if (formData.get("notifyCustomer") === "on" && booking.status === "CONFIRMED") {
      await sendBookingEmail(booking.id, "moved");
    }
  }
  revalidatePath("/kalender");
  revalidatePath(`/kalender/${booking.id}`);
  return { success: moved ? "Bookingen er flyttet." : "Gemt." };
}

const STATUS_TEXT: Record<BookingStatus, string> = {
  CONFIRMED: "genåbnet",
  COMPLETED: "markeret som gennemført",
  CANCELLED: "aflyst",
  NO_SHOW: "markeret som udeblevet",
};

export async function setBookingStatus(formData: FormData) {
  const { user, workspace } = await requireBookingModule();
  const booking = await getBooking(workspace.id, formData.get("id"));
  const status = z.enum(["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).safeParse(formData.get("status"));
  if (!booking || !status.success || booking.status === status.data) return;
  await changeBookingStatus(booking, status.data, user.id, STATUS_TEXT[status.data]);
  if (status.data === "CANCELLED" && formData.get("notifyCustomer") === "on") {
    await sendBookingEmail(booking.id, "cancelled");
  }
  // En gennemført behandling gør kunden til kunde.
  if (status.data === "COMPLETED") {
    await db
      .update(schema.contacts)
      .set({ status: "CUSTOMER", updatedAt: new Date() })
      .where(
        and(
          eq(schema.contacts.workspaceId, workspace.id),
          eq(schema.contacts.id, booking.contactId),
          eq(schema.contacts.status, "LEAD"),
        ),
      );
  }
  revalidatePath("/kalender");
  revalidatePath(`/kalender/${booking.id}`);
}

export async function deleteBooking(formData: FormData) {
  const { workspace } = await requireBookingModule("ADMIN");
  const booking = await getBooking(workspace.id, formData.get("id"));
  if (!booking) return;
  await db.delete(schema.bookings).where(eq(schema.bookings.id, booking.id));
  revalidatePath("/kalender");
  redirect("/kalender");
}

// ---------- Biler ----------

const vehicleSchema = z.object({
  plate: z.string().trim().max(20),
  make: z.string().trim().max(60),
  model: z.string().trim().max(80),
  year: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}$/.test(v) && +v >= 1900 && +v <= 2100), "Årgang skal være et årstal"),
  color: z.string().trim().max(40),
  notes: z.string().trim().max(2000),
});
const VEHICLE_KEYS = ["plate", "make", "model", "year", "color", "notes"];

function vehicleValues(d: z.infer<typeof vehicleSchema>) {
  return {
    plate: normalizePlate(d.plate) || null,
    make: d.make || null,
    model: d.model || null,
    year: d.year ? Number(d.year) : null,
    color: d.color || null,
    notes: d.notes || null,
  };
}

export async function addVehicle(contactId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireBookingModule();
  const contact = await getContact(workspace.id, contactId);
  if (!contact) return { error: "Kontakten findes ikke" };
  const values = pickValues(formData, VEHICLE_KEYS);
  const parsed = vehicleSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const v = vehicleValues(parsed.data);
  if (!v.plate && !v.make && !v.model) return { error: "Skriv mindst nummerplade eller mærke", values };
  await db.insert(schema.vehicles).values({ workspaceId: workspace.id, contactId: contact.id, ...v });
  await logEvent(workspace.id, user.id, `Bil tilføjet: ${[v.plate, v.make, v.model].filter(Boolean).join(" ")}`, {
    contactId: contact.id,
    companyId: contact.companyId,
  });
  revalidatePath(`/kunder/${contact.id}`);
  return { success: "Bilen er tilføjet." };
}

export async function updateVehicle(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireBookingModule();
  const vehicle = await getVehicle(workspace.id, id);
  if (!vehicle) return { error: "Bilen findes ikke" };
  const values = pickValues(formData, VEHICLE_KEYS);
  const parsed = vehicleSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  await db
    .update(schema.vehicles)
    .set({ ...vehicleValues(parsed.data), updatedAt: new Date() })
    .where(and(eq(schema.vehicles.workspaceId, workspace.id), eq(schema.vehicles.id, vehicle.id)));
  revalidatePath(`/biler/${vehicle.id}`);
  revalidatePath(`/kunder/${vehicle.contactId}`);
  return { success: "Gemt." };
}

export async function deleteVehicle(formData: FormData) {
  const { workspace } = await requireBookingModule();
  const vehicle = await getVehicle(workspace.id, formData.get("id"));
  if (!vehicle) return;
  await db.delete(schema.vehicles).where(eq(schema.vehicles.id, vehicle.id));
  revalidatePath(`/kunder/${vehicle.contactId}`);
  redirect(`/kunder/${vehicle.contactId}`);
}
