import "server-only";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { BookingStatus } from "@/db/schema";
import { formatPlate, newBookingToken } from "./booking";
import { logEvent } from "./crm";
import { brandedEmail, isEmailConfigured, sendEmail } from "./email";
import { formatOre } from "./quote-math";
import { addDays, formatLongDate, localDate, localTime, zonedToUtc } from "./time";
import { getAppUrl } from "./url";

/** "mandag d. 23. november kl. 10:00" */
export function formatWhen(startsAt: Date) {
  return `${formatLongDate(localDate(startsAt))} kl. ${localTime(startsAt)}`;
}

type NewBooking = {
  workspaceId: string;
  contactId: string;
  vehicleId: string | null;
  serviceId: string | null;
  serviceName: string;
  priceOre: number;
  startsAt: Date;
  durationMinutes: number;
  source: "ONLINE" | "MANUAL";
  customerNote?: string | null;
  internalNote?: string | null;
  assigneeId?: string | null;
  createdById?: string | null;
  ipHash?: string | null;
  /** Antal samtidige bookinger der tillades. Null = ingen kontrol (personalet har valgt at overbooke). */
  capacity: number | null;
};

/**
 * Gemmer en booking. Kontrollen af ledig plads og indsættelsen sker under en lås pr. firma,
 * så to kunder ikke kan få den samme tid samtidig. Returnerer null, hvis tiden er optaget.
 */
export async function createBooking(input: NewBooking) {
  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}))`);
    if (input.capacity !== null) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.workspaceId, input.workspaceId),
            eq(schema.bookings.status, "CONFIRMED"),
            lt(schema.bookings.startsAt, endsAt),
            sql`${schema.bookings.endsAt} > ${input.startsAt}`,
          ),
        );
      if (n >= Math.max(1, input.capacity)) return null;
    }
    const [booking] = await tx
      .insert(schema.bookings)
      .values({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        vehicleId: input.vehicleId,
        serviceId: input.serviceId,
        serviceName: input.serviceName,
        priceOre: input.priceOre,
        startsAt: input.startsAt,
        endsAt,
        source: input.source,
        customerNote: input.customerNote || null,
        internalNote: input.internalNote || null,
        assigneeId: input.assigneeId ?? null,
        createdById: input.createdById ?? null,
        ipHash: input.ipHash ?? null,
        token: newBookingToken(),
      })
      .returning();
    return booking;
  });
}

/** Alt der skal bruges til en e-mail om en booking. */
async function bookingContext(bookingId: string) {
  const [row] = await db
    .select({
      booking: schema.bookings,
      contactName: schema.contacts.name,
      contactEmail: schema.contacts.email,
      plate: schema.vehicles.plate,
      ws: {
        name: schema.workspaces.name,
        address: schema.workspaces.address,
        phone: schema.workspaces.phone,
      },
      cancelHours: schema.bookingSettings.cancelHours,
    })
    .from(schema.bookings)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.bookings.contactId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookings.workspaceId))
    .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.bookings.vehicleId))
    .leftJoin(schema.bookingSettings, eq(schema.bookingSettings.workspaceId, schema.bookings.workspaceId))
    .where(eq(schema.bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

function details(ctx: NonNullable<Awaited<ReturnType<typeof bookingContext>>>) {
  const { booking, ws } = ctx;
  return [
    `Ydelse: ${booking.serviceName}`,
    `Tid: ${formatWhen(booking.startsAt)}`,
    ...(ctx.plate ? [`Bil: ${formatPlate(ctx.plate)}`] : []),
    ...(booking.priceOre > 0 ? [`Pris: ${formatOre(booking.priceOre)}`] : []),
    ...(ws.address ? [`Adresse: ${ws.address.replace(/\n/g, ", ")}`] : []),
  ];
}

type MailKind = "confirmation" | "reminder" | "cancelled" | "moved";

/** Sender en e-mail om bookingen til kunden. Returnerer om den blev sendt. */
export async function sendBookingEmail(bookingId: string, kind: MailKind) {
  if (!isEmailConfigured()) return false;
  const ctx = await bookingContext(bookingId);
  if (!ctx?.contactEmail) return false;
  const { booking, ws } = ctx;
  const url = `${await getAppUrl()}/book/aflys/${booking.token}`;
  const first = ctx.contactName.split(" ")[0];
  const when = formatWhen(booking.startsAt);
  const contactLine = ws.phone ? `Spørgsmål? Ring på ${ws.phone}.` : "Har du spørgsmål, så svar gerne på denne e-mail.";
  const cancelLine = `Kan du ikke komme, så aflys senest ${ctx.cancelHours ?? 24} timer før via knappen herunder.`;

  const content = {
    confirmation: {
      subject: `Bekræftelse: ${booking.serviceName} ${when}`,
      heading: `Tak for din booking, ${first}`,
      intro: `Vi glæder os til at se dig ${when}.`,
      button: true,
    },
    moved: {
      subject: `Ny tid: ${booking.serviceName} ${when}`,
      heading: `Din tid er flyttet, ${first}`,
      intro: `Din tid er nu ${when}.`,
      button: true,
    },
    reminder: {
      subject: `Påmindelse: ${booking.serviceName} i morgen kl. ${localTime(booking.startsAt)}`,
      heading: `Vi ses i morgen, ${first}`,
      intro: `Husk din tid ${when}.`,
      button: true,
    },
    cancelled: {
      subject: `Aflyst: ${booking.serviceName} ${when}`,
      heading: `Din tid er aflyst`,
      intro: `Din tid ${when} er aflyst. Du er velkommen til at booke en ny tid.`,
      button: false,
    },
  }[kind];

  const result = await sendEmail({
    to: ctx.contactEmail,
    subject: content.subject,
    ...brandedEmail({
      sender: ws.name,
      heading: content.heading,
      paragraphs: [content.intro, details(ctx).join("\n"), ...(content.button ? [cancelLine] : []), contactLine],
      button: content.button ? { label: "Se eller aflys din tid", url } : undefined,
      footer: `Sendt af ${ws.name}.`,
    }),
  });
  return result.sent;
}

/** Daglig kørsel: påmindelse til kunder med en tid i morgen (dansk tid). Returnerer antal sendte. */
export async function sendBookingReminders(now = new Date()) {
  if (!isEmailConfigured()) return 0;
  const tomorrow = addDays(localDate(now), 1);
  const due = await db
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookings.workspaceId))
    .where(
      and(
        eq(schema.bookings.status, "CONFIRMED"),
        isNull(schema.bookings.reminderSentAt),
        eq(schema.workspaces.bookingEnabled, true),
        gte(schema.bookings.startsAt, zonedToUtc(tomorrow, "00:00")),
        lt(schema.bookings.startsAt, zonedToUtc(addDays(tomorrow, 1), "00:00")),
      ),
    )
    .limit(1000);
  let sent = 0;
  for (const b of due) {
    if (await sendBookingEmail(b.id, "reminder")) {
      await db.update(schema.bookings).set({ reminderSentAt: new Date() }).where(eq(schema.bookings.id, b.id));
      sent++;
    }
  }
  return sent;
}

/** Skifter status og logger det på kundens tidslinje. */
export async function changeBookingStatus(
  booking: typeof schema.bookings.$inferSelect,
  status: BookingStatus,
  userId: string | null,
  reason: string,
) {
  await db
    .update(schema.bookings)
    .set({ status, cancelledAt: status === "CANCELLED" ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(schema.bookings.workspaceId, booking.workspaceId), eq(schema.bookings.id, booking.id)));
  await logEvent(booking.workspaceId, userId, `${booking.serviceName} ${formatWhen(booking.startsAt)}: ${reason}`, {
    contactId: booking.contactId,
  });
}

/**
 * Daglig kørsel: påmind kunder om en ny behandling, når ydelsens interval er gået
 * (fx coating efter 12 måneder). Kun seneste gennemførte booking, kun kunder der ikke har
 * booket igen, og kun påmindelser der er forfaldne inden for de seneste 60 dage.
 */
export async function sendServiceReminders(now = new Date()) {
  if (!isEmailConfigured()) return 0;
  const due = await db
    .select({
      booking: schema.bookings,
      months: schema.services.reminderMonths,
      contactName: schema.contacts.name,
      email: schema.contacts.email,
      plate: schema.vehicles.plate,
      wsName: schema.workspaces.name,
      key: schema.bookingSettings.key,
    })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.bookings.contactId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookings.workspaceId))
    .innerJoin(schema.bookingSettings, eq(schema.bookingSettings.workspaceId, schema.bookings.workspaceId))
    .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.bookings.vehicleId))
    .where(
      and(
        eq(schema.bookings.status, "COMPLETED"),
        isNull(schema.bookings.serviceReminderSentAt),
        eq(schema.workspaces.bookingEnabled, true),
        sql`${schema.services.reminderMonths} is not null`,
        sql`${schema.contacts.email} is not null`,
        isNull(schema.contacts.emailOptOutAt),
        sql`${schema.bookings.startsAt} + make_interval(months => ${schema.services.reminderMonths}) <= ${now}`,
        sql`${schema.bookings.startsAt} + make_interval(months => ${schema.services.reminderMonths}) > ${now}::timestamptz - interval '60 days'`,
        // Ingen nyere booking hos samme kunde (så har de allerede booket igen).
        sql`not exists (select 1 from ${schema.bookings} later where later.contact_id = ${schema.bookings.contactId}
              and later.starts_at > ${schema.bookings.startsAt} and later.status in ('CONFIRMED', 'COMPLETED'))`,
      ),
    )
    .limit(500);

  const appUrl = await getAppUrl();
  let sent = 0;
  for (const row of due) {
    const { booking } = row;
    // Markér først, så en fejl midt i kørslen ikke giver dobbelte e-mails.
    const [claimed] = await db
      .update(schema.bookings)
      .set({ serviceReminderSentAt: new Date() })
      .where(and(eq(schema.bookings.id, booking.id), isNull(schema.bookings.serviceReminderSentAt)))
      .returning({ id: schema.bookings.id });
    if (!claimed) continue;
    const first = row.contactName.split(" ")[0];
    const result = await sendEmail({
      to: row.email!,
      subject: `Tid til ${booking.serviceName.toLowerCase()} igen?`,
      headers: { "List-Unsubscribe": `<${appUrl}/book/afmeld/${booking.token}>` },
      ...brandedEmail({
        sender: row.wsName,
        heading: `Hej ${first}`,
        paragraphs: [
          `Det er ${row.months} måneder siden, ${row.plate ? `bilen (${formatPlate(row.plate)})` : "din bil"} fik ${booking.serviceName.toLowerCase()} hos os.`,
          "Det er et godt tidspunkt at få det gjort igen. Book en tid, når det passer dig.",
        ],
        button: { label: "Book tid", url: `${appUrl}/book/${row.key}` },
        footer: `Sendt af ${row.wsName}.`,
        unsubscribeUrl: `${appUrl}/book/afmeld/${booking.token}`,
      }),
    });
    if (!result.sent) {
      await db.update(schema.bookings).set({ serviceReminderSentAt: null }).where(eq(schema.bookings.id, booking.id));
      continue;
    }
    await logEvent(booking.workspaceId, null, `Påmindelse om ny behandling sendt: ${booking.serviceName}`, {
      contactId: booking.contactId,
    });
    sent++;
  }
  return sent;
}
