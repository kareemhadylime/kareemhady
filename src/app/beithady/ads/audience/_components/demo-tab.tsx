import { queryDemoRollup, type DemoRollupRow } from '@/lib/beithady/ads/insights-demo';
import { derivePriorPeriod } from '@/lib/beithady/ads/date-range';
import { PeriodDeltaBadge } from '../../_components/period-delta-badge';

const AGE_BUCKETS = ['13-17','18-24','25-34','35-44','45-54','55-64','65+','unknown'] as const;

function maxClicks(rows: DemoRollupRow[]): number {
  return rows.reduce((m, r) => Math.max(m, r.clicks), 0) || 1;
}

function findRow(rows: DemoRollupRow[], age: string, gender: string): DemoRollupRow | undefined {
  return rows.find(r => r.age_range === age && r.gender === gender);
}

export async function DemoTab({
  range, campaignId, platforms,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
}) {
  const [current, prior] = await Promise.all([
    queryDemoRollup({ from: range.from, to: range.to, campaignId, platforms }),
    range.compare ? queryDemoRollup({ ...derivePriorPeriod(range), campaignId, platforms }) : Promise.resolve([]),
  ]);

  if (current.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No demographic data yet for this range.
      </div>
    );
  }
  const max = maxClicks(current);

  return (
    <div className="space-y-3">
      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Clicks by age × gender</h3>
        <div className="space-y-1.5 text-xs">
          {AGE_BUCKETS.map(age => {
            const female = findRow(current, age, 'female')?.clicks ?? 0;
            const male = findRow(current, age, 'male')?.clicks ?? 0;
            const total = female + male;
            if (total === 0) return null;
            return (
              <div key={age} className="grid grid-cols-[80px_1fr_60px] items-center gap-3">
                <span className="text-slate-600 dark:text-slate-300 font-medium">{age}</span>
                <div className="flex items-center gap-1 h-4">
                  <div className="bg-emerald-400/70 dark:bg-emerald-600/70 h-full rounded-l"
                       style={{ width: `${(female / max) * 100}%` }}
                       title={`Female: ${female}`} />
                  <div className="bg-slate-400/70 dark:bg-slate-500/70 h-full rounded-r"
                       style={{ width: `${(male / max) * 100}%` }}
                       title={`Male: ${male}`} />
                </div>
                <span className="text-right tabular-nums text-slate-500 dark:text-slate-400">{total.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400/70 dark:bg-emerald-600/70" /> Female</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-400/70 dark:bg-slate-500/70" /> Male</span>
        </div>
      </div>

      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Detail</h3>
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Age</th>
              <th className="py-2">Gender</th>
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
              const p = prior.find(x => x.age_range === r.age_range && x.gender === r.gender);
              return (
                <tr key={`${r.age_range}|${r.gender}`} className="text-slate-700 dark:text-slate-200">
                  <td className="py-1.5">{r.age_range}</td>
                  <td className="py-1.5 capitalize">{r.gender}</td>
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
