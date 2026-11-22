"use client";

import { useActionState, useState } from "react";
import { saveBranding } from "@/app/actions/workspace";
import { Field, FormMessage, SubmitButton } from "@/components/ui";

export function BrandingForm({ color, logoUrl, name }: { color: string; logoUrl: string | null; name: string }) {
  const [state, action] = useActionState(saveBranding, {});
  const [preview, setPreview] = useState(color);
  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap items-center gap-6">
        <Field label="Firmafarve" htmlFor="brand-color">
          <input
            id="brand-color"
            name="brandColor"
            type="color"
            defaultValue={color}
            onChange={(e) => setPreview(e.target.value)}
            className="h-10 w-20 cursor-pointer rounded border border-slate-300 bg-white"
          />
        </Field>
        <div aria-hidden className="flex items-center gap-2 text-sm">
          <span className="rounded-md px-3 py-1.5 font-medium text-white" style={{ background: preview }}>
            Book tid
          </span>
          <span className="text-slate-500">Sådan ser knapperne ud</span>
        </div>
      </div>
      <Field label="Logo (PNG, JPG eller WebP, højst 300 KB)" htmlFor="brand-logo">
        <input
          id="brand-logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
      </Field>
      {logoUrl && (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- logoet hentes fra vores egen /logo-rute */}
          <img
            src={logoUrl}
            alt={`Logo for ${name}`}
            className="h-10 w-auto rounded border border-slate-200 bg-white p-1"
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="removeLogo" className="h-4 w-4" />
            Fjern logo
          </label>
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton>Gem udseende</SubmitButton>
    </form>
  );
}
