import Link from 'next/link';
import { getTopAds, type TopAdSortBy } from '@/lib/beithady/ads/top-ads';
import { getTopAssets } from '@/lib/beithady/ads/top-assets';

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

export async function OptimizeTab({
  range, campaignId, buildingCode, sort,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
  sort?: TopAdSortBy;
}) {
  const sortBy: TopAdSortBy = sort === 'ctr' || sort === 'cpl' ? sort : 'leads';

  const [topAds, topAssets] = await Promise.all([
    getTopAds({ from: range.from, to: range.to, sortBy, limit: 20, buildingCode }),
    getTopAssets({ buildingCode, limit: 20 }),
  ]);

  const baseQs = new URLSearchParams({
    from: range.from, to: range.to,
    ...(range.preset ? { preset: range.preset } : {}),
    ...(range.compare ? { compare: '1' } : {}),
    ...(campaignId ? { campaign: String(campaignId) } : {}),
    ...(buildingCode ? { building: buildingCode } : {}),
    tab: 'optimize',
  });
  function sortHref(s: TopAdSortBy): string {
    const q = new URLSearchParams(baseQs); q.set('sort', s);
    return `/beithady/ads/audience?${q.toString()}`;
  }

  return (
    <div className="space-y-3">
      <div className="ix-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Top performing ads</h3>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Sort</span>
            {(['leads', 'ctr', 'cpl'] as const).map(s => (
              <Link key={s} href={sortHref(s)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${sortBy === s ? ACTIVE : INACTIVE}`}>
                {s === 'leads' ? 'Leads' : s === 'ctr' ? 'CTR' : 'CPL'}
              </Link>
            ))}
          </div>
        </div>
        {topAds.length === 0 ? (
          <div className="text-xs text-slate-400 italic">No ad-level data yet for this range.</div>
        ) : (
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2">Ad</th>
                <th className="py-2">Campaign</th>
                <th className="py-2 text-right">Impressions</th>
                <th className="py-2 text-right">Clicks</th>
                <th className="py-2 text-right">CTR %</th>
                <th className="py-2 text-right">Spend (EGP)</th>
                <th className="py-2 text-right"># Leads</th>
                <th className="py-2 text-right">CPL (EGP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {topAds.map(r => (
                <tr key={r.ad_id} className="text-slate-700 dark:text-slate-200">
                  <td className="py-1.5 font-medium">{r.ad_name}</td>
                  <td className="py-1.5">{r.campaign_name}</td>
                  <td className="py-1.5 text-right">{r.impressions.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.clicks.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.ctr_pct}%</td>
                  <td className="py-1.5 text-right">{r.spend_egp.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.leads.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.cpl_egp != null ? r.cpl_egp : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Top creative assets</h3>
        {topAssets.length === 0 ? (
          <div className="text-xs text-slate-400 italic">No creative-asset performance data yet.</div>
        ) : (
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2">Thumb</th>
                <th className="py-2">Asset</th>
                <th className="py-2">Building</th>
                <th className="py-2 text-right">Ads</th>
                <th className="py-2 text-right">Impressions</th>
                <th className="py-2 text-right">Clicks</th>
                <th className="py-2 text-right">CPL (EGP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {topAssets.map(r => (
                <tr key={r.asset_id} className="text-slate-700 dark:text-slate-200">
                  <td className="py-1.5">
                    {r.public_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.public_url} alt={r.asset_id}
                           className="w-12 h-12 rounded object-cover bg-slate-100 dark:bg-slate-800" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-slate-100 dark:bg-slate-800" />
                    )}
                  </td>
                  <td className="py-1.5 truncate max-w-[200px]">{r.asset_id}</td>
                  <td className="py-1.5">{r.building_code ?? '—'}</td>
                  <td className="py-1.5 text-right">{r.ad_count}</td>
                  <td className="py-1.5 text-right">{r.impressions.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.clicks.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.cpl != null ? Math.round(r.cpl) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
