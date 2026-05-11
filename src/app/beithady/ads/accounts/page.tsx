import Link from 'next/link';
import { Plus, ExternalLink, KeyRound, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { PLATFORM_LABEL } from '@/lib/beithady/ads/platforms';
import { resolveIgAccountAction } from '../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type AdsAccountRow = {
  id: number;
  platform: 'meta' | 'google' | 'tiktok';
  external_id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
  fb_page_id: string | null;
  fb_page_name: string | null;
  ig_business_id: string | null;
  ig_username: string | null;
  google_customer_id: string | null;
  google_login_customer_id: string | null;
  google_refresh_token: string | null;
  tiktok_advertiser_id: string | null;
  tiktok_identity_id: string | null;
  tiktok_username: string | null;
  tiktok_refresh_token: string | null;
};

export default async function AccountsPage() {
  await requireBeithadyPermission('ads', 'full');
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_accounts')
    .select('id, platform, external_id, name, currency, timezone, status, fb_page_id, fb_page_name, ig_business_id, ig_username, google_customer_id, google_login_customer_id, google_refresh_token, tiktok_advertiser_id, tiktok_identity_id, tiktok_username, tiktok_refresh_token')
    .order('platform').order('id');
  const rows = (data as AdsAccountRow[] | null) || [];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Accounts' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Ad accounts"
        subtitle="Connected ad accounts across Meta, Google, and TikTok. Connect or add a new account, then publish from the platform tabs."
        right={
          <Link href="/admin/integrations" className="ix-btn-secondary">
            <KeyRound size={14} /> App-level credentials
          </Link>
        }
      />

      <AdsTabs active="accounts" />

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Accounts</h2>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">
            No accounts yet. Add Meta credentials in <Link className="ix-link" href="/admin/integrations">integrations</Link> first;
            Beithady's Meta ad account is auto-registered on first publish.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 pr-3">Platform</th>
                  <th className="py-2 pr-3">Name / External ID</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Currency</th>
                  <th className="py-2 pr-3">Identity</th>
                  <th className="py-2 pr-3">Connected</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isConnected =
                    (r.platform === 'meta' && !!r.fb_page_id) ||
                    (r.platform === 'google' && !!r.google_refresh_token) ||
                    (r.platform === 'tiktok' && !!r.tiktok_refresh_token);
                  const identity =
                    r.platform === 'meta' ? (r.ig_username ? `@${r.ig_username}` : r.fb_page_name || '—')
                    : r.platform === 'google' ? (r.google_customer_id ? `cust ${r.google_customer_id}` : '—')
                    : (r.tiktok_username ? `@${r.tiktok_username}` : '—');
                  return (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                      <td className="py-2 pr-3 font-medium">{PLATFORM_LABEL[r.platform]}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.external_id}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                          r.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                        }`}>{r.status}</span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{r.currency}</td>
                      <td className="py-2 pr-3 text-[11px]">{identity}</td>
                      <td className="py-2 pr-3">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={12} /> Live</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle size={12} /> Connect</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {r.platform === 'meta' && r.fb_page_id && !r.ig_business_id && (
                          <form action={resolveIgAccountAction} className="inline">
                            <input type="hidden" name="account_id" value={r.id} />
                            <button className="ix-link text-[11px]">Resolve IG</button>
                          </form>
                        )}
                        {r.platform === 'google' && !r.google_refresh_token && (
                          <Link href={`/api/auth/google-ads/start?scope=${r.id}`} className="ix-link text-[11px]">Connect →</Link>
                        )}
                        {r.platform === 'tiktok' && !r.tiktok_refresh_token && (
                          <Link href={`/api/auth/tiktok/start?account_id=${r.id}`} className="ix-link text-[11px]">Connect →</Link>
                        )}
                        {r.platform === 'tiktok' && r.tiktok_refresh_token && (
                          <Link href="/beithady/ads/tiktok/accounts" className="ix-link text-[11px]">Configure →</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ix-card p-5 space-y-3 text-xs">
        <h3 className="font-semibold text-sm">Add a new account</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          <PlatformAddCard
            label="Meta (Facebook + Instagram)"
            description="One row covers FB Pages + IG Business accounts + ads campaigns. Configure system-user token under integrations."
            primaryHref="/admin/integrations"
            primaryLabel="Configure credentials"
          />
          <PlatformAddCard
            label="Google Ads"
            description="Add an ads_accounts row with the customer ID, then connect OAuth via Google to authorize ad management."
            primaryHref="/beithady/ads/google/accounts"
            primaryLabel="Manage Google accounts"
          />
          <PlatformAddCard
            label="TikTok"
            description="Add the advertiser ID + identity, then connect the TikTok OAuth flow for organic Reels publishing."
            primaryHref="/beithady/ads/tiktok/accounts"
            primaryLabel="Manage TikTok accounts"
          />
        </div>
      </section>
    </BeithadyShell>
  );
}

function PlatformAddCard({ label, description, primaryHref, primaryLabel }: { label: string; description: string; primaryHref: string; primaryLabel: string }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
      <div className="font-semibold text-sm">{label}</div>
      <p className="text-slate-500 dark:text-slate-400">{description}</p>
      <Link href={primaryHref} className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 hover:underline">
        <Plus size={12} /> {primaryLabel} <ExternalLink size={10} />
      </Link>
    </div>
  );
}
