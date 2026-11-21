"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Tjekker hvert halve minut for nye notifikationer, mens Kundespor er åben.
 * Har brugeren tilladt det, vises de som skrivebordsnotifikationer; ellers opdateres tælleren i menuen.
 */
export function NotificationPoller({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const since = useRef(new Date().toISOString());
  const lastUnread = useRef(initialUnread);

  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState === "hidden" && !("Notification" in window && Notification.permission === "granted")) return;
      try {
        const res = await fetch(`/api/notifications?efter=${encodeURIComponent(since.current)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          unread: number;
          now: string;
          latest: { id: string; title: string; body: string | null }[];
        };
        since.current = data.now;
        if ("Notification" in window && Notification.permission === "granted") {
          for (const n of data.latest) {
            const notification = new Notification(n.title, { body: n.body ?? undefined, icon: "/icon-512.png", tag: n.id });
            notification.onclick = () => {
              window.focus();
              router.push("/notifikationer");
            };
          }
        }
        if (data.unread !== lastUnread.current) {
          lastUnread.current = data.unread;
          router.refresh();
        }
      } catch {
        // Netværksfejl: prøv igen ved næste tjek.
      }
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
