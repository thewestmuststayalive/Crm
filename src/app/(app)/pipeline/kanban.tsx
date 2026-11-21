"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveDeal } from "@/app/actions/deals";
import type { DealStage } from "@/db/schema";
import { formatIsoDate, formatKr, STAGE_LABELS } from "@/lib/labels";
import { cx } from "@/components/styles";

export type KanbanDeal = {
  id: string;
  title: string;
  value: number;
  stage: DealStage;
  contactName: string | null;
  companyName: string | null;
  ownerName: string | null;
  expectedCloseDate: string | null;
};

const COLUMN_STYLES: Record<DealStage, string> = {
  NEW: "border-t-sky-400",
  CONTACTED: "border-t-indigo-400",
  PROPOSAL: "border-t-amber-400",
  WON: "border-t-emerald-500",
  LOST: "border-t-slate-400",
};

/** Kanban-tavle. Træk et kort til en anden kolonne for at skifte fase. */
export function Kanban({ deals, stages }: { deals: KanbanDeal[]; stages: DealStage[] }) {
  const [optimistic, setOptimistic] = useOptimistic(deals, (state, move: { id: string; stage: DealStage }) =>
    state.map((d) => (d.id === move.id ? { ...d, stage: move.stage } : d)),
  );
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<DealStage | null>(null);

  function drop(stage: DealStage, id: string) {
    setOver(null);
    const deal = optimistic.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    startTransition(async () => {
      setOptimistic({ id, stage });
      await moveDeal(id, stage);
    });
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="grid min-w-[880px] grid-cols-5 gap-3">
        {stages.map((stage) => {
          const items = optimistic.filter((d) => d.stage === stage);
          const total = items.reduce((sum, d) => sum + d.value, 0);
          return (
            <section
              key={stage}
              aria-label={STAGE_LABELS[stage]}
              data-stage={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                drop(stage, e.dataTransfer.getData("text/plain"));
              }}
              className={cx(
                "flex min-h-64 flex-col rounded-lg border border-t-4 border-slate-200 bg-slate-50 p-2 transition",
                COLUMN_STYLES[stage],
                over === stage && "bg-slate-100 ring-2 ring-slate-300",
              )}
            >
              <header className="mb-2 px-1">
                <h2 className="text-sm font-semibold text-slate-800">
                  {STAGE_LABELS[stage]} <span className="font-normal text-slate-500">({items.length})</span>
                </h2>
                <p className="text-xs text-slate-500">{formatKr(total)}</p>
              </header>
              <ul className="space-y-2">
                {items.map((d) => (
                  <li
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", d.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
                  >
                    <Link href={`/pipeline/${d.id}`} className="block text-sm font-medium text-slate-900 hover:underline">
                      {d.title}
                    </Link>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{formatKr(d.value)}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {[d.contactName, d.companyName].filter(Boolean).join(" · ") || "Ingen kunde"}
                    </p>
                    <p className="mt-1 flex justify-between gap-2 text-xs text-slate-400">
                      <span className="truncate">{d.ownerName ?? ""}</span>
                      {d.expectedCloseDate && <span>{formatIsoDate(d.expectedCloseDate)}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
