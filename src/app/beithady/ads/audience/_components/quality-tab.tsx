import { getLeadQualityPerCampaign } from '@/lib/beithady/ads/lead-quality';
import { getFrtPerCampaign } from '@/lib/beithady/ads/frt';

function slaTone(pct: number): string {
  if (pct < 10) return 'text-emerald-700 dark:text-emerald-300';
  if (pct < 20) return 'text-slate-700 dark:text-slate-200';
  return 'text-rose-700 dark:text-rose-300';
}

export async function QualityTab({
  range, buildingCode,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
}) {
  const [quality, frt] = await Promise.all([
    getLeadQualityPerCampaign({ from: range.from, to: range.to, buildingCode }),
    getFrtPerCampaign({ from: range.from, to: range.to, buildingCode }),
  ]);

  if (quality.length === 0 && frt.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No lead activity yet for this range.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Lead quality % per campaign</h3>
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Campaign</th>
              <th className="py-2 text-right">Leads</th>
              <th className="py-2 text-right">Booked</th>
              <th className="py-2 text-right">Quality %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {quality.map(r => (
              <tr key={r.campaign_id} className="text-slate-700 dark:text-slate-200">
                <td className="py-1.5 font-medium">{r.campaign_name}</td>
                <td className="py-1.5 text-right">{r.leads.toLocaleString()}</td>
                <td className="py-1.5 text-right">{r.booked.toLocaleString()}</td>
                <td className="py-1.5 text-right text-emerald-700 dark:text-emerald-300">{r.quality_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Response speed per campaign</h3>
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Campaign</th>
              <th className="py-2 text-right">Leads</th>
              <th className="py-2 text-right">Median</th>
              <th className="py-2 text-right">p95</th>
              <th className="py-2 text-right">% over 1h SLA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {frt.map(r => (
              <tr key={r.campaign_id} className="text-slate-700 dark:text-slate-200">
                <td className="py-1.5 font-medium">{r.campaign_name}</td>
                <td className="py-1.5 text-right">{r.total_leads.toLocaleString()}</td>
                <td className="py-1.5 text-right">{r.median_minutes != null ? `${r.median_minutes}m` : '—'}</td>
                <td className="py-1.5 text-right">{r.p95_minutes != null ? `${r.p95_minutes}m` : '—'}</td>
                <td className={`py-1.5 text-right ${slaTone(r.over_1h_pct)}`}>
                  {r.over_1h_pct}% ({r.over_1h_count})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
