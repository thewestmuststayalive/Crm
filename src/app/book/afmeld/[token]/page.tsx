import { eq } from "drizzle-orm";
import { BrandHeader } from "@/components/brand-header";
import { brandStyle, getBranding } from "@/lib/branding";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { db, schema } from "@/db";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = {
  title: "Afmeld påmindelser",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UnsubscribeBookingPage({ params }: PageProps<"/book/afmeld/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const [row] = await db
    .select({ name: schema.workspaces.name, workspaceId: schema.workspaces.id })
    .from(schema.bookings)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.bookings.workspaceId))
    .where(eq(schema.bookings.token, token))
    .limit(1);
  if (!row) notFound();
  const brand = await getBranding(row.workspaceId);
  return (
    <main
      style={brandStyle(brand.color)}
      className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"
    >
      <div className="w-full max-w-md space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <BrandHeader brand={brand} className="mb-4" />
          <h1 className="text-lg font-semibold text-slate-900">Afmeld påmindelser fra {row.name}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Du får så ikke flere påmindelser om nye behandlinger eller lignende e-mails. Bekræftelser på tider, du selv
            booker, får du stadig.
          </p>
          <div className="mt-5">
            <UnsubscribeForm token={token} />
          </div>
        </section>
        <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
          Sendt via <Logo size={18} />
        </p>
      </div>
    </main>
  );
}
