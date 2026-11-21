"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/indstillinger", label: "Firma" },
  { href: "/indstillinger/medlemmer", label: "Medlemmer" },
  { href: "/indstillinger/kontaktformular", label: "Kontaktformular" },
  { href: "/indstillinger/profil", label: "Min profil" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4 overflow-x-auto border-b border-slate-200 whitespace-nowrap">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
              active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
