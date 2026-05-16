import Link from 'next/link';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listCampaigns, listOverviewByDay, getDashboardKpis, listCampaignRoas } from '@/lib/beithady/ads/reporting';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { PLATFORM_LABEL } from '@/lib/beithady/ads/platforms';
import { DollarSign, Users, BarChart3, TrendingUp, Wallet } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;
  const days = Math.max(1, Math.min(180, Number.parseInt(sp.days || '30', 10) || 30));

  const [kpis, campaigns, daily, roasRows] = await Promise.all([
    getDashboardKpis(days),
    listCampaigns(),
    listOverviewByDay(days),
    listCampaignRoas(),
  ]);

  // Per-platform totals
  const perPlatform: Record<string, { spend: number; leads: number; impressions: number; clicks: number }> = {
    meta: { spend: 0, leads: 0, impressions: 0, clicks: 0 },
    google: { spend: 0, leads: 0, impressions: 0, clicks: 0 },
    tiktok: { spend: 0, leads: 0, impressions: 0, clicks: 0 },
  };
  for (const d of daily) {
    const p = d.platform || 'meta';
    if (!perPlatform[p]) continue;
    perPlatform[p].spend += Number(d.spend) || 0;
    perPlatform[p].leads += Number(d.leads) || 0;
    perPlatform[p].impressions += Number(d.impressions) || 0;
    perPlatform[p].clicks += Number(d.clicks) || 0;
  }

  // Per-building rollup (uses building_codes from campaigns × leads/spend)
  const perBuilding: Record<string, { spend: number; leads: number }> = {};
  for (const c of campaigns) {
    for (const code of c.building_codes || []) {
      if (!perBuilding[code]) perBuilding[code] = { spend: 0, leads: 0 };
      perBuilding[code].spend += Number(c.spend) || 0;
      perBuilding[code].leads += Number(c.leads) || 0;
    }
  }
  const buildingRows = Object.entries(perBuilding).sort((a, b) => b[1].spend - a[1].spend);

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Performance' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Performance"
        subtitle={`Cross-platform analytics over the last ${days} days. Filter, drill into campaigns, export.`}
        right={
          <div className="flex items-center gap-2 text-xs">
            <Link href={`/api/beithady/ads/export?dataset=daily&days=${days}`} className="ix-btn-secondary" prefetch={false}>Daily CSV</Link>
            <Link href="/api/beithady/ads/export?dataset=roas" className="ix-btn-secondary" prefetch={false}>ROAS CSV</Link>
          </div>
        }
      />

      <AdsTabs active="performance" />

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <Stat icon={DollarSign} label={`Spend (${days}d)`} value={`EGP ${kpis.spend.toLocaleString()}`} />
        <Stat icon={Users} label={`Leads (${days}d)`} value={kpis.leads.toLocaleString()} accent="cyan" />
        <Stat icon={TrendingUp} label="CPL" value={kpis.cpl == null ? '—' : `EGP ${kpis.cpl.toFixed(2)}`} accent="amber" />
        <Stat icon={BarChart3} label="Bookings" value={kpis.bookings.toLocaleString()} accent="emerald" />
        <Stat icon={Wallet} label="ROAS" value={kpis.roas == null ? '—' : `${kpis.roas.toFixed(2)}x`} accent="emerald" />
      </section>

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Platform breakdown</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 pr-3">Platform</th>
              <th className="py-2 pr-3 text-right">Spend</th>
              <th className="py-2 pr-3 text-right">Impressions</th>
              <th className="py-2 pr-3 text-right">Clicks</th>
              <th className="py-2 pr-3 text-right">Leads</th>
              <th className="py-2 pr-3 text-right">CPL</th>
              <th className="py-2 pr-3 text-right">CPC</th>
            </tr>
          </thead>
          <tbody>
            {(['meta', 'google', 'tiktok'] as const).map(p => {
              const r = perPlatform[p];
              const cpl = r.leads > 0 ? r.spend / r.leads : null;
              const cpc = r.clicks > 0 ? r.spend / r.clicks : null;
              return (
                <tr key={p} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 font-medium">{PLATFORM_LABEL[p]}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">EGP {Math.round(r.spend).toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.impressions.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.leads.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{cpl == null ? '—' : `EGP ${cpl.toFixed(2)}`}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{cpc == null ? '—' : `EGP ${cpc.toFixed(2)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Per-building rollup</h2>
        {buildingRows.length === 0 ? (
          <p className="text-xs text-slate-500">No building-tagged spend yet. Add building codes when creating a campaign.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Building</th>
                <th className="py-2 pr-3 text-right">Spend</th>
                <th className="py-2 pr-3 text-right">Leads</th>
                <th className="py-2 pr-3 text-right">CPL</th>
              </tr>
            </thead>
            <tbody>
              {buildingRows.map(([code, r]) => {
                const cpl = r.leads > 0 ? r.spend / r.leads : null;
                return (
                  <tr key={code} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3 font-mono">{code}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">EGP {Math.round(r.spend).toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.leads.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{cpl == null ? '—' : `EGP ${cpl.toFixed(2)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">ROAS by campaign</h2>
        {roasRows.filter(r => r.spend > 0 || r.attributed_revenue > 0).length === 0 ? (
          <p className="text-xs text-slate-500">No spend yet. ROAS = attributed booking value (all currencies, converted to USD via <code>fx_rates_usd</code>) / ad spend.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Campaign</th>
                <th className="py-2 pr-3">Platform</th>
                <th className="py-2 pr-3 text-right">Spend</th>
                <th className="py-2 pr-3 text-right">Leads</th>
                <th className="py-2 pr-3 text-right">Bookings</th>
                <th className="py-2 pr-3 text-right">Revenue</th>
                <th className="py-2 pr-3 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {roasRows
                .filter(r => r.spend > 0 || r.attributed_revenue > 0)
                .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))
                .map(r => (
                  <tr key={r.campaign_id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3 font-medium truncate max-w-xs">{r.campaign_name}</td>
                    <td className="py-2 pr-3">{PLATFORM_LABEL[r.platform as keyof typeof PLATFORM_LABEL] || r.platform}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">EGP {Math.round(r.spend).toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.leads.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.bookings.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">EGP {r.attributed_revenue.toLocaleString()}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${r.roas != null && r.roas >= 1 ? 'text-emerald-700 dark:text-emerald-300' : r.roas != null ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'}`}>
                      {r.roas == null ? '—' : `${r.roas.toFixed(2)}x`}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Daily totals ({days}d)</h2>
        {daily.length === 0 ? (
          <p className="text-xs text-slate-500">No metrics in this window yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Platform</th>
                <th className="py-2 pr-3 text-right">Impressions</th>
                <th className="py-2 pr-3 text-right">Clicks</th>
                <th className="py-2 pr-3 text-right">Spend</th>
                <th className="py-2 pr-3 text-right">Leads</th>
                <th className="py-2 pr-3 text-right">CPL</th>
              </tr>
            </thead>
            <tbody>
              {daily.slice(0, 60).map((d, i) => (
                <tr key={`${d.metric_date}-${d.platform}-${i}`} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3">{d.metric_date}</td>
                  <td className="py-2 pr-3">{PLATFORM_LABEL[d.platform as keyof typeof PLATFORM_LABEL] || d.platform}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{Number(d.impressions).toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{Number(d.clicks).toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">EGP {Math.round(Number(d.spend)).toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{Number(d.leads).toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{d.cpl == null ? '—' : `EGP ${d.cpl.toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </BeithadyShell>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; accent?: 'cyan' | 'amber' | 'emerald' }) {
  const cls = accent === 'cyan' ? 'text-cyan-700 dark:text-cyan-300' : accent === 'amber' ? 'text-amber-700 dark:text-amber-300' : accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 inline-flex items-center justify-center gap-1">
        <Icon size={10} /> {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
