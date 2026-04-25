import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

// Mobile-friendly vertical week-list view of bookings for a single boat.
// Renders 14 days starting from `from` (defaults to today) so the user
// sees this week + next week. Each day is a tappable row with a status
// pill on the right. Tap an active booking to open its detail page.

type Row = { id: string; booking_date: string; status: string; price_egp_snapshot: string | number };

type Props = {
  rows: Row[];
  from: string;          // YYYY-MM-DD inclusive
  daysCount?: number;    // default 14
};

function pad(n: number) { return String(n).padStart(2, '0'); }

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function dayLabel(dateStr: string): { weekday: string; day: number; month: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    weekday: dt.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    day: dt.getUTCDate(),
    month: dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
  };
}

function statusStyle(status?: string): { bg: string; ring: string; label: string } {
  switch (status) {
    case 'held': return { bg: 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200', ring: 'ring-amber-300', label: 'Held' };
    case 'confirmed': return { bg: 'bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-200', ring: 'ring-blue-300', label: 'Confirmed' };
    case 'details_filled': return { bg: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-900 dark:text-cyan-200', ring: 'ring-cyan-300', label: 'Details filed' };
    case 'paid_to_owner': return { bg: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200', ring: 'ring-emerald-300', label: 'Paid' };
    case 'cancelled': return { bg: 'bg-rose-100 dark:bg-rose-950 text-rose-900 dark:text-rose-200', ring: 'ring-rose-300', label: 'Cancelled' };
    case 'expired': return { bg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300', ring: 'ring-slate-300', label: 'Expired' };
    default: return { bg: '', ring: '', label: '' };
  }
}

export function WeekList({ rows, from, daysCount = 14 }: Props) {
  // Index by date for O(1) lookup, preferring active statuses.
  const byDate = new Map<string, Row>();
  const priority: Record<string, number> = {
    held: 4, confirmed: 5, details_filled: 6, paid_to_owner: 7, cancelled: 2, expired: 1,
  };
  for (const r of rows) {
    const cur = byDate.get(r.booking_date);
    if (!cur || (priority[r.status] || 0) > (priority[cur.status] || 0)) byDate.set(r.booking_date, r);
  }

  const days = Array.from({ length: daysCount }, (_, i) => addDays(from, i));

  return (
    <div className="ix-card divide-y divide-slate-100 dark:divide-slate-800">
      {days.map((date, idx) => {
        const row = byDate.get(date);
        const s = statusStyle(row?.status);
        const isToday = date === from;
        const { weekday, day, month } = dayLabel(date);
        const clickable = !!row && !['expired', 'cancelled'].includes(row.status);
        const inner = (
          <div className={`flex items-center gap-3 p-3.5 ${clickable ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''} transition`}>
            <div className={`w-12 text-center shrink-0 ${isToday ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-700 dark:text-slate-200'}`}>
              <div className="text-[10px] uppercase tracking-wide font-semibold">{weekday}</div>
              <div className={`text-2xl leading-none font-bold tabular-nums ${isToday ? 'text-cyan-700 dark:text-cyan-300' : ''}`}>{day}</div>
              <div className="text-[10px] uppercase text-slate-400">{month}</div>
            </div>
            <div className="flex-1 min-w-0">
              {row ? (
                <>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    EGP {Number(row.price_egp_snapshot).toLocaleString()}
                  </div>
                  <span className={`mt-1 inline-block text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${s.bg}`}>
                    {s.label}
                  </span>
                </>
              ) : (
                <div className="text-xs text-slate-400 dark:text-slate-500">Available</div>
              )}
              {isToday && (
                <span className="ml-2 inline-block text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
                  Today
                </span>
              )}
            </div>
            {clickable && <ChevronRight size={16} className="text-slate-400 shrink-0" />}
          </div>
        );
        if (clickable && row) {
          return (
            <Link key={date} href={`/emails/boat-rental/owner/booking/${row.id}`} className="block">
              {inner}
            </Link>
          );
        }
        return <div key={date + '-' + idx}>{inner}</div>;
      })}
    </div>
  );
}
