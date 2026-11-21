"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { moveDeal } from "@/app/actions/deals";
import type { DealStatus } from "@/db/schema";
import { formatIsoDate, formatKr } from "@/lib/labels";
import { cx } from "@/components/styles";

export type KanbanDeal = {
  id: string;
  title: string;
  value: number;
  stageId: string;
  contactName: string | null;
  companyName: string | null;
  ownerName: string | null;
  expectedCloseDate: string | null;
};

export type KanbanStage = { id: string; name: string; kind: DealStatus };

const COLUMN_STYLES: Record<DealStatus, string> = {
  OPEN: "border-t-brand-400",
  WON: "border-t-emerald-500",
  LOST: "border-t-slate-400",
};

/** Kanban-tavle. Træk et kort til en anden kolonne for at skifte fase. */
export function Kanban({ deals, stages }: { deals: KanbanDeal[]; stages: KanbanStage[] }) {
  const [optimistic, setOptimistic] = useOptimistic(deals, (state, move: { id: string; stageId: string }) =>
    state.map((d) => (d.id === move.id ? { ...d, stageId: move.stageId } : d)),
  );
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  // Markerer at tavlen er interaktiv (bruges af tests, så de ikke trækker kort før React er klar).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (rootRef.current) rootRef.current.dataset.ready = "true";
  }, []);

  function drop(stageId: string, id: string) {
    setOver(null);
    const deal = optimistic.find((d) => d.id === id);
    if (!deal || deal.stageId === stageId) return;
    startTransition(async () => {
      setOptimistic({ id, stageId });
      await moveDeal(id, stageId);
    });
  }

  return (
    <div ref={rootRef} data-kanban className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${stages.length}, minmax(170px, 1fr))`,
          minWidth: `${stages.length * 176}px`,
        }}
      >
        {stages.map((stage) => {
          const items = optimistic.filter((d) => d.stageId === stage.id);
          const total = items.reduce((sum, d) => sum + d.value, 0);
          return (
            <section
              key={stage.id}
              aria-label={stage.name}
              data-stage-name={stage.name}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage.id);
              }}
              onDragLeave={() => setOver((s) => (s === stage.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                drop(stage.id, e.dataTransfer.getData("text/plain"));
              }}
              className={cx(
                "flex min-h-64 flex-col rounded-lg border border-t-4 border-slate-200 bg-slate-50 p-2 transition",
                COLUMN_STYLES[stage.kind],
                over === stage.id && "bg-slate-100 ring-2 ring-slate-300",
              )}
            >
              <header className="mb-2 px-1">
                <h2 className="text-sm font-semibold text-slate-800">
                  {stage.name} <span className="font-normal text-slate-500">({items.length})</span>
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
