import { cx } from "./styles";

export const BRAND_NAME = "Kundespor";
export const BRAND_TAGLINE = "Alle kunder samlet. Ingen glemt.";

/**
 * Kundesporets symbol: et spor fra første kontakt (hvid prik) til kunden (gylden prik).
 * `tone="light"` bruges på mørk baggrund.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1b6257" />
      <path d="M9 22.5c0-4.2 3.8-5.2 7-6.2s7-2 7-6.3" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="9" cy="22.5" r="2.4" fill="#fff" />
      <circle cx="23" cy="10" r="3.2" fill="#f5b94a" />
    </svg>
  );
}

export function Logo({ tone = "dark", size = 28, className }: { tone?: "dark" | "light"; size?: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span
        className={cx("font-display text-lg font-bold tracking-tight", tone === "light" ? "text-white" : "text-brand-900")}
      >
        {BRAND_NAME}
      </span>
    </span>
  );
}
