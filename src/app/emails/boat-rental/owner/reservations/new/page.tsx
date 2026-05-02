import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { TabNav, OWNER_TABS } from '../../../_components/tabs';
import { ExternalBrokerPicker } from '../../_components/external-broker-picker';
import { createManualReservationAction } from '../manual-actions';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ boat_id?: string; date?: string }>;

export default async function NewManualReservation({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();

  const [boatsRes, brokersRes, externalsRes] = await Promise.all([
    ownerIds.length
      ? sb.from('boat_rental_boats').select('id, name').in('owner_id', ownerIds).order('name')
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    sb.from('app_users').select('id, username').order('username'),
    ownerIds.length
      ? sb
          .from('boat_rental_external_brokers')
          .select('id, name, phone')
          .in('owner_id', ownerIds)
          .order('name')
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; phone: string | null }> }),
  ]);

  const boats =
    ((boatsRes.data as unknown) as Array<{ id: string; name: string }> | null) ?? [];
  const brokers =
    ((brokersRes.data as unknown) as Array<{ id: string; username: string }> | null) ?? [];
  const externals =
    ((externalsRes.data as unknown) as Array<{ id: string; name: string; phone: string | null }> | null) ?? [];

  return (
    <>
      <header className="mb-6 flex items-center gap-2">
        <Link
          href="/emails/boat-rental/owner/reservations"
          className="text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
        >
          <ChevronLeft size={14} /> Reservations
        </Link>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner/reservations" />

      <section className="mt-8 ix-card p-6 max-w-2xl">
        <h1 className="text-xl font-bold tracking-tight">New manual reservation</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create a booking yourself without going through the broker hold flow.
        </p>

        <form action={createManualReservationAction} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Boat *</span>
            <select name="boat_id" required defaultValue={sp.boat_id ?? ''} className="ix-input mt-1">
              <option value="" disabled>
                Select a boat…
              </option>
              {boats.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Date *</span>
            <input
              name="booking_date"
              type="date"
              required
              defaultValue={sp.date ?? ''}
              className="ix-input mt-1"
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Trip price (EGP) *</span>
            <input
              name="trip_price"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              required
              className="ix-input mt-1"
            />
            <span className="block text-[11px] text-slate-500 mt-1">
              Override the boat&apos;s pricing-table default if needed.
            </span>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-slate-600 text-xs">Source *</legend>
            <label className="block text-sm">
              <input type="radio" name="source" value="registered_broker" defaultChecked className="mr-2" />
              Registered broker
            </label>
            <label className="block text-sm">
              <input type="radio" name="source" value="external_broker" className="mr-2" />
              External broker (not in our system)
            </label>
            <label className="block text-sm">
              <input type="radio" name="source" value="client_direct" className="mr-2" />
              Client direct
            </label>
          </fieldset>

          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Registered broker (if applicable)</span>
            <select name="broker_id" className="ix-input mt-1" defaultValue="">
              <option value="">— none —</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.username}
                </option>
              ))}
            </select>
          </label>

          <div className="block text-sm">
            <span className="text-slate-600 text-xs">External broker (if applicable)</span>
            <ExternalBrokerPicker initial={externals} fieldName="external_broker_id" />
          </div>

          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Special requests / notes</span>
            <textarea name="notes" rows={3} className="ix-input mt-1" />
          </label>

          <div className="flex gap-2 justify-end">
            <Link href="/emails/boat-rental/owner/reservations" className="ix-btn-secondary">
              Cancel
            </Link>
            <button type="submit" className="ix-btn-primary">
              Create reservation
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
