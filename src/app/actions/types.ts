export type ActionState = {
  error?: string;
  success?: string;
  /** Indtastede værdier (aldrig adgangskoder), så formularen kan udfyldes igen efter en fejl. */
  values?: Record<string, string>;
};

/** Plukker de angivne tekstfelter ud af formularen – inkl. egne felter (cf_*). */
export function pickValues(formData: FormData, keys: string[]): Record<string, string> {
  const picked: Record<string, string> = Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("cf_") && typeof v === "string") picked[k] = v;
  }
  return picked;
}
