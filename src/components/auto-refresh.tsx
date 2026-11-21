"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Henter siden igen med jævne mellemrum, så nye beskeder dukker op uden genindlæsning. */
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
