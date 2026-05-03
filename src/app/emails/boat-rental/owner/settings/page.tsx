import { Settings } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { TabNav, OWNER_TABS } from '../../_components/tabs';
import { saveOwnerSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

type Settings = {
  default_fuel_price_per_l: number | string | null;
  preferred_marina_vendor: string | null;
  notification_lang: string;
  reminder_24h_lang: string;
  whatsapp: string | null;
};

export default async function OwnerSettingsPage() {
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();

  const settingsRes = ownerIds.length
    ? await sb
        .from('boat_rental_owner_settings')
        .select('*')
        .eq('owner_id', ownerIds[0])
        .maybeSingle()
    : { data: null };
  const settings = settingsRes.data as Settings | null;

  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300">
          <Settings size={24} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
            Owner Portal
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Defaults that prefill new expenses + notification preferences.
          </p>
        </div>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner" />

      {ownerIds.length === 0 ? (
        <div className="ix-card p-6 max-w-xl mt-8 text-sm text-slate-500">
          You don&apos;t have an owner record yet. Ask the admin to create one before configuring
          settings.
        </div>
      ) : (
        <form
          action={saveOwnerSettingsAction}
          className="ix-card p-6 max-w-xl mt-8 space-y-4"
        >
          <h2 className="font-semibold">Defaults</h2>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Default fuel price per liter (EGP)</span>
            <input
              name="default_fuel_price_per_l"
              type="number"
              step="0.01"
              min="0"
              defaultValue={settings?.default_fuel_price_per_l ?? ''}
              className="ix-input mt-1"
            />
            <span className="block text-[11px] text-slate-500 mt-1">
              Pre-fills the price/liter field on new fuel expenses.
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Preferred Marina vendor name</span>
            <input
              name="preferred_marina_vendor"
              defaultValue={settings?.preferred_marina_vendor ?? ''}
              className="ix-input mt-1"
            />
            <span className="block text-[11px] text-slate-500 mt-1">
              Pre-fills the vendor name on new marina docking expenses.
            </span>
          </label>

          <h2 className="font-semibold pt-4">Notifications</h2>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Notification language</span>
            <select
              name="notification_lang"
              defaultValue={settings?.notification_lang ?? 'en'}
              className="ix-input mt-1"
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">24h trip reminder language</span>
            <select
              name="reminder_24h_lang"
              defaultValue={settings?.reminder_24h_lang ?? 'ar'}
              className="ix-input mt-1"
            >
              <option value="ar">Arabic</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">
              WhatsApp number (overrides owner record)
            </span>
            <input
              name="whatsapp"
              defaultValue={settings?.whatsapp ?? ''}
              placeholder="201001234567"
              pattern="[0-9 +-]{8,18}"
              className="ix-input mt-1"
            />
            <span className="block text-[11px] text-slate-500 mt-1">
              Use the international format without &quot;+&quot; (e.g.{' '}
              <code>201001234567</code>).
            </span>
          </label>

          <div className="flex justify-end pt-3">
            <button type="submit" className="ix-btn-primary">
              Save
            </button>
          </div>
        </form>
      )}
    </>
  );
}
