import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Pause, Play, ShieldAlert, ExternalLink, AlertCircle, Zap, Copy, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { statusBadgeClass, PLATFORM_LABEL } from '@/lib/beithady/ads/platforms';
import { convertToEgp, convertManyToEgp } from '@/lib/fx-rates';
import { fmtCairoDateTime, fmtCairoDate } from '@/lib/fmt-date';
import { setCampaignStatusActionUnified } from '../../actions';
import { loadMetaCredentials, fetchMetaEntityStatusBatch, fetchMetaCampaignInsights, type MetaLiveStatus, type MetaInsightsSnapshot } from '@/lib/beithady/ads/meta-client';
import { MetaStatusBadge, MetaIssuesList } from './meta-status-badge';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type CampaignRow = {
  id: number;
  external_id: string;
  platform: 'meta' | 'google' | 'tiktok';
  name: string;
  status: string | null;
  objective: string | null;
  daily_budget_micros: number | null;
  monthly_budget_cap_usd: number | null;
  auto_paused_at: string | null;
  auto_paused_reason: string | null;
  building_codes: string[] | null;
  account_id: number;
  created_at: string;
};
type AccountRow = { id: number; name: string; currency: string; external_id: string };
type AdSetRow = {
  id: number;
  external_id: string;
  name: string;
  status: string | null;
  daily_budget_micros: number | null;
  optimization_goal: string | null;
  age_min: number | null;
  age_max: number | null;
  target_countries: string[] | null;
};
type AdRow = {
  id: number;
  external_id: string;
  name: string;
  status: string | null;
  creative_type: string | null;
  creative_url: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  landing_url: string | null;
};
type MetricRow = { metric_date: string; impressions: number; clicks: number; spend_micros: number; leads: number; conversions: number };
type LeadRow = {
  lead_id: number;
  created_at: string;
  full_name: string | null;
  phone_e164: string | null;
  country: string | null;
  funnel_stage: 'new' | 'processed' | 'booked';
  booking_value: number | null;
  booking_currency: string | null;
};

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string; status_set?: string; error?: string }>;
}) {
  await requireBeithadyPermission('ads', 'read');
  const { id } = await params;
  const sp = await searchParams;
  const campaignId = Number.parseInt(id, 10);
  if (!Number.isFinite(campaignId)) notFound();

  const sb = supabaseAdmin();

  const { data: campRaw } = await sb
    .from('ads_campaigns')
    .select('id, external_id, platform, name, status, objective, daily_budget_micros, monthly_budget_cap_usd, auto_paused_at, auto_paused_reason, building_codes, account_id, created_at')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campRaw) notFound();
  const camp = campRaw as CampaignRow;

  const [{ data: accountRaw }, { data: adSetsRaw }, { data: adsRaw }, { data: metricsRaw }, { data: leadsRaw }] = await Promise.all([
    sb.from('ads_accounts').select('id, name, currency, external_id').eq('id', camp.account_id).maybeSingle(),
    sb.from('ads_ad_sets').select('id, external_id, name, status, daily_budget_micros, optimization_goal, age_min, age_max, target_countries').eq('campaign_id', camp.id),
    sb.from('ads_ads').select('id, external_id, name, status, creative_type, creative_url, headline, body, cta, landing_url, ad_set_id').eq('platform', camp.platform),
    sb.from('ads_daily_metrics').select('metric_date, impressions, clicks, spend_micros, leads, conversions').eq('campaign_id', camp.id).is('ad_id', null).is('ad_set_id', null).order('metric_date', { ascending: true }).limit(60),
    sb.from('ads_lead_funnel').select('lead_id, created_at, full_name, phone_e164, country, funnel_stage, booking_value, booking_currency').eq('campaign_id', camp.id).order('created_at', { ascending: false }).limit(25),
  ]);

  const account = (accountRaw as AccountRow | null);
  const adSets = (adSetsRaw as AdSetRow[] | null) || [];
  const adSetIdSet = new Set(adSets.map(s => s.id));
  const ads = ((adsRaw as Array<AdRow & { ad_set_id: number }> | null) || []).filter(a => adSetIdSet.has(a.ad_set_id));
  const metrics = (metricsRaw as MetricRow[] | null) || [];
  const leads = (leadsRaw as LeadRow[] | null) || [];

  // Aggregate totals. Spend in ads_daily_metrics is in the ad account's
  // native currency (Meta=USD, Google=EGP, TikTok=USD) — convert each
  // row to EGP up front so totals + sparkline + tooltips all match.
  const accountCurrency = account?.currency || 'USD';
  const dailySpendEgp = await convertManyToEgp(
    metrics.map(m => ({ amount: (Number(m.spend_micros) || 0) / 1_000_000, currency: accountCurrency }))
  );
  let totalImp = 0, totalClicks = 0, totalSpend = 0, totalLeads = 0;
  metrics.forEach((m, i) => {
    totalImp += Number(m.impressions) || 0;
    totalClicks += Number(m.clicks) || 0;
    totalSpend += dailySpendEgp[i] || 0;
    totalLeads += Number(m.leads) || 0;
  });

  // Multi-currency conversion → EGP revenue (cross-converted from each
  // booking's source currency via fx_rates_usd, then USD→EGP).
  let attributedRevenueEgp = 0;
  for (const l of leads) {
    if (l.funnel_stage === 'booked' && l.booking_value && l.booking_currency) {
      attributedRevenueEgp += await convertToEgp(l.booking_value, l.booking_currency);
    }
  }
  const roas = totalSpend > 0 ? attributedRevenueEgp / totalSpend : null;

  // Live Meta delivery status + real-time insights — only for Meta campaigns
  // with non-draft external IDs. Both fetched in parallel.
  let liveStatuses: Map<string, MetaLiveStatus> = new Map();
  let liveInsights: MetaInsightsSnapshot | null = null;
  if (camp.platform === 'meta' && !camp.external_id.startsWith('draft_')) {
    const creds = await loadMetaCredentials();
    if (creds.ok) {
      const externalIds = [
        camp.external_id,
        ...adSets.map(s => s.external_id).filter(Boolean),
        ...ads.map(a => a.external_id).filter(Boolean),
      ];
      const [statusMap, insightsResult] = await Promise.all([
        fetchMetaEntityStatusBatch(externalIds, creds.creds.token),
        fetchMetaCampaignInsights(camp.external_id, creds.creds.token),
      ]);
      liveStatuses = statusMap;
      if (insightsResult.ok) liveInsights = insightsResult.data;
    }
  }
  const campLive = liveStatuses.get(camp.external_id) || null;

  // Budget-cap state
  const cap = camp.monthly_budget_cap_usd != null ? Number(camp.monthly_budget_cap_usd) : null;
  const capPct = cap && cap > 0 ? (totalSpend / cap) * 100 : null;
  const autoPaused = !!camp.auto_paused_at;
  const isDraft = camp.external_id.startsWith('draft_');

  const upperStatus = (camp.status || '').toUpperCase();
  const canFlip = upperStatus === 'ACTIVE' || upperStatus === 'PAUSED';
  const nextStatus: 'PAUSED' | 'ACTIVE' = upperStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

  // Sparkline data — last 30 days, normalized. Use the already-converted
  // EGP spend per day so the tooltip and bar heights agree with the totals.
  const chartDays = metrics.slice(-30);
  const chartSpendEgp = dailySpendEgp.slice(-30);
  const maxSpend = chartSpendEgp.reduce((m, v) => Math.max(m, v), 0);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Ads', href: '/beithady/ads' },
      { label: 'Campaigns', href: '/beithady/ads/campaigns' },
      { label: camp.name },
    ]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Ads · ${PLATFORM_LABEL[camp.platform]}`}
        title={camp.name}
        subtitle={`${camp.objective || '—'} · external ID ${camp.external_id} · created ${fmtCairoDate(camp.created_at)}`}
        right={
          <Link href="/beithady/ads/campaigns" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> All campaigns
          </Link>
        }
      />

      <AdsTabs active="campaigns" />

      {sp.published && (
        <div className="ix-card border-emerald-200 bg-emerald-50 p-3 text-sm">
          Published in <strong>{sp.published}</strong> mode. Campaign is PAUSED — review in the native Ads Manager and activate when ready.
        </div>
      )}
      {sp.status_set && (
        <div className="ix-card border-cyan-200 bg-cyan-50 p-3 text-sm">
          Status set to <strong>{sp.status_set}</strong>.
        </div>
      )}
      {sp.error && (
        <div className="ix-card border-rose-200 bg-rose-50 p-3 text-sm flex items-center gap-2 font-mono">
          <AlertCircle size={14} className="text-rose-600" /> {sp.error}
        </div>
      )}

      {autoPaused && (
        <div className="ix-card border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-4 text-sm flex items-start gap-2">
          <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Auto-paused by budget guard</div>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {camp.auto_paused_reason || 'no reason recorded'} · paused {camp.auto_paused_at ? fmtCairoDateTime(camp.auto_paused_at) : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Raise the cap (or remove it) on the Campaigns page, then re-activate below to resume serving.
            </div>
          </div>
        </div>
      )}

      {/* Header KPIs + status flip */}
      <section className="ix-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs uppercase tracking-wide font-semibold px-2 py-0.5 rounded ${statusBadgeClass(camp.status)}`}>
              {camp.status || '—'}
            </span>
            {camp.platform === 'meta' && campLive && (
              <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
                Meta says: <MetaStatusBadge status={campLive} />
              </span>
            )}
            <span className="text-xs text-slate-500">{PLATFORM_LABEL[camp.platform]} · account {account?.name || '—'}</span>
            {isDraft && (
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                title="Never sent to the ad platform — credentials were missing at creation time. Use 'Publish to Google Ads' to create the live campaign.">
                draft (db-only)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {camp.platform === 'meta' && !isDraft && (
              <Link
                href={`/beithady/ads/google/pmax?from_meta=${camp.id}`}
                className="ix-btn-secondary text-xs inline-flex items-center gap-1.5"
                title="Pre-fill a new Google Performance Max campaign with this ad's content + audience"
              >
                <Copy size={12} /> Duplicate to Google PMax
              </Link>
            )}
            {camp.platform === 'google' && isDraft && (
              <Link
                href="/beithady/ads/google/pmax"
                className="ix-btn-primary text-xs inline-flex items-center gap-1.5"
                title="This draft was never sent to Google — create a live campaign now"
              >
                <Sparkles size={12} /> Publish to Google Ads
              </Link>
            )}
            {canFlip && (
              <form action={setCampaignStatusActionUnified} className="inline">
                <input type="hidden" name="campaign_id" value={camp.id} />
                <input type="hidden" name="status" value={nextStatus} />
                <button type="submit" className={nextStatus === 'PAUSED' ? 'ix-btn-secondary' : 'ix-btn-primary'}>
                  {nextStatus === 'PAUSED' ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
          <Stat label="Spend (60d)" value={`EGP ${Math.round(totalSpend).toLocaleString()}`} />
          <Stat label="Impressions" value={totalImp.toLocaleString()} />
          <Stat label="Clicks" value={totalClicks.toLocaleString()} />
          <Stat label="Leads" value={totalLeads.toLocaleString()} accent="cyan" />
          <Stat label="Bookings revenue (EGP)" value={`EGP ${Math.round(attributedRevenueEgp).toLocaleString()}`} accent="emerald" />
          <Stat label="ROAS" value={roas == null ? '—' : `${roas.toFixed(2)}x`} accent={roas != null && roas >= 1 ? 'emerald' : 'amber'} />
        </div>

        {/* Campaign-level Meta issues (disapproval / billing / etc) */}
        <MetaIssuesList status={campLive} />

        {(cap != null || camp.building_codes?.length) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {cap != null && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Monthly cap</div>
                <div className="font-semibold tabular-nums">EGP {cap.toLocaleString()}</div>
                {capPct != null && (
                  <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className={`h-full ${capPct >= 100 ? 'bg-rose-500' : capPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, capPct)}%` }} />
                  </div>
                )}
                {capPct != null && <div className="text-[10px] text-slate-500 mt-0.5">{capPct.toFixed(0)}% used</div>}
              </div>
            )}
            {camp.building_codes?.length ? (
              <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Buildings</div>
                <div className="text-sm font-mono">{camp.building_codes.join(' · ')}</div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Live Meta Insights — real-time from Meta Insights API */}
      {camp.platform === 'meta' && liveInsights && (
        <section className="ix-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Zap size={14} className="text-amber-500" />
              Live from Meta
              <span className="text-[10px] font-normal text-slate-400 ml-1">lifetime · pulled {fmtCairoDateTime(liveInsights.fetched_at)}</span>
            </h2>
            <span className="text-[10px] text-slate-400 italic">
              Not from our DB — direct Meta Insights API
            </span>
          </div>
          {liveInsights.impressions === 0 && liveInsights.spend === 0 ? (
            <p className="text-xs text-slate-500">No spend or impressions yet — campaign may be brand new or hasn&apos;t started delivering.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
              <Stat label="Spend (live)" value={`EGP ${liveInsights.spend.toFixed(2)}`} />
              <Stat label="Impressions" value={liveInsights.impressions.toLocaleString()} />
              <Stat label="Clicks" value={liveInsights.clicks.toLocaleString()} />
              <Stat label="Reach" value={liveInsights.reach.toLocaleString()} />
              {liveInsights.cpm != null && <Stat label="CPM" value={`EGP ${liveInsights.cpm.toFixed(2)}`} />}
              {liveInsights.cpc != null && <Stat label="CPC" value={`EGP ${liveInsights.cpc.toFixed(2)}`} />}
              {liveInsights.ctr != null && <Stat label="CTR" value={`${liveInsights.ctr.toFixed(2)}%`} accent="cyan" />}
            </div>
          )}
        </section>
      )}

      {/* Daily metrics sparkline */}
      {chartDays.length > 0 && (
        <section className="ix-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Daily spend (last {chartDays.length} days)</h2>
          <div className="flex items-end gap-0.5 h-24">
            {chartDays.map((d, i) => {
              const spendEgp = chartSpendEgp[i] || 0;
              const h = maxSpend > 0 ? Math.max(2, (spendEgp / maxSpend) * 96) : 2;
              return (
                <div key={`${d.metric_date}-${i}`} className="flex-1 bg-emerald-400 dark:bg-emerald-600 rounded-t" style={{ height: `${h}px` }} title={`${d.metric_date}: EGP ${spendEgp.toFixed(2)}`} />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>{chartDays[0]?.metric_date}</span>
            <span>{chartDays[chartDays.length - 1]?.metric_date}</span>
          </div>
        </section>
      )}

      {/* Ad sets */}
      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Ad sets ({adSets.length})</h2>
        {adSets.length === 0 ? (
          <p className="text-xs text-slate-500">No ad sets yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Status</th>
                {camp.platform === 'meta' && <th className="py-2 pr-3">Meta delivery</th>}
                <th className="py-2 pr-3">Goal</th>
                <th className="py-2 pr-3 text-right">Daily budget</th>
                <th className="py-2 pr-3">Targeting</th>
              </tr>
            </thead>
            <tbody>
              {adSets.map(s => {
                const sLive = liveStatuses.get(s.external_id) || null;
                return (
                <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 font-medium">{s.name}</td>
                  <td className="py-2 pr-3"><span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(s.status)}`}>{s.status || '—'}</span></td>
                  {camp.platform === 'meta' && (
                    <td className="py-2 pr-3"><MetaStatusBadge status={sLive} /></td>
                  )}
                  <td className="py-2 pr-3">{s.optimization_goal || '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.daily_budget_micros ? `EGP ${(s.daily_budget_micros / 1_000_000).toFixed(2)}` : '—'}</td>
                  <td className="py-2 pr-3 text-[10px]">
                    {(s.target_countries || []).join(', ') || '—'}
                    {(s.age_min || s.age_max) && <span className="text-slate-500"> · age {s.age_min || '?'}–{s.age_max || '?'}</span>}
                  </td>
                </tr>);
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Ads */}
      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Ads ({ads.length})</h2>
        {ads.length === 0 ? (
          <p className="text-xs text-slate-500">No ads yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {ads.map(a => {
              const aLive = liveStatuses.get(a.external_id) || null;
              return (
              <div key={a.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex gap-3">
                {a.creative_url && (
                  <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden shrink-0">
                    {a.creative_type === 'video'
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      ? <video src={a.creative_url} className="w-full h-full object-cover" muted preload="metadata" />
                      : <img src={a.creative_url} alt={a.headline || ''} className="w-full h-full object-cover" />}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{a.name}</div>
                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(a.status)} shrink-0`}>{a.status || '—'}</span>
                  </div>
                  {camp.platform === 'meta' && (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span>Meta:</span> <MetaStatusBadge status={aLive} />
                    </div>
                  )}
                  {a.headline && <div className="font-semibold">{a.headline}</div>}
                  {a.body && <div className="text-slate-500 line-clamp-2">{a.body}</div>}
                  {a.landing_url && (
                    <a href={a.landing_url} target="_blank" rel="noreferrer" className="ix-link inline-flex items-center gap-0.5 text-[10px]">
                      Landing URL <ExternalLink size={9} />
                    </a>
                  )}
                  <MetaIssuesList status={aLive} />
                </div>
              </div>);
            })}
          </div>
        )}
      </section>

      {/* Recent leads */}
      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Recent leads ({leads.length})</h2>
        {leads.length === 0 ? (
          <p className="text-xs text-slate-500">No leads attributed to this campaign yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Name / Phone</th>
                <th className="py-2 pr-3">Country</th>
                <th className="py-2 pr-3">Stage</th>
                <th className="py-2 pr-3 text-right">Booking value</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.lead_id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 text-slate-500">{fmtCairoDate(l.created_at)}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{l.full_name || '—'}</div>
                    {l.phone_e164 && <div className="text-[10px] text-slate-400 font-mono">{l.phone_e164}</div>}
                  </td>
                  <td className="py-2 pr-3">{l.country || '—'}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                      l.funnel_stage === 'booked' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                      : l.funnel_stage === 'processed' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}>{l.funnel_stage}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.booking_value ? `${l.booking_currency || ''} ${Number(l.booking_value).toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </BeithadyShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'cyan' | 'amber' | 'emerald' }) {
  const cls = accent === 'cyan' ? 'text-cyan-700 dark:text-cyan-300'
    : accent === 'amber' ? 'text-amber-700 dark:text-amber-300'
    : accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-md p-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-base font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
