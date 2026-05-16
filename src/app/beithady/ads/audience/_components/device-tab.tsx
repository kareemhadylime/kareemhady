import { queryDeviceRollup, type DeviceRollupRow } from '@/lib/beithady/ads/insights-device';
import { derivePriorPeriod } from '@/lib/beithady/ads/date-range';
import { PeriodDeltaBadge } from '../../_components/period-delta-badge';

const DEVICE_LABEL: Record<string, string> = {
  mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop', connected_tv: 'CTV', tv: 'TV', unknown: 'Unknown',
};
const DEVICE_COLOR: Record<string, string> = {
  mobile: 'bg-emerald-500/70 dark:bg-emerald-600/70',
  tablet: 'bg-emerald-300/70 dark:bg-emerald-400/70',
  desktop: 'bg-slate-400/70 dark:bg-slate-500/70',
  connected_tv: 'bg-slate-300/70 dark:bg-slate-600/70',
  tv: 'bg-slate-300/70 dark:bg-slate-600/70',
  unknown: 'bg-slate-200/70 dark:bg-slate-700/70',
};

function sumBy<K extends string>(rows: DeviceRollupRow[], keyFn: (r: DeviceRollupRow) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) ?? 0) + r.clicks);
  return m;
}

export async function DeviceTab({
  range, campaignId, platforms,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
}) {
  const [current, prior] = await Promise.all([
    queryDeviceRollup({ from: range.from, to: range.to, campaignId, platforms }),
    range.compare ? queryDeviceRollup({ ...derivePriorPeriod(range), campaignId, platforms }) : Promise.resolve([]),
  ]);

  if (current.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No device data yet for this range.
      </div>
    );
  }

  const byDevice = sumBy(current, r => r.device_platform);
  const totalClicks = current.reduce((s, r) => s + r.clicks, 0) || 1;
  const hasMeta = current.some(r => r.publisher_platform != null);
  const byPlacement = hasMeta
    ? sumBy(current.filter(r => r.publisher_platform), r => `${r.publisher_platform}:${r.placement ?? '—'}`)
    : new Map<string, number>();

  return (
    <div className="space-y-3">
      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Devices</h3>
        <div className="h-4 w-full rounded overflow-hidden flex">
          {Array.from(byDevice.entries()).map(([dev, clicks]) => (
            <div key={dev}
                 className={DEVICE_COLOR[dev] ?? DEVICE_COLOR.unknown}
                 style={{ width: `${(clicks / totalClicks) * 100}%` }}
                 title={`${DEVICE_LABEL[dev] ?? dev}: ${clicks.toLocaleString()} clicks`} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          {Array.from(byDevice.entries()).map(([dev, clicks]) => (
            <span key={dev} className="inline-flex items-center gap-1">
              <span className={`w-3 h-3 rounded ${DEVICE_COLOR[dev] ?? DEVICE_COLOR.unknown}`} />
              <span className="font-medium text-slate-700 dark:text-slate-200">{DEVICE_LABEL[dev] ?? dev}</span>
              <span className="tabular-nums">{clicks.toLocaleString()} · {Math.round((clicks / totalClicks) * 100)}%</span>
            </span>
          ))}
        </div>
      </div>

      {hasMeta && (
        <div className="ix-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Placements (Meta only)</h3>
          <div className="space-y-1.5 text-xs">
            {Array.from(byPlacement.entries()).sort((a, b) => b[1] - a[1]).map(([key, clicks]) => {
              const [pub, plc] = key.split(':');
              const pct = (clicks / totalClicks) * 100;
              return (
                <div key={key} className="grid grid-cols-[180px_1fr_70px] items-center gap-3">
                  <span className="text-slate-600 dark:text-slate-300 truncate"><span className="capitalize">{pub}</span> · {plc}</span>
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                    <div className="h-full bg-emerald-400/70 dark:bg-emerald-600/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-slate-500 dark:text-slate-400">{clicks.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Detail</h3>
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Device</th>
              <th className="py-2">Publisher</th>
              <th className="py-2">Placement</th>
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
              const p = prior.find(x =>
                x.device_platform === r.device_platform &&
                x.publisher_platform === r.publisher_platform &&
                x.placement === r.placement);
              return (
                <tr key={`${r.device_platform}|${r.publisher_platform ?? ''}|${r.placement ?? ''}`}
                    className="text-slate-700 dark:text-slate-200">
                  <td className="py-1.5">{DEVICE_LABEL[r.device_platform] ?? r.device_platform}</td>
                  <td className="py-1.5 capitalize">{r.publisher_platform ?? '—'}</td>
                  <td className="py-1.5">{r.placement ?? '—'}</td>
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
    </div>
  );
}
