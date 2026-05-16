import Link from 'next/link';
import {
  getLeadDensityHeatmap, getMetaHourlyHeatmap, type HeatmapCell, type MetaHourlyCell,
} from '@/lib/beithady/ads/hourly';
import { cellColorBucket } from '@/lib/beithady/ads/cohort';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function maxOf(cells: Array<HeatmapCell | MetaHourlyCell>, field: 'lead_count' | 'clicks' | 'spend_micros' | 'impressions'): number {
  let m = 0;
  for (const c of cells) {
    const v = (c as Record<string, number>)[field] ?? 0;
    if (v > m) m = v;
  }
  return m || 1;
}

export async function TimeTab({
  range, campaignId, buildingCode, mode,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
  mode?: 'leads' | 'meta';
}) {
  const activeMode: 'leads' | 'meta' = mode === 'meta' ? 'meta' : 'leads';
  const baseQs = new URLSearchParams({
    from: range.from, to: range.to,
    ...(range.preset ? { preset: range.preset } : {}),
    ...(range.compare ? { compare: '1' } : {}),
    ...(campaignId ? { campaign: String(campaignId) } : {}),
    ...(buildingCode ? { building: buildingCode } : {}),
    tab: 'time',
  });
  const leadsQs = new URLSearchParams(baseQs); leadsQs.set('heatmap', 'leads');
  const metaQs = new URLSearchParams(baseQs); metaQs.set('heatmap', 'meta');

  const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
  const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

  // Pull both for now; cheap (mocked / small data). UI only renders the active mode.
  const [leadCells, metaCells] = await Promise.all([
    getLeadDensityHeatmap({ from: range.from, to: range.to, campaignId, buildingCode }),
    getMetaHourlyHeatmap({ from: range.from, to: range.to, campaignId }),
  ]);

  if (activeMode === 'meta' && metaCells.length === 0) {
    return (
      <div className="space-y-3">
        <div className="ix-card p-3 flex items-center gap-2 text-xs">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Mode</span>
          <Link href={`/beithady/ads/audience?${leadsQs.toString()}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${INACTIVE}`}>Lead density</Link>
          <Link href={`/beithady/ads/audience?${metaQs.toString()}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${ACTIVE}`}>Meta spend</Link>
        </div>
        <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Meta hourly data populating — try again in ~6 hours.
        </div>
      </div>
    );
  }

  // Build a quick lookup for the active mode
  const lookup = new Map<string, number>();
  if (activeMode === 'leads') {
    for (const c of leadCells) lookup.set(`${c.day_of_week}|${c.hour}`, c.lead_count);
  } else {
    for (const c of metaCells) lookup.set(`${c.day_of_week}|${c.hour}`, c.clicks);
  }
  const max = activeMode === 'leads' ? maxOf(leadCells, 'lead_count') : maxOf(metaCells, 'clicks');
  const totalSum = Array.from(lookup.values()).reduce((s, n) => s + n, 0) || 1;

  return (
    <div className="space-y-3">
      <div className="ix-card p-3 flex items-center gap-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Mode</span>
        <Link href={`/beithady/ads/audience?${leadsQs.toString()}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${activeMode === 'leads' ? ACTIVE : INACTIVE}`}>Lead density</Link>
        <Link href={`/beithady/ads/audience?${metaQs.toString()}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${activeMode === 'meta' ? ACTIVE : INACTIVE}`}>Meta spend</Link>
      </div>

      <div className="ix-card p-5 overflow-x-auto">
        <table className="w-full text-[10px] tabular-nums">
          <thead className="text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1 text-left"></th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="py-1 text-center">{h}h</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, dow) => (
              <tr key={day}>
                <td className="py-1 pr-2 text-slate-600 dark:text-slate-300 font-medium">{day}</td>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = lookup.get(`${dow}|${h}`) ?? 0;
                  const pct = (v / max) * 100;
                  const colorBucket = cellColorBucket((v / totalSum) * 100);
                  const label = activeMode === 'leads'
                    ? `${DAYS[dow]} ${h}:00 — ${v} leads`
                    : `${DAYS[dow]} ${h}:00 — ${v.toLocaleString()} clicks`;
                  return (
                    <td key={h}
                        className={`heatmap-cell h-5 text-center ${colorBucket}`}
                        style={{ opacity: max > 0 ? Math.max(0.15, pct / 100) : 0.15 }}
                        title={label}>
                      {v > 0 ? v : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
