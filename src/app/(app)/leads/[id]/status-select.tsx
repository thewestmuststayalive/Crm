"use client";

import { useTransition } from "react";
import { setProspectStatus } from "@/app/actions/leads";
import type { ProspectStatus } from "@/db/schema";
import { cx } from "@/components/styles";

const QUICK: { value: ProspectStatus; label: string }[] = [
  { value: "NEW", label: "Ny" },
  { value: "CALLED", label: "Ringet op" },
  { value: "INTERESTED", label: "Interesseret" },
  { value: "NOT_INTERESTED", label: "Ikke interesseret" },
];

/** Skift status direkte i listen. "Ring igen" og "Gør til kunde" sker på firmaets side. */
export function StatusSelect({
  id,
  name,
  status,
  label,
  className,
}: {
  id: string;
  name: string;
  status: ProspectStatus;
  label: string;
  className: string;
}) {
  const [pending, startTransition] = useTransition();
  if (!QUICK.some((q) => q.value === status)) {
    return <span className={cx("rounded px-2 py-1 text-xs font-medium", className)}>{label}</span>;
  }
  return (
    <select
      aria-label={`Status for ${name}`}
      value={status}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("status", e.target.value);
        startTransition(() => setProspectStatus(fd));
      }}
      className={cx("rounded border-0 px-2 py-1 text-xs font-medium", className, pending && "opacity-60")}
    >
      {QUICK.map((q) => (
        <option key={q.value} value={q.value}>
          {q.label}
        </option>
      ))}
    </select>
  );
}
