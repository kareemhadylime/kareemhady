import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, OWNER_TABS } from '../../_components/tabs';
import { WeekList } from './_components/week-list';

export const dynamic = 'force-dynamic';

type Boat = { id: string; name: string };
type DayRow = { id: string; booking_date: string; status: string; price_egp_snapshot: string | number };

type SearchParams = Promise<{ boat_id?: string; month?: string }>;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseMonth(m: string | undefined, todayStr: string): string {
  if (m && /^\d{4}-\d{2}$/.test(m)) return m;
  return todayStr.slice(0, 7);
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function buildMonthGrid(monthYm: string): { dates: string[]; label: string; firstDow: number; daysInMonth: number } {
  const [y, m] = monthYm.split('-').map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const firstDow = firstOfMonth.getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${y}-${pad(m)}-${pad(d)}`);
  }
  const label = firstOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { dates, label, firstDow, daysInMonth };
}

function statusColor(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case 'held':
      return { bg: 'bg-amber-100 hover:bg-amber-200 border-amber-300', text: 'text-amber-900', label: 'Held' };
    case 'confirmed':
      return { bg: 'bg-blue-100 hover:bg-blue-200 border-blue-300', text: 'text-blue-900', label: 'Confirmed' };
    case 'details_filled':
      return { bg: 'bg-cyan-100 hover:bg-cyan-200 border-cyan-300', text: 'text-cyan-900', label: 'Details filled' };
    case 'paid_to_owner':
      return { bg: 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300', text: 'text-emerald-900', label: 'Paid' };
    case 'cancelled':
      return { bg: 'bg-rose-100 hover:bg-rose-200 border-rose-300', text: 'text-rose-900', label: 'Cancelled' };
    case 'expired':
      return { bg: 'bg-slate-100 hover:bg-slate-200 border-slate-300', text: 'text-slate-600', label: 'Expired' };
    default:
      return { bg: 'bg-white hover:bg-slate-50 border-slate-200', text: 'text-slate-400', label: '' };
  }
}

export default async function OwnerCalendar({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();

  const boatsRes = ownerIds.length
    ? await sb.from('boat_rental_boats').select('id, name').in('owner_id', ownerIds).order('name')
    : { data: [] };
  const boats = ((boatsRes.data as unknown) as Boat[] | null) || [];

  const selectedBoat = sp.boat_id || boats[0]?.id || '';
  const today = cairoTodayStr();
  const monthYm = parseMonth(sp.month, today);
  const grid = buildMonthGrid(monthYm);

  let rows: DayRow[] = [];
  let weekRows: DayRow[] = [];
  if (selectedBoat) {
    const monthStart = monthYm + '-01';
    const monthEnd = addMonths(monthYm, 1) + '-01';
    // Range that covers both the month grid AND today+14 for the week-list
    // view, fetched in a single query to avoid a round trip per breakpoint.
    const weekEnd = (() => {
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + 14));
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    })();
    const minStart = monthStart < today ? monthStart : today;
    const maxEnd = monthEnd > weekEnd ? monthEnd : weekEnd;
    const resvRes = await sb
      .from('boat_rental_reservations')
      .select('id, booking_date, status, price_egp_snapshot')
      .eq('boat_id', selectedBoat)
      .gte('booking_date', minStart)
      .lt('booking_date', maxEnd);
    const all = ((resvRes.data as unknown) as DayRow[] | null) || [];
    rows = all.filter(r => r.booking_date >= monthStart && r.booking_date < monthEnd);
    weekRows = all.filter(r => r.booking_date >= today && r.booking_date < weekEnd);
  }
  const byDate = new Map<string, DayRow>();
  for (const r of rows) {
    // Prefer pre-terminal active statuses over cancelled/expired when multiple rows exist.
    const existing = byDate.get(r.booking_date);
    const priority = (s: string) =>
      ({ held: 4, confirmed: 5, details_filled: 6, paid_to_owner: 7, cancelled: 2, expired: 1 })[s] || 0;
    if (!existing || priority(r.status) > priority(existing.status)) byDate.set(r.booking_date, r);
  }

  const prevMonth = addMonths(monthYm, -1);
  const nextMonth = addMonths(monthYm, +1);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-slate-500 mt-1">Per-boat booking state by day. Click a booked day to see details.</p>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner/calendar" />

      <section className="mt-8 ix-card p-4 sm:p-6">
        <form method="get" className="flex items-end gap-3 flex-wrap mb-5">
          <label className="text-sm flex-1">
            <span className="text-slate-600 dark:text-slate-400 text-xs">Boat</span>
            <select name="boat_id" defaultValue={selectedBoat} className="ix-input mt-1">
              {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <input type="hidden" name="month" value={monthYm} />
          <button type="submit" className="ix-btn-secondary">Apply</button>
        </form>

        {/* Mobile (<sm): week-list view */}
        <div className="sm:hidden">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Next 14 days
          </h2>
          <WeekList rows={weekRows} from={today} />
        </div>

        {/* Desktop (≥sm): month grid */}
        <div className="hidden sm:block">
        <div className="flex items-center justify-between mb-4">
          <Link
            href={`?boat_id=${selectedBoat}&month=${prevMonth}`}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft size={16} /> {prevMonth}
          </Link>
          <h2 className="text-lg font-semibold">{grid.label}</h2>
          <Link
            href={`?boat_id=${selectedBoat}&month=${nextMonth}`}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            {nextMonth} <ChevronRight size={16} />
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: grid.firstDow }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {grid.dates.map(date => {
            const row = byDate.get(date);
            const c = statusColor(row?.status || '');
            const dayNum = parseInt(date.slice(-2), 10);
            const isToday = date === today;
            const clickable = !!row && row.status !== 'expired' && row.status !== 'cancelled';
            const content = (
              <>
                <div className={`text-sm font-semibold ${isToday ? 'text-cyan-700' : ''}`}>
                  {dayNum}
                </div>
                {row && (
                  <div className={`text-[10px] mt-1 ${c.text}`}>
                    {c.label}
                  </div>
                )}
              </>
            );
            const cellClasses = `aspect-square p-1.5 rounded border text-left ${c.bg} ${isToday ? 'ring-1 ring-cyan-500' : ''}`;
            if (row && clickable) {
              return (
                <Link key={date} href={`/emails/boat-rental/owner/booking/${row.id}`} className={cellClasses}>
                  {content}
                </Link>
              );
            }
            return (
              <div key={date} className={cellClasses}>
                {content}
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-3">
          <Legend color="bg-amber-100 dark:bg-amber-950 border-amber-300" label="Held" />
          <Legend color="bg-blue-100 dark:bg-blue-950 border-blue-300" label="Confirmed" />
          <Legend color="bg-cyan-100 dark:bg-cyan-950 border-cyan-300" label="Details filled" />
          <Legend color="bg-emerald-100 dark:bg-emerald-950 border-emerald-300" label="Paid" />
          <Legend color="bg-rose-100 dark:bg-rose-950 border-rose-300" label="Cancelled" />
          <Legend color="bg-slate-100 dark:bg-slate-800 border-slate-300" label="Expired" />
        </div>
        </div>
      </section>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-3 h-3 rounded border ${color}`} />
      {label}
    </span>
  );
}
