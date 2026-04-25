import { Filter, AlertTriangle, XCircle } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { BackToAdminMenu } from '../_components/back-to-menu';
import { adminForceCancelAction, clearRefundFlagAction } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{
  status?: string;
  boat_id?: string;
  from?: string;
  to?: string;
}>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export default async function AllBookingsAdmin({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const sb = supabaseAdmin();

  let q = sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, status, price_egp_snapshot, refund_pending, notes, cancelled_by_role,
      boat:boat_rental_boats ( id, name, owner:boat_rental_owners ( name ) ),
      broker:app_users!boat_rental_reservations_broker_id_fkey ( id, username ),
      booking:boat_rental_bookings ( client_name, guest_count, destination:boat_rental_destinations ( name ) ),
      payment:boat_rental_payments ( amount_egp, paid_at, recorded_by_role )
    `
    )
    .order('booking_date', { ascending: false })
    .limit(200);

  if (sp.status) q = q.eq('status', sp.status);
  if (sp.boat_id) q = q.eq('boat_id', sp.boat_id);
  if (sp.from) q = q.gte('booking_date', sp.from);
  if (sp.to) q = q.lte('booking_date', sp.to);

  const { data } = await q;
  const rows = ((data as unknown) as Row[] | null) || [];

  const { data: boatsRaw } = await sb
    .from('boat_rental_boats')
    .select('id, name')
    .order('name');
  const boats = ((boatsRaw as unknown) as Array<{ id: string; name: string }> | null) || [];

  const refundCount = rows.filter(r => r.refund_pending).length;

  return (
    <>
      <BackToAdminMenu />
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">All Bookings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every reservation across the fleet. {refundCount > 0 && (
            <span className="ml-1 text-rose-700">
              <AlertTriangle size={12} className="inline mb-0.5" /> {refundCount} refund pending.
            </span>
          )}
        </p>
      </header>

      <section className="mt-8 ix-card p-5">
        <form method="get" className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Status</span>
            <select name="status" defaultValue={sp.status || ''} className="ix-input mt-1">
              <option value="">All</option>
              <option value="held">Held</option>
              <option value="confirmed">Confirmed</option>
              <option value="details_filled">Details filled</option>
              <option value="paid_to_owner">Paid to owner</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Boat</span>
            <select name="boat_id" defaultValue={sp.boat_id || ''} className="ix-input mt-1">
              <option value="">All boats</option>
              {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">From</span>
            <input name="from" type="date" defaultValue={sp.from || ''} className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">To</span>
            <input name="to" type="date" defaultValue={sp.to || ''} className="ix-input mt-1" />
          </label>
          <button type="submit" className="ix-btn-secondary"><Filter size={14} /> Apply</button>
        </form>
      </section>

      {/* Mobile: card list */}
      <section className="mt-6 md:hidden space-y-2">
        {rows.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">No reservations match.</div>
        )}
        {rows.map(r => {
          const cancellable = ['held', 'confirmed', 'details_filled'].includes(r.status);
          return (
            <div key={r.id} className="ix-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.boat?.name || '—'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{r.booking_date}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums">
                    EGP {Number(r.price_egp_snapshot).toLocaleString()}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 justify-end">
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      {r.status}
                    </span>
                    {r.refund_pending && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        refund
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                <div>Owner · {r.boat?.owner?.name || '—'}</div>
                <div>Broker · {r.broker?.username || '—'}</div>
                {r.booking?.client_name && (
                  <div>Client · {r.booking.client_name} ({r.booking.guest_count})</div>
                )}
              </div>
              {(r.refund_pending || cancellable) && (
                <div className="mt-3 flex items-center gap-3 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
                  {r.refund_pending && (
                    <form action={clearRefundFlagAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline">
                        Clear refund
                      </button>
                    </form>
                  )}
                  {cancellable && (
                    <form action={adminForceCancelAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-800 inline-flex items-center gap-1"
                      >
                        <XCircle size={12} /> Force-cancel
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Desktop: table */}
      <section className="mt-6 ix-card overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Boat</th>
                <th className="text-left px-4 py-2">Owner</th>
                <th className="text-left px-4 py-2">Broker</th>
                <th className="text-left px-4 py-2">Client / Guests</th>
                <th className="text-right px-4 py-2">EGP</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 px-4 py-6">No reservations match.</td>
                </tr>
              )}
              {rows.map(r => {
                const cancellable = ['held', 'confirmed', 'details_filled'].includes(r.status);
                return (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 whitespace-nowrap">{r.booking_date}</td>
                    <td className="px-4 py-2">{r.boat?.name || '—'}</td>
                    <td className="px-4 py-2">{r.boat?.owner?.name || '—'}</td>
                    <td className="px-4 py-2">{r.broker?.username || '—'}</td>
                    <td className="px-4 py-2">
                      {r.booking?.client_name ? `${r.booking.client_name} / ${r.booking.guest_count}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {Number(r.price_egp_snapshot).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                        {r.status}
                      </span>
                      {r.refund_pending && (
                        <span className="ml-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                          refund
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        {r.refund_pending && (
                          <form action={clearRefundFlagAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="text-xs text-emerald-700 hover:underline">
                              Clear refund
                            </button>
                          </form>
                        )}
                        {cancellable && (
                          <form action={adminForceCancelAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              type="submit"
                              className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1"
                              title="Force-cancel (admin override, ignores 72h rule)"
                            >
                              <XCircle size={12} /> Cancel
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
