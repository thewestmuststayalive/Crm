// Rene beregninger til tilbud – bruges både på serveren og i editoren i browseren.

type LineAmounts = {
  quantity: string | number;
  unitPriceOre: number;
  discountPct: string | number;
};

const ore = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
  minimumFractionDigits: 2,
});

/** 125050 → "1.250,50 kr." */
export function formatOre(value: number) {
  return ore.format(value / 100);
}

/** Læser "1.250,50", "1250.50" eller "1250" (kr.) og returnerer øre. Null ved ugyldigt beløb. */
export function parseAmountOre(input: string): number | null {
  let s = input.replace(/\s|kr\.?|dkk/gi, "");
  if (s === "") return 0;
  if (!s.includes(",") && /^-?\d+\.\d{1,2}$/.test(s)) s = s.replace(".", ",");
  s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || Math.abs(n) > 100_000_000) return null;
  return Math.round(n * 100);
}

/** Læser et dansk tal som "2,5" eller "1.000" (antal, rabat). NaN ved ugyldigt input. */
export function parseDanishNumber(input: string) {
  const s = input.trim();
  if (s === "") return NaN;
  if (!s.includes(",") && /^\d+\.\d{1,2}$/.test(s)) return Number(s);
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export function lineTotalOre(line: LineAmounts) {
  const qty = Number(line.quantity);
  const discount = Number(line.discountPct);
  return Math.round(qty * line.unitPriceOre * (1 - discount / 100));
}

export function quoteTotals(lines: LineAmounts[], vatRate: number) {
  const subtotal = lines.reduce((sum, l) => sum + lineTotalOre(l), 0);
  const vat = Math.round((subtotal * vatRate) / 100);
  return { subtotal, vat, total: subtotal + vat };
}

/** Viser øre som redigerbar tekst: 125050 → "1250,50", 100000 → "1000". */
export function oreToInput(value: number) {
  return value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2).replace(".", ",");
}

/** "2.50" (fra databasen) → "2,5" */
export function numericToInput(value: string) {
  return String(Number(value)).replace(".", ",");
}
