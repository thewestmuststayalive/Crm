"use client";

import { useActionState } from "react";
import { saveSmsSettings, sendTestSms } from "@/app/actions/sms";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function SmsSettingsForm({
  current,
}: {
  current: { hasToken: boolean; sender: string; confirmation: boolean; reminder: boolean; monthlyLimit: number } | null;
}) {
  const [state, action] = useActionState(saveSmsSettings, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={current?.hasToken ? "Ny API-nøgle (valgfri)" : "API-nøgle fra GatewayAPI"} htmlFor="sms-token">
          <Input
            id="sms-token"
            name="token"
            type="password"
            autoComplete="off"
            required={!current?.hasToken}
            placeholder={current?.hasToken ? "Gemt – udfyld kun for at skifte" : ""}
          />
        </Field>
        <Field label="Afsendernavn (højst 11 tegn)" htmlFor="sms-sender">
          <Input id="sms-sender" name="sender" maxLength={11} required defaultValue={v.sender ?? current?.sender ?? ""} placeholder="Bilpleje" />
        </Field>
        <Field label="Loft pr. måned (SMS-dele)" htmlFor="sms-limit">
          <Input
            id="sms-limit"
            name="monthlyLimit"
            type="number"
            min={0}
            max={20000}
            required
            defaultValue={v.monthlyLimit ?? current?.monthlyLimit ?? 300}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="confirmation" defaultChecked={current?.confirmation ?? true} />
        Bekræftelse, når en kunde booker online
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="reminder" defaultChecked={current?.reminder ?? true} />
        Påmindelse dagen før
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton>Gem SMS-indstillinger</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function TestSmsForm() {
  const [state, action] = useActionState(sendTestSms, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="w-56">
        <Field label="Dit mobilnummer" htmlFor="sms-test">
          <Input id="sms-test" name="phone" type="tel" required />
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingText="Sender…">
        Send test-SMS
      </SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
