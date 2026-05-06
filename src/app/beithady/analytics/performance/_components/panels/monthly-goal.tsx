'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const fmtK = (n: number) => `$${(n / 1000).toFixed(1)}k`;

export function MonthlyGoal({ payload, onHide }: Props) {
  const g = payload.goal;
  if (!g) {
    return (
      <PanelFrame label="🎯 Monthly goal" onHide={onHide}>
        <p className="text-[10px] text-[#6077a6]">No goal set · admin config in V1.5.</p>
      </PanelFrame>
    );
  }
  const pct = Math.min(100, g.pct_of_target);
  const onPace = pct >= ((30 - g.days_remaining) / 30) * 100;
  return (
    <PanelFrame label={`🎯 Monthly goal · ${payload.month_label}`} onHide={onHide}>
      <div className="text-[10px] text-[#003462]">
        {fmtK(g.current_mtd_usd)} of <span className="font-semibold">{fmtK(g.monthly_revenue_target_usd)}</span> goal
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-[#eae9f3]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full bg-gradient-to-r from-[#003462] to-[#6077a6]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-[9px] text-[#6077a6]">
        {pct.toFixed(0)}% · {g.days_remaining}d left · projecting {fmtK(g.projected_eom_usd)} {onPace ? '✓' : ''}
      </p>
    </PanelFrame>
  );
}
