"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui";

type Permission = NotificationPermission | "unsupported";

function readPermission(): Permission {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Lader brugeren slå skrivebordsnotifikationer til (vises mens Kundespor er åben i browseren). */
export function DesktopNotificationsToggle() {
  const permission = useSyncExternalStore(subscribe, readPermission, () => "unsupported" as Permission);

  if (permission === "unsupported") return null;
  if (permission === "granted") {
    return (
      <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">
        Skrivebordsnotifikationer er slået til, mens Kundespor er åben i browseren.
      </p>
    );
  }
  if (permission === "denied") {
    return (
      <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
        Skrivebordsnotifikationer er blokeret i browseren. Du kan tillade dem i browserens indstillinger for siden.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900">
      <span>Få en notifikation på skærmen, når der kommer nye leads og beskeder.</span>
      <Button
        type="button"
        className="px-2.5 py-1 text-xs"
        onClick={async () => {
          await Notification.requestPermission();
          listeners.forEach((l) => l());
        }}
      >
        Slå til
      </Button>
    </div>
  );
}
