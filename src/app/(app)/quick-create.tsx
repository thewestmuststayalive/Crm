"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Modules = { booking: boolean; agency: boolean };

/** "+ Ny"-knappen i menuen: opret det mest brugte med ét klik. */
export function QuickCreate({ modules }: { modules: Modules }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [
    { href: "/kunder/ny", label: "Kontakt" },
    { href: "/virksomheder/ny", label: "Virksomhed" },
    { href: "/pipeline/ny", label: "Deal" },
    { href: "/opgaver", label: "Opgave" },
    ...(modules.booking ? [{ href: "/kalender/ny", label: "Booking" }] : []),
    ...(modules.agency
      ? [
          { href: "/tid", label: "Tidsregistrering" },
          { href: "/projekter", label: "Projekt" },
        ]
      : []),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-full items-center rounded-md bg-accent-400 px-3 py-1.5 text-sm font-semibold text-brand-950 hover:bg-accent-300"
      >
        + Ny
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Opret ny"
          className="absolute top-full right-0 z-40 mt-1 w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {links.map((l) => (
            <Link
              key={l.href + l.label}
              href={l.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
