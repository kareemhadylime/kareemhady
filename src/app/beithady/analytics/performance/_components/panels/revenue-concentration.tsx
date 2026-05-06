'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const SLICE_COLORS = ['#003462', '#6077a6', '#7a8aa3', '#b3bbcb', '#cdd5e3', '#dfe4ee'];

export function RevenueConcentration({ payload, onHide }: Props) {
  const c = payload.revenue_concentration;
  if (!c || c.by_building.length === 0) {
    return (
      <PanelFrame label="📊 Revenue concentration · MTD" onHide={onHide}>
        <p className="text-[10px] text-[#6077a6]">No data yet · waits for next snapshot.</p>
      </PanelFrame>
    );
  }
  return (
    <PanelFrame
      label="📊 Revenue concentration · MTD"
      onHide={onHide}
      drillTo="/beithady/financials?breakdown=building"
    >
      <div
        className="flex h-9 overflow-hidden rounded text-[9px] font-bold text-white"
        role="img"
        aria-label={`Building revenue mix: ${c.by_building
          .map((r) => `${r.key} ${r.pct_of_total.toFixed(0)}%`)
          .join(', ')}`}
      >
        {c.by_building.slice(0, 6).map((row, i) => {
          const w = row.pct_of_total;
          if (w < 0.5) return null;
          return (
            <div
              key={row.key}
              className="flex items-center justify-center"
              style={{ width: `${w}%`, background: SLICE_COLORS[i] ?? '#dfe4ee' }}
              title={`${row.key} · ${w.toFixed(1)}%`}
            >
              {w >= 8 ? `${row.key} ${w.toFixed(0)}%` : ''}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-[#6077a6]">
        Top 3 buildings ={' '}
        <span className="font-semibold text-[#003462]">
          {c.top3_building_pct.toFixed(0)}%
        </span>{' '}
        revenue · Top channel ={' '}
        <span
          className={`font-semibold ${
            c.top1_channel_pct >= 70 ? 'text-amber-700' : 'text-[#003462]'
          }`}
        >
          {c.top1_channel_pct.toFixed(0)}%
        </span>
        {c.top1_channel_pct >= 70 && ' (concentration risk)'}
      </p>
    </PanelFrame>
  );
}
