import "server-only";
import type { ProspectInput } from "@/lib/prospects";
import { LeadSourceError } from "./google";

// Søgning i CVR via Erhvervsstyrelsens "system-til-system"-adgang (Elasticsearch).
// Adgangen er gratis, men kræver brugernavn og adgangskode fra cvrselvbetjening@erst.dk:
// CVR_ES_USER og CVR_ES_PASSWORD i Vercel. CVR_ES_URL kan ændre adressen (bruges i tests).

const DEFAULT_URL = "http://distribution.virk.dk/cvr-permanent/virksomhed/_search";
const META = "Vrvirksomhed.virksomhedMetadata";
export const CVR_PAGE_SIZE = 50;

export const COMPANY_FORMS = [
  { code: "80", label: "ApS" },
  { code: "60", label: "A/S" },
  { code: "10", label: "Enkeltmandsvirksomhed" },
  { code: "30", label: "I/S" },
] as const;

/** Størrelser efter antal ansatte, oversat til CVR's intervalkoder. */
export const COMPANY_SIZES = {
  "1-4": { label: "1–4 ansatte", codes: ["ANTAL_1_1", "ANTAL_2_4"] },
  "5-19": { label: "5–19 ansatte", codes: ["ANTAL_5_9", "ANTAL_10_19"] },
  "20-99": { label: "20–99 ansatte", codes: ["ANTAL_20_49", "ANTAL_50_99"] },
  "100+": {
    label: "100+ ansatte",
    codes: ["ANTAL_100_199", "ANTAL_200_499", "ANTAL_500_999", "ANTAL_1000_999999"],
  },
} as const;
export type CompanySize = keyof typeof COMPANY_SIZES;

export type CvrFilters = {
  industry?: string | null;
  postFrom?: number | null;
  postTo?: number | null;
  form?: string | null;
  size?: CompanySize | null;
  foundedAfter?: string | null;
  name?: string | null;
};

export function cvrConfigured() {
  return Boolean(process.env.CVR_ES_USER && process.env.CVR_ES_PASSWORD);
}

/** Bygger Elasticsearch-forespørgslen. Eksporteret, så den kan testes. */
export function buildCvrQuery(f: CvrFilters, from: number) {
  const filter: unknown[] = [];
  const industry = f.industry?.trim();
  if (industry) {
    filter.push(
      /^\d{6}$/.test(industry)
        ? { term: { [`${META}.nyesteHovedbranche.branchekode`]: industry } }
        : { match_phrase_prefix: { [`${META}.nyesteHovedbranche.branchetekst`]: industry } },
    );
  }
  if (f.postFrom != null || f.postTo != null) {
    filter.push({
      range: {
        [`${META}.nyesteBeliggenhedsadresse.postnummer`]: {
          ...(f.postFrom != null ? { gte: f.postFrom } : {}),
          ...(f.postTo != null ? { lte: f.postTo } : {}),
        },
      },
    });
  }
  if (f.form) filter.push({ term: { [`${META}.nyesteVirksomhedsform.virksomhedsformkode`]: Number(f.form) } });
  if (f.size && COMPANY_SIZES[f.size]) {
    filter.push({
      bool: {
        should: COMPANY_SIZES[f.size].codes.map((code) => ({
          match: { [`${META}.nyesteMaanedsbeskaeftigelse.intervalKodeAntalAnsatte`]: code },
        })),
        minimum_should_match: 1,
      },
    });
  }
  if (f.foundedAfter) filter.push({ range: { [`${META}.stiftelsesDato`]: { gte: f.foundedAfter } } });
  if (f.name?.trim()) {
    filter.push({ match: { [`${META}.nyesteNavn.navn`]: { query: f.name.trim(), operator: "and" } } });
  }
  return {
    from,
    size: CVR_PAGE_SIZE,
    _source: [
      "Vrvirksomhed.cvrNummer",
      "Vrvirksomhed.reklamebeskyttet",
      "Vrvirksomhed.telefonNummer",
      "Vrvirksomhed.hjemmeside",
      `${META}.nyesteNavn`,
      `${META}.nyesteBeliggenhedsadresse`,
      `${META}.nyesteHovedbranche`,
      `${META}.nyesteVirksomhedsform`,
      `${META}.nyesteMaanedsbeskaeftigelse`,
      `${META}.nyesteKontaktoplysninger`,
      `${META}.stiftelsesDato`,
      `${META}.sammensatStatus`,
    ],
    query: {
      bool: {
        filter,
        // Kun aktive firmaer, og aldrig reklamebeskyttede.
        should: [
          { match: { [`${META}.sammensatStatus`]: "NORMAL" } },
          { match: { [`${META}.sammensatStatus`]: "Aktiv" } },
        ],
        minimum_should_match: 1,
        must_not: [{ term: { "Vrvirksomhed.reklamebeskyttet": true } }],
      },
    },
  };
}

type Contact = { kontaktoplysning?: string; hemmelig?: boolean; periode?: { gyldigTil?: string | null } };
type Doc = {
  Vrvirksomhed?: {
    cvrNummer?: number;
    reklamebeskyttet?: boolean;
    telefonNummer?: Contact[];
    hjemmeside?: Contact[];
    virksomhedMetadata?: {
      nyesteNavn?: { navn?: string };
      nyesteBeliggenhedsadresse?: {
        vejnavn?: string | null;
        husnummerFra?: number | null;
        bogstavFra?: string | null;
        etage?: string | null;
        sidedoer?: string | null;
        postnummer?: number | null;
        postdistrikt?: string | null;
        fritekst?: string | null;
      };
      nyesteHovedbranche?: { branchekode?: string; branchetekst?: string };
      nyesteVirksomhedsform?: { kortBeskrivelse?: string };
      nyesteMaanedsbeskaeftigelse?: { intervalKodeAntalAnsatte?: string | null; antalAnsatte?: number | null } | null;
      nyesteKontaktoplysninger?: string[];
      stiftelsesDato?: string | null;
    };
  };
};

const current = (list?: Contact[]) =>
  list?.find((c) => !c.hemmelig && !c.periode?.gyldigTil && c.kontaktoplysning)?.kontaktoplysning ?? null;

function employeesLabel(m?: { intervalKodeAntalAnsatte?: string | null; antalAnsatte?: number | null } | null) {
  if (!m) return null;
  if (typeof m.antalAnsatte === "number") return String(m.antalAnsatte);
  const match = m.intervalKodeAntalAnsatte?.match(/^ANTAL_(\d+)_(\d+)$/);
  if (!match) return null;
  if (match[1] === match[2]) return match[1];
  return Number(match[2]) >= 999999 ? `${match[1]}+` : `${match[1]}–${match[2]}`;
}

export function parseCvrHit(doc: Doc): ProspectInput | null {
  const v = doc.Vrvirksomhed;
  const meta = v?.virksomhedMetadata;
  if (!v?.cvrNummer || !meta?.nyesteNavn?.navn || v.reklamebeskyttet) return null;
  const a = meta.nyesteBeliggenhedsadresse;
  const street = a?.vejnavn
    ? [
        `${a.vejnavn} ${a.husnummerFra ?? ""}${a.bogstavFra ?? ""}`.trim(),
        a.etage ? `${a.etage}.${a.sidedoer ? ` ${a.sidedoer}` : ""}` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : (a?.fritekst ?? null);
  const city = a?.postnummer ? `${a.postnummer} ${a.postdistrikt ?? ""}`.trim() : null;
  const extra = meta.nyesteKontaktoplysninger ?? [];
  const phone = current(v.telefonNummer) ?? extra.find((c) => /^\+?[\d ]{8,}$/.test(c)) ?? null;
  const website = current(v.hjemmeside) ?? extra.find((c) => !c.includes("@") && /\.[a-z]{2,}/i.test(c)) ?? null;
  const branch = meta.nyesteHovedbranche;
  const cvr = String(v.cvrNummer).padStart(8, "0");
  return {
    source: "CVR",
    externalId: cvr,
    name: meta.nyesteNavn.navn.slice(0, 200),
    cvr,
    address: [street, city].filter(Boolean).join(", ").slice(0, 300) || null,
    phone: phone?.slice(0, 40) ?? null,
    website: website?.slice(0, 500) ?? null,
    industry: branch?.branchetekst
      ? `${branch.branchetekst}${branch.branchekode ? ` (${branch.branchekode})` : ""}`.slice(0, 200)
      : null,
    employees: employeesLabel(meta.nyesteMaanedsbeskaeftigelse),
    companyForm: meta.nyesteVirksomhedsform?.kortBeskrivelse?.slice(0, 60) ?? null,
    foundedAt: typeof meta.stiftelsesDato === "string" && /^\d{4}-\d{2}-\d{2}/.test(meta.stiftelsesDato)
      ? meta.stiftelsesDato.slice(0, 10)
      : null,
    rating: null,
    reviewCount: null,
    mapsUrl: null,
  };
}

export async function searchCvr(filters: CvrFilters, from = 0) {
  const user = process.env.CVR_ES_USER;
  const password = process.env.CVR_ES_PASSWORD;
  if (!user || !password) {
    throw new LeadSourceError("CVR-søgning er ikke sat op endnu. Se vejledningen nedenfor.");
  }
  let res: Response;
  try {
    res = await fetch(process.env.CVR_ES_URL ?? DEFAULT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
      },
      body: JSON.stringify(buildCvrQuery(filters, from)),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new LeadSourceError("CVR-registret svarede ikke. Prøv igen om lidt.");
  }
  if (!res.ok) {
    console.error("CVR-søgning fejlede", res.status, (await res.text().catch(() => "")).slice(0, 500));
    if (res.status === 401 || res.status === 403) {
      throw new LeadSourceError("CVR afviste adgangen. Tjek brugernavn og adgangskode i Vercel.");
    }
    throw new LeadSourceError("Søgningen i CVR fejlede. Prøv med færre eller andre filtre.");
  }
  const data = (await res.json()) as { hits?: { total?: number | { value?: number }; hits?: { _source?: Doc }[] } };
  const totalRaw = data.hits?.total;
  const total = typeof totalRaw === "number" ? totalRaw : (totalRaw?.value ?? 0);
  const results = (data.hits?.hits ?? [])
    .map((h) => (h._source ? parseCvrHit(h._source) : null))
    .filter((r): r is ProspectInput => r !== null);
  // Elasticsearch tillader højst 3.000 resultater i alt pr. søgning.
  const nextFrom = from + CVR_PAGE_SIZE < Math.min(total, 3000) ? from + CVR_PAGE_SIZE : null;
  return { results, total, nextFrom };
}
