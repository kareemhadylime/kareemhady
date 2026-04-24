import { Plus, Save, Trash2 } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TabNav, ADMIN_TABS } from '../../_components/tabs';
import { createSeasonAction, updateSeasonAction, deleteSeasonAction } from './actions';

export const dynamic = 'force-dynamic';

type Row = { id: string; name: string; start_date: string; end_date: string };

export default async function SeasonsAdmin() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_seasons')
    .select('id, name, start_date, end_date')
    .order('start_date');
  const rows = (data as Row[] | null) || [];

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Seasons & Holidays</h1>
        <p className="text-sm text-slate-500 mt-1">
          Any booking whose date falls inside one of these ranges uses the <em>season</em> pricing tier.
        </p>
      </header>
      <TabNav tabs={ADMIN_TABS} currentPath="/emails/boat-rental/admin/seasons" />

      <section className="mt-8 ix-card p-6">
        <h2 className="font-semibold mb-3 text-sm">Add season / holiday range</h2>
        <form action={createSeasonAction} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-sm md:col-span-2">
            <span className="text-slate-600 text-xs">Name</span>
            <input name="name" required placeholder="Sham El-Nessim 2026" className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Start date</span>
            <input name="start_date" type="date" required className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">End date</span>
            <input name="end_date" type="date" required className="ix-input mt-1" />
          </label>
          <div className="md:col-span-4">
            <button type="submit" className="ix-btn-primary"><Plus size={14} /> Add range</button>
          </div>
        </form>
      </section>

      <section className="mt-6 space-y-2">
        {rows.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">No seasons defined.</div>
        )}
        {rows.map(r => (
          <div key={r.id} className="ix-card p-4">
            <form action={updateSeasonAction} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <input type="hidden" name="id" value={r.id} />
              <label className="text-sm md:col-span-2">
                <span className="text-slate-600 text-xs">Name</span>
                <input name="name" defaultValue={r.name} required className="ix-input mt-1" />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="text-slate-600 text-xs">Start</span>
                <input name="start_date" type="date" defaultValue={r.start_date} required className="ix-input mt-1" />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="text-slate-600 text-xs">End</span>
                <input name="end_date" type="date" defaultValue={r.end_date} required className="ix-input mt-1" />
              </label>
              <div className="md:col-span-6 flex justify-between">
                <button type="submit" className="ix-btn-secondary"><Save size={14} /> Save</button>
              </div>
            </form>
            <form action={deleteSeasonAction} className="mt-2 flex justify-end">
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1">
                <Trash2 size={12} /> Delete
              </button>
            </form>
          </div>
        ))}
      </section>
    </>
  );
}
