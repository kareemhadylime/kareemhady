import Link from 'next/link';
import { queryGeoRollup } from '@/lib/beithady/ads/insights-geo';
import { queryDemoRollup } from '@/lib/beithady/ads/insights-demo';
import { queryDeviceRollup } from '@/lib/beithady/ads/insights-device';
import { Globe2, Users, MonitorSmartphone } from 'lucide-react';

const DEVICE_LABEL: Record<string, string> = {
  mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop', connected_tv: 'CTV', tv: 'TV', unknown: 'Unknown',
};

function fmtPct(num: number, denom: number): string {
  if (denom <= 0) return '—';
  return `${Math.round((num / denom) * 100)}%`;
}

export async function AudienceSummaryWidget({
  range, campaignId,
}: {
  range: { from: string; to: string };
  campaignId?: number;
}) {
  const [geo, demo, device] = await Promise.all([
    queryGeoRollup({ from: range.from, to: range.to, campaignId }),
    queryDemoRollup({ from: range.from, to: range.to, campaignId }),
    queryDeviceRollup({ from: range.from, to: range.to, campaignId }),
  ]);
  const totalClicks = geo.reduce((s, r) => s + r.clicks, 0) || 1;
  const totalDemoClicks = demo.reduce((s, r) => s + r.clicks, 0) || 1;
  const totalDeviceClicks = device.reduce((s, r) => s + r.clicks, 0) || 1;
  const top3Geo = geo.slice(0, 3);
  const top3Demo = demo.slice(0, 3);
  const top3Device = device.slice(0, 3);
  const href = `/beithady/ads/audience?from=${range.from}&to=${range.to}${campaignId ? `&campaign=${campaignId}` : ''}`;

  return (
    <div className="ix-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Audience snapshot</h3>
        <Link href={href} className="ix-link text-xs">Open full report →</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <Globe2 size={12} /><span>Top countries</span>
          </div>
          <ul className="space-y-1">
            {top3Geo.map(r => (
              <li key={r.country_code} className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.country_code}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.clicks.toLocaleString()} clk · {fmtPct(r.clicks, totalClicks)}</span>
              </li>
            ))}
            {top3Geo.length === 0 && <li className="text-slate-400">No data yet</li>}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <Users size={12} /><span>Top demographics</span>
          </div>
          <ul className="space-y-1">
            {top3Demo.map(r => (
              <li key={`${r.age_range}|${r.gender}`} className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.age_range} · {r.gender}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.clicks.toLocaleString()} clk · {fmtPct(r.clicks, totalDemoClicks)}</span>
              </li>
            ))}
            {top3Demo.length === 0 && <li className="text-slate-400">No data yet</li>}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <MonitorSmartphone size={12} /><span>Top device</span>
          </div>
          <ul className="space-y-1">
            {top3Device.map(r => (
              <li key={`${r.device_platform}|${r.publisher_platform ?? ''}|${r.placement ?? ''}`}
                  className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{DEVICE_LABEL[r.device_platform] ?? r.device_platform}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.clicks.toLocaleString()} clk · {fmtPct(r.clicks, totalDeviceClicks)}</span>
              </li>
            ))}
            {top3Device.length === 0 && <li className="text-slate-400">No data yet</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
