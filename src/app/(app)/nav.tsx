"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; also?: string[]; module?: "booking" | "agency" }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/venter", label: "Venter på svar" },
  { href: "/kunder", label: "Kunder", also: ["/virksomheder"] },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/kalender", label: "Kalender", also: ["/biler"], module: "booking" },
  { href: "/opgaver", label: "Opgaver" },
  { href: "/tid", label: "Tid", module: "agency" },
  { href: "/indbakke", label: "Indbakke" },
  { href: "/annoncer", label: "Annoncer" },
  { href: "/indstillinger", label: "Indstillinger" },
];

/** Hovedmenuen. `badges` viser fx antal ulæste beskeder ud for et menupunkt. */
export function Nav({
  badges = {},
  modules = { booking: false, agency: false },
}: {
  badges?: Record<string, number>;
  modules?: { booking: boolean; agency: boolean };
}) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
      {items
        .filter((item) => !item.module || modules[item.module])
        .map((item) => {
          const active = [item.href, ...(item.also ?? [])].some(
            (href) => pathname === href || pathname.startsWith(href + "/"),
          );
          const badge = badges[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                active ? "bg-white/12 text-white" : "text-brand-100/80 hover:bg-white/6 hover:text-white"
              }`}
            >
              {item.label}
              {badge > 0 && (
                <span
                  className="rounded-full bg-accent-400 px-1.5 text-[10px] font-semibold text-brand-950"
                  aria-label={
                    item.href === "/venter"
                      ? `${badge} venter`
                      : item.href === "/kalender"
                        ? `${badge} i dag`
                        : `${badge} ulæste`
                  }
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
