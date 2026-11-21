// Felter man kan importere til, og automatisk genkendelse af kolonneoverskrifter.
// Ligger uden "server-only", så klientens import-guide kan bruge samme liste.

export const IMPORT_FIELDS = [
  { key: "name", label: "Navn" },
  { key: "firstName", label: "Fornavn" },
  { key: "lastName", label: "Efternavn" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefon" },
  { key: "company", label: "Virksomhed" },
  { key: "title", label: "Stilling" },
  { key: "status", label: "Status (lead/kunde/inaktiv)" },
  { key: "note", label: "Note" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export type Mapping = Partial<Record<ImportField, number>>;

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["navn", "name", "fulde navn", "fuldt navn", "full name", "kontakt", "kontaktperson", "kunde", "kundenavn"],
  firstName: ["fornavn", "first name", "firstname", "given name"],
  lastName: ["efternavn", "last name", "lastname", "surname", "family name"],
  email: ["email", "e-mail", "mail", "e-mailadresse", "emailadresse", "email address"],
  phone: ["telefon", "telefonnummer", "tlf", "tlf.", "tlf nr", "phone", "mobil", "mobilnummer", "mobile", "phone number"],
  company: ["virksomhed", "firma", "firmanavn", "company", "company name", "organisation", "organization"],
  title: ["stilling", "titel", "title", "job title", "jobtitel", "rolle"],
  status: ["status", "type", "kundetype"],
  note: ["note", "noter", "notes", "kommentar", "kommentarer", "bemærkning", "bemærkninger", "beskrivelse"],
};

const normalize = (s: string) => s.toLowerCase().replace(/[_*]/g, " ").replace(/\s+/g, " ").trim();

/** Foreslår hvilken kolonne der hører til hvilket felt ud fra overskrifterne. */
export function suggestMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && SYNONYMS[field.key].includes(normalize(h)));
    if (idx >= 0) {
      mapping[field.key] = idx;
      used.add(idx);
    }
  }
  return mapping;
}
