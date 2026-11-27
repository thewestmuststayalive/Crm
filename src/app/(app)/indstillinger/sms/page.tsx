import type { Metadata } from "next";
import { disableSms } from "@/app/actions/sms";
import { Card, ConfirmButton } from "@/components/ui";
import { requireBookingModule } from "@/lib/modules";
import { getSmsSettings, smsUsageThisMonth } from "@/lib/sms";
import { SmsSettingsForm, TestSmsForm } from "./forms";

export const metadata: Metadata = { title: "SMS" };

export default async function SmsSettingsPage() {
  const { workspace } = await requireBookingModule("ADMIN");
  const [settings, used] = await Promise.all([getSmsSettings(workspace.id), smsUsageThisMonth(workspace.id)]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Send bekræftelse og påmindelse om bookinger på SMS – færre kunder glemmer deres tid. Der sendes kun servicebeskeder,
        aldrig reklame.
      </p>
      <Card
        title={settings ? "SMS er slået til" : "Slå SMS til"}
        description={settings ? `${used} af ${settings.monthlyLimit} SMS-dele brugt denne måned.` : undefined}
      >
        {!settings && (
          <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>
              Opret en gratis konto på <span className="font-medium">gatewayapi.eu</span> (dansk udbyder, data i EU) og
              indbetal fx 100 kr.
            </li>
            <li>Opret en API-nøgle under &quot;API → API Keys&quot;, og sæt den ind herunder.</li>
            <li>En SMS koster ca. 0,30 kr. Lange beskeder fylder 2 dele.</li>
          </ol>
        )}
        <SmsSettingsForm
          current={
            settings
              ? {
                  hasToken: true,
                  sender: settings.sender,
                  confirmation: settings.confirmation,
                  reminder: settings.reminder,
                  monthlyLimit: settings.monthlyLimit,
                }
              : null
          }
        />
      </Card>
      {settings && (
        <>
          <Card title="Test">
            <TestSmsForm />
          </Card>
          <form action={disableSms}>
            <ConfirmButton className="px-3 py-1.5 text-xs" message="Slå SMS fra og slet nøglen?">
              Slå SMS fra
            </ConfirmButton>
          </form>
        </>
      )}
    </div>
  );
}
