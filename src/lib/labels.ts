import type { ActivityType, ContactStatus, LeadSource } from "@/db/schema";

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
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  NOTE: "Note",
  CALL: "Opkald",
  EMAIL: "E-mail",
  MEETING: "Møde",
};

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
