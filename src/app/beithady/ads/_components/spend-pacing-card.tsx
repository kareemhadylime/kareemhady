import { TrendingUp } from 'lucide-react';
import { getSpendPacing, type CampaignPacingRow } from '@/lib/beithady/ads/pacing';

function barTint(row: CampaignPacingRow): string {
  if (row.auto_paused) return 'bg-slate-400/70 dark:bg-slate-500/70';
  if (row.pct_of_cap >= 95) return 'bg-rose-500/70 dark:bg-rose-600/70';
  if (row.pct_of_cap >= 80) return 'bg-amber-500/70 dark:bg-amber-600/70';
  if (row.pct_of_cap >= 60) return 'bg-slate-400/70 dark:bg-slate-500/70';
  return 'bg-emerald-500/70 dark:bg-emerald-600/70';
}

function sparklinePath(points: number[], width: number, height: number): string {
  if (points.length === 0) return '';
  const max = Math.max(...points, 1);
  const stepX = width / Math.max(1, points.length - 1);
  return points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${height - (v / max) * height}`)
    .join(' ');
}

export async function SpendPacingCard({ range }: { range: { from: string; to: string } }) {
  const pacing = await getSpendPacing({ range });
  const points = pacing.daily.map(d => d.spend_egp);
  const path = sparklinePath(points, 280, 40);

  return (
    <div className="ix-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <TrendingUp size={14} className="text-emerald-600" />
        <span>Spend pacing</span>
      </div>

      <div className="flex items-center gap-4">
        <svg width="280" height="40" className="text-slate-500 dark:text-slate-400">
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <div className="text-xs tabular-nums">
          <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wide">Total / cap</div>
          <div className="text-slate-700 dark:text-slate-200 font-semibold">
            EGP {pacing.total_spend_egp.toLocaleString()} / EGP {pacing.total_cap_egp.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        {pacing.campaigns.map(c => (
          <div key={c.campaign_id} className="grid grid-cols-[180px_1fr_120px] items-center gap-3">
            <span className="truncate text-slate-600 dark:text-slate-300">
              {c.campaign_name}{c.auto_paused ? ' (auto-paused)' : ''}
            </span>
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
              <div className={`h-full ${barTint(c)}`} style={{ width: `${Math.min(100, c.pct_of_cap)}%` }} />
            </div>
            <span className="text-right tabular-nums text-slate-500 dark:text-slate-400">
              {c.pct_of_cap}% of EGP {(c.monthly_budget_cap_egp ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {pacing.campaigns.filter(c => c.pct_of_cap > 80 && !c.auto_paused).map(c => (
        <div key={`warn-${c.campaign_id}`} className="text-[11px] text-amber-700 dark:text-amber-300">
          ⚠ projected to hit cap (EGP {c.projected_egp_eom.toLocaleString()} EOM)
        </div>
      ))}
    </div>
  );
}
