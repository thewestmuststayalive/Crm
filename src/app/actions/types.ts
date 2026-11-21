export type ActionState = {
  error?: string;
  success?: string;
  /** Indtastede værdier (aldrig adgangskoder), så formularen kan udfyldes igen efter en fejl. */
  values?: Record<string, string>;
};

/** Plukker de angivne tekstfelter ud af formularen. */
export function pickValues(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}
