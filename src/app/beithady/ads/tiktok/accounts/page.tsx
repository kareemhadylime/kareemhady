import Link from 'next/link';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { syncTikTokAdvertisersAction, setTikTokIdentityAction } from '../../actions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function addTikTokAccountAction(formData: FormData): Promise<void> {
  'use server';
  const user = await getCurrentUser();
  if (!user || !(user.is_admin || await hasBeithadyPermission(user, 'ads', 'full'))) throw new Error('forbidden');
  const externalId = String(formData.get('external_id') || '').trim();
  const name = String(formData.get('name') || '').trim() || 'TikTok ads';
  if (!externalId) redirect('/beithady/ads/tiktok/accounts?error=missing_external_id');
  const sb = supabaseAdmin();
  await sb.from('ads_accounts').upsert(
    {
      platform: 'tiktok',
      external_id: externalId,
      name,
      currency: 'USD',
      status: 'active',
    },
    { onConflict: 'platform,external_id' }
  );
  revalidatePath('/beithady/ads/tiktok/accounts');
  redirect('/beithady/ads/tiktok/accounts?added=1');
}

export default async function TikTokAccountsPage({ searchParams }: { searchParams: Promise<{ error?: string; added?: string; advertiser?: string; identity?: string; connected?: string; marketing_connected?: string }> }) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_accounts')
    .select('id, name, external_id, tiktok_advertiser_id, tiktok_bc_id, tiktok_identity_id, tiktok_identity_type, tiktok_username, tiktok_refresh_token')
    .eq('platform', 'tiktok')
    .order('id');
  const rows = (data as Array<{ id: number; name: string; external_id: string; tiktok_advertiser_id: string | null; tiktok_bc_id: string | null; tiktok_identity_id: string | null; tiktok_identity_type: string | null; tiktok_username: string | null; tiktok_refresh_token: string | null }> | null) || [];

  // Marketing API (Business) credential status — surfaces whether the provider
  // has app_id + secret + access_token so we can show a single connect button
  // per row that knows what to do.
  const { data: mcRow } = await sb
    .from('integration_credentials')
    .select('config, enabled')
    .eq('provider', 'tiktok_business')
    .maybeSingle();
  const mcConfig = ((mcRow as { config?: Record<string, string> } | null)?.config) || {};
  const marketingHasApp = !!mcConfig.app_id && !!mcConfig.secret;
  const marketingHasToken = !!mcConfig.access_token;

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Accounts', href: '/beithady/ads/accounts' }, { label: 'TikTok' }]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="TikTok accounts"
        subtitle="Add a row, connect via OAuth, set advertiser_id + identity_id, then you can publish."
      />

      <AdsTabs active="accounts" />

      {(sp.added || sp.advertiser || sp.identity || sp.connected || sp.marketing_connected) && (
        <div className="ix-card border-emerald-200 bg-emerald-50 p-3 text-sm">
          {sp.added && 'Account added.'} {sp.advertiser && 'Advertiser saved.'} {sp.identity && 'Identity saved.'} {sp.connected && `Login Kit connected ${sp.connected}.`} {sp.marketing_connected && `Marketing API connected — ${sp.marketing_connected}.`}
        </div>
      )}
      {sp.error && <div className="ix-card border-rose-200 bg-rose-50 p-3 text-sm font-mono">{sp.error}</div>}

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Existing accounts</h2>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">No TikTok accounts yet.</p>
        ) : (
          <div className="space-y-4">
            {rows.map(r => (
              <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-medium text-sm">{r.name} <span className="text-[10px] text-slate-400 font-mono ml-2">({r.external_id})</span></div>
                    <div className="text-[10px] text-slate-500 space-y-0.5 pt-1">
                      <div>Login Kit (posting): {r.tiktok_refresh_token ? <span className="text-emerald-600">connected{r.tiktok_username ? ` as @${r.tiktok_username}` : ''}</span> : <span className="text-amber-600">not connected</span>}</div>
                      <div>Marketing API (reporting): {marketingHasToken && r.tiktok_advertiser_id ? <span className="text-emerald-600">connected · advertiser {r.tiktok_advertiser_id}</span> : <span className="text-amber-600">{marketingHasApp ? 'app linked, OAuth pending' : 'app credentials missing — see /admin/integrations'}</span>}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 items-end">
                    {!r.tiktok_refresh_token && (
                      <Link href={`/api/auth/tiktok/start?account_id=${r.id}`} className="ix-btn-secondary text-xs">Connect Login Kit</Link>
                    )}
                    {marketingHasApp && (
                      <Link href={`/api/auth/tiktok-business/start?account_id=${r.id}`} className="ix-btn-primary text-xs">
                        {marketingHasToken ? 'Re-authorize Marketing API' : 'Authorize Marketing API'}
                      </Link>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <form action={syncTikTokAdvertisersAction} className="space-y-2">
                    <label className="text-xs font-semibold">Advertiser ID (paid)</label>
                    <input type="hidden" name="account_id" value={r.id} />
                    <input name="advertiser_id" defaultValue={r.tiktok_advertiser_id || ''} className="ix-input font-mono text-xs" placeholder="1234567890" />
                    <input name="bc_id" defaultValue={r.tiktok_bc_id || ''} className="ix-input font-mono text-xs" placeholder="BC ID (optional)" />
                    <button className="ix-btn-secondary text-xs">Save advertiser</button>
                  </form>

                  <form action={setTikTokIdentityAction} className="space-y-2">
                    <label className="text-xs font-semibold">Identity ID + type (paid)</label>
                    <input type="hidden" name="account_id" value={r.id} />
                    <input name="identity_id" defaultValue={r.tiktok_identity_id || ''} className="ix-input font-mono text-xs" placeholder="identity_id" />
                    <select name="identity_type" defaultValue={r.tiktok_identity_type || 'CUSTOMIZED_USER'} className="ix-input text-xs">
                      <option value="CUSTOMIZED_USER">CUSTOMIZED_USER</option>
                      <option value="TT_USER">TT_USER</option>
                      <option value="BC_AUTH_TT">BC_AUTH_TT</option>
                      <option value="UNAUTH_TT_USER">UNAUTH_TT_USER</option>
                    </select>
                    <button className="ix-btn-secondary text-xs">Save identity</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ix-card p-5 space-y-3 text-sm">
        <h2 className="font-semibold">Add new TikTok row</h2>
        <form action={addTikTokAccountAction} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="external_id" className="text-xs font-semibold">External ID (any unique slug)</label>
            <input id="external_id" name="external_id" required className="ix-input" placeholder="beithady-main" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="name" className="text-xs font-semibold">Display name</label>
            <input id="name" name="name" className="ix-input" placeholder="Beit Hady TikTok" />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" className="ix-btn-primary">Add row</button>
          </div>
        </form>
        <p className="text-[11px] text-slate-500">
          App-level credentials live in <Link className="ix-link" href="/admin/integrations">/admin/integrations</Link>.
          Two separate providers:
          {' '}<code>tiktok_ads</code> (Login Kit / posting — developers.tiktok.com app)
          {' and '}<code>tiktok_business</code> (Marketing API / read-only reporting — business-api.tiktok.com app).
          Paste each app&apos;s App ID + Secret into the matching card, then come back here and click the Authorize button(s).
        </p>
      </section>
    </BeithadyShell>
  );
}
