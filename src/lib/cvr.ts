import "server-only";

// Opslag i CVR-registret via cvrapi.dk (gratis med begrænset antal opslag pr. dag).
// CVRAPI_TOKEN kan sættes for et betalt abonnement med flere opslag; CVR_API_URL bruges i tests.

export type CvrCompany = {
  cvr: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  /** Reklamebeskyttet: må ikke kontaktes med markedsføring uden samtykke. */
  protected: boolean;
};

type CvrApiResponse = {
  vat?: number;
  name?: string;
  address?: string | null;
  zipcode?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  industrydesc?: string | null;
  protected?: boolean;
  error?: string;
};

export class CvrError extends Error {}

export async function lookupCvr(query: string): Promise<CvrCompany | null> {
  const q = query.trim();
  if (q.length < 2 || q.length > 100) return null;
  const url = new URL(process.env.CVR_API_URL ?? "https://cvrapi.dk/api");
  url.searchParams.set(/^\d{8}$/.test(q.replace(/\s/g, "")) ? "vat" : "name", q.replace(/^(\d{2})\s?(\d{2})\s?(\d{2})\s?(\d{2})$/, "$1$2$3$4"));
  url.searchParams.set("country", "dk");
  if (process.env.CVRAPI_TOKEN) url.searchParams.set("token", process.env.CVRAPI_TOKEN);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Kundespor CRM" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new CvrError("CVR-registret svarer ikke lige nu. Prøv igen om lidt.");
  }
  if (res.status === 404) return null;
  if (res.status === 429 || res.status === 402) {
    throw new CvrError("Dagens gratis CVR-opslag er brugt. Prøv igen i morgen, eller udfyld felterne selv.");
  }
  const data = (await res.json().catch(() => ({}))) as CvrApiResponse;
  if (!res.ok || data.error === "NOT_FOUND" || !data.vat || !data.name) {
    if (data.error && data.error !== "NOT_FOUND") throw new CvrError("CVR-opslaget fejlede. Udfyld felterne selv.");
    return null;
  }

  const zipCity = [data.zipcode, data.city].filter(Boolean).join(" ");
  return {
    cvr: String(data.vat),
    name: data.name,
    address: [data.address, zipCity].filter(Boolean).join(", ") || null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    industry: data.industrydesc ?? null,
    protected: Boolean(data.protected),
  };
}
