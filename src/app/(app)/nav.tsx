"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; also?: string[] }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/kunder", label: "Kunder", also: ["/virksomheder"] },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/opgaver", label: "Opgaver" },
  { href: "/indbakke", label: "Indbakke" },
  { href: "/annoncer", label: "Annoncer" },
  { href: "/indstillinger", label: "Indstillinger" },
];

/** Hovedmenuen. `badges` viser fx antal ulæste beskeder ud for et menupunkt. */
export function Nav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
      {items.map((item) => {
        const active = [item.href, ...(item.also ?? [])].some(
          (href) => pathname === href || pathname.startsWith(href + "/"),
        );
        const badge = badges[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {item.label}
            {badge > 0 && (
              <span
                className="rounded-full bg-sky-600 px-1.5 text-[10px] font-semibold text-white"
                aria-label={`${badge} ulæste`}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
