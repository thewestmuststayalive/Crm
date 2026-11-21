"use client";

import { useTransition } from "react";
import { moveDeal } from "@/app/actions/deals";
import { Select } from "@/components/ui";

/** Skift fase direkte fra dealsiden (virker også på mobil, hvor træk-og-slip ikke gør). */
export function StageSelect({
  dealId,
  stageId,
  stages,
}: {
  dealId: string;
  stageId: string;
  stages: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="stage-select" className="text-sm text-slate-600">
        Fase
      </label>
      <Select
        id="stage-select"
        key={stageId}
        defaultValue={stageId}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => moveDeal(dealId, next));
        }}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
