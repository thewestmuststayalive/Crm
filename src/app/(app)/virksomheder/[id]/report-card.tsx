"use client";

import { useActionState } from "react";
import { saveReportSettings, sendReportNow } from "@/app/actions/client-report";
import { CopyButton } from "@/components/copy-button";
import { buttonClass } from "@/components/styles";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function ReportControls({
  companyId,
  link,
  lastMonth,
  lastMonthLabel,
  isAdmin,
  initial,
}: {
  companyId: string;
  link: string;
  lastMonth: string;
  lastMonthLabel: string;
  isAdmin: boolean;
  initial: { enabled: boolean; email: string; fallbackEmail: string | null };
}) {
  const [saved, save] = useActionState(saveReportSettings.bind(null, companyId), {});
  const [sent, send] = useActionState(sendReportNow.bind(null, companyId), {});
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a
          href={`${link}?maaned=${lastMonth}`}
          target="_blank"
          rel="noreferrer"
          className={buttonClass("secondary", "px-2.5 py-1 text-xs")}
        >
          Se rapport for {lastMonthLabel}
        </a>
        <CopyButton text={link} label="Kopiér link" />
      </div>
      <form action={send} className="space-y-2">
        <input type="hidden" name="month" value={lastMonth} />
        <SubmitButton variant="secondary" pendingText="Sender…" className="px-2.5 py-1 text-xs">
          Send rapport for {lastMonthLabel} nu
        </SubmitButton>
        <FormMessage state={sent} />
      </form>
      {isAdmin && (
        <form action={save} className="space-y-2 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="reportEnabled" defaultChecked={initial.enabled} className="h-4 w-4" />
            Send automatisk den 1. i hver måned
          </label>
          <Field label="Modtager" htmlFor={`report-email-${companyId}`}>
            <Input
              id={`report-email-${companyId}`}
              name="reportEmail"
              type="email"
              defaultValue={saved.values?.reportEmail ?? initial.email}
              placeholder={initial.fallbackEmail ?? "kunde@firma.dk"}
            />
          </Field>
          <FormMessage state={saved} />
          <SubmitButton variant="secondary" className="px-2.5 py-1 text-xs">
            Gem
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
