"use client";

import { useTransition } from "react";
import { moveDeal } from "@/app/actions/deals";
import type { DealStage } from "@/db/schema";
import { Select } from "@/components/ui";
import { STAGE_LABELS } from "@/lib/labels";

/** Skift fase direkte fra dealsiden (virker også på mobil, hvor træk-og-slip ikke gør). */
export function StageSelect({ dealId, stage }: { dealId: string; stage: DealStage }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="stage-select" className="text-sm text-slate-600">
        Fase
      </label>
      <Select
        id="stage-select"
        key={stage}
        defaultValue={stage}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => moveDeal(dealId, next));
        }}
      >
        {Object.entries(STAGE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
    </div>
  );
}
