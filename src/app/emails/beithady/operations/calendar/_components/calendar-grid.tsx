'use client';

import { useMemo } from 'react';
import type { CalendarGridData, CalendarReservation } from '@/lib/beithady/operations/types';
import { ListingRail } from './listing-rail';
import { ReservationBar } from './reservation-bar';

const RAIL_PX = 220;
const COL_PX = 64;

function fmtDate(iso: string): { dow: string; day: string; isWeekend: boolean } {
  const d = new Date(iso + 'T00:00:00');
  const dow = d.toLocaleDateString('en', { weekday: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  const wd = d.getDay();
  return { dow, day, isWeekend: wd === 0 || wd === 6 };
}

export function CalendarGrid({ data }: { data: CalendarGridData }) {
  const todayIso = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.toISOString().slice(0, 10);
  }, []);

  // Build the date strip
  const dates = useMemo(() => {
    const arr: string[] = [];
    const d = new Date(data.windowStart + 'T00:00:00');
    for (let i = 0; i < data.daysCount; i++) {
      arr.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return arr;
  }, [data.windowStart, data.daysCount]);

  // Group reservations by listing for fast lookup per row
  const resByListing = useMemo(() => {
    const m = new Map<string, CalendarReservation[]>();
    for (const r of data.reservations) {
      const arr = m.get(r.listing_id) || [];
      arr.push(r);
      m.set(r.listing_id, arr);
    }
    return m;
  }, [data.reservations]);

  const minWidth = RAIL_PX + dates.length * COL_PX;
  const gridTemplate = `${RAIL_PX}px repeat(${dates.length}, minmax(${COL_PX}px, 1fr))`;

  if (data.rows.length === 0) {
    return (
      <div className="ix-card p-10 text-center text-sm text-slate-500">
        No bookable units match the current filters. Try clearing buildings/channels.
      </div>
    );
  }

  return (
    <div className="ix-card overflow-x-auto">
      <div style={{ minWidth }}>
        {/* Date header */}
        <div
          className="grid sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-slate-500 sticky left-0 bg-white dark:bg-slate-900 z-[6] border-r border-slate-200 dark:border-slate-700">
            Listing
          </div>
          {dates.map(iso => {
            const { dow, day, isWeekend } = fmtDate(iso);
            const isToday = iso === todayIso;
            return (
              <div
                key={iso}
                className={`text-center py-1 text-[10px] border-l border-slate-100 dark:border-slate-800
                  ${isWeekend ? 'bg-slate-50 dark:bg-slate-800/40' : ''}
                  ${isToday ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-200 font-semibold' : 'text-slate-500'}`}
                title={iso}
              >
                <div className="uppercase tracking-wide">{dow}</div>
                <div className="font-bold tabular-nums">{day}</div>
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {data.rows.map(row => {
          const rowRes = resByListing.get(row.listing_id) || [];
          return (
            <div
              key={row.listing_id}
              className="grid border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <ListingRail row={row} windowStart={data.windowStart} />
              {/* Date strip wrapper — single column 2 → end, but inside it
                  we render per-cell backgrounds + reservation bars overlaid. */}
              <div
                className="relative"
                style={{ gridColumn: `2 / span ${dates.length}` }}
              >
                <div
                  className="grid h-12"
                  style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(${COL_PX}px,1fr))` }}
                >
                  {dates.map(iso => {
                    const { isWeekend } = fmtDate(iso);
                    const isToday = iso === todayIso;
                    return (
                      <div
                        key={iso}
                        className={`border-l border-slate-100 dark:border-slate-800 flex items-center justify-center text-[10px] tabular-nums
                          ${isWeekend ? 'bg-slate-50/40 dark:bg-slate-800/20' : ''}
                          ${isToday ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}
                      >
                        {row.base_price_usd != null && (
                          <span className="text-slate-400">${Math.round(row.base_price_usd)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Today vertical line */}
                {(() => {
                  const idx = dates.indexOf(todayIso);
                  if (idx < 0) return null;
                  const leftPct = ((idx + 0.5) / dates.length) * 100;
                  return (
                    <div
                      aria-hidden
                      className="absolute top-0 bottom-0 w-px bg-pink-500/70 pointer-events-none"
                      style={{ left: `${leftPct}%` }}
                    />
                  );
                })()}
                {/* Reservation bars overlaid */}
                <div className="absolute inset-0 pointer-events-none">
                  {rowRes.map(r => (
                    <ReservationBar
                      key={r.reservation_id}
                      res={r}
                      windowStartIso={data.windowStart}
                      daysCount={dates.length}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
