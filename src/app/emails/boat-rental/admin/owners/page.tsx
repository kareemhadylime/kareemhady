import { Plus, Save, Trash2, Mail, Phone, KeyRound, UserPlus } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { BackToAdminMenu } from '../_components/back-to-menu';
import {
  createOwnerAction,
  updateOwnerAction,
  deleteOwnerAction,
  setupOwnerLoginAction,
  resetOwnerLoginPasswordAction,
} from './actions';

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

  // Pull usernames for any owners that already have a linked login —
  // shown inline so the admin can give it to the owner.
  const linkedUserIds = owners.map(o => o.user_id).filter(Boolean) as string[];
  const usernameByUid = new Map<string, string>();
  if (linkedUserIds.length > 0) {
    const { data: users } = await sb
      .from('app_users')
      .select('id, username')
      .in('id', linkedUserIds);
    for (const u of (users as Array<{ id: string; username: string }> | null) || []) {
      usernameByUid.set(u.id, u.username);
    }
  }

  return (
    <>
      <BackToAdminMenu href="/emails/boat-rental/admin/setup" label="Back to setup" />
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Owners</h1>
        <p className="text-sm text-slate-500 mt-1">Boat owners — receive payment notifications after every trip.</p>
      </header>

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

          {/* Optional inline login provisioning. Both fields must be
              filled for the login to be created — leaving them blank
              just creates the owner record. Admin can add a login
              later via the per-owner card below. */}
          <fieldset className="md:col-span-2 mt-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
            <legend className="text-[11px] uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-300 px-1 inline-flex items-center gap-1">
              <UserPlus size={11} /> Owner login (optional)
            </legend>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3">
              Fill in both fields to give this owner a login they can use to view their own boats and bookings. Leave blank to skip — you can set one up later from this page.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm block">
                <span className="text-slate-600 dark:text-slate-300 text-xs">Username (lowercase, 3+ chars)</span>
                <input name="login_username" minLength={3} className="ix-input mt-1" />
              </label>
              <label className="text-sm block">
                <span className="text-slate-600 dark:text-slate-300 text-xs">Temporary password (8+ chars)</span>
                <input name="login_password" minLength={8} className="ix-input mt-1" />
              </label>
            </div>
          </fieldset>

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
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Phone size={12} /> +{o.whatsapp}</span>
                  {o.email && <span className="inline-flex items-center gap-1"><Mail size={12} /> {o.email}</span>}
                  {o.user_id ? (
                    <span className="text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                      Login: <strong className="font-semibold">{usernameByUid.get(o.user_id) || 'linked'}</strong>
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">No login yet</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button type="submit" className="ix-btn-secondary"><Save size={14} /> Save</button>
                </div>
              </div>
            </form>

            {/* Login management — set up first time, or reset password
                if already linked. Sits below the main owner form so
                admins can administer credentials inline. */}
            {!o.user_id ? (
              <form
                action={setupOwnerLoginAction}
                className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 grid grid-cols-1 md:grid-cols-3 gap-2 items-end"
              >
                <input type="hidden" name="owner_id" value={o.id} />
                <div className="md:col-span-3 text-[11px] uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                  <UserPlus size={11} /> Set up login
                </div>
                <label className="text-sm block">
                  <span className="text-slate-600 dark:text-slate-300 text-xs">Username</span>
                  <input
                    name="username"
                    type="text"
                    minLength={3}
                    placeholder="e.g. malayaowner"
                    className="ix-input mt-1 text-xs"
                  />
                </label>
                <label className="text-sm block">
                  <span className="text-slate-600 dark:text-slate-300 text-xs">Temp password (8+)</span>
                  <input
                    name="password"
                    type="text"
                    minLength={8}
                    className="ix-input mt-1 text-xs"
                  />
                </label>
                <button type="submit" className="ix-btn-primary text-xs">
                  <UserPlus size={12} /> Create login
                </button>
              </form>
            ) : (
              <form
                action={resetOwnerLoginPasswordAction}
                className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-3 flex items-end gap-2 flex-wrap"
              >
                <input type="hidden" name="user_id" value={o.user_id} />
                <label className="text-sm block flex-1 min-w-[200px]">
                  <span className="text-slate-600 dark:text-slate-300 text-xs inline-flex items-center gap-1">
                    <KeyRound size={11} /> Reset password for <strong>{usernameByUid.get(o.user_id) || 'this owner'}</strong>
                  </span>
                  <input
                    name="new_password"
                    type="text"
                    minLength={8}
                    placeholder="New password (8+ chars)"
                    className="ix-input mt-1 text-xs"
                  />
                </label>
                <button type="submit" className="ix-btn-secondary text-xs">
                  <KeyRound size={12} /> Reset
                </button>
              </form>
            )}

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
