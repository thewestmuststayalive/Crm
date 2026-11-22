import type { Branding } from "@/lib/branding";

/** Firmaets logo (eller navn) øverst på kundesider. */
export function BrandHeader({ brand, className }: { brand: Branding; className?: string }) {
  if (!brand.logoUrl) return null;
  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- logoet hentes fra vores egen /logo-rute */}
      <img src={brand.logoUrl} alt={brand.name} className="h-10 w-auto max-w-[220px] object-contain" />
    </div>
  );
}
