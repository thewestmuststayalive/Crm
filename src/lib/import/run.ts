import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ContactStatus } from "@/db/schema";
import type { Mapping } from "./fields";
import type { Table } from "./parse";

export type ImportResult = {
  created: number;
  skipped: number;
  companiesCreated: number;
  problems: { row: number; message: string }[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const last8 = (phone: string) => phone.replace(/\D/g, "").slice(-8);

function parseStatus(value: string): ContactStatus {
  const v = value.trim().toLowerCase();
  if (["kunde", "customer", "client", "aktiv kunde"].includes(v)) return "CUSTOMER";
  if (["inaktiv", "inactive", "tidligere kunde", "former"].includes(v)) return "INACTIVE";
  return "LEAD";
}

/**
 * Importerer kontakter fra en tabel. Kontakter, der allerede findes (samme e-mail eller
 * telefonnummer – også tidligere i samme fil), springes over. Virksomheder findes eller oprettes.
 * Data hentes og indsættes i store bidder, så tusindvis af rækker kan importeres hurtigt.
 */
export async function runImport(opts: {
  workspaceId: string;
  userId: string;
  table: Table;
  mapping: Mapping;
}): Promise<ImportResult> {
  const { workspaceId, userId, table, mapping } = opts;
  const get = (row: string[], key: keyof Mapping) => {
    const idx = mapping[key];
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  const existing = await db
    .select({ email: schema.contacts.email, phone: schema.contacts.phone })
    .from(schema.contacts)
    .where(eq(schema.contacts.workspaceId, workspaceId));
  const emails = new Set(existing.flatMap((c) => (c.email ? [c.email.toLowerCase()] : [])));
  const phones = new Set(existing.flatMap((c) => (c.phone && last8(c.phone).length === 8 ? [last8(c.phone)] : [])));

  const companyRows = await db
    .select({ id: schema.companies.id, name: schema.companies.name })
    .from(schema.companies)
    .where(eq(schema.companies.workspaceId, workspaceId));
  const companies = new Map(companyRows.map((c) => [c.name.toLowerCase(), c.id]));

  const result: ImportResult = { created: 0, skipped: 0, companiesCreated: 0, problems: [] };
  const contacts: (typeof schema.contacts.$inferInsert)[] = [];
  const notes: (typeof schema.activities.$inferInsert)[] = [];
  const newCompanies: (typeof schema.companies.$inferInsert)[] = [];

  table.rows.forEach((row, i) => {
    const rowNo = i + 2; // +1 for overskrift, +1 fordi rækker tælles fra 1 i Excel
    let email = get(row, "email").toLowerCase();
    const phone = get(row, "phone");
    if (email && !EMAIL_RE.test(email)) {
      result.problems.push({ row: rowNo, message: `Ugyldig e-mail "${email}" blev sprunget over` });
      email = "";
    }
    const fullName = [get(row, "firstName"), get(row, "lastName")].filter(Boolean).join(" ");
    const name = get(row, "name") || fullName || email || phone;
    if (!name) {
      result.problems.push({ row: rowNo, message: "Mangler navn, e-mail og telefon" });
      return;
    }

    const phoneKey = phone ? last8(phone) : "";
    if ((email && emails.has(email)) || (phoneKey.length === 8 && phones.has(phoneKey))) {
      result.skipped++;
      return;
    }
    if (email) emails.add(email);
    if (phoneKey.length === 8) phones.add(phoneKey);

    let companyId: string | null = null;
    const companyName = get(row, "company");
    if (companyName) {
      companyId = companies.get(companyName.toLowerCase()) ?? null;
      if (!companyId) {
        companyId = randomUUID();
        companies.set(companyName.toLowerCase(), companyId);
        newCompanies.push({ id: companyId, workspaceId, name: companyName.slice(0, 200), ownerId: userId });
      }
    }

    const id = randomUUID();
    contacts.push({
      id,
      workspaceId,
      name: name.slice(0, 200),
      email: email || null,
      phone: phone.slice(0, 50) || null,
      title: get(row, "title").slice(0, 100) || null,
      status: parseStatus(get(row, "status")),
      source: "IMPORT",
      companyId,
      ownerId: userId,
    });
    const note = get(row, "note");
    if (note) {
      notes.push({ workspaceId, contactId: id, authorId: userId, type: "NOTE", body: note.slice(0, 5000) });
    }
  });

  const CHUNK = 500;
  await db.transaction(async (tx) => {
    for (let i = 0; i < newCompanies.length; i += CHUNK) await tx.insert(schema.companies).values(newCompanies.slice(i, i + CHUNK));
    for (let i = 0; i < contacts.length; i += CHUNK) await tx.insert(schema.contacts).values(contacts.slice(i, i + CHUNK));
    for (let i = 0; i < notes.length; i += CHUNK) await tx.insert(schema.activities).values(notes.slice(i, i + CHUNK));
  });

  result.created = contacts.length;
  result.companiesCreated = newCompanies.length;
  return result;
}
