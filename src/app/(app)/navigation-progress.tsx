"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Tynd bjælke øverst, fra man klikker på et link, til den nye side er klar – så appen
 * altid reagerer med det samme. Skjules, så snart adressen skifter.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const current = search ? `${pathname}?${search}` : pathname;
  // Adressen, vi var på, da der blev klikket. Bjælken vises, mens vi stadig står der.
  const [from, setFrom] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      const here = window.location.pathname + window.location.search;
      if (href === here || href.startsWith("#")) return;
      setFrom(here);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (from === null || from !== current) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden" role="progressbar" aria-label="Indlæser side">
      <div className="h-full w-1/3 animate-[progress_1s_ease-in-out_infinite] bg-accent-400" />
    </div>
  );
}
