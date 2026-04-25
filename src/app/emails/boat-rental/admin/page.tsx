import Link from 'next/link';
import {
  Ship, Calendar as CalendarIcon, AlertTriangle, TrendingUp, Wallet,
  Clock, Users as UsersIcon, MapPin, Bell, History, Tag, CalendarRange,
} from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, ADMIN_TABS } from '../_components/tabs';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ from?: string; to?: string; preset?: string; lite?: string }>;

function dateFromPreset(preset: string, today: string): { from: string; to: string; label: string } {
  const [y, m, d] = today.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  switch (preset) {
    case 'today':
      return { from: today, to: today, label: 'Today' };
    case 'last7':
      return {
        from: new Date(base.getTime() - 6 * 86400e3).toISOString().slice(0, 10),
        to: today,
        label: 'Last 7 days',
      };
    case 'last30':
      return {
        from: new Date(base.getTime() - 29 * 86400e3).toISOString().slice(0, 10),
        to: today,
        label: 'Last 30 days',
      };
    case 'mtd':
      return { from: today.slice(0, 7) + '-01', to: today, label: 'Month to date' };
    case 'ytd':
      return { from: today.slice(0, 4) + '-01-01', to: today, label: 'Year to date' };
    default:
      return { from: today.slice(0, 7) + '-01', to: today, label: 'Month to date' };
  }
}

function fmtEgp(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default async function BoatRentalAdminDashboard({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const today = cairoTodayStr();
  const lite = sp.lite === '1';
  const tomorrow = (() => {
    const [y, m, d] = today.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    return t.toISOString().slice(0, 10);
  })();

  // Determine active filter range.
  const presetUsed = !sp.from && !sp.to ? (sp.preset || 'mtd') : 'custom';
  const range = presetUsed === 'custom'
    ? { from: sp.from || today.slice(0, 7) + '-01', to: sp.to || today, label: 'Custom range' }
    : dateFromPreset(presetUsed, today);

  const sb = supabaseAdmin();

  // Parallel queries.
  const [
    boatsRes,
    todayTripsRes,
    tomorrowTripsRes,
    activeHoldsRes,
    refundPendingRes,
    revInRangeRes,
    bookingsInRangeRes,
    cancelledInRangeRes,
    topBoatsRes,
    topBrokersRes,
    recentAuditRes,
    notifFailedRes,
    upcomingNoDetailsRes,
  ] = await Promise.all([
    sb.from('boat_rental_boats').select('id, status'),
    // Today's trips: any reservation for today not cancelled/expired/held.
    sb
      .from('boat_rental_reservations')
      .select(
        `
        id, status, price_egp_snapshot,
        boat:boat_rental_boats ( name, skipper_name ),
        booking:boat_rental_bookings ( client_name, guest_count, trip_ready_time, destination:boat_rental_destinations ( name ) )
      `
      )
      .eq('booking_date', today)
      .in('status', ['confirmed', 'details_filled', 'paid_to_owner']),
    sb
      .from('boat_rental_reservations')
      .select(
        `
        id, status, price_egp_snapshot,
        boat:boat_rental_boats ( name ),
        booking:boat_rental_bookings ( client_name, guest_count, trip_ready_time )
      `
      )
      .eq('booking_date', tomorrow)
      .in('status', ['confirmed', 'details_filled']),
    sb
      .from('boat_rental_reservations')
      .select(
        `
        id, booking_date, held_until, price_egp_snapshot,
        boat:boat_rental_boats ( name ),
        broker:app_users!boat_rental_reservations_broker_id_fkey ( username )
      `
      )
      .eq('status', 'held')
      .order('held_until'),
    sb
      .from('boat_rental_reservations')
      .select(
        `
        id, booking_date, price_egp_snapshot,
        boat:boat_rental_boats ( name )
      `
      )
      .eq('refund_pending', true)
      .order('booking_date', { ascending: false }),
    // Revenue: payments made in range.
    sb
      .from('boat_rental_payments')
      .select('amount_egp, paid_at')
      .gte('paid_at', range.from)
      .lte('paid_at', range.to + 'T23:59:59Z'),
    sb
      .from('boat_rental_reservations')
      .select('id, status, price_egp_snapshot, booking_date')
      .gte('booking_date', range.from)
      .lte('booking_date', range.to),
    sb
      .from('boat_rental_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'cancelled')
      .gte('booking_date', range.from)
      .lte('booking_date', range.to),
    // Top boats: aggregate price snapshot of completed bookings in range.
    lite
      ? Promise.resolve({ data: [] })
      : sb
          .from('boat_rental_reservations')
          .select(
            `
            boat_id, price_egp_snapshot,
            boat:boat_rental_boats ( name )
          `
          )
          .eq('status', 'paid_to_owner')
          .gte('booking_date', range.from)
          .lte('booking_date', range.to),
    lite
      ? Promise.resolve({ data: [] })
      : sb
          .from('boat_rental_reservations')
          .select(
            `
            broker_id, price_egp_snapshot,
            broker:app_users!boat_rental_reservations_broker_id_fkey ( username )
          `
          )
          .in('status', ['confirmed', 'details_filled', 'paid_to_owner'])
          .gte('booking_date', range.from)
          .lte('booking_date', range.to),
    lite
      ? Promise.resolve({ data: [] })
      : sb
          .from('boat_rental_audit_log')
          .select('id, action, from_status, to_status, created_at, actor_role, reservation_id')
          .order('created_at', { ascending: false })
          .limit(8),
    sb
      .from('boat_rental_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed'),
    sb
      .from('boat_rental_reservations')
      .select(
        `
        id, booking_date,
        boat:boat_rental_boats ( name )
      `
      )
      .eq('status', 'confirmed')
      .gte('booking_date', tomorrow)
      .lte('booking_date', tomorrow),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boats = ((boatsRes.data as unknown) as Array<{ id: string; status: string }> | null) || [];
  const activeBoats = boats.filter(b => b.status === 'active').length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayTrips = ((todayTripsRes.data as unknown) as any[] | null) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tomorrowTrips = ((tomorrowTripsRes.data as unknown) as any[] | null) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeHolds = ((activeHoldsRes.data as unknown) as any[] | null) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refundsPending = ((refundPendingRes.data as unknown) as any[] | null) || [];
  const revRows = ((revInRangeRes.data as unknown) as Array<{ amount_egp: string | number }> | null) || [];
  const revenueTotal = revRows.reduce((s, r) => s + Number(r.amount_egp), 0);
  const bookingsInRange = ((bookingsInRangeRes.data as unknown) as Array<{ status: string; price_egp_snapshot: string | number }> | null) || [];
  const livePerRange = bookingsInRange.filter(r => ['confirmed', 'details_filled', 'paid_to_owner'].includes(r.status));
  const avgBookingValue = livePerRange.length ? revenueTotal / Math.max(livePerRange.length, 1) : 0;
  const cancelledCount = (cancelledInRangeRes as { count: number | null }).count || 0;
  const totalCount = bookingsInRange.length;
  const cancelRate = totalCount > 0 ? (cancelledCount / totalCount) * 100 : 0;

  // Top boats.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topBoatRows = ((topBoatsRes.data as unknown) as any[] | null) || [];
  const boatTotals = new Map<string, { name: string; total: number; trips: number }>();
  for (const r of topBoatRows) {
    const k = r.boat_id;
    const cur = boatTotals.get(k) || { name: r.boat?.name || '—', total: 0, trips: 0 };
    cur.total += Number(r.price_egp_snapshot);
    cur.trips++;
    boatTotals.set(k, cur);
  }
  const topBoats = [...boatTotals.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  // Top brokers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topBrokerRows = ((topBrokersRes.data as unknown) as any[] | null) || [];
  const brokerTotals = new Map<string, { name: string; total: number; bookings: number }>();
  for (const r of topBrokerRows) {
    const k = r.broker_id;
    const cur = brokerTotals.get(k) || { name: r.broker?.username || '—', total: 0, bookings: 0 };
    cur.total += Number(r.price_egp_snapshot);
    cur.bookings++;
    brokerTotals.set(k, cur);
  }
  const topBrokers = [...brokerTotals.values()].sort((a, b) => b.bookings - a.bookings).slice(0, 5);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audit = ((recentAuditRes.data as unknown) as any[] | null) || [];
  const failedNotifs = (notifFailedRes as { count: number | null }).count || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tomorrowMissingDetails = ((upcomingNoDetailsRes.data as unknown) as any[] | null) || [];

  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300 shrink-0">
          <Ship size={24} strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">Personal · Boat Rental</p>
            <Link
              href={lite ? '?' : '?lite=1'}
              className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border transition ${
                lite
                  ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-amber-300'
              }`}
              title={lite ? 'Lite mode on — leaderboards skipped. Click to disable.' : 'Toggle lite mode (skips heavy queries — useful on slow connections)'}
            >
              {lite ? 'Lite mode ON' : 'Lite mode'}
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Today is {today} (Cairo). Range: <strong>{range.label}</strong> ({range.from} → {range.to}).
          </p>
        </div>
      </header>

      <TabNav tabs={ADMIN_TABS} currentPath="/emails/boat-rental/admin" />

      {/* Date range filters */}
      <section className="mt-6 ix-card p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1">
            {(['today', 'last7', 'last30', 'mtd', 'ytd'] as const).map(p => {
              const active = (presetUsed === p) || (presetUsed === 'mtd' && p === 'mtd' && !sp.from);
              return (
                <Link
                  key={p}
                  href={`?preset=${p}`}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition ${active ? 'bg-cyan-50 border-cyan-300 text-cyan-700 font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {p === 'today' ? 'Today' : p === 'last7' ? 'Last 7d' : p === 'last30' ? 'Last 30d' : p.toUpperCase()}
                </Link>
              );
            })}
          </div>
          <div className="flex-1" />
          <label className="text-sm">
            <span className="text-slate-600 text-xs">From</span>
            <input name="from" type="date" defaultValue={sp.from || range.from} className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">To</span>
            <input name="to" type="date" defaultValue={sp.to || range.to} className="ix-input mt-1" />
          </label>
          <button type="submit" className="ix-btn-secondary">Apply</button>
        </form>
      </section>

      {/* KPI cards */}
      <section className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Wallet} tint="emerald" label={`Revenue · ${range.label}`} value={`EGP ${fmtEgp(revenueTotal)}`} hint={`${livePerRange.length} live booking${livePerRange.length === 1 ? '' : 's'}`} />
        <Stat icon={TrendingUp} tint="cyan" label="Avg booking value" value={`EGP ${fmtEgp(avgBookingValue)}`} hint={`${totalCount} total in range`} />
        <Stat icon={Ship} tint="indigo" label="Active boats" value={String(activeBoats)} hint={`${boats.length - activeBoats} archived/maint`} />
        <Stat icon={AlertTriangle} tint={cancelRate > 15 ? 'rose' : 'slate'} label="Cancel rate" value={`${cancelRate.toFixed(0)}%`} hint={`${cancelledCount} cancelled`} />
      </section>

      {/* Alerts */}
      {(refundsPending.length > 0 || failedNotifs > 0 || tomorrowMissingDetails.length > 0) && (
        <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          {refundsPending.length > 0 && (
            <Alert
              tint="rose"
              icon={AlertTriangle}
              title={`${refundsPending.length} refund${refundsPending.length === 1 ? '' : 's'} pending`}
              body={refundsPending.slice(0, 3).map(r => `${r.boat?.name} · ${r.booking_date} · EGP ${Number(r.price_egp_snapshot).toLocaleString()}`).join(' · ')}
              href="/emails/boat-rental/admin/bookings?status=cancelled"
            />
          )}
          {failedNotifs > 0 && (
            <Alert
              tint="amber"
              icon={Bell}
              title={`${failedNotifs} WhatsApp message${failedNotifs === 1 ? '' : 's'} failed`}
              body="Check Green-API config or retry from the notifications log."
              href="/emails/boat-rental/admin/notifications?status=failed"
            />
          )}
          {tomorrowMissingDetails.length > 0 && (
            <Alert
              tint="amber"
              icon={CalendarIcon}
              title={`${tomorrowMissingDetails.length} trip${tomorrowMissingDetails.length === 1 ? '' : 's'} tomorrow missing details`}
              body={tomorrowMissingDetails.slice(0, 3).map(r => r.boat?.name).join(', ')}
              href="/emails/boat-rental/admin/bookings?status=confirmed"
            />
          )}
        </section>
      )}

      {/* Today's trips */}
      <section className="mt-6 ix-card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <CalendarIcon size={16} className="text-cyan-600" /> Today&apos;s trips ({todayTrips.length})
        </h2>
        {todayTrips.length === 0 ? (
          <p className="text-sm text-slate-500">No trips scheduled today.</p>
        ) : (
          <div className="space-y-2">
            {todayTrips.map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                <div>
                  <span className="font-medium">{t.boat?.name}</span>
                  <span className="text-slate-500"> · {t.booking?.client_name || '(no details)'}</span>
                  {t.booking?.guest_count != null && <span className="text-slate-500"> · {t.booking.guest_count} guests</span>}
                  {t.booking?.trip_ready_time && <span className="text-slate-500"> · ready {t.booking.trip_ready_time}</span>}
                  {t.booking?.destination?.name && <span className="text-slate-500"> · {t.booking.destination.name}</span>}
                </div>
                <span className="text-xs text-slate-400">EGP {Number(t.price_egp_snapshot).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tomorrow's trips */}
      {tomorrowTrips.length > 0 && (
        <section className="mt-4 ix-card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <CalendarIcon size={16} className="text-amber-600" /> Tomorrow ({tomorrow}) — {tomorrowTrips.length} trip{tomorrowTrips.length === 1 ? '' : 's'}
          </h2>
          <div className="space-y-2 text-sm">
            {tomorrowTrips.map(t => (
              <div key={t.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                <div>
                  <span className="font-medium">{t.boat?.name}</span>
                  <span className="text-slate-500"> · {t.booking?.client_name || <span className="text-rose-600">details missing</span>}</span>
                  {t.booking?.guest_count != null && <span className="text-slate-500"> · {t.booking.guest_count} guests</span>}
                </div>
                <span className="text-xs text-slate-400">EGP {Number(t.price_egp_snapshot).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active holds */}
      {activeHolds.length > 0 && (
        <section className="mt-4 ix-card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Clock size={16} className="text-amber-600" /> Active holds ({activeHolds.length})
          </h2>
          <div className="space-y-2 text-sm">
            {activeHolds.map(h => (
              <div key={h.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                <div>
                  <span className="font-medium">{h.boat?.name}</span>
                  <span className="text-slate-500"> · {h.booking_date}</span>
                  <span className="text-slate-400 ml-2">by {h.broker?.username}</span>
                </div>
                <span className="text-xs text-slate-400">
                  Expires {h.held_until ? new Date(h.held_until).toLocaleTimeString() : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Leaderboards (skipped in lite mode) */}
      {!lite && (
      <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="ix-card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Ship size={16} className="text-cyan-600" /> Top boats by revenue · {range.label}
          </h2>
          {topBoats.length === 0 ? (
            <p className="text-sm text-slate-500">No completed trips in range.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {topBoats.map(b => (
                <div key={b.name} className="flex items-center justify-between">
                  <span>{b.name}</span>
                  <span className="text-slate-500 text-xs">
                    {b.trips} trip{b.trips === 1 ? '' : 's'} · <strong className="text-slate-900">EGP {fmtEgp(b.total)}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ix-card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <UsersIcon size={16} className="text-violet-600" /> Top brokers by bookings · {range.label}
          </h2>
          {topBrokers.length === 0 ? (
            <p className="text-sm text-slate-500">No bookings in range.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {topBrokers.map(b => (
                <div key={b.name} className="flex items-center justify-between">
                  <span>{b.name}</span>
                  <span className="text-slate-500 text-xs">
                    {b.bookings} bookings · <strong className="text-slate-900">EGP {fmtEgp(b.total)}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      )}

      {/* Recent activity + quick links */}
      <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {!lite && (
        <div className="ix-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2"><History size={16} className="text-slate-600" /> Recent activity</h2>
            <Link href="/emails/boat-rental/admin/audit" className="text-xs text-cyan-700 hover:underline">View all →</Link>
          </div>
          {audit.length === 0 ? (
            <p className="text-sm text-slate-500">No activity yet.</p>
          ) : (
            <div className="space-y-2 text-xs text-slate-600">
              {audit.map(a => (
                <div key={a.id} className="flex items-center justify-between border-b border-slate-100 pb-1 last:border-0">
                  <span>
                    <span className="font-mono">{a.action}</span>
                    <span className="text-slate-400"> · {a.from_status || '—'} → {a.to_status || '—'}</span>
                    <span className="text-slate-400"> · {a.actor_role || '—'}</span>
                  </span>
                  <span className="text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
        <div className="ix-card p-5">
          <h2 className="font-semibold mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/emails/boat-rental/admin/boats" icon={Ship} label="Manage boats" />
            <QuickLink href="/emails/boat-rental/admin/pricing" icon={Tag} label="Edit pricing" />
            <QuickLink href="/emails/boat-rental/admin/seasons" icon={CalendarRange} label="Seasons" />
            <QuickLink href="/emails/boat-rental/admin/destinations" icon={MapPin} label="Destinations" />
            <QuickLink href="/emails/boat-rental/admin/users" icon={UsersIcon} label="Users" />
            <QuickLink href="/admin/integrations" icon={Bell} label="Green-API setup" />
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({
  icon: Icon, tint, label, value, hint,
}: {
  icon: React.ComponentType<{ size?: number }>;
  tint: 'emerald' | 'cyan' | 'indigo' | 'rose' | 'slate' | 'amber';
  label: string;
  value: string;
  hint?: string;
}) {
  const tints: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-50 text-slate-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="ix-card p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg inline-flex items-center justify-center ${tints[tint]} shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium truncate">{label}</div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
        {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

function Alert({
  tint, icon: Icon, title, body, href,
}: {
  tint: 'rose' | 'amber';
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  body: string;
  href: string;
}) {
  const wrap = tint === 'rose' ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200 bg-amber-50/50';
  const iconColor = tint === 'rose' ? 'text-rose-600' : 'text-amber-600';
  return (
    <Link href={href} className={`ix-card p-4 ${wrap} hover:shadow-sm transition`}>
      <div className="flex items-start gap-2">
        <Icon size={16} />
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${iconColor}`}>{title}</div>
          <div className="text-xs text-slate-600 mt-1 truncate">{body}</div>
        </div>
      </div>
    </Link>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ size?: number }>; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50 transition">
      <Icon size={14} />
      {label}
    </Link>
  );
}
