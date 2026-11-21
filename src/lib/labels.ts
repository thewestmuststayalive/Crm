import type { ActivityType, ContactStatus, DealStatus, LeadSource } from "@/db/schema";

export const STATUS_LABELS: Record<ContactStatus, string> = {
  LEAD: "Lead",
  CUSTOMER: "Kunde",
  INACTIVE: "Inaktiv",
};

export const STATUS_STYLES: Record<ContactStatus, string> = {
  LEAD: "bg-amber-50 text-amber-800",
  CUSTOMER: "bg-emerald-50 text-emerald-800",
  INACTIVE: "bg-slate-100 text-slate-600",
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  MANUAL: "Manuel",
  WEBSITE: "Hjemmeside",
  META_LEAD: "Meta Lead Ads",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  PHONE: "Telefon",
  REFERRAL: "Anbefaling",
  OTHER: "Andet",
  IMPORT: "Import",
  BOOKING: "Onlinebooking",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  NOTE: "Note",
  CALL: "Opkald",
  EMAIL: "E-mail",
  MEETING: "Møde",
  SYSTEM: "Hændelse",
};

/** Aktivitetstyper brugeren selv kan vælge (SYSTEM oprettes automatisk). */
export const USER_ACTIVITY_TYPES = ["NOTE", "CALL", "EMAIL", "MEETING"] as const satisfies readonly ActivityType[];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  OPEN: "Åben",
  WON: "Vundet",
  LOST: "Tabt",
};

/** Farve på fase-mærker efter om fasen er åben, vundet eller tabt. */
export const DEAL_STATUS_STYLES: Record<DealStatus, string> = {
  OPEN: "bg-sky-50 text-sky-800",
  WON: "bg-emerald-50 text-emerald-800",
  LOST: "bg-slate-100 text-slate-600",
};

const kr = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 });
export function formatKr(value: number) {
  return kr.format(value);
}

/** Dagens dato i dansk tid som YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now);
}

/** Formaterer en YYYY-MM-DD-dato (fra en date-kolonne) på dansk. */
export function formatIsoDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

const dateTime = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Copenhagen",
});
const dateOnly = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeZone: "Europe/Copenhagen" });

export function formatDateTime(d: Date) {
  return dateTime.format(d);
}

export function formatDate(d: Date) {
  return dateOnly.format(d);
}
