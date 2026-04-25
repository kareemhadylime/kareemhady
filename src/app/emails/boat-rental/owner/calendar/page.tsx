import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, OWNER_TABS } from '../../_components/tabs';
import { WeekList } from './_components/week-list';
import { InteractiveMonthGrid } from './_components/interactive-grid';

export const dynamic = 'force-dynamic';

type Boat = { id: string; name: string };
type DayRow = { id: string; booking_date: string; status: string; price_egp_snapshot: string | number };
type BlockRow = { id: string; blocked_date: string; reason: string };

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
  const firstDow = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${y}-${pad(m)}-${pad(d)}`);
  }
  const label = firstOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { dates, label, firstDow, daysInMonth };
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
  let blocks: BlockRow[] = [];
  if (selectedBoat) {
    const monthStart = monthYm + '-01';
    const monthEnd = addMonths(monthYm, 1) + '-01';
    const weekEnd = (() => {
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + 14));
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    })();
    const minStart = monthStart < today ? monthStart : today;
    const maxEnd = monthEnd > weekEnd ? monthEnd : weekEnd;

    const [resvRes, blockRes] = await Promise.all([
      sb
        .from('boat_rental_reservations')
        .select('id, booking_date, status, price_egp_snapshot')
        .eq('boat_id', selectedBoat)
        .gte('booking_date', minStart)
        .lt('booking_date', maxEnd),
      sb
        .from('boat_rental_owner_blocks')
        .select('id, blocked_date, reason')
        .eq('boat_id', selectedBoat)
        .gte('blocked_date', monthStart)
        .lt('blocked_date', monthEnd),
    ]);
    const all = ((resvRes.data as unknown) as DayRow[] | null) || [];
    rows = all.filter(r => r.booking_date >= monthStart && r.booking_date < monthEnd);
    weekRows = all.filter(r => r.booking_date >= today && r.booking_date < weekEnd);
    blocks = ((blockRes.data as unknown) as BlockRow[] | null) || [];
  }

  const prevMonth = addMonths(monthYm, -1);
  const nextMonth = addMonths(monthYm, +1);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Per-boat booking state by day. Click a booked day to see details. Click an empty future day to <strong>block it</strong> for personal use.
        </p>
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

        {/* Desktop (≥sm): month grid with click-to-block */}
        <div className="hidden sm:block">
          <div className="flex items-center justify-between mb-4">
            <Link
              href={`?boat_id=${selectedBoat}&month=${prevMonth}`}
              className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900"
            >
              <ChevronLeft size={16} /> {prevMonth}
            </Link>
            <h2 className="text-lg font-semibold">{grid.label}</h2>
            <Link
              href={`?boat_id=${selectedBoat}&month=${nextMonth}`}
              className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900"
            >
              {nextMonth} <ChevronRight size={16} />
            </Link>
          </div>

          {selectedBoat && (
            <InteractiveMonthGrid
              boatId={selectedBoat}
              monthLabel={grid.label}
              dates={grid.dates}
              firstDow={grid.firstDow}
              today={today}
              reservations={rows}
              blocks={blocks}
            />
          )}

          <div className="mt-6 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-3">
            <Legend color="bg-amber-100 dark:bg-amber-950 border-amber-300" label="Held" />
            <Legend color="bg-blue-100 dark:bg-blue-950 border-blue-300" label="Confirmed" />
            <Legend color="bg-cyan-100 dark:bg-cyan-950 border-cyan-300" label="Filed" />
            <Legend color="bg-emerald-100 dark:bg-emerald-950 border-emerald-300" label="Paid" />
            <Legend color="bg-purple-100 dark:bg-purple-950 border-purple-300" label="Owner-blocked" />
            <Legend color="bg-rose-100 dark:bg-rose-950 border-rose-300" label="Cancelled" />
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
