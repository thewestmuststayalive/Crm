"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; soon?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/kunder", label: "Kunder", soon: true },
  { href: "/pipeline", label: "Pipeline", soon: true },
  { href: "/opgaver", label: "Opgaver", soon: true },
  { href: "/indbakke", label: "Indbakke", soon: true },
  { href: "/indstillinger", label: "Indstillinger" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
      {items.map((item) => {
        if (item.soon) {
          return (
            <span
              key={item.href}
              className="flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-slate-400"
              title="Kommer i en senere fase"
            >
              {item.label}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Snart</span>
            </span>
          );
        }
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium ${
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
