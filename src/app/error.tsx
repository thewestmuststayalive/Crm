"use client";

import { LogoMark } from "@/components/brand";
import { buttonClass } from "@/components/styles";

/** Vises hvis en side fejler uventet. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <LogoMark size={40} className="mx-auto" />
        <h1 className="mt-6 text-xl font-semibold text-slate-900">Noget gik galt</h1>
        <p className="mt-2 text-sm text-slate-600">
          Siden kunne ikke vises lige nu. Prøv igen om et øjeblik. Fortsætter problemet, så giv udvikleren denne kode:
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-slate-400">{error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className={buttonClass()}>
            Prøv igen
          </button>
          <a href="/dashboard" className={buttonClass("secondary")}>
            Til forsiden
          </a>
        </div>
      </div>
    </main>
  );
}
