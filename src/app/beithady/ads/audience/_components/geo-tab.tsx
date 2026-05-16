import { queryGeoRollup } from '@/lib/beithady/ads/insights-geo';
import { derivePriorPeriod } from '@/lib/beithady/ads/date-range';
import { PeriodDeltaBadge } from '../../_components/period-delta-badge';

export async function GeoTab({
  range, campaignId, platforms, buildingCode,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
}) {
  const [current, prior] = await Promise.all([
    queryGeoRollup({ from: range.from, to: range.to, campaignId, platforms, buildingCode }),
    range.compare
      ? queryGeoRollup({ ...derivePriorPeriod(range), campaignId, platforms, buildingCode })
      : Promise.resolve([]),
  ]);
  const priorByCountry = new Map(prior.map(r => [r.country_code, r]));

  if (current.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No audience data yet for this range.
        <div className="mt-2 text-xs">Run <span className="font-mono">Backfill 90d</span> on /admin/integrations, or wait for the next 6h cron tick.</div>
      </div>
    );
  }

  return (
    <div className="ix-card p-5 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Countries</h3>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-2">Country</th>
            <th className="py-2 text-right">Impressions</th>
            <th className="py-2 text-right">Clicks</th>
            <th className="py-2 text-right">CTR</th>
            <th className="py-2 text-right">Spend (EGP)</th>
            <th className="py-2 text-right">Leads</th>
            {range.compare && <th className="py-2 text-right">Δ clicks</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {current.map(r => {
            const ctr = r.impressions ? (r.clicks / r.impressions) * 100 : 0;
            const p = priorByCountry.get(r.country_code);
            return (
              <tr key={r.country_code} className="text-slate-700 dark:text-slate-200">
                <td className="py-1.5 font-medium">{r.country_code}</td>
                <td className="py-1.5 text-right">{r.impressions.toLocaleString()}</td>
                <td className="py-1.5 text-right">{r.clicks.toLocaleString()}</td>
                <td className="py-1.5 text-right">{ctr.toFixed(2)}%</td>
                <td className="py-1.5 text-right">{(r.spend_micros / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="py-1.5 text-right">{r.leads.toLocaleString()}</td>
                {range.compare && (
                  <td className="py-1.5 text-right">
                    <PeriodDeltaBadge current={r.clicks} prior={p?.clicks ?? 0} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
