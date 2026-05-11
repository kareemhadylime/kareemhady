import Link from 'next/link';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function addGoogleAccountAction(formData: FormData): Promise<void> {
  'use server';
  const user = await getCurrentUser();
  if (!user || !(user.is_admin || await hasBeithadyPermission(user, 'ads', 'full'))) throw new Error('forbidden');
  const customerId = String(formData.get('customer_id') || '').replace(/[^\d]/g, '');
  const name = String(formData.get('name') || '').trim() || `Google Ads ${customerId}`;
  const currency = String(formData.get('currency') || 'USD');
  if (!customerId) redirect('/beithady/ads/google/accounts?error=missing_customer_id');
  const sb = supabaseAdmin();
  await sb.from('ads_accounts').upsert(
    {
      platform: 'google',
      external_id: customerId,
      name,
      currency,
      google_customer_id: customerId,
      status: 'active',
    },
    { onConflict: 'platform,external_id' }
  );
  revalidatePath('/beithady/ads/google/accounts');
  redirect('/beithady/ads/google/accounts?added=' + customerId);
}

export default async function GoogleAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string; connected?: string }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_accounts')
    .select('id, name, external_id, currency, status, google_customer_id, google_login_customer_id, google_refresh_token')
    .eq('platform', 'google')
    .order('id');
  const rows = (data as Array<{ id: number; name: string; external_id: string; currency: string; status: string; google_customer_id: string | null; google_login_customer_id: string | null; google_refresh_token: string | null }> | null) || [];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Accounts', href: '/beithady/ads/accounts' }, { label: 'Google' }]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Google Ads accounts"
        subtitle="Add a Google customer ID, then run OAuth to authorize the app to manage that account."
      />

      <AdsTabs active="accounts" />

      {(sp.added || sp.connected) && (
        <div className="ix-card border-emerald-200 bg-emerald-50 p-3 text-sm">
          {sp.added && <>Added customer <code>{sp.added}</code>. Click <strong>Connect →</strong> to authorize.</>}
          {sp.connected && <>Connected customer <code>{sp.connected}</code>. Ready to publish.</>}
        </div>
      )}
      {sp.error && (
        <div className="ix-card border-rose-200 bg-rose-50 p-3 text-sm font-mono">{sp.error}</div>
      )}

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Existing accounts</h2>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">No Google accounts yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Customer ID</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Currency</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">OAuth</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 font-mono">{r.external_id}</td>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3">{r.currency}</td>
                  <td className="py-2 pr-3">{r.status}</td>
                  <td className="py-2 pr-3">
                    {r.google_refresh_token
                      ? <span className="text-emerald-600 dark:text-emerald-400">Authorized</span>
                      : <Link className="ix-link" href={`/api/auth/google-ads/start?scope=${r.id}`}>Connect →</Link>}
                  </td>
                  <td className="py-2 pr-3">
                    <Link href="/beithady/ads/google/publish" className="ix-link">Publish →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ix-card p-5 space-y-3 text-sm">
        <h2 className="font-semibold">Add new</h2>
        <form action={addGoogleAccountAction} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="customer_id" className="text-xs font-semibold">Customer ID (numeric)</label>
            <input id="customer_id" name="customer_id" required className="ix-input" placeholder="1234567890" />
          </div>
          <div className="space-y-1">
            <label htmlFor="name" className="text-xs font-semibold">Display name</label>
            <input id="name" name="name" className="ix-input" placeholder="Beithady Search ads" />
          </div>
          <div className="space-y-1">
            <label htmlFor="currency" className="text-xs font-semibold">Currency</label>
            <select id="currency" name="currency" className="ix-input" defaultValue="USD">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="EGP">EGP</option>
              <option value="AED">AED</option>
            </select>
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" className="ix-btn-primary">Add account</button>
          </div>
        </form>
        <p className="text-[11px] text-slate-500">
          App-level credentials (developer token, OAuth client ID/secret) live in
          {' '}<Link className="ix-link" href="/admin/integrations">/admin/integrations</Link> (provider <code>google_ads</code>).
          Per-account refresh tokens are stored encrypted on the row above.
        </p>
      </section>
    </BeithadyShell>
  );
}
