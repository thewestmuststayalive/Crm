import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { getReviewRequestByToken } from "@/lib/reviews";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = {
  title: "Afmeld e-mails",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UnsubscribePage({ params }: PageProps<"/anmeld/[token]/afmeld">) {
  const { token } = await params;
  const row = await getReviewRequestByToken(token);
  if (!row) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Afmeld e-mails fra {row.workspaceName}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ønsker du ikke at modtage anmodninger om anmeldelser og lignende e-mails fra {row.workspaceName}, kan du
            afmelde dig her.
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
