"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/styles";
import { NAV_ITEMS } from "./nav";

type Modules = { booking: boolean; agency: boolean };

const icons: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5-4-5.7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  pipeline: <path d="M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v6h-4z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icons[name]}
    </svg>
  );
}

/** Bundmenu på telefonen med de vigtigste sider, søgning og resten under "Mere". */
export function MobileNav({
  modules,
  badges,
  userName,
  logout,
}: {
  modules: Modules;
  badges: Record<string, number>;
  userName: string;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const tabs = [
    { href: "/dashboard", label: "Hjem", icon: "home" as const },
    { href: "/kunder", label: "Kunder", icon: "people" as const },
    modules.booking
      ? { href: "/kalender", label: "Kalender", icon: "calendar" as const }
      : { href: "/pipeline", label: "Pipeline", icon: "pipeline" as const },
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <nav
        aria-label="Bundmenu"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cx(
              "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
              isActive(t.href) ? "text-brand-700" : "text-slate-500",
            )}
          >
            <Icon name={t.icon} />
            {t.label}
            {(badges[t.href] ?? 0) > 0 && (
              <span className="absolute top-1 right-1/4 min-w-4 rounded-full bg-accent-400 px-1 text-center text-[10px] leading-4 font-semibold text-brand-950">
                {badges[t.href]}
              </span>
            )}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("kundespor:search"))}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
        >
          <Icon name="search" />
          Søg
        </button>
        <button
          type="button"
          onClick={() => setMore(true)}
          aria-expanded={more}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
        >
          <Icon name="menu" />
          Mere
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 md:hidden" onClick={() => setMore(false)}>
          <div
            role="dialog"
            aria-label="Menu"
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" aria-hidden />
            <ul className="grid grid-cols-2 gap-2">
              {NAV_ITEMS.filter((i) => !i.module || modules[i.module]).map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={() => setMore(false)}
                    className={cx(
                      "flex items-center justify-between rounded-lg border px-3 py-3 text-sm font-medium",
                      isActive(i.href)
                        ? "border-brand-300 bg-brand-50 text-brand-800"
                        : "border-slate-200 text-slate-800",
                    )}
                  >
                    {i.label}
                    {(badges[i.href] ?? 0) > 0 && (
                      <span className="rounded-full bg-accent-400 px-1.5 text-[10px] font-semibold text-brand-950">
                        {badges[i.href]}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="truncate text-slate-600">{userName}</span>
              <form action={logout}>
                <button className="text-slate-600 underline">Log ud</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
