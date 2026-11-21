import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ugyldige id'er i URL'en skal give 404, ikke en databasefejl. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Valgfrit tekstfelt: tom streng bliver til null. */
export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Højst ${max} tegn`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.email("Ugyldig e-mail").nullable())
  .nullable()
  .default(null);

/** Valgfrit id fra en <select>: tom streng bliver til null. */
export const optionalId = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || isUuid(v), "Ugyldigt valg")
  .nullable()
  .default(null);

/** Escaper % og _ så brugerens søgetekst ikke tolkes som LIKE-mønster. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}
