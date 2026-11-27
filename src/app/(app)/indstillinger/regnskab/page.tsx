import type { Metadata } from "next";
import { disconnectEconomic } from "@/app/actions/economic";
import { buttonClass } from "@/components/styles";
import { Card, ConfirmButton } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import {
  EconomicError,
  economicConfigured,
  getEconomicConnection,
  getEconomicOptions,
  isReadOnlyPlan,
  missingSettings,
} from "@/lib/economic";
import { EconomicSettingsForm, TokenForm } from "./forms";

export const metadata: Metadata = { title: "Regnskab" };

const ERRORS: Record<string, string> = {
  opsaetning: "e-conomic er ikke sat op på serveren endnu (se vejledningen herunder).",
  afbrudt: "Forbindelsen blev afbrudt. Prøv igen.",
  token: "e-conomic godkendte ikke tokenet. Prøv igen.",
};

export default async function AccountingPage({ searchParams }: PageProps<"/indstillinger/regnskab">) {
  const { workspace } = await requireRole("ADMIN");
  const sp = await searchParams;
  const configured = economicConfigured() && isEncryptionConfigured();
  const conn = configured ? await getEconomicConnection(workspace.id) : null;
  let options: Awaited<ReturnType<typeof getEconomicOptions>> | null = null;
  let loadError: string | null = null;
  if (conn) {
    try {
      options = await getEconomicOptions(conn.grantToken);
    } catch (error) {
      loadError = error instanceof EconomicError ? error.message : "e-conomic svarede ikke.";
    }
  }
  const missing = conn ? missingSettings(conn.settings) : [];
  const error = typeof sp.fejl === "string" ? ERRORS[sp.fejl] : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Kundespor laver fakturaer i jeres e-conomic. Nummer, moms og bogføring sker i e-conomic, så I overholder
        bogføringsloven, og kunden får fakturaen på e-mail med PDF og et link.
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {sp.forbundet === "1" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          e-conomic er forbundet.
        </p>
      )}

      {!configured ? (
        <Card title="e-conomic er ikke sat op endnu" description="Det gøres én gang for Kundespor – derefter forbinder hvert firma selv.">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>
              Opret en gratis udvikleraftale på <span className="font-medium">secure.e-conomic.com/developer</span> (kræver
              CVR og MitID).
            </li>
            <li>Opret en app med rollen &quot;Superbruger&quot;. Notér &quot;App Secret Token&quot; og &quot;App Public Token&quot;.</li>
            <li>
              Under appens tokens: sæt redirect-adressen til <code className="rounded bg-slate-100 px-1">https://jeres-adresse/api/economic/callback</code>.
            </li>
            <li>
              I Vercel: tilføj <code className="rounded bg-slate-100 px-1">ECONOMIC_APP_SECRET_TOKEN</code> og{" "}
              <code className="rounded bg-slate-100 px-1">ECONOMIC_APP_PUBLIC_TOKEN</code>, og tryk &quot;Redeploy&quot;.
            </li>
          </ol>
        </Card>
      ) : !conn ? (
        <Card title="Forbind e-conomic" description="Du logger ind i e-conomic og godkender, at Kundespor må lave fakturaer.">
          <div className="space-y-4">
            <a href="/api/economic/connect" className={buttonClass()}>
              Forbind e-conomic
            </a>
            <p className="text-sm text-slate-600">
              Kræver e-conomic <span className="font-medium">Plus eller højere</span> – på Basis kan andre programmer ikke
              oprette fakturaer.
            </p>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-brand-700">Viste e-conomic et token i stedet?</summary>
              <div className="mt-3">
                <TokenForm />
              </div>
            </details>
          </div>
        </Card>
      ) : (
        <>
          <Card title="Forbundet til e-conomic">
            <div className="space-y-3 text-sm text-slate-700">
              <p>
                <span className="font-medium">{conn.companyName ?? "e-conomic"}</span>
                {conn.agreementNumber && ` · aftale ${conn.agreementNumber}`}
                {conn.planLevel && ` · abonnement: ${conn.planLevel}`}
              </p>
              {isReadOnlyPlan(conn.planLevel) && (
                <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                  Jeres abonnement ({conn.planLevel}) tillader kun, at andre programmer læser data. For at Kundespor kan lave
                  fakturaer, skal e-conomic opgraderes til Plus eller højere.
                </p>
              )}
              <form action={disconnectEconomic}>
                <ConfirmButton className="px-3 py-1.5 text-xs" message="Afbryd forbindelsen til e-conomic?">
                  Afbryd forbindelsen
                </ConfirmButton>
              </form>
            </div>
          </Card>
          <Card
            title="Standardvalg på fakturaer"
            description={missing.length ? `Mangler: ${missing.join(", ")}.` : "Bruges på alle fakturaer fra Kundespor."}
          >
            {options ? (
              <EconomicSettingsForm
                options={options}
                current={Object.fromEntries(
                  Object.entries(conn.settings).map(([k, v]) => [k, String(v)]),
                )}
              />
            ) : (
              <p className="text-sm text-red-700">{loadError}</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
