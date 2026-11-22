"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit } from "@/app/api/search/route";
import { cx } from "@/components/styles";

type Modules = { booking: boolean; agency: boolean };
type Item = { type: string; label: string; detail?: string | null; href: string };

/** Genveje, der altid kan vælges i søgefeltet. */
function actions(modules: Modules): Item[] {
  return [
    { type: "Opret", label: "Ny kontakt", href: "/kunder/ny" },
    { type: "Opret", label: "Ny virksomhed", href: "/virksomheder/ny" },
    { type: "Opret", label: "Ny deal", href: "/pipeline/ny" },
    { type: "Opret", label: "Ny opgave", href: "/opgaver" },
    ...(modules.booking ? [{ type: "Opret", label: "Ny booking", href: "/kalender/ny" }] : []),
    ...(modules.agency
      ? [
          { type: "Opret", label: "Registrér tid", href: "/tid" },
          { type: "Opret", label: "Nyt projekt", href: "/projekter" },
        ]
      : []),
    { type: "Gå til", label: "Dashboard", href: "/dashboard" },
    { type: "Gå til", label: "Venter på svar", href: "/venter" },
    { type: "Gå til", label: "Pipeline", href: "/pipeline" },
    ...(modules.booking ? [{ type: "Gå til", label: "Kalender", href: "/kalender" }] : []),
    { type: "Gå til", label: "Indbakke", href: "/indbakke" },
    { type: "Gå til", label: "Indstillinger", href: "/indstillinger" },
  ];
}

export function CommandPalette({ modules }: { modules: Modules }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setActive(0);
  }, []);

  // Ctrl+K / Cmd+K eller "/" åbner søgningen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("kundespor:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("kundespor:search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Søg i databasen, når der er skrevet mindst 2 tegn.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal });
        if (res.ok) setHits(((await res.json()) as { hits: SearchHit[] }).hits);
      } catch {
        // Afbrudt søgning – ignorer.
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shortcuts = actions(modules).filter((a) => !q || a.label.toLowerCase().includes(q));
    return q.length >= 2 ? [...hits, ...shortcuts] : shortcuts;
  }, [hits, modules, query]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-md bg-white/8 px-3 py-1.5 text-left text-sm text-brand-100 hover:bg-white/12"
        aria-label="Søg og genveje"
      >
        <span className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Søg …
        </span>
        <kbd className="hidden rounded bg-white/10 px-1.5 text-[10px] text-brand-200 md:inline">Ctrl K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh]"
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Søg"
            className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
                if (e.target.value.trim().length < 2) setHits([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  go(items[active]);
                }
              }}
              placeholder="Søg på kunde, telefon, deal, nummerplade … eller skriv 'ny'"
              aria-label="Søgeord"
              className="w-full border-b border-slate-200 px-4 py-3 text-base outline-none"
            />
            <ul role="listbox" aria-label="Resultater" className="max-h-[50vh] overflow-y-auto py-1">
              {items.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Ingen resultater.</li>}
              {items.map((item, i) => (
                <li
                  key={`${item.type}-${item.href}-${item.label}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(item);
                  }}
                  className={cx(
                    "flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm",
                    i === active ? "bg-brand-50" : "",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{item.label}</span>
                    {item.detail && <span className="block truncate text-xs text-slate-500">{item.detail}</span>}
                  </span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {item.type}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
              ↑↓ for at vælge · Enter for at åbne · Esc for at lukke
            </p>
          </div>
        </div>
      )}
    </>
  );
}
