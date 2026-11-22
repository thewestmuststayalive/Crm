import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { getAppUrl } from "./url";

export const DEFAULT_BRAND_COLOR = "#1b6257";
export const LOGO_MAX_BYTES = 300 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export type Branding = { name: string; color: string; logoUrl: string | null };

/** Firmaets navn, farve og logo-adresse til kundesider og e-mails. */
export const getBranding = cache(async (workspaceId: string): Promise<Branding> => {
  const [row] = await db
    .select({ name: schema.workspaces.name, color: schema.workspaces.brandColor, logo: schema.workspaces.logoData })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  const version = row?.logo ? createHash("sha1").update(row.logo).digest("hex").slice(0, 10) : null;
  return {
    name: row?.name ?? "",
    color: isHexColor(row?.color) ? row.color : DEFAULT_BRAND_COLOR,
    logoUrl: version ? `${await getAppUrl()}/logo/${workspaceId}?v=${version}` : null,
  };
});

/** Felter til brandedEmail(): afsendernavn, farve og logo. */
export async function emailBrand(workspaceId: string) {
  const b = await getBranding(workspaceId);
  return { sender: b.name, color: b.color, logoUrl: b.logoUrl ?? undefined };
}

/**
 * Sætter firmafarven på alt indhold i en kundeside. Tailwinds brand-farver er CSS-variabler,
 * så knapper og markeringer følger automatisk med.
 */
export function brandStyle(color: string): React.CSSProperties {
  return {
    ["--color-brand-50" as string]: `color-mix(in srgb, ${color} 8%, white)`,
    ["--color-brand-100" as string]: `color-mix(in srgb, ${color} 16%, white)`,
    ["--color-brand-300" as string]: `color-mix(in srgb, ${color} 45%, white)`,
    ["--color-brand-500" as string]: `color-mix(in srgb, ${color} 85%, white)`,
    ["--color-brand-600" as string]: color,
    ["--color-brand-700" as string]: color,
    ["--color-brand-800" as string]: `color-mix(in srgb, ${color} 85%, black)`,
  };
}

// ---------- Egne tekster i e-mails ----------

export const EMAIL_TEXTS = {
  bookingConfirmation: {
    label: "Bekræftelse på booking",
    default: "Vi glæder os til at se dig {tid}.",
    vars: ["navn", "ydelse", "tid", "firma"],
  },
  bookingReminder: {
    label: "Påmindelse dagen før",
    default: "Husk din tid {tid}.",
    vars: ["navn", "ydelse", "tid", "firma"],
  },
  serviceReminder: {
    label: "Påmindelse om ny behandling",
    default:
      "Det er {måneder} måneder siden, {bil} fik {ydelse} hos os. Det er et godt tidspunkt at få det gjort igen. Book en tid, når det passer dig.",
    vars: ["navn", "ydelse", "måneder", "bil", "firma"],
  },
  quoteSent: {
    label: "Tilbud sendt til kunden",
    default: 'Tak for din interesse. Her er vores tilbud på "{titel}" på {beløb} inkl. moms.',
    vars: ["navn", "titel", "beløb", "firma"],
  },
} as const;

export type EmailTextKey = keyof typeof EMAIL_TEXTS;

/** Erstatter {navn}, {tid} osv. i teksten. Ukendte variabler bliver stående. */
export function fillTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{([a-zæøå]+)\}/gi, (whole, key: string) => vars[key.toLowerCase()] ?? whole);
}

/** Firmaets egen tekst – eller standardteksten – med variablerne udfyldt. */
export async function emailText(workspaceId: string, key: EmailTextKey, vars: Record<string, string>) {
  const [row] = await db
    .select({ texts: schema.workspaces.emailTexts })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  const custom = row?.texts?.[key]?.trim();
  return fillTemplate(custom || EMAIL_TEXTS[key].default, vars);
}
