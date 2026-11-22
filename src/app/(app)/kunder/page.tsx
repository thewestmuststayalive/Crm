import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { CustomerTabs } from "@/components/customer-tabs";
import { EmptyState, Pagination, SourceBadge, StatusBadge } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { db, schema } from "@/db";
import { contactStatusEnum, type ContactStatus } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { getMemberOptions } from "@/lib/crm";
import { hasRole } from "@/lib/roles";
import { BulkForm, SelectAll } from "./bulk-form";
import { formatDate, STATUS_LABELS } from "@/lib/labels";
import { isUuid, likePattern } from "@/lib/validation";

export const metadata: Metadata = { title: "Kunder" };

const PAGE_SIZE = 50;

const SORTS = {
  nyeste: { label: "Nyeste først", order: () => [desc(schema.contacts.createdAt)] },
  aktivitet: { label: "Senest ændret", order: () => [desc(schema.contacts.updatedAt)] },
  navn: { label: "Navn A–Å", order: () => [asc(sql`lower(${schema.contacts.name})`)] },
  aeldste: { label: "Ældste først", order: () => [asc(schema.contacts.createdAt)] },
} as const;
type SortKey = keyof typeof SORTS;

export default async function ContactsPage({ searchParams }: PageProps<"/kunder">) {
  const { user, workspace } = await requireWorkspace();
  const sp = await searchParams;
  const sort: SortKey = typeof sp.sort === "string" && sp.sort in SORTS ? (sp.sort as SortKey) : "nyeste";
  // Ansvarlig: "mig", "ingen" eller en medarbejders id.
  const owner = sp.ansvarlig === "mig" || sp.ansvarlig === "ingen" || isUuid(sp.ansvarlig) ? String(sp.ansvarlig) : "";
  const members = await getMemberOptions(workspace.id);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const status = contactStatusEnum.enumValues.includes(sp.status as ContactStatus)
    ? (sp.status as ContactStatus)
    : undefined;
  const page = Math.max(1, Number.parseInt(String(sp.side ?? "1"), 10) || 1);

  const filters: (SQL | undefined)[] = [eq(schema.contacts.workspaceId, workspace.id)];
  if (status) filters.push(eq(schema.contacts.status, status));
  if (owner === "mig") filters.push(eq(schema.contacts.ownerId, user.id));
  else if (owner === "ingen") filters.push(isNull(schema.contacts.ownerId));
  else if (owner) filters.push(eq(schema.contacts.ownerId, owner));
  if (q) {
    const p = likePattern(q);
    filters.push(
      or(
        ilike(schema.contacts.name, p),
        ilike(schema.contacts.email, p),
        ilike(schema.contacts.phone, p),
        ilike(schema.companies.name, p),
        // Nummerplade (gemt uden mellemrum), så "ab 12 345" finder bilens ejer.
        sql`exists (select 1 from ${schema.vehicles} v where v.contact_id = ${schema.contacts.id} and v.plate ilike ${likePattern(q.toUpperCase().replace(/[^A-Z0-9ÆØÅ]/g, "") || q)})`,
      ),
    );
  }

  const rows = await db
    .select({
      id: schema.contacts.id,
      name: schema.contacts.name,
      email: schema.contacts.email,
      phone: schema.contacts.phone,
      status: schema.contacts.status,
      source: schema.contacts.source,
      createdAt: schema.contacts.createdAt,
      companyId: schema.companies.id,
      companyName: schema.companies.name,
    })
    .from(schema.contacts)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
    .where(and(...filters))
    .orderBy(...SORTS[sort].order(), desc(schema.contacts.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  const hasMore = rows.length > PAGE_SIZE;
  const contacts = rows.slice(0, PAGE_SIZE);

  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (owner) params.set("ansvarlig", owner);
    if (sort !== "nyeste") params.set("sort", sort);
    if (p > 1) params.set("side", String(p));
    const s = params.toString();
    return s ? `/kunder?${s}` : "/kunder";
  };
  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (status) exportParams.set("status", status);
  const selectClass = "rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Kunder</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/kunder/import" className={buttonClass("secondary")}>
            Importér
          </Link>
          <a href={`/kunder/eksport?${exportParams}`} className={buttonClass("secondary")}>
            Eksportér CSV
          </a>
          <Link href="/kunder/ny" className={buttonClass()}>
            Ny kontakt
          </Link>
        </div>
      </div>
      <CustomerTabs />
      {typeof sp.besked === "string" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {sp.besked}
        </p>
      )}

      <form className="flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Søg
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Søg på navn, e-mail, telefon, virksomhed eller nummerplade"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <label htmlFor="status" className="sr-only">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm"
        >
          <option value="">Alle statusser</option>
          {contactStatusEnum.enumValues.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <label htmlFor="ansvarlig" className="sr-only">
          Ansvarlig
        </label>
        <select id="ansvarlig" name="ansvarlig" defaultValue={owner} className={selectClass}>
          <option value="">Alle ansvarlige</option>
          <option value="mig">Mine kunder</option>
          {members
            .filter((m) => m.id !== user.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          <option value="ingen">Ingen ansvarlig</option>
        </select>
        <label htmlFor="sort" className="sr-only">
          Sortering
        </label>
        <select id="sort" name="sort" defaultValue={sort} className={selectClass}>
          {Object.entries(SORTS).map(([key, v]) => (
            <option key={key} value={key}>
              {v.label}
            </option>
          ))}
        </select>
        <button className={buttonClass("secondary")}>Søg</button>
      </form>

      {contacts.length === 0 ? (
        <EmptyState>
          {q || status || owner
            ? "Ingen kontakter matcher din søgning."
            : "Ingen kontakter endnu. Opret den første med “Ny kontakt”."}
        </EmptyState>
      ) : (
        <BulkForm members={members} isAdmin={hasRole(workspace.role, "ADMIN")} back={makeHref(page)}>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <SelectAll />
                  </th>
                  <th className="px-4 py-3 font-medium">Navn</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Virksomhed</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Kontakt</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Kilde</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Oprettet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        name="ids"
                        value={c.id}
                        aria-label={`Vælg ${c.name}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/kunder/${c.id}`} className="font-medium text-slate-900 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {c.companyId ? (
                        <Link href={`/virksomheder/${c.companyId}`} className="text-slate-700 hover:underline">
                          {c.companyName}
                        </Link>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{c.email ?? c.phone ?? "–"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <SourceBadge source={c.source} />
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BulkForm>
      )}
      <Pagination page={page} hasMore={hasMore} makeHref={makeHref} />
    </div>
  );
}
