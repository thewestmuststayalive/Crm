import type { Metadata } from "next";
import { BrandHeader } from "@/components/brand-header";
import { brandStyle, getBranding } from "@/lib/branding";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { bookableDays, getPublicBooking, getServices } from "@/lib/booking";
import { formatOre } from "@/lib/quote-math";
import { formatMinutes } from "@/lib/time";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Book tid", robots: { index: false, follow: false } };

export default async function PublicBookingPage({ params }: PageProps<"/book/[key]">) {
  const { key } = await params;
  const pub = await getPublicBooking(key);
  if (!pub) notFound();
  const services = await getServices(pub.workspace.id, { onlineOnly: true });
  const days = bookableDays(pub.settings);
  const ws = pub.workspace;

  const brand = await getBranding(pub.workspace.id);
  return (
    <main style={brandStyle(brand.color)} className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-1">
          <BrandHeader brand={brand} className="mb-3" />
          <h1 className="font-display text-2xl font-bold text-slate-900">Book tid hos {ws.name}</h1>
          {pub.settings.intro && <p className="text-sm whitespace-pre-line text-slate-600">{pub.settings.intro}</p>}
          <p className="text-sm text-slate-500">
            {[ws.address?.replace(/\n/g, ", "), ws.phone].filter(Boolean).join(" · ")}
          </p>
        </header>

        {services.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Der er ingen ydelser at booke online lige nu. Kontakt os direkte.
          </p>
        ) : (
          <BookingForm
            bookingKey={key}
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              duration: formatMinutes(s.durationMinutes),
              price: s.priceOre > 0 ? formatOre(s.priceOre) : null,
            }))}
            days={days}
            companyName={ws.name}
          />
        )}

        <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
          Booking via <Logo size={18} />
        </p>
      </div>
    </main>
  );
}
