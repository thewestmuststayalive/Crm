import Link from "next/link";
import type { ReactNode } from "react";
import type { ContactStatus, LeadSource } from "@/db/schema";
import { SOURCE_LABELS, STATUS_LABELS, STATUS_STYLES } from "@/lib/labels";
import { cx } from "./styles";

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className ?? "bg-slate-100 text-slate-700",
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: ContactStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function SourceBadge({ source }: { source: LeadSource }) {
  return <Badge>{SOURCE_LABELS[source]}</Badge>;
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-2">
      {back && (
        <Link href={back.href} className="text-sm text-slate-500 hover:text-slate-900">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words text-slate-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

/** Række i en detaljeliste. Viser en streg, hvis værdien mangler. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 min-w-0 break-words text-slate-900">{children || "–"}</dd>
    </div>
  );
}

export function Pagination({ page, hasMore, makeHref }: { page: number; hasMore: boolean; makeHref: (p: number) => string }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="flex items-center justify-between text-sm" aria-label="Sider">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className="text-slate-700 underline">
          ← Forrige
        </Link>
      ) : (
        <span />
      )}
      <span className="text-slate-500">Side {page}</span>
      {hasMore ? (
        <Link href={makeHref(page + 1)} className="text-slate-700 underline">
          Næste →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
