import { Plus, Save, Trash2, Mail, Phone } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TabNav, ADMIN_TABS } from '../../_components/tabs';
import { createOwnerAction, updateOwnerAction, deleteOwnerAction } from './actions';

export const dynamic = 'force-dynamic';

type OwnerRow = {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  notes: string | null;
  status: string;
  user_id: string | null;
  created_at: string;
};

export default async function OwnersAdmin() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_owners')
    .select('id, name, whatsapp, email, notes, status, user_id, created_at')
    .order('created_at', { ascending: false });
  const owners = (data as OwnerRow[] | null) || [];

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Owners</h1>
        <p className="text-sm text-slate-500 mt-1">Boat owners — receive payment notifications after every trip.</p>
      </header>
      <TabNav tabs={ADMIN_TABS} currentPath="/emails/boat-rental/admin/owners" />

      <section className="mt-8 ix-card p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Plus size={16} /> Add owner
        </h2>
        <form action={createOwnerAction} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Name *</span>
            <input name="name" required className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">WhatsApp * (digits only, with country code)</span>
            <input name="whatsapp" type="tel" inputMode="tel" required placeholder="201234567890" className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Email</span>
            <input name="email" type="email" className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Notes</span>
            <input name="notes" className="ix-input mt-1" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="ix-btn-primary"><Plus size={14} /> Create owner</button>
          </div>
        </form>
      </section>

      <section className="mt-6 space-y-3">
        {owners.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">No owners yet.</div>
        )}
        {owners.map(o => (
          <div key={o.id} className="ix-card p-5">
            <form action={updateOwnerAction} className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input type="hidden" name="id" value={o.id} />
              <label className="text-sm md:col-span-2">
                <span className="text-slate-600 text-xs">Name</span>
                <input name="name" defaultValue={o.name} required className="ix-input mt-1" />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="text-slate-600 text-xs">WhatsApp</span>
                <input name="whatsapp" defaultValue={o.whatsapp} required className="ix-input mt-1" />
              </label>
              <label className="text-sm">
                <span className="text-slate-600 text-xs">Status</span>
                <select name="status" defaultValue={o.status} className="ix-input mt-1">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-600 text-xs">Email</span>
                <input name="email" type="email" defaultValue={o.email || ''} className="ix-input mt-1" />
              </label>
              <label className="text-sm md:col-span-5">
                <span className="text-slate-600 text-xs">Notes</span>
                <input name="notes" defaultValue={o.notes || ''} className="ix-input mt-1" />
              </label>
              <div className="md:col-span-6 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1"><Phone size={12} /> +{o.whatsapp}</span>
                  {o.email && <span className="inline-flex items-center gap-1"><Mail size={12} /> {o.email}</span>}
                  {o.user_id && <span className="text-emerald-700">Login linked</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button type="submit" className="ix-btn-secondary"><Save size={14} /> Save</button>
                </div>
              </div>
            </form>
            <form action={deleteOwnerAction} className="mt-2 flex justify-end">
              <input type="hidden" name="id" value={o.id} />
              <button
                type="submit"
                className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1"
                title="Delete (or archive if any boats reference this owner)"
              >
                <Trash2 size={12} /> Delete / archive
              </button>
            </form>
          </div>
        ))}
      </section>
    </>
  );
}
