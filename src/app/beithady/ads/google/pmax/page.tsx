import Link from 'next/link';
import { Sparkles, AlertCircle, Copy, Info } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { publishGooglePMaxAction } from '../../actions';
import { buildBhWaLink } from '@/lib/beithady/ads/platforms';
import { buildPmaxDefaultsFromMetaCampaign, type PmaxDefaults } from '@/lib/beithady/ads/duplicate-to-google';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function GooglePMaxPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from_meta?: string }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const { data: accountsRaw } = await sb
    .from('ads_accounts')
    .select('id, name, external_id, google_refresh_token, status')
    .eq('platform', 'google')
    .order('id');
  const accounts = (accountsRaw as Array<{ id: number; name: string; external_id: string; google_refresh_token: string | null; status: string }> | null) || [];

  // If duplicating from a Meta campaign, pre-fill the form. The defaults
  // function is best-effort — unknown fields fall back to Beithady defaults
  // so the form is always submittable.
  let prefill: PmaxDefaults | null = null;
  const fromMetaId = Number.parseInt(sp.from_meta || '', 10);
  if (Number.isFinite(fromMetaId) && fromMetaId > 0) {
    prefill = await buildPmaxDefaultsFromMetaCampaign(fromMetaId);
  }
  const defaultFinalUrl = prefill?.finalUrl || buildBhWaLink('Hi Beit Hady — interested in a stay');
  const defaultCampaignName = prefill?.campaignName || '';
  const defaultBudget = prefill?.dailyBudgetUsd ?? 30;
  const defaultCap = prefill?.monthlyBudgetCapUsd ?? '';
  const defaultBuildings = (prefill?.buildingCodes || []).join(', ');
  const defaultHeadlines = (prefill?.headlines || []).join('\n');
  const defaultLongHeadlines = (prefill?.longHeadlines || []).join('\n');
  const defaultDescriptions = (prefill?.descriptions || []).join('\n');

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Google PMax' }]} containerClass="max-w-4xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Publish — Google Performance Max"
        subtitle="Search + Display + YouTube + Discover + Gmail + Maps in one campaign. Google's AI optimizes placement mix. Closest practical alternative to Hotel Ads without a property feed."
      />

      <AdsTabs active="google" />

      {sp.error && (
        <div className="ix-card border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-sm flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span className="font-mono text-xs">{sp.error}</span>
        </div>
      )}

      {prefill?.found && (
        <div className="ix-card border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950 p-4 text-sm space-y-2">
          <div className="flex items-center gap-2">
            <Copy size={14} className="text-violet-600 dark:text-violet-300 shrink-0" />
            <strong>Duplicated from Meta campaign</strong>
            <Link href={`/beithady/ads/campaigns/${fromMetaId}`} className="ix-link text-xs">view original →</Link>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Pre-filled headlines, descriptions, budget, locations, and landing URL from the Meta campaign. Review and edit before publishing — PMax has stricter character limits and accepts different audience signals.
          </div>
          {prefill.marketingImageUrl && (
            <div className="flex items-start gap-3 mt-2 p-2 bg-white/40 dark:bg-slate-900/40 rounded">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={prefill.marketingImageUrl} alt="Meta ad creative" className="w-16 h-16 object-cover rounded shrink-0" />
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                Meta ad creative — auto-uploaded to Google Ads (landscape or square slot, whichever fits). Still needed: the opposite crop + logo in Google Ads UI.
              </div>
            </div>
          )}
          {prefill.notes.length > 0 && (
            <ul className="text-[11px] text-amber-700 dark:text-amber-300 mt-2 space-y-1">
              {prefill.notes.map((n, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Info size={11} className="shrink-0 mt-0.5" /><span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="ix-card p-3 border-cyan-200 bg-cyan-50 dark:bg-cyan-950 text-xs">
        After publishing, complete the campaign in Google Ads UI:<br/>
        <strong>Text + Meta creative image</strong> are uploaded automatically. Still needed: <strong>opposite crop variant + logo</strong> — add in Google Ads UI.
      </div>

      {accounts.length === 0 ? (
        <div className="ix-card p-5 text-sm space-y-2">
          <p>No Google Ads account configured yet.</p>
          <Link className="ix-link" href="/beithady/ads/google/accounts">Add a Google account →</Link>
        </div>
      ) : (
        <form action={publishGooglePMaxAction} className="ix-card p-5 space-y-4">
          {prefill?.marketingImageUrl && (
            <input type="hidden" name="marketing_image_url" value={prefill.marketingImageUrl} />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="Account" htmlFor="account_id">
              <select id="account_id" name="account_id" required className="ix-input">
                {accounts.map(a => (
                  <option key={a.id} value={a.id} disabled={!a.google_refresh_token}>
                    {a.name} ({a.external_id}){!a.google_refresh_token ? ' — not connected' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Campaign name (optional)" htmlFor="campaign_name">
              <input id="campaign_name" name="campaign_name" className="ix-input" placeholder="Auto-generated if blank" defaultValue={defaultCampaignName} />
            </Field>
            <Field label="Daily budget (USD)" htmlFor="daily_budget_usd">
              <input id="daily_budget_usd" name="daily_budget_usd" type="number" min="5" step="1" defaultValue={defaultBudget} required className="ix-input" />
            </Field>
            <Field label="Monthly cap (USD, optional)" htmlFor="monthly_budget_cap_usd">
              <input id="monthly_budget_cap_usd" name="monthly_budget_cap_usd" type="number" min="1" step="10" className="ix-input" placeholder="1000" defaultValue={defaultCap} />
            </Field>
            <Field label="Business name (≤25 chars)" htmlFor="business_name">
              <input id="business_name" name="business_name" maxLength={25} defaultValue="Beit Hady" className="ix-input" />
            </Field>
            <Field label="Final URL" htmlFor="final_url">
              <input id="final_url" name="final_url" type="url" defaultValue={defaultFinalUrl} className="ix-input font-mono text-xs" />
            </Field>
            <Field label="Building codes (comma-separated)" htmlFor="building_codes" className="md:col-span-2">
              <input id="building_codes" name="building_codes" className="ix-input font-mono text-xs" placeholder="BH-435, BH-26" defaultValue={defaultBuildings} />
            </Field>
          </div>

          <div className="space-y-1">
            <label htmlFor="headlines" className="text-xs font-semibold">Short headlines (3–15, one per line, ≤30 chars each)</label>
            <textarea id="headlines" name="headlines" required rows={5} className="ix-input font-mono text-xs" placeholder={'Beit Hady Apartments\nLuxury Cairo Stays\nBook on WhatsApp'} defaultValue={defaultHeadlines} />
          </div>

          <div className="space-y-1">
            <label htmlFor="long_headlines" className="text-xs font-semibold">Long headlines (1–5, one per line, ≤90 chars each)</label>
            <textarea id="long_headlines" name="long_headlines" required rows={3} className="ix-input font-mono text-xs" placeholder={'Premium serviced apartments in Cairo — direct host, 24/7 concierge'} defaultValue={defaultLongHeadlines} />
          </div>

          <div className="space-y-1">
            <label htmlFor="descriptions" className="text-xs font-semibold">Descriptions (2–5, one per line, ≤90 chars each)</label>
            <textarea id="descriptions" name="descriptions" required rows={4} className="ix-input font-mono text-xs" placeholder={'Premium furnishings, direct host, WhatsApp booking. Message us for live availability.'} defaultValue={defaultDescriptions} />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-500">PMax lands PAUSED. After saving, attach images in Google Ads UI and activate.</p>
            <button type="submit" className="ix-btn-primary">
              <Sparkles size={14} /> Publish (PAUSED)
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
