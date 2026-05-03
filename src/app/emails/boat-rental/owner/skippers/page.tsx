import { Users, Star } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { TabNav, OWNER_TABS } from '../../_components/tabs';
import { AddSkipperModal } from './_components/add-skipper-modal';
import { setDefaultSkipperAction, deactivateSkipperAction } from './actions';

export const dynamic = 'force-dynamic';

type Boat = { id: string; name: string };
type Skipper = { id: string; boat_id: string; name: string; whatsapp: string; is_default: boolean; active: boolean };

export default async function SkippersPage() {
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();

  const boatsRes = ownerIds.length
    ? await sb.from('boat_rental_boats').select('id, name').in('owner_id', ownerIds).order('name')
    : { data: [] };
  const boats = ((boatsRes.data as unknown) as Boat[] | null) ?? [];
  const boatIds = boats.map(b => b.id);

  const skippersRes = boatIds.length
    ? await sb.from('boat_rental_skippers').select('id, boat_id, name, whatsapp, is_default, active').in('boat_id', boatIds).order('is_default', { ascending: false }).order('name')
    : { data: [] };
  const skippers = ((skippersRes.data as unknown) as Skipper[] | null) ?? [];

  const skippersByBoat = new Map<string, Skipper[]>();
  for (const s of skippers) {
    const arr = skippersByBoat.get(s.boat_id) ?? [];
    arr.push(s);
    skippersByBoat.set(s.boat_id, arr);
  }

  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 text-cyan-600">
          <Users size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Owner Portal</p>
          <h1 className="text-3xl font-bold tracking-tight">Skippers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage the captains for each boat. One default per boat, plus part-timers.</p>
        </div>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner/skippers" />

      <section className="mt-8">
        <div className="flex justify-end mb-4">
          <AddSkipperModal boats={boats} />
        </div>

        {boats.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">No boats linked to your account.</div>
        )}

        {boats.map(boat => {
          const list = skippersByBoat.get(boat.id) ?? [];
          return (
            <div key={boat.id} className="ix-card p-5 mb-4">
              <h2 className="font-semibold mb-3">{boat.name}</h2>
              {list.length === 0 && (
                <p className="text-xs text-slate-500">No skippers yet — add one.</p>
              )}
              <ul className="divide-y divide-slate-100">
                {list.map(sk => (
                  <li key={sk.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {sk.is_default && <Star size={14} className="text-amber-500 fill-amber-400" />}
                      <div>
                        <div className="font-medium text-sm">{sk.name}</div>
                        <div className="text-xs text-slate-500">+{sk.whatsapp}</div>
                      </div>
                      {!sk.active && (
                        <span className="ml-2 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {!sk.is_default && sk.active && (
                        <form action={setDefaultSkipperAction}>
                          <input type="hidden" name="id" value={sk.id} />
                          <button className="text-xs text-amber-700 hover:text-amber-900">Set default</button>
                        </form>
                      )}
                      {!sk.is_default && sk.active && (
                        <form action={deactivateSkipperAction}>
                          <input type="hidden" name="id" value={sk.id} />
                          <button className="text-xs text-rose-700 hover:text-rose-900 ml-3">Deactivate</button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </>
  );
}
