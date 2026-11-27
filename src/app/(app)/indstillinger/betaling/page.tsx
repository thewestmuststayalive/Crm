import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { disconnectStripe } from "@/app/actions/payments";
import { Card, ConfirmButton } from "@/components/ui";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { getModules } from "@/lib/modules";
import { oreToInput } from "@/lib/quote-math";
import { getStripeConnection } from "@/lib/stripe";
import { DepositForm, StripeKeyForm } from "./forms";

export const metadata: Metadata = { title: "Betaling" };

export default async function PaymentSettingsPage() {
  const { workspace } = await requireRole("ADMIN");
  const [conn, modules, [settings]] = await Promise.all([
    isEncryptionConfigured() ? getStripeConnection(workspace.id) : null,
    getModules(workspace.id),
    db
      .select({ depositOre: schema.bookingSettings.depositOre })
      .from(schema.bookingSettings)
      .where(eq(schema.bookingSettings.workspaceId, workspace.id))
      .limit(1),
  ]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Kunderne kan betale fakturaer og depositum med MobilePay eller kort via Stripe. Betalingen registreres automatisk
        i Kundespor.
      </p>
      {!conn ? (
        <Card title="Forbind Stripe" description="Ingen fast pris – Stripe tager et gebyr pr. betaling.">
          <div className="space-y-4">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
              <li>
                Opret en konto på <span className="font-medium">stripe.com</span> med firmaets CVR og bankkonto.
              </li>
              <li>
                Slå <span className="font-medium">MobilePay</span> til under Indstillinger → Betalingsmetoder i Stripe (kort
                er slået til fra start).
              </li>
              <li>
                Kopiér den hemmelige nøgle under Udviklere → API-nøgler, og sæt den ind herunder. Kundespor gemmer den
                krypteret og opretter selv forbindelsen, der fortæller, når en kunde har betalt.
              </li>
            </ol>
            <StripeKeyForm />
            <p className="text-xs text-slate-500">
              Gebyr hos Stripe: ca. 1,5 % + 1,80 kr. pr. dansk kortbetaling. MobilePay koster lidt mere (Vipps MobilePays
              eget gebyr kommer oveni).
            </p>
          </div>
        </Card>
      ) : (
        <Card title="Stripe er forbundet">
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              <span className="font-medium">{conn.accountName ?? "Stripe-konto"}</span> ·{" "}
              {conn.livemode ? "rigtige betalinger" : "testtilstand (ingen rigtige penge)"}
            </p>
            <p className="text-slate-600">
              Fakturasiden viser nu &quot;Betal med MobilePay eller kort&quot;. Husk at registrere udbetalingerne fra Stripe i
              e-conomic.
            </p>
            <form action={disconnectStripe}>
              <ConfirmButton className="px-3 py-1.5 text-xs" message="Afbryd forbindelsen til Stripe?">
                Afbryd forbindelsen
              </ConfirmButton>
            </form>
          </div>
        </Card>
      )}
      {modules.booking && (
        <Card
          title="Depositum ved onlinebooking"
          description="Kunden betaler et depositum med MobilePay eller kort, når de booker online. 0 = intet depositum."
        >
          {conn ? (
            <DepositForm current={settings?.depositOre ? oreToInput(settings.depositOre) : ""} />
          ) : (
            <p className="text-sm text-slate-500">Forbind Stripe først.</p>
          )}
        </Card>
      )}
    </div>
  );
}
