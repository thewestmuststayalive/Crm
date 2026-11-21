// Varigheder og måneder til tidsregistrering. Rene funktioner, der også bruges i browseren.

/**
 * Læser en varighed og returnerer minutter: "1:30", "1,5" (timer), "45" (minutter), "90m", "2t", "1t 15m".
 * Null ved ugyldigt input.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,3}):([0-5]\d)$/.exec(s))) return +m[1] * 60 + +m[2];
  if ((m = /^(\d{1,4})\s*(m|min|minutter)$/.exec(s))) return +m[1];
  if ((m = /^(\d{1,3})\s*(t|h|timer?)\s*(\d{1,2})\s*(m|min)?$/.exec(s))) return +m[1] * 60 + +m[3];
  if ((m = /^(\d{1,3}(?:[.,]\d{1,2})?)\s*(t|h|timer?)$/.exec(s)))
    return Math.round(Number(m[1].replace(",", ".")) * 60);
  // Et tal uden enhed: op til 12 læses som timer ("1,5"), større hele tal som minutter ("45").
  if ((m = /^(\d{1,3}(?:[.,]\d{1,2})?)$/.exec(s))) {
    const n = Number(m[1].replace(",", "."));
    return n <= 12 ? Math.round(n * 60) : Number.isInteger(n) ? n : null;
  }
  return null;
}

/** 90 → "1:30" */
export function formatHM(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/** 90 → "1,5 t" */
export function formatHours(minutes: number) {
  return `${(minutes / 60).toLocaleString("da-DK", { maximumFractionDigits: 1 })} t`;
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** "2026-11" → første og sidste dato i måneden. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const monthName = new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric", timeZone: "UTC" });
export function formatMonth(month: string) {
  return monthName.format(new Date(`${month}-01T00:00:00Z`));
}

/** Indeværende måned i dansk tid, "YYYY-MM". */
export function currentMonth(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now).slice(0, 7);
}
