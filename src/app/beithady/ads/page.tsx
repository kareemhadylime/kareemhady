import Link from 'next/link';
import { Megaphone, Plus, Users, DollarSign, Activity, BarChart3, AlertTriangle, Globe2, RefreshCw } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getProviderEnabled, getProviderStatus } from '@/lib/credentials';
import { getDashboardKpisWithCompare, listCampaigns, listLeadFunnel } from '@/lib/beithady/ads/reporting';
import { convertManyToEgp } from '@/lib/fx-rates';
import { fmtCairoDate } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { AdsTabs } from './_components/ads-tabs';
import { DateRangeFilter } from './_components/date-range-filter';
import { PerBuildingFilter } from './_components/per-building-filter';
import { FrtCard } from './_components/frt-card';
import { AudienceSummaryWidget } from './_components/audience-summary-widget';
import { parseDateRange } from '@/lib/beithady/ads/date-range';
import { statusBadgeClass, PLATFORM_LABEL } from '@/lib/beithady/ads/platforms';
import { syncAllAction } from './actions';
import { AiSummaryCard } from './_components/ai-summary-card';
import { AnomalyBanner } from './_components/anomaly-banner';
import { SpendPacingCard } from './_components/spend-pacing-card';
import { PeriodDeltaBadge } from './_components/period-delta-badge';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AdsLandingPage({
  searchParams,
}: {
  searchParams: Promise<{
    building?: string; date?: string; signal?: string;
    from?: string; to?: string; preset?: string; compare?: string;
  }>;
}) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;
  const range = parseDateRange({ from: sp.from, to: sp.to, preset: sp.preset, compare: sp.compare });

  const sb = supabaseAdmin();
  const { data: recentSummaryRow } = await sb
    .from('beithady_audit_log')
    .select('metadata, created_at')
    .eq('module', 'ads').eq('action', 'ai_summary_generated')
    .order('created_at', { ascending: false })
    .limit(1);
  const recentSummary = (recentSummaryRow as Array<{ metadata: Record<string, unknown>; created_at: string }> | null)?.[0];
  const summaryRange = recentSummary?.metadata?.range as { from?: string; to?: string } | undefined;
  const summaryForThisRange = summaryRange?.from === range.from && summaryRange?.to === range.to
    ? (recentSummary!.metadata.summary as string | undefined) ?? null
    : null;

  const cairoToday = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
  const sinceIso = new Date(cairoToday + 'T00:00:00+03:00').toISOString();
  const { count: usedToday } = await sb.from('beithady_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'ads').eq('action', 'ai_summary_generated')
    .gte('created_at', sinceIso);

  const [
    kpisCompare,
    campaigns,
    recentLeads,
    metaEnabled,
    metaStatus,
    googleEnabled,
    googleStatus,
    tiktokEnabled,
    tiktokStatus,
  ] = await Promise.all([
    getDashboardKpisWithCompare({ range: { from: range.from, to: range.to }, compare: range.compare }),
    listCampaigns(),
    listLeadFunnel({ limit: 10 }),
    getProviderEnabled('meta_marketing'),
    getProviderStatus('meta_marketing'),
    getProviderEnabled('google_ads'),
    getProviderStatus('google_ads'),
    getProviderEnabled('tiktok_ads'),
    getProviderStatus('tiktok_ads'),
  ]);
  const kpis = kpisCompare.current;
  const priorKpis = kpisCompare.prior;
  const metaConfigured = metaEnabled && (metaStatus.config_keys_set.length >= 4 || metaStatus.has_env_fallback.length >= 4);
  const googleConfigured = googleEnabled && (googleStatus.config_keys_set.length >= 4 || googleStatus.has_env_fallback.length >= 4);
  const tiktokConfigured = tiktokEnabled && (tiktokStatus.config_keys_set.length >= 2 || tiktokStatus.has_env_fallback.length >= 2);

  // Per-campaign spend is in the ad account's native currency
  // (Meta=USD, Google=EGP, TikTok=USD). Convert each row to EGP up front
  // so the per-platform cards AND the campaigns table both show EGP.
  const campaignSpendEgp = await convertManyToEgp(
    campaigns.map(c => ({ amount: Number(c.spend) || 0, currency: c.account_currency }))
  );

  // Per-platform breakdown
  const platformBreakdown: Record<string, { spend: number; leads: number; active: number; drafts: number }> = {
    meta: { spend: 0, leads: 0, active: 0, drafts: 0 },
    google: { spend: 0, leads: 0, active: 0, drafts: 0 },
    tiktok: { spend: 0, leads: 0, active: 0, drafts: 0 },
  };
  campaigns.forEach((c, i) => {
    const p = c.platform || 'meta';
    if (!platformBreakdown[p]) return;
    platformBreakdown[p].spend += campaignSpendEgp[i] || 0;
    platformBreakdown[p].leads += Number(c.leads) || 0;
    if (c.campaign_status?.toUpperCase() === 'ACTIVE') platformBreakdown[p].active += 1;
    if (c.campaign_status?.toUpperCase() === 'DRAFT') platformBreakdown[p].drafts += 1;
  });

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Ads"
        subtitle="Meta CTWA + Google Search + TikTok Ads. Instagram Reels + TikTok organic. AI copy, gallery-fed creatives, lead-to-booking attribution."
        right={
          <div className="flex items-center gap-2">
            <form action={syncAllAction} className="inline">
              <button type="submit" className="ix-btn-secondary text-xs" title="Pull latest spend + leads from Meta + Google + TikTok">
                <RefreshCw size={12} /> Sync now
              </button>
            </form>
            <Link
              href={`/beithady/ads/create${sp.building ? `?building=${sp.building}` : ''}${sp.date ? `&date=${sp.date}` : ''}${sp.signal ? `&signal=${sp.signal}` : ''}`}
              className="ix-btn-primary"
            >
              <Plus size={14} /> New campaign
            </Link>
          </div>
        }
      />

      <AiSummaryCard
        range={{ from: range.from, to: range.to }}
        summary={summaryForThisRange}
        usedToday={usedToday ?? 0}
      />
      <AdsTabs active="overview" />
      <DateRangeFilter />
      <PerBuildingFilter />
      <AnomalyBanner />

      {/* Per-platform connection status row */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <PlatformStatusCard label="Meta" connected={metaConfigured} stats={platformBreakdown.meta} hrefConfigure="/admin/integrations" />
        <PlatformStatusCard label="Google" connected={googleConfigured} stats={platformBreakdown.google} hrefConfigure="/admin/integrations" />
        <PlatformStatusCard label="TikTok" connected={tiktokConfigured} stats={platformBreakdown.tiktok} hrefConfigure="/admin/integrations" />
      </section>

      {/* Phase G deep-link banner */}
      {sp.signal === 'gap' && sp.building && (
        <div className="ix-card border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 text-sm flex items-center gap-2">
          <Globe2 size={16} className="text-amber-600" />
          <span>
            Spawning a campaign for occupancy gap at <strong>{sp.building}</strong>{sp.date ? ` on ${sp.date}` : ''}.
            Click <strong>New campaign</strong> to continue with these defaults pre-filled.
          </span>
        </div>
      )}

      {!metaConfigured && !googleConfigured && !tiktokConfigured && (
        <div className="ix-card border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 text-sm flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            No ad platforms configured yet. Campaigns will save as <strong>drafts</strong> until you connect credentials at
            {' '}<Link href="/admin/integrations" className="ix-link">/admin/integrations</Link>.
          </span>
        </div>
      )}

      <FrtCard
        range={{ from: range.from, to: range.to }}
        buildingCode={sp.building}
      />
      <SpendPacingCard range={{ from: range.from, to: range.to }} />

      <AudienceSummaryWidget range={{ from: range.from, to: range.to }} />

      {/* KPIs for the selected date range */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <Stat label={`Spend (${range.preset === 'custom' ? `${range.from}—${range.to}` : range.preset})`}
              value={`EGP ${kpis.spend.toLocaleString()}`}
              delta={priorKpis ? { current: kpis.spend, prior: priorKpis.spend } : undefined}
              icon={DollarSign} />
        <Stat label={`Leads (${range.preset === 'custom' ? `${range.from}—${range.to}` : range.preset})`}
              value={kpis.leads.toLocaleString()}
              delta={priorKpis ? { current: kpis.leads, prior: priorKpis.leads } : undefined}
              icon={Users} accent="cyan" />
        <Stat label="CPL"
              value={kpis.cpl == null ? '—' : `EGP ${kpis.cpl.toFixed(2)}`}
              delta={priorKpis && kpis.cpl != null && priorKpis.cpl != null
                ? { current: kpis.cpl, prior: priorKpis.cpl, reverseColor: true }
                : undefined}
              accent="amber" />
        <Stat label="Bookings attributed"
              value={kpis.bookings.toLocaleString()}
              delta={priorKpis ? { current: kpis.bookings, prior: priorKpis.bookings } : undefined}
              accent="emerald" />
        <Stat label="Revenue (EGP)"
              value={`EGP ${kpis.attributed_revenue.toLocaleString()}`}
              delta={priorKpis ? { current: kpis.attributed_revenue, prior: priorKpis.attributed_revenue } : undefined}
              accent="emerald" />
        <Stat label="Active" value={kpis.active_campaigns.toLocaleString()} icon={Activity} />
        <Stat label="Drafts" value={kpis.draft_campaigns.toLocaleString()} accent="slate" />
      </section>

      {/* Campaigns + recent leads side-by-side */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="ix-card p-5 lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <BarChart3 size={14} className="text-emerald-600" />
            Campaigns
          </h2>
          {campaigns.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-500">
              No campaigns yet. <Link href="/beithady/ads/create" className="ix-link">Create your first.</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 pr-3">Campaign</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Buildings</th>
                    <th className="py-2 pr-3 text-right">Spend</th>
                    <th className="py-2 pr-3 text-right">Leads</th>
                    <th className="py-2 pr-3 text-right">CPL</th>
                    <th className="py-2 pr-3 text-right">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 12).map((c, i) => {
                    const spendEgp = campaignSpendEgp[i] || 0;
                    const leads = Number(c.leads) || 0;
                    // c.cpl from the view is spend/leads in ACCOUNT currency,
                    // so recompute in EGP for display consistency.
                    const cplEgp = leads > 0 ? spendEgp / leads : null;
                    return (
                    <tr key={c.campaign_id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                      <td className="py-2 pr-3">
                        <Link href={`/beithady/ads/campaigns/${c.campaign_id}`} className="ix-link font-medium">
                          {c.campaign_name}
                        </Link>
                        <div className="text-[10px] text-slate-400">{PLATFORM_LABEL[c.platform as keyof typeof PLATFORM_LABEL] || c.platform} · {c.objective || '—'}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(c.campaign_status)}`}>
                          {c.campaign_status || '—'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-[11px]">
                        {(c.building_codes || []).join(' · ') || '—'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">EGP {Math.round(spendEgp).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{leads.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{cplEgp == null ? '—' : `EGP ${cplEgp.toFixed(2)}`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.ctr_pct == null ? '—' : `${c.ctr_pct.toFixed(2)}%`}</td>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="ix-card p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <Users size={14} className="text-cyan-600" />
            Recent leads
          </h2>
          {recentLeads.length === 0 ? (
            <p className="text-xs text-slate-500">No leads yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentLeads.map(l => (
                <li key={l.lead_id} className="py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{l.full_name || l.phone_e164 || l.email || 'Unknown'}</div>
                      <div className="text-[10px] text-slate-500">
                        {l.country && <span>{l.country} · </span>}
                        {fmtCairoDate(l.created_at)}
                      </div>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                      l.funnel_stage === 'booked' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' :
                      l.funnel_stage === 'processed' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}>
                      {l.funnel_stage}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link href="/beithady/ads/leads" className="text-xs ix-link">All leads →</Link>
        </div>
      </section>

      <p className="text-[11px] text-slate-500 flex items-center gap-2 justify-center">
        <Megaphone size={11} /> Phase H+ — Meta CTWA + Google Search + TikTok Ads + IG Reels + TikTok Reels. AI copy via Claude Haiku, gallery-fed creatives, 90d phone-match attribution.
      </p>
    </BeithadyShell>
  );
}

function PlatformStatusCard({
  label,
  connected,
  stats,
  hrefConfigure,
}: {
  label: string;
  connected: boolean;
  stats: { spend: number; leads: number; active: number; drafts: number };
  hrefConfigure: string;
}) {
  return (
    <div className="ix-card p-3">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">{label}</div>
        {connected ? (
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">Live</span>
        ) : (
          <Link href={hrefConfigure} className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200 hover:underline">
            Connect →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 mt-2 text-[10px] text-slate-500">
        <div><div className="font-bold tabular-nums text-sm text-slate-700 dark:text-slate-200">EGP {Math.round(stats.spend).toLocaleString()}</div>Spend</div>
        <div><div className="font-bold tabular-nums text-sm text-slate-700 dark:text-slate-200">{stats.leads}</div>Leads</div>
        <div><div className="font-bold tabular-nums text-sm text-emerald-700">{stats.active}</div>Active</div>
        <div><div className="font-bold tabular-nums text-sm text-slate-500">{stats.drafts}</div>Drafts</div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, icon: Icon, delta }: {
  label: string;
  value: string;
  accent?: 'cyan' | 'amber' | 'emerald' | 'slate';
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  delta?: { current: number; prior: number; reverseColor?: boolean };
}) {
  const cls = accent === 'cyan'
    ? 'text-cyan-700 dark:text-cyan-300'
    : accent === 'amber'
      ? 'text-amber-700 dark:text-amber-300'
      : accent === 'emerald'
        ? 'text-emerald-700 dark:text-emerald-300'
        : accent === 'slate'
          ? 'text-slate-500'
          : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 inline-flex items-center justify-center gap-1">
        {Icon && <Icon size={10} />}
        {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
      {delta && (
        <div className="flex justify-center mt-0.5">
          <PeriodDeltaBadge current={delta.current} prior={delta.prior} reverseColor={delta.reverseColor} />
        </div>
      )}
    </div>
  );
}
