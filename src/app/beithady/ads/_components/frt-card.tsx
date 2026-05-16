import Link from 'next/link';
import { Clock } from 'lucide-react';
import { getFrtSummary, getFrtPerCampaign } from '@/lib/beithady/ads/frt';

function slaTone(pct: number): string {
  if (pct < 10) return 'text-emerald-700 dark:text-emerald-300';
  if (pct < 20) return 'text-slate-700 dark:text-slate-200';
  return 'text-rose-700 dark:text-rose-300';
}

export async function FrtCard({
  range, buildingCode,
}: {
  range: { from: string; to: string };
  buildingCode?: string;
}) {
  const [summary, perCampaign] = await Promise.all([
    getFrtSummary({ from: range.from, to: range.to, buildingCode }),
    getFrtPerCampaign({ from: range.from, to: range.to, buildingCode }),
  ]);
  if (summary.total_leads === 0) return null;

  // Worst campaign = highest over_1h_pct with at least 1 lead.
  const worst = [...perCampaign]
    .filter(c => c.total_leads > 0)
    .sort((a, b) => (b.over_1h_pct ?? 0) - (a.over_1h_pct ?? 0))[0];

  return (
    <div className="ix-card p-5 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <Clock size={14} className="text-emerald-600" />
        <span>WhatsApp first-response time</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Median</div>
          <div className="text-base font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {summary.median_minutes != null ? `${summary.median_minutes}m` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">p95</div>
          <div className="text-base font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {summary.p95_minutes != null ? `${summary.p95_minutes}m` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Over 1h SLA</div>
          <div className={`text-base font-semibold tabular-nums ${slaTone(summary.over_1h_pct)}`}>
            {summary.over_1h_pct}% ({summary.over_1h_count} / {summary.responded_leads})
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Unresponded</div>
          <div className="text-base font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {summary.unresponded_count}
          </div>
        </div>
      </div>
      {worst && worst.over_1h_pct > 10 && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Worst campaign: <strong className="text-slate-700 dark:text-slate-200">{worst.campaign_name}</strong>
          {' '}({worst.over_1h_pct}% over SLA){' '}
          <Link
            href={`/beithady/ads/audience?tab=quality&campaign=${worst.campaign_id}`}
            className="ix-link"
          >view in Quality →</Link>
        </div>
      )}
    </div>
  );
}
