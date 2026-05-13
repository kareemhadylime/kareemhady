import Link from 'next/link';
import { Search, AlertCircle } from 'lucide-react';
import { TargetGroupPicker } from '../../_components/target-group-picker';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { publishGoogleSearchAction } from '../../actions';
import { buildBhWaLink } from '@/lib/beithady/ads/platforms';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function GooglePublishPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const [{ data: accountsRaw }, { data: signalsRaw }] = await Promise.all([
    sb
      .from('ads_accounts')
      .select('id, name, external_id, google_refresh_token, status')
      .eq('platform', 'google')
      .order('id'),
    sb
      .from('beithady_market_signals')
      .select('origin_country, signal_type, our_share_pct, delta_pct')
      .eq('signal_type', 'under_indexed')
      .order('delta_pct', { ascending: true })
      .limit(8),
  ]);
  const accounts = (accountsRaw as Array<{ id: number; name: string; external_id: string; google_refresh_token: string | null; status: string }> | null) || [];
  const connectedAccounts = accounts.filter(a => !!a.google_refresh_token && a.status === 'active');
  const suggestedCountries = (signalsRaw as Array<{ origin_country: string; delta_pct: number | null }> | null) || [];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Google publish' }]} containerClass="max-w-4xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Publish — Google Search ads"
        subtitle="Create a Search campaign pointing to WhatsApp (wa.me). Lands in PAUSED state for review in Google Ads Manager."
      />

      <AdsTabs active="google" />

      {sp.error && (
        <div className="ix-card border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-sm flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span className="font-mono text-xs">{sp.error}</span>
        </div>
      )}

      {suggestedCountries.length > 0 && (
        <div className="ix-card border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950 p-3 text-xs">
          <div className="font-semibold mb-1 text-cyan-700 dark:text-cyan-200">Phase G market intel — under-indexed countries</div>
          <p className="text-slate-600 dark:text-slate-300 mb-1.5">
            Beithady is under-represented for travelers from these markets relative to the Egypt baseline.
            Use them as Google location IDs (resolve via the Google Ads geo target picker) or as language/audience hints.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestedCountries.map(s => (
              <span key={s.origin_country} className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-cyan-200 dark:border-cyan-700 font-mono">
                {s.origin_country}{s.delta_pct != null ? ` (${s.delta_pct.toFixed(1)}%)` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="ix-card p-5 text-sm space-y-2">
          <p>No Google Ads account configured yet.</p>
          <p>
            <Link className="ix-link" href="/beithady/ads/google/accounts">Add a Google account →</Link>
          </p>
        </div>
      ) : (
        <form action={publishGoogleSearchAction} className="ix-card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="Account" htmlFor="account_id">
              <select id="account_id" name="account_id" required className="ix-input">
                {accounts.map(a => (
                  <option key={a.id} value={a.id} disabled={!a.google_refresh_token}>
                    {a.name} ({a.external_id}){!a.google_refresh_token ? ' — not connected' : ''}
                  </option>
                ))}
              </select>
              {connectedAccounts.length === 0 && (
                <p className="text-[11px] text-amber-700">
                  No accounts connected via OAuth yet. <Link href="/beithady/ads/google/accounts" className="ix-link">Connect →</Link>
                </p>
              )}
            </Field>
            <Field label="Campaign name (optional)" htmlFor="campaign_name">
              <input id="campaign_name" name="campaign_name" className="ix-input" placeholder="Auto-generated if blank" />
            </Field>
            <Field label="Daily budget (USD)" htmlFor="daily_budget_usd">
              <input id="daily_budget_usd" name="daily_budget_usd" type="number" min="1" step="0.5" defaultValue="10" required className="ix-input" />
            </Field>
            <Field label="CPC bid (USD)" htmlFor="cpc_bid_usd">
              <input id="cpc_bid_usd" name="cpc_bid_usd" type="number" min="0.05" step="0.05" defaultValue="0.50" className="ix-input" />
            </Field>
            <Field label="Monthly cap (USD, optional)" htmlFor="monthly_budget_cap_usd" className="md:col-span-2">
              <input id="monthly_budget_cap_usd" name="monthly_budget_cap_usd" type="number" min="1" step="10" className="ix-input" placeholder="500" />
              <p className="text-[11px] text-slate-500">When MTD spend reaches this, the budget-guard cron auto-pauses the campaign.</p>
            </Field>
            <Field label="Final URL" htmlFor="final_url" className="md:col-span-2">
              <input id="final_url" name="final_url" type="url" defaultValue={buildBhWaLink('Hi Beit Hady — interested in a stay')} className="ix-input font-mono text-xs" placeholder="https://wa.me/..." />
            </Field>
            <Field label="Path 1 (optional, ≤15 chars)" htmlFor="path1">
              <input id="path1" name="path1" maxLength={15} className="ix-input" placeholder="beit-hady" />
            </Field>
            <Field label="Path 2 (optional, ≤15 chars)" htmlFor="path2">
              <input id="path2" name="path2" maxLength={15} className="ix-input" placeholder="cairo-stay" />
            </Field>
            <Field label="Target audience" htmlFor="target_group" className="md:col-span-2">
              <TargetGroupPicker />
            </Field>
            <Field label="Building codes (comma-separated)" htmlFor="building_codes" className="md:col-span-2">
              <input id="building_codes" name="building_codes" className="ix-input font-mono text-xs" placeholder="BH-435, BH-26" />
            </Field>
          </div>

          <div className="space-y-1">
            <label htmlFor="keywords" className="text-xs font-semibold">Keywords (one per line)</label>
            <p className="text-[11px] text-slate-500">Use <code>&quot;exact phrase&quot;</code> for phrase match, <code>[exact match]</code> for exact, plain word/words for broad.</p>
            <textarea id="keywords" name="keywords" required rows={6} className="ix-input font-mono text-xs" placeholder={'beit hady\n"luxury cairo apartment"\n[serviced apartment new cairo]'} />
          </div>

          <div className="space-y-1">
            <label htmlFor="negative_keywords" className="text-xs font-semibold">Negative keywords (one per line, optional)</label>
            <p className="text-[11px] text-slate-500">Built-in brand-protection list auto-merges (airbnb, booking.com, free, scam, etc.). Add campaign-specific negatives here.</p>
            <textarea id="negative_keywords" name="negative_keywords" rows={3} className="ix-input font-mono text-xs" placeholder={'rent to own\ndaily rental egypt'} />
          </div>

          <div className="space-y-1">
            <label htmlFor="headlines" className="text-xs font-semibold">Headlines (3–15, one per line, ≤30 chars each)</label>
            <textarea id="headlines" name="headlines" required rows={5} className="ix-input font-mono text-xs" placeholder={'Premium Apartments in Cairo\nBook on WhatsApp\nServiced Stays — Beit Hady'} />
          </div>

          <div className="space-y-1">
            <label htmlFor="descriptions" className="text-xs font-semibold">Descriptions (2–4, one per line, ≤90 chars each)</label>
            <textarea id="descriptions" name="descriptions" required rows={4} className="ix-input font-mono text-xs" placeholder={'Direct host, premium furnishings, 24/7 concierge. Message on WhatsApp to check availability.'} />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-500">Campaign is created PAUSED. Activate it from Google Ads Manager after review.</p>
            <button type="submit" className="ix-btn-primary">
              <Search size={14} /> Publish (PAUSED)
            </button>
          </div>
        </form>
      )}
    </BeithadyShell>
  );
}

function Field({ label, htmlFor, children, className = '' }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-semibold">{label}</label>
      {children}
    </div>
  );
}
