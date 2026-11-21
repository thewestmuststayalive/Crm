import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { contactStatusEnum, type ContactStatus } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { formatCustomValue, getCustomFields } from "@/lib/custom-fields";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime, SOURCE_LABELS, STATUS_LABELS } from "@/lib/labels";
import { likePattern } from "@/lib/validation";

/** Eksporterer kontakterne (med samme søgning/filter som listen) som CSV. */
export async function GET(request: NextRequest) {
  const { workspace } = await requireWorkspace();
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const statusParam = request.nextUrl.searchParams.get("status");
  const status = contactStatusEnum.enumValues.includes(statusParam as ContactStatus)
    ? (statusParam as ContactStatus)
    : undefined;

  const filters: (SQL | undefined)[] = [eq(schema.contacts.workspaceId, workspace.id)];
  if (status) filters.push(eq(schema.contacts.status, status));
  if (q) {
    const p = likePattern(q);
    filters.push(
      or(
        ilike(schema.contacts.name, p),
        ilike(schema.contacts.email, p),
        ilike(schema.contacts.phone, p),
        ilike(schema.companies.name, p),
      ),
    );
  }

  const rows = await db
    .select({
      name: schema.contacts.name,
      title: schema.contacts.title,
      email: schema.contacts.email,
      phone: schema.contacts.phone,
      status: schema.contacts.status,
      source: schema.contacts.source,
      company: schema.companies.name,
      owner: schema.users.name,
      createdAt: schema.contacts.createdAt,
      custom: schema.contacts.custom,
    })
    .from(schema.contacts)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
    .leftJoin(schema.users, eq(schema.users.id, schema.contacts.ownerId))
    .where(and(...filters))
    .orderBy(desc(schema.contacts.createdAt))
    .limit(50_000);

  const customFields = await getCustomFields(workspace.id, "CONTACT");
  const csv = toCsv(
    ["Navn", "Stilling", "E-mail", "Telefon", "Status", "Kilde", "Virksomhed", "Ansvarlig", "Oprettet", ...customFields.map((f) => f.label)],
    rows.map((r) => [
      r.name,
      r.title,
      r.email,
      r.phone,
      STATUS_LABELS[r.status],
      SOURCE_LABELS[r.source],
      r.company,
      r.owner,
      formatDateTime(r.createdAt),
      ...customFields.map((f) => formatCustomValue(f, r.custom[f.id])),
    ]),
  );
  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(`kontakter-${date}.csv`, csv);
}
