'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const fmtK = (n: number) => `$${(n / 1000).toFixed(1)}k`;

export function StlyYoy({ payload, onHide }: Props) {
  const s = payload.stly;
  if (!s) {
    return (
      <PanelFrame label="📅 STLY · Same time last year" onHide={onHide}>
        <p className="text-[10px] text-[#6077a6]">Insufficient history yet · returns once a year-old snapshot exists.</p>
      </PanelFrame>
    );
  }
  const revPositive = s.delta_pct >= 0;
  const occPositive = s.delta_pp >= 0;
  return (
    <PanelFrame label="📅 STLY · Same time last year" onHide={onHide} drillTo={`/beithady/analytics/performance?compare=last-year`}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[#6077a6]">MTD Revenue YoY</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-semibold text-[#003462]" style={{ fontFamily: 'var(--bh-heading)' }}>{fmtK(s.current_mtd_revenue_usd)}</span>
            <span className={`text-[11px] font-semibold ${revPositive ? 'text-emerald-700' : 'text-red-700'}`}>
              {revPositive ? '▲ ' : '▼ '}{Math.abs(s.delta_pct).toFixed(1)}%
            </span>
          </div>
          <div className="text-[9px] text-[#6077a6]">STLY {fmtK(s.prior_mtd_revenue_usd)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[#6077a6]">MTD Occupancy YoY</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-semibold text-[#003462]" style={{ fontFamily: 'var(--bh-heading)' }}>{s.current_mtd_occupancy_pct.toFixed(0)}%</span>
            <span className={`text-[11px] font-semibold ${occPositive ? 'text-emerald-700' : 'text-red-700'}`}>
              {occPositive ? '▲ ' : '▼ '}{Math.abs(s.delta_pp).toFixed(1)}pp
            </span>
          </div>
          <div className="text-[9px] text-[#6077a6]">STLY {s.prior_mtd_occupancy_pct.toFixed(0)}%</div>
        </div>
      </div>
    </PanelFrame>
  );
}
