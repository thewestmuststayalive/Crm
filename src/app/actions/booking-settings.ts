"use server";

import { randomBytes } from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { OpeningDay } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getBookingSettings, getService } from "@/lib/booking";
import { requireBookingModule } from "@/lib/modules";
import { parseAmountOre } from "@/lib/quote-math";
import { isTime, timeToMinutes } from "@/lib/time";
import type { ActionState } from "./types";

const PATH = "/indstillinger/booking";

function done(message: string, kind: "ok" | "fejl" = "ok"): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${kind === "ok" ? "besked" : "fejlbesked"}=${encodeURIComponent(message)}`);
}

/** Slår moduler til og fra for firmaet. */
export async function saveModules(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const booking = formData.get("booking") === "on";
  const agency = formData.get("agency") === "on";
  await db
    .update(schema.workspaces)
    .set({ bookingEnabled: booking, agencyEnabled: agency })
    .where(eq(schema.workspaces.id, workspace.id));
  if (booking) await getBookingSettings(workspace.id);
  revalidatePath("/", "layout");
  redirect(`/indstillinger?besked=${encodeURIComponent("Modulerne er gemt.")}`);
}

const rulesSchema = z.object({
  slotMinutes: z.coerce
    .number()
    .int()
    .refine((n) => [10, 15, 20, 30, 45, 60, 90, 120].includes(n), "Ugyldigt interval"),
  capacity: z.coerce.number().int().min(1, "Mindst 1 samtidig booking").max(50),
  minNoticeHours: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 14),
  maxDaysAhead: z.coerce.number().int().min(1).max(365),
  cancelHours: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 14),
  intro: z.string().trim().max(2000),
});

export async function saveBookingRules(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireBookingModule("ADMIN");
  const values = Object.fromEntries(
    ["slotMinutes", "capacity", "minNoticeHours", "maxDaysAhead", "cancelHours", "intro"].map((k) => [
      k,
      String(formData.get(k) ?? ""),
    ]),
  );
  const parsed = rulesSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const days: OpeningDay[] = [];
  for (let i = 0; i < 7; i++) {
    const open = formData.get(`open_${i}`) === "on";
    const from = String(formData.get(`from_${i}`) ?? "");
    const to = String(formData.get(`to_${i}`) ?? "");
    if (open && (!isTime(from) || !isTime(to) || timeToMinutes(from) >= timeToMinutes(to))) {
      return { error: "Hver åben dag skal have et 'fra' før 'til'.", values };
    }
    days.push({ open, from: isTime(from) ? from : "08:00", to: isTime(to) ? to : "16:00" });
  }
  await getBookingSettings(workspace.id);
  await db
    .update(schema.bookingSettings)
    .set({ ...parsed.data, intro: parsed.data.intro || null, openingHours: days, updatedAt: new Date() })
    .where(eq(schema.bookingSettings.workspaceId, workspace.id));
  revalidatePath(PATH);
  return { success: "Gemt." };
}

/** Laver et nyt bookinglink. Det gamle holder op med at virke. */
export async function newBookingLink() {
  const { workspace } = await requireBookingModule("ADMIN");
  await getBookingSettings(workspace.id);
  await db
    .update(schema.bookingSettings)
    .set({ key: randomBytes(9).toString("base64url"), updatedAt: new Date() })
    .where(eq(schema.bookingSettings.workspaceId, workspace.id));
  done("Der er lavet et nyt bookinglink. Husk at opdatere det på hjemmeside og Instagram.");
}

const serviceSchema = z.object({
  name: z.string().trim().min(1, "Ydelsen skal have et navn").max(100),
  description: z.string().trim().max(500),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(5, "Varigheden skal være mindst 5 minutter")
    .max(24 * 60 * 5),
  reminderMonths: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 60), "Påmindelse skal være 1–60 måneder"),
});

type ServiceData = {
  name: string;
  description: string | null;
  durationMinutes: number;
  priceOre: number;
  reminderMonths: number | null;
  bookableOnline: boolean;
};

function parseService(formData: FormData): { ok: false; error: string } | { ok: true; data: ServiceData } {
  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? ""),
    durationMinutes: formData.get("durationMinutes"),
    reminderMonths: String(formData.get("reminderMonths") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const price = parseAmountOre(String(formData.get("price") ?? ""));
  if (price === null || price < 0) return { ok: false, error: "Ugyldig pris" };
  const d = parsed.data;
  return {
    ok: true,
    data: {
      name: d.name,
      description: d.description || null,
      durationMinutes: d.durationMinutes,
      priceOre: price,
      reminderMonths: d.reminderMonths ? Number(d.reminderMonths) : null,
      bookableOnline: formData.get("bookableOnline") === "on",
    },
  };
}

export async function addService(formData: FormData) {
  const { workspace } = await requireBookingModule("ADMIN");
  const parsed = parseService(formData);
  if (!parsed.ok) done(parsed.error, "fejl");
  const [{ pos }] = await db
    .select({ pos: max(schema.services.position) })
    .from(schema.services)
    .where(eq(schema.services.workspaceId, workspace.id));
  await db.insert(schema.services).values({ workspaceId: workspace.id, ...parsed.data, position: (pos ?? -1) + 1 });
  done(`Ydelsen "${parsed.data.name}" er oprettet.`);
}

export async function updateService(formData: FormData) {
  const { workspace } = await requireBookingModule("ADMIN");
  const service = await getService(workspace.id, formData.get("id"));
  if (!service) return;
  const parsed = parseService(formData);
  if (!parsed.ok) done(parsed.error, "fejl");
  await db
    .update(schema.services)
    .set({ ...parsed.data, active: formData.get("active") === "on" })
    .where(and(eq(schema.services.workspaceId, workspace.id), eq(schema.services.id, service.id)));
  done(`Ydelsen "${parsed.data.name}" er gemt.`);
}

/** Sletter ydelsen. Tidligere bookinger beholder navn og pris. */
export async function deleteService(formData: FormData) {
  const { workspace } = await requireBookingModule("ADMIN");
  const service = await getService(workspace.id, formData.get("id"));
  if (!service) return;
  await db.delete(schema.services).where(eq(schema.services.id, service.id));
  done(`Ydelsen "${service.name}" er slettet.`);
}
