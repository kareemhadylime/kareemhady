import { Plus, Save, Trash2, Eye, EyeOff } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { BackToAdminMenu } from '../_components/back-to-menu';
import {
  createDestinationAction,
  toggleDestinationAction,
  renameDestinationAction,
  deleteDestinationAction,
} from './actions';

export const dynamic = 'force-dynamic';

type Row = { id: string; name: string; active: boolean; created_at: string };

export default async function DestinationsAdmin() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_destinations')
    .select('id, name, active, created_at')
    .order('active', { ascending: false })
    .order('name');
  const rows = (data as Row[] | null) || [];

  return (
    <>
      <BackToAdminMenu />
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Destinations</h1>
        <p className="text-sm text-slate-500 mt-1">Dropdown options on the broker trip-details form.</p>
      </header>

      <section className="mt-8 ix-card p-6">
        <form action={createDestinationAction} className="flex gap-3 items-end">
          <label className="text-sm flex-1">
            <span className="text-slate-600 text-xs">Destination name</span>
            <input name="name" required placeholder="e.g. Ras Mohammed" className="ix-input mt-1" />
          </label>
          <button type="submit" className="ix-btn-primary"><Plus size={14} /> Add</button>
        </form>
      </section>

      <section className="mt-6 space-y-2">
        {rows.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">No destinations yet.</div>
        )}
        {rows.map(r => (
          <div key={r.id} className={`ix-card p-4 flex items-center gap-3 ${!r.active ? 'opacity-60' : ''}`}>
            <form action={renameDestinationAction} className="flex-1 flex items-center gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input name="name" defaultValue={r.name} className="ix-input flex-1" />
              <button type="submit" className="ix-btn-secondary"><Save size={12} /> Save</button>
            </form>
            <form action={toggleDestinationAction}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="active" value={r.active ? '1' : '0'} />
              <button
                type="submit"
                className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                title={r.active ? 'Disable' : 'Enable'}
              >
                {r.active ? <Eye size={14} /> : <EyeOff size={14} />}
                {r.active ? 'Active' : 'Hidden'}
              </button>
            </form>
            <form action={deleteDestinationAction}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="text-rose-600 hover:text-rose-800" title="Delete (or soft-disable if referenced)">
                <Trash2 size={14} />
              </button>
            </form>
          </div>
        ))}
      </section>
    </>
  );
}
