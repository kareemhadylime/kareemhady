import Link from 'next/link';
import { Megaphone, Plus, Users, DollarSign, Activity, BarChart3, AlertTriangle, Globe2, RefreshCw } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getProviderEnabled, getProviderStatus } from '@/lib/credentials';
import { getDashboardKpis, listCampaigns, listLeadFunnel } from '@/lib/beithady/ads/reporting';
import { fmtCairoDate } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { AdsTabs } from './_components/ads-tabs';
import { statusBadgeClass, PLATFORM_LABEL } from '@/lib/beithady/ads/platforms';
import { syncAllAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AdsLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string; date?: string; signal?: string }>;
}) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;

  const [
    kpis,
    campaigns,
    recentLeads,
    metaEnabled,
    metaStatus,
    googleEnabled,
    googleStatus,
    tiktokEnabled,
    tiktokStatus,
  ] = await Promise.all([
    getDashboardKpis(30),
    listCampaigns(),
    listLeadFunnel({ limit: 10 }),
    getProviderEnabled('meta_marketing'),
    getProviderStatus('meta_marketing'),
    getProviderEnabled('google_ads'),
    getProviderStatus('google_ads'),
    getProviderEnabled('tiktok_ads'),
    getProviderStatus('tiktok_ads'),
  ]);
  const metaConfigured = metaEnabled && (metaStatus.config_keys_set.length >= 4 || metaStatus.has_env_fallback.length >= 4);
  const googleConfigured = googleEnabled && (googleStatus.config_keys_set.length >= 4 || googleStatus.has_env_fallback.length >= 4);
  const tiktokConfigured = tiktokEnabled && (tiktokStatus.config_keys_set.length >= 2 || tiktokStatus.has_env_fallback.length >= 2);

  // Per-platform breakdown
  const platformBreakdown: Record<string, { spend: number; leads: number; active: number; drafts: number }> = {
    meta: { spend: 0, leads: 0, active: 0, drafts: 0 },
    google: { spend: 0, leads: 0, active: 0, drafts: 0 },
    tiktok: { spend: 0, leads: 0, active: 0, drafts: 0 },
  };
  for (const c of campaigns) {
    const p = c.platform || 'meta';
    if (!platformBreakdown[p]) continue;
    platformBreakdown[p].spend += Number(c.spend) || 0;
    platformBreakdown[p].leads += Number(c.leads) || 0;
    if (c.campaign_status?.toUpperCase() === 'ACTIVE') platformBreakdown[p].active += 1;
    if (c.campaign_status?.toUpperCase() === 'DRAFT') platformBreakdown[p].drafts += 1;
  }

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

      <AdsTabs active="overview" />

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

      {/* KPIs (last 30 days) */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <Stat label="Spend (30d)" value={`$${kpis.spend.toLocaleString()}`} icon={DollarSign} />
        <Stat label="Leads (30d)" value={kpis.leads.toLocaleString()} icon={Users} accent="cyan" />
        <Stat label="CPL" value={kpis.cpl == null ? '—' : `$${kpis.cpl.toFixed(2)}`} accent="amber" />
        <Stat label="Bookings attributed" value={kpis.bookings.toLocaleString()} accent="emerald" />
        <Stat label="Revenue (USD)" value={`$${kpis.attributed_revenue.toLocaleString()}`} accent="emerald" />
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
                  {campaigns.slice(0, 12).map(c => (
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
                      <td className="py-2 pr-3 text-right tabular-nums">${Math.round(c.spend).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.leads.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.cpl == null ? '—' : `$${c.cpl.toFixed(2)}`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.ctr_pct == null ? '—' : `${c.ctr_pct.toFixed(2)}%`}</td>
                    </tr>
                  ))}
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
        <div><div className="font-bold tabular-nums text-sm text-slate-700 dark:text-slate-200">${Math.round(stats.spend).toLocaleString()}</div>Spend</div>
        <div><div className="font-bold tabular-nums text-sm text-slate-700 dark:text-slate-200">{stats.leads}</div>Leads</div>
        <div><div className="font-bold tabular-nums text-sm text-emerald-700">{stats.active}</div>Active</div>
        <div><div className="font-bold tabular-nums text-sm text-slate-500">{stats.drafts}</div>Drafts</div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, icon: Icon }: { label: string; value: string; accent?: 'cyan' | 'amber' | 'emerald' | 'slate'; icon?: React.ComponentType<{ size?: number; className?: string }> }) {
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
    </div>
  );
}
