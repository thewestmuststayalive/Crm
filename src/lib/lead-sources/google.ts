import "server-only";
import type { ProspectInput } from "@/lib/prospects";

// Google Places API (New) – Text Search. Nøglen ligger i GOOGLE_PLACES_API_KEY (Vercel).
// GOOGLE_PLACES_URL bruges kun i tests. Telefon og hjemmeside er "Enterprise"-felter hos Google:
// 1.000 kald om måneden er gratis, derefter betales pr. kald. Hvert kald giver op til 20 firmaer.

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "nextPageToken",
].join(",");

type Place = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text?: string };
};

export class LeadSourceError extends Error {}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

export async function searchGooglePlaces(query: string, pageToken?: string | null) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new LeadSourceError("Google Maps-søgning er ikke sat op endnu. Se vejledningen nedenfor.");
  const base = (process.env.GOOGLE_PLACES_URL ?? "https://places.googleapis.com").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/v1/places:searchText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "da",
        regionCode: "DK",
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new LeadSourceError("Google svarede ikke. Prøv igen om lidt.");
  }
  if (!res.ok) {
    console.error("Google Places fejl", res.status, (await res.text().catch(() => "")).slice(0, 500));
    if (res.status === 403 || res.status === 401)
      throw new LeadSourceError("Google afviste nøglen. Tjek at Places API (New) er slået til, og at nøglen er rigtig.");
    if (res.status === 429) throw new LeadSourceError("Google-kvoten er brugt op for i dag. Prøv igen i morgen.");
    throw new LeadSourceError("Søgningen hos Google fejlede. Prøv igen om lidt.");
  }
  const data = (await res.json()) as { places?: Place[]; nextPageToken?: string };
  const results: ProspectInput[] = (data.places ?? [])
    .filter((p) => p.id && p.displayName?.text && p.businessStatus !== "CLOSED_PERMANENTLY")
    .map((p) => ({
      source: "GOOGLE" as const,
      externalId: p.id!.slice(0, 300),
      name: p.displayName!.text!.slice(0, 200),
      cvr: null,
      address: p.formattedAddress?.replace(/, Danmark$/, "").slice(0, 300) ?? null,
      phone: p.nationalPhoneNumber?.slice(0, 40) ?? null,
      website: p.websiteUri?.slice(0, 500) ?? null,
      industry: p.primaryTypeDisplayName?.text?.slice(0, 200) ?? null,
      employees: null,
      companyForm: null,
      foundedAt: null,
      rating: typeof p.rating === "number" ? p.rating : null,
      reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      mapsUrl: p.googleMapsUri?.slice(0, 500) ?? null,
    }));
  return { results, nextPageToken: data.nextPageToken ?? null };
}
