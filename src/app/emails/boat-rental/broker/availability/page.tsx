import Link from 'next/link';
import { Search, CheckCircle2, XCircle, Clock, AlertTriangle, Lock, Zap } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { checkAvailability, checkAvailabilityRange, type AvailabilityStatus } from '@/lib/boat-rental/availability';
import { TabNav, BROKER_TABS } from '../../_components/tabs';
import { reserveHoldAction } from './actions';
import { reserveDirectAction } from '../actions';

export const dynamic = 'force-dynamic';

type Boat = { id: string; name: string; capacity_guests: number; skipper_name: string };

type SearchParams = Promise<{ boat_id?: string; date?: string }>;

const REASON_LABELS: Record<string, string> = {
  personal_use: 'Owner — personal use',
  maintenance: 'Maintenance',
  owner_trip: 'Owner trip',
  repair: 'Repair',
  other: 'Other',
};

export default async function BrokerInquiry({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const selectedBoat = sp.boat_id || '';
  const selectedDate = sp.date || '';
  const today = cairoTodayStr();

  const sb = supabaseAdmin();
  const { data: boatsRaw } = await sb
    .from('boat_rental_boats')
    .select('id, name, capacity_guests, skipper_name')
    .eq('status', 'active')
    .order('name');
  const boats = ((boatsRaw as unknown) as Boat[] | null) || [];

  // 7-day strip: when a boat is selected, show today→today+6 (or selectedDate→+6 if set).
  const stripStart = selectedDate || today;
  const strip: Array<{ date: string; status: AvailabilityStatus }> = selectedBoat
    ? await checkAvailabilityRange(selectedBoat, stripStart, 7)
    : [];

  // Single-date result for the inquired day.
  let result: AvailabilityStatus | null = null;
  if (selectedBoat && selectedDate) {
    result = await checkAvailability(selectedBoat, selectedDate);
  }

  const boat = boats.find(b => b.id === selectedBoat);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Inquire</h1>
        <p className="text-sm text-slate-500 mt-1">
          Check availability + price for a boat on a specific day. If available, choose <strong>Hold (2h)</strong>{' '}
          or <strong>Reserve now</strong>.
        </p>
      </header>
      <TabNav tabs={BROKER_TABS} currentPath="/emails/boat-rental/broker/availability" />

      <section className="mt-8 ix-card p-6">
        <form method="get" className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="text-sm">
            <span className="text-slate-600 dark:text-slate-300 text-xs">Boat</span>
            <select name="boat_id" defaultValue={selectedBoat} required className="ix-input mt-1">
              <option value="">Select boat…</option>
              {boats.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} (cap. {b.capacity_guests})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600 dark:text-slate-300 text-xs">Date</span>
            <input
              name="date"
              type="date"
              min={today}
              defaultValue={selectedDate}
              className="ix-input mt-1"
            />
          </label>
          <button type="submit" className="ix-btn-primary"><Search size={14} /> Check</button>
        </form>
      </section>

      {/* 7-day price strip */}
      {selectedBoat && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Next 7 days · {boat?.name}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {strip.map(({ date, status }) => {
              const isToday = date === today;
              const isSelected = date === selectedDate;
              const dayLabel = (() => {
                const [y, m, d] = date.split('-').map(Number);
                const dt = new Date(Date.UTC(y, m - 1, d));
                return dt.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
              })();
              const dayNum = parseInt(date.slice(-2), 10);

              const tint =
                status.kind === 'available' ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/30 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40' :
                status.kind === 'booked' ? 'border-rose-300 dark:border-rose-700 bg-rose-50/40 dark:bg-rose-950/30' :
                status.kind === 'blocked' ? 'border-slate-300 dark:border-slate-600 bg-slate-100/60 dark:bg-slate-800/60' :
                'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/30';

              const inner = (
                <>
                  <div className={`text-[10px] uppercase tracking-wide font-semibold ${isSelected ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {dayLabel} {isToday && '· Today'}
                  </div>
                  <div className={`text-lg font-bold tabular-nums ${isSelected ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-900 dark:text-slate-100'}`}>
                    {dayNum}
                  </div>
                  {status.kind === 'available' && (
                    <div className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                      EGP {status.amountEgp.toLocaleString()}
                    </div>
                  )}
                  {status.kind === 'booked' && (
                    <div className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 mt-1">
                      Booked
                    </div>
                  )}
                  {status.kind === 'blocked' && (
                    <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 mt-1 inline-flex items-center gap-1">
                      <Lock size={9} /> Owner-reserved
                    </div>
                  )}
                  {status.kind === 'no_price' && (
                    <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 mt-1">
                      No price
                    </div>
                  )}
                </>
              );

              const cellClasses = `p-3 rounded-lg border ${tint} ${isSelected ? 'ring-2 ring-cyan-400/60' : ''} text-left transition`;
              return status.kind === 'available' || status.kind === 'no_price' ? (
                <Link key={date} href={`?boat_id=${selectedBoat}&date=${date}`} className={cellClasses}>
                  {inner}
                </Link>
              ) : (
                <div key={date} className={cellClasses + ' opacity-80 cursor-not-allowed'}>
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Result panel for the specific inquired date */}
      {result && (
        <section className="mt-6">
          {result.kind === 'available' && (
            <div className="ix-card p-6 border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/30">
              <div className="flex items-start gap-3 mb-5">
                <CheckCircle2 size={22} className="text-emerald-600 dark:text-emerald-300 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-emerald-900 dark:text-emerald-100">Available</div>
                  <div className="text-sm text-emerald-800 dark:text-emerald-200 mt-0.5">
                    {boat?.name} · {selectedDate} · 10 AM to sunset
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100 mt-2">
                    EGP {result.amountEgp.toLocaleString()}
                  </div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {result.tier === 'season'
                      ? 'Season/Holiday tier'
                      : result.tier === 'weekend'
                        ? 'Weekend tier (Fri/Sat)'
                        : 'Weekday tier'}{' '}
                    · net to owner
                  </div>
                </div>
              </div>

              {/* Two action forms side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Hold action */}
                <form action={reserveHoldAction} className="ix-card p-4 bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-800">
                  <input type="hidden" name="boat_id" value={selectedBoat} />
                  <input type="hidden" name="booking_date" value={selectedDate} />
                  <h3 className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-1.5 mb-1">
                    <Clock size={14} /> Hold for 2 hours
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                    Boat is locked for 2 hours while you talk to the client. Hold auto-releases if you don&apos;t confirm.
                  </p>
                  <button type="submit" className="ix-btn-secondary w-full justify-center">
                    <Clock size={14} /> Place 2-hour hold
                  </button>
                </form>

                {/* Reserve direct action */}
                <form action={reserveDirectAction} className="ix-card p-4 bg-white dark:bg-slate-900 border-cyan-200 dark:border-cyan-800">
                  <input type="hidden" name="boat_id" value={selectedBoat} />
                  <input type="hidden" name="booking_date" value={selectedDate} />
                  <h3 className="font-semibold text-cyan-900 dark:text-cyan-100 flex items-center gap-1.5 mb-1">
                    <Zap size={14} /> Reserve now
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                    Skip the hold — confirm immediately. Owner gets a WhatsApp confirmation.
                  </p>
                  <label className="text-xs block">
                    <span className="text-slate-600 dark:text-slate-300">Notes (optional)</span>
                    <textarea
                      name="notes"
                      rows={2}
                      placeholder="Special requirements: coolers, music, pickup detail…"
                      className="ix-input mt-1 text-xs"
                    />
                  </label>
                  <button type="submit" className="ix-btn-primary w-full justify-center mt-2">
                    <Zap size={14} /> Reserve & confirm
                  </button>
                </form>
              </div>

              <div className="mt-4 text-center">
                <Link
                  href="/emails/boat-rental/broker/availability"
                  className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
                >
                  Cancel — back to inquiry
                </Link>
              </div>
            </div>
          )}
          {result.kind === 'booked' && (
            <div className="ix-card p-6 border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/30">
              <div className="flex items-start gap-3">
                <XCircle size={22} className="text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-rose-900 dark:text-rose-100">Booked by another broker</div>
                  <div className="text-sm text-rose-800 dark:text-rose-200 mt-0.5">
                    {boat?.name} on {selectedDate} is currently {result.status}.
                  </div>
                </div>
              </div>
            </div>
          )}
          {result.kind === 'blocked' && (
            <div className="ix-card p-6 border-slate-300 dark:border-slate-600 bg-slate-100/60 dark:bg-slate-800/60">
              <div className="flex items-start gap-3">
                <Lock size={22} className="text-slate-600 dark:text-slate-300 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Owner-reserved</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                    {boat?.name} on {selectedDate} is blocked by the owner — {REASON_LABELS[result.reason] || result.reason}.
                  </div>
                </div>
              </div>
            </div>
          )}
          {result.kind === 'no_price' && (
            <div className="ix-card p-6 border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <AlertTriangle size={22} className="text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-900 dark:text-amber-100">No price configured</div>
                  <div className="text-sm text-amber-800 dark:text-amber-200 mt-0.5">
                    {boat?.name} has no price set for this date tier. Ask the admin to add one.
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
