import { BRAND_TAGLINE, Logo } from "@/components/brand";

const POINTS = [
  "Messenger, Instagram, hjemmeside og Lead Ads i én indbakke",
  "Se hvem der venter på svar – og hvor længe",
  "Fra annonce til vundet kunde, for alle dine firmaer",
];

/** Login og oprettelse: brandpanel til venstre (skjult på mobil), formular til højre. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-brand-950 p-12 text-brand-50 lg:flex lg:flex-col lg:justify-between">
        <Logo tone="light" size={32} />
        <div className="relative z-10 max-w-md">
          <p className="font-display text-4xl leading-tight font-bold tracking-tight text-white">{BRAND_TAGLINE}</p>
          <ul className="mt-8 space-y-3 text-brand-100">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent-400" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-brand-300">Dansk CRM til små virksomheder</p>
        {/* Dekorativt spor i baggrunden */}
        <svg
          className="pointer-events-none absolute -right-24 bottom-0 h-[70%] text-brand-800"
          viewBox="0 0 400 500"
          fill="none"
          aria-hidden
        >
          <path d="M40 480c0-160 120-190 200-220s140-90 140-220" stroke="currentColor" strokeWidth="28" strokeLinecap="round" />
          <circle cx="380" cy="40" r="26" className="fill-accent-400" />
        </svg>
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size={32} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
        </div>
      </section>
    </main>
  );
}
