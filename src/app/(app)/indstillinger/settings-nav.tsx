"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs: { href: string; label: string; module?: "booking" }[] = [
  { href: "/indstillinger", label: "Firma" },
  { href: "/indstillinger/medlemmer", label: "Medlemmer" },
  { href: "/indstillinger/booking", label: "Booking", module: "booking" },
  { href: "/indstillinger/salgsfaser", label: "Salgsfaser" },
  { href: "/indstillinger/felter", label: "Egne felter" },
  { href: "/indstillinger/automatik", label: "Automatik" },
  { href: "/indstillinger/anmeldelser", label: "Anmeldelser" },
  { href: "/indstillinger/kontaktformular", label: "Kontaktformular" },
  { href: "/indstillinger/meta", label: "Facebook & Instagram" },
  { href: "/indstillinger/persondata", label: "Persondata" },
  { href: "/indstillinger/profil", label: "Min profil" },
];

export function SettingsNav({ booking }: { booking: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4 overflow-x-auto border-b border-slate-200 whitespace-nowrap">
      {tabs
        .filter((tab) => !tab.module || booking)
        .map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
                active ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
    </nav>
  );
}
