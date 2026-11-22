// Dato og tid i dansk tid (Europe/Copenhagen) uafhængigt af serverens tidszone.
// Datoer er "YYYY-MM-DD", klokkeslæt er "HH:MM".

export const TIME_ZONE = "Europe/Copenhagen";

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function localParts(instant: Date) {
  const p = Object.fromEntries(partsFormat.formatToParts(instant).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Forskellen mellem dansk tid og UTC i millisekunder på et givet tidspunkt. */
function offsetMs(instant: Date) {
  const p = localParts(instant);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Dansk dato + klokkeslæt → tidspunkt (UTC). Tager højde for sommertid. */
export function zonedToUtc(dateIso: string, time: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - offsetMs(new Date(guess));
  const second = guess - offsetMs(new Date(first));
  return new Date(second);
}

/** Tidspunkt → dansk dato "YYYY-MM-DD". */
export function localDate(instant: Date) {
  const p = localParts(instant);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Tidspunkt → dansk klokkeslæt "HH:MM". */
export function localTime(instant: Date) {
  const p = localParts(instant);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}

/** Minutter efter midnat i dansk tid. */
export function localMinutes(instant: Date) {
  const p = localParts(instant);
  return p.h * 60 + p.mi;
}

export function addDays(dateIso: string, days: number) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Ugedag med mandag = 0 … søndag = 6. */
export function weekdayIndex(dateIso: string) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Mandagen i den uge, datoen ligger i. */
export function startOfWeek(dateIso: string) {
  return addDays(dateIso, -weekdayIndex(dateIso));
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"] as const;
export const WEEKDAYS_SHORT = ["man", "tir", "ons", "tor", "fre", "lør", "søn"] as const;

const longDate = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-11-23" → "mandag d. 23. november" */
export function formatLongDate(dateIso: string) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return longDate.format(new Date(Date.UTC(y, m - 1, d)));
}

/** "2026-11-23" → "23. nov." */
export function formatShortDate(dateIso: string) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return shortDate.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Varighed i minutter → "1 t 30 min" */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} t` : `${h} t ${m} min`;
}
