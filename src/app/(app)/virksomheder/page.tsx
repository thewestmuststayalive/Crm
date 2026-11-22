import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { CustomerTabs } from "@/components/customer-tabs";
import { EmptyState, Pagination } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { likePattern } from "@/lib/validation";

export const metadata: Metadata = { title: "Virksomheder" };

const PAGE_SIZE = 50;

export default async function CompaniesPage({ searchParams }: PageProps<"/virksomheder">) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number.parseInt(String(sp.side ?? "1"), 10) || 1);

  const filters: (SQL | undefined)[] = [eq(schema.companies.workspaceId, workspace.id)];
  if (q) {
    const p = likePattern(q);
    filters.push(
      or(
        ilike(schema.companies.name, p),
        ilike(schema.companies.cvr, p),
        ilike(schema.companies.email, p),
        ilike(schema.companies.phone, p),
      ),
    );
  }

  const rows = await db
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      cvr: schema.companies.cvr,
      phone: schema.companies.phone,
      email: schema.companies.email,
      contactCount: count(schema.contacts.id),
    })
    .from(schema.companies)
    .leftJoin(schema.contacts, eq(schema.contacts.companyId, schema.companies.id))
    .where(and(...filters))
    .groupBy(schema.companies.id)
    .orderBy(asc(schema.companies.name))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  const hasMore = rows.length > PAGE_SIZE;
  const companies = rows.slice(0, PAGE_SIZE);
  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("side", String(p));
    const s = params.toString();
    return s ? `/virksomheder?${s}` : "/virksomheder";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Kunder</h1>
        <Link href="/virksomheder/ny" className={buttonClass()}>
          Ny virksomhed
        </Link>
      </div>
      <CustomerTabs />

      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Søg
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Søg på navn, CVR, e-mail eller telefon"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button className={buttonClass("secondary")}>Søg</button>
      </form>

      {companies.length === 0 ? (
        <EmptyState>{q ? "Ingen virksomheder matcher din søgning." : "Ingen virksomheder endnu."}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Navn</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">CVR</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Kontakt</th>
                <th className="px-4 py-3 text-right font-medium">Personer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/virksomheder/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{c.cvr ?? "–"}</td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{c.email ?? c.phone ?? "–"}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{c.contactCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} hasMore={hasMore} makeHref={makeHref} />
    </div>
  );
}
