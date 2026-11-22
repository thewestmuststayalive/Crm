import type { Metadata } from "next";
import QRCode from "qrcode";
import { PageHeader } from "@/components/display";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { getAppUrl } from "@/lib/url";

export const metadata: Metadata = { title: "Brug på telefonen" };

export default async function PhonePage() {
  await requireWorkspace();
  const link = `${await getAppUrl()}/dashboard`;
  const qrSvg = await QRCode.toString(link, { type: "svg", margin: 1, width: 192 });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Brug Kundespor på telefonen" subtitle="Læg Kundespor på hjemmeskærmen, så det åbner som en app." />

      <Card title="1. Åbn Kundespor på telefonen" description="Scan koden med telefonens kamera, eller åbn linket i browseren.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div
            className="h-48 w-48 shrink-0 rounded-md border border-slate-200 bg-white"
            role="img"
            aria-label="QR-kode til Kundespor"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="min-w-0 space-y-2 text-sm text-slate-700">
            <p className="font-medium break-all text-slate-900">{link}</p>
            <p>Log ind med den samme e-mail og adgangskode som her. Telefonen husker dig i 30 dage ad gangen.</p>
          </div>
        </div>
      </Card>

      <Card title="2. Læg det på hjemmeskærmen">
        <div className="grid gap-4 text-sm text-slate-700 sm:grid-cols-2">
          <section aria-label="iPhone">
            <h3 className="mb-2 font-semibold text-slate-900">iPhone (Safari)</h3>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Tryk på Del-knappen (firkanten med pilen op).</li>
              <li>Vælg &quot;Føj til hjemmeskærm&quot;.</li>
              <li>Tryk &quot;Tilføj&quot;.</li>
            </ol>
          </section>
          <section aria-label="Android">
            <h3 className="mb-2 font-semibold text-slate-900">Android (Chrome)</h3>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Tryk på de tre prikker øverst til højre.</li>
              <li>Vælg &quot;Installer app&quot; eller &quot;Føj til startskærm&quot;.</li>
              <li>Bekræft.</li>
            </ol>
          </section>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Herefter ligger Kundespor som et ikon på telefonen og åbner i fuld skærm uden browserens adresselinje. Første
          gang du åbner ikonet, skal du logge ind igen.
        </p>
      </Card>
    </div>
  );
}
