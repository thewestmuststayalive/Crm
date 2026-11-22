import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/display";
import { buttonClass, cx } from "@/components/styles";
import {
  BOOKING_STATUS_STYLES,
  formatPlate,
  getBookingSettings,
  getBookingsBetween,
  type CalendarBooking,
} from "@/lib/booking";
import { requireBookingModule } from "@/lib/modules";
import {
  addDays,
  formatLongDate,
  formatShortDate,
  isIsoDate,
  localDate,
  localMinutes,
  localTime,
  minutesToTime,
  startOfWeek,
  timeToMinutes,
  WEEKDAYS_SHORT,
  zonedToUtc,
} from "@/lib/time";

export const metadata: Metadata = { title: "Kalender" };

const HOUR_PX = 56;

function todayDate() {
  return localDate(new Date());
}

/** Fordeler overlappende bookinger i spor, så de vises side om side. */
function lanes(items: CalendarBooking[]) {
  const placed: { b: CalendarBooking; lane: number; lanes: number }[] = [];
  let group: typeof placed = [];
  let groupEnd = 0;
  const flush = () => {
    const n = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const g of group) g.lanes = n;
    placed.push(...group);
    group = [];
  };
  for (const b of items) {
    const start = b.startsAt.getTime();
    if (group.length > 0 && start >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.b.endsAt.getTime() > start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ b, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, b.endsAt.getTime());
  }
  flush();
  return placed;
}

function BookingCard({ b, compact }: { b: CalendarBooking; compact?: boolean }) {
  const vehicle = [formatPlate(b.plate), [b.make, b.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/kalender/${b.id}`}
      className={cx(
        "block h-full overflow-hidden rounded-md border px-2 py-1 text-xs leading-tight hover:shadow",
        BOOKING_STATUS_STYLES[b.status],
      )}
      aria-label={`${localTime(b.startsAt)} ${b.serviceName} – ${b.contactName}`}
    >
      <span className="font-semibold">{localTime(b.startsAt)}</span> {b.serviceName}
      <span className="block truncate">{b.contactName}</span>
      {!compact && vehicle && <span className="block truncate opacity-80">{vehicle}</span>}
    </Link>
  );
}

export default async function CalendarPage({ searchParams }: PageProps<"/kalender">) {
  const { workspace } = await requireBookingModule();
  const sp = await searchParams;
  const today = todayDate();
  const weekStart = startOfWeek(isIsoDate(sp.uge) ? sp.uge : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [settings, bookings] = await Promise.all([
    getBookingSettings(workspace.id),
    getBookingsBetween(workspace.id, zonedToUtc(weekStart, "00:00"), zonedToUtc(addDays(weekStart, 7), "00:00")),
  ]);

  // Tidsaksen dækker åbningstiden og evt. bookinger uden for den.
  const openDays = settings.openingHours.filter((d) => d.open);
  let startMin = openDays.length ? Math.min(...openDays.map((d) => timeToMinutes(d.from))) : 8 * 60;
  let endMin = openDays.length ? Math.max(...openDays.map((d) => timeToMinutes(d.to))) : 17 * 60;
  for (const b of bookings) {
    if (localDate(b.startsAt) !== localDate(b.endsAt)) continue;
    startMin = Math.min(startMin, localMinutes(b.startsAt));
    endMin = Math.max(endMin, localMinutes(b.endsAt));
  }
  startMin = Math.floor(startMin / 60) * 60;
  endMin = Math.ceil(endMin / 60) * 60;
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60);
  const height = ((endMin - startMin) / 60) * HOUR_PX;
  const byDay = (d: string) => bookings.filter((b) => localDate(b.startsAt) === d);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Kalender"
        subtitle={`Uge med ${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`}
        actions={
          <>
            <Link
              href={`/kalender?uge=${addDays(weekStart, -7)}`}
              className={buttonClass("secondary")}
              aria-label="Forrige uge"
            >
              ←
            </Link>
            <Link href="/kalender" className={buttonClass("secondary")}>
              I dag
            </Link>
            <Link
              href={`/kalender?uge=${addDays(weekStart, 7)}`}
              className={buttonClass("secondary")}
              aria-label="Næste uge"
            >
              →
            </Link>
            <Link href="/kalender/ny" className={buttonClass()}>
              Ny booking
            </Link>
          </>
        }
      />

      {/* Uge-gitter (computer) */}
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block" data-calendar="week">
        <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-slate-200" />
          {days.map((d, i) => (
            <div
              key={d}
              className={cx(
                "border-b border-l border-slate-200 px-2 py-2 text-center text-xs",
                d === today ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-600",
                !settings.openingHours[i]?.open && "bg-slate-50",
              )}
            >
              <span className="capitalize">{WEEKDAYS_SHORT[i]}</span> {formatShortDate(d)}
            </div>
          ))}
          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-slate-400"
                style={{ top: ((h - startMin) / 60) * HOUR_PX }}
              >
                {h === startMin ? "" : minutesToTime(h)}
              </span>
            ))}
          </div>
          {days.map((d, i) => (
            <section
              key={d}
              aria-label={formatLongDate(d)}
              className={cx("relative border-l border-slate-200", !settings.openingHours[i]?.open && "bg-slate-50")}
              style={{ height }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-slate-100"
                  style={{ top: ((h - startMin) / 60) * HOUR_PX }}
                />
              ))}
              {lanes(byDay(d)).map(({ b, lane, lanes: n }) => {
                const top = ((localMinutes(b.startsAt) - startMin) / 60) * HOUR_PX;
                const sameDay = localDate(b.endsAt) === d;
                const end = sameDay ? localMinutes(b.endsAt) : endMin;
                const h = Math.max(22, ((end - localMinutes(b.startsAt)) / 60) * HOUR_PX - 2);
                return (
                  <div
                    key={b.id}
                    className="absolute p-0.5"
                    style={{ top, height: h, left: `${(lane / n) * 100}%`, width: `${100 / n}%` }}
                  >
                    <BookingCard b={b} compact={h < 50} />
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>

      {/* Dagsliste (mobil) */}
      <div className="space-y-4 md:hidden">
        {days.map((d) => {
          const list = byDay(d);
          return (
            <section key={d} aria-label={`Liste ${formatLongDate(d)}`}>
              <h2
                className={cx(
                  "mb-2 text-sm font-semibold capitalize",
                  d === today ? "text-brand-800" : "text-slate-700",
                )}
              >
                {formatLongDate(d)}
              </h2>
              {list.length === 0 ? (
                <p className="text-sm text-slate-400">Ingen bookinger</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((b) => (
                    <li key={b.id}>
                      <BookingCard b={b} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
