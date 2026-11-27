import "server-only";
import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, localDate, localTime, zonedToUtc } from "./time";
import { decrypt } from "./crypto";
import { formatWhen } from "./booking-flow";
import { getAppUrl } from "./url";

// SMS via GatewayAPI (gatewayapi.eu – dansk udbyder med data i EU). Hvert firma har sin egen
// konto; API-nøglen sættes ind under Indstillinger → SMS og gemmes krypteret.
// Der sendes kun servicebeskeder om bookinger (bekræftelse og påmindelse) – aldrig reklame.
// GATEWAYAPI_URL bruges kun i tests.

export class SmsError extends Error {}

const apiBase = () => (process.env.GATEWAYAPI_URL ?? "https://gatewayapi.eu").replace(/\/$/, "");

/** Telefonnummer til internationalt format uden "+": "20 30 40 50" → "4520304050". */
export function toMsisdn(phone: string | null | undefined) {
  if (!phone) return null;
  let p = phone.trim().replace(/[\s().-]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  else if (p.startsWith("00")) p = p.slice(2);
  else if (/^\d{8}$/.test(p)) p = `45${p}`;
  return /^\d{10,15}$/.test(p) ? p : null;
}

// Tegn i GSM 7-bit-alfabetet (inkl. æøå). Andre tegn (fx emoji) gør SMS'en dyrere (70 tegn pr. del).
const GSM = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM_EXT = new Set("^{}\\[~]|€");

/** Antal SMS-dele, beskeden fylder (hver del koster). */
export function smsParts(text: string) {
  const chars = [...text];
  const gsm = chars.every((c) => GSM.has(c) || GSM_EXT.has(c));
  if (gsm) {
    const len = chars.reduce((n, c) => n + (GSM_EXT.has(c) ? 2 : 1), 0);
    return len <= 160 ? 1 : Math.ceil(len / 153);
  }
  return chars.length <= 70 ? 1 : Math.ceil(chars.length / 67);
}

export function validSender(sender: string) {
  return /^[A-Za-z0-9 ]{2,11}$/.test(sender) && /[A-Za-z]/.test(sender);
}

async function request<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new SmsError("SMS-udbyderen svarede ikke.");
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    if (res.status === 401) throw new SmsError("GatewayAPI afviste nøglen. Tjek at den er kopieret korrekt.");
    throw new SmsError(err?.message ? `GatewayAPI: ${err.message}` : "SMS'en kunne ikke sendes.");
  }
  return (await res.json()) as T;
}

/** Tjekker nøglen og returnerer kontoens saldo. */
export async function getSmsAccount(token: string) {
  const me = await request<{ credit?: number; currency?: string }>(token, "GET", "/rest/me");
  return { credit: me.credit ?? null, currency: me.currency ?? null };
}

export async function sendSms(token: string, sender: string, to: string, message: string) {
  const res = await request<{ ids?: number[] }>(token, "POST", "/rest/mtsms", {
    sender,
    message,
    recipients: [{ msisdn: Number(to) }],
  });
  return res.ids?.[0] ?? null;
}

export async function getSmsSettings(workspaceId: string) {
  const [row] = await db
    .select()
    .from(schema.smsSettings)
    .where(eq(schema.smsSettings.workspaceId, workspaceId))
    .limit(1);
  return row ? { ...row, token: decrypt(row.tokenEnc) } : null;
}

/** SMS-dele sendt i indeværende måned (dansk tid). */
export async function smsUsageThisMonth(workspaceId: string, now = new Date()) {
  const first = `${localDate(now).slice(0, 7)}-01`;
  const [row] = await db
    .select({ parts: sql<number>`coalesce(sum(${schema.smsLog.parts}), 0)::int` })
    .from(schema.smsLog)
    .where(
      and(
        eq(schema.smsLog.workspaceId, workspaceId),
        eq(schema.smsLog.status, "sent"),
        gte(schema.smsLog.createdAt, zonedToUtc(first, "00:00")),
      ),
    );
  return row?.parts ?? 0;
}

/**
 * Sender bekræftelse eller påmindelse om en booking på SMS, hvis firmaet har slået det til.
 * Hver besked sendes højst én gang pr. booking (unik række i sms_log), og månedens loft overholdes.
 */
export async function sendBookingSms(bookingId: string, kind: "confirmation" | "reminder") {
  const [row] = await db
    .select({
      booking: schema.bookings,
      phone: schema.contacts.phone,
      name: schema.contacts.name,
      workspaceName: schema.workspaces.name,
    })
    .from(schema.bookings)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.bookings.contactId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookings.workspaceId))
    .where(eq(schema.bookings.id, bookingId))
    .limit(1);
  if (!row || row.booking.status !== "CONFIRMED") return false;
  const settings = await getSmsSettings(row.booking.workspaceId);
  if (!settings || !(kind === "confirmation" ? settings.confirmation : settings.reminder)) return false;
  const to = toMsisdn(row.phone);
  if (!to) return false;

  const first = row.name.split(" ")[0];
  const link = `${await getAppUrl()}/book/aflys/${row.booking.token}`;
  const message =
    kind === "confirmation"
      ? `Hej ${first}. Din tid hos ${row.workspaceName} er bekræftet: ${row.booking.serviceName} ${formatWhen(row.booking.startsAt)}. Se eller aflys: ${link}`
      : `Påmindelse: ${row.booking.serviceName} i morgen kl. ${localTime(row.booking.startsAt)} hos ${row.workspaceName}. Se eller aflys: ${link}`;
  const parts = smsParts(message);
  if ((await smsUsageThisMonth(row.booking.workspaceId)) + parts > settings.monthlyLimit) return false;

  // Reservér rækken først, så to samtidige kørsler ikke sender samme SMS.
  const [claimed] = await db
    .insert(schema.smsLog)
    .values({ workspaceId: row.booking.workspaceId, bookingId, kind, parts, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: schema.smsLog.id });
  if (!claimed) return false;
  try {
    await sendSms(settings.token, settings.sender, to, message);
    await db.update(schema.smsLog).set({ status: "sent" }).where(eq(schema.smsLog.id, claimed.id));
    return true;
  } catch (error) {
    await db
      .update(schema.smsLog)
      .set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 300) : "ukendt fejl" })
      .where(eq(schema.smsLog.id, claimed.id));
    return false;
  }
}

/** Daglig kørsel: SMS-påmindelse til kunder med en tid i morgen. */
export async function sendSmsReminders(now = new Date()) {
  const tomorrow = addDays(localDate(now), 1);
  const due = await db
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .innerJoin(schema.smsSettings, eq(schema.smsSettings.workspaceId, schema.bookings.workspaceId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookings.workspaceId))
    .where(
      and(
        eq(schema.bookings.status, "CONFIRMED"),
        eq(schema.smsSettings.reminder, true),
        eq(schema.workspaces.bookingEnabled, true),
        isNotNull(schema.bookings.contactId),
        gte(schema.bookings.startsAt, zonedToUtc(tomorrow, "00:00")),
        lt(schema.bookings.startsAt, zonedToUtc(addDays(tomorrow, 1), "00:00")),
      ),
    )
    .limit(1000);
  let sent = 0;
  for (const b of due) {
    if (await sendBookingSms(b.id, "reminder")) sent++;
  }
  return sent;
}
