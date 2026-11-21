import type { ActivityType, ContactStatus, DealStage, LeadSource } from "@/db/schema";

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

export const STAGE_LABELS: Record<DealStage, string> = {
  NEW: "Ny",
  CONTACTED: "Kontaktet",
  PROPOSAL: "Tilbud sendt",
  WON: "Vundet",
  LOST: "Tabt",
};

export const STAGE_STYLES: Record<DealStage, string> = {
  NEW: "bg-sky-50 text-sky-800",
  CONTACTED: "bg-indigo-50 text-indigo-800",
  PROPOSAL: "bg-amber-50 text-amber-800",
  WON: "bg-emerald-50 text-emerald-800",
  LOST: "bg-slate-100 text-slate-600",
};

export const OPEN_STAGES = ["NEW", "CONTACTED", "PROPOSAL"] as const satisfies readonly DealStage[];

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
