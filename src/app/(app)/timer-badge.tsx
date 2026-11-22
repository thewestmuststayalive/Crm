"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatHM } from "@/lib/duration";

/** Lille visning i menuen, mens stopuret kører. */
export function TimerBadge({ startedAt, label }: { startedAt: string; label: string }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMinutes(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000)));
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [startedAt]);
  return (
    <Link
      href="/tid"
      className="mx-4 mb-2 flex items-center gap-2 rounded-md bg-accent-400/15 px-3 py-1.5 text-xs text-accent-100 hover:bg-accent-400/25"
      aria-label={`Stopur kører: ${label}`}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent-400" aria-hidden />
      <span className="font-mono font-semibold text-white">{minutes === null ? "…" : formatHM(minutes)}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
