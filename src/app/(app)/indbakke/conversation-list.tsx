"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/styles";

type Item = {
  id: string;
  name: string | null;
  platform: "MESSENGER" | "INSTAGRAM";
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  pageName: string;
};

const time = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

export function ConversationList({ conversations }: { conversations: Item[] }) {
  const pathname = usePathname();
  const inThread = pathname !== "/indbakke";

  return (
    // På mobil vises listen kun på oversigten; i en samtale fylder tråden hele skærmen.
    <nav
      aria-label="Samtaler"
      className={cx("min-h-0 overflow-y-auto border-slate-200 md:block md:border-r", inThread && "hidden")}
    >
      {conversations.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">
          Ingen samtaler endnu. Kobl en Facebook-side på under Indstillinger → Facebook &amp; Instagram.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {conversations.map((c) => {
            const active = pathname === `/indbakke/${c.id}`;
            return (
              <li key={c.id}>
                <Link
                  href={`/indbakke/${c.id}`}
                  className={cx("block px-4 py-3 hover:bg-slate-50", active && "bg-slate-100")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cx("truncate text-sm", c.unreadCount > 0 ? "font-semibold text-slate-900" : "text-slate-800")}>
                      {c.name ?? "Ukendt"}
                    </span>
                    {c.lastMessageAt && (
                      <span className="shrink-0 text-xs text-slate-400">{time.format(new Date(c.lastMessageAt))}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">{c.lastMessagePreview ?? ""}</span>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 rounded-full bg-sky-600 px-1.5 text-[10px] font-semibold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {c.platform === "INSTAGRAM" ? "Instagram" : "Messenger"} · {c.pageName}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
