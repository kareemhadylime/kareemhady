'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function RevenueWaterfall({ payload, onHide }: Props) {
  const w = payload.revenue_waterfall;
  if (!w || w.gross_usd <= 0) {
    return (
      <PanelFrame label="💧 Revenue waterfall · MTD" onHide={onHide}>
        <p className="text-[10px] text-[#6077a6]">No data yet · waits for next snapshot.</p>
      </PanelFrame>
    );
  }
  const max = w.gross_usd;
  return (
    <PanelFrame label="💧 Revenue waterfall · MTD" onHide={onHide} drillTo="/beithady/financials">
      <div className="grid grid-cols-4 items-end gap-1.5" style={{ height: 64 }}>
        <Bar label="Gross"   value={w.gross_usd}        max={max} color="#003462" textColor="text-[#003462]" />
        <Bar label="Fees"    value={w.channel_fees_usd} max={max} color="#dc2626" textColor="text-red-700"   sign="-" />
        <Bar label="Tax"     value={w.taxes_usd}        max={max} color="#dc2626" textColor="text-red-700"   sign="-" />
        <Bar label="Net"     value={w.net_usd}          max={max} color="#6077a6" textColor="text-[#003462]" />
      </div>
      <p className="mt-2 text-[9px] text-[#6077a6]">Fees + tax estimated (V1) · real values from Odoo in V1.5</p>
    </PanelFrame>
  );
}

function Bar({ label, value, max, color, textColor, sign = '' }: { label: string; value: number; max: number; color: string; textColor: string; sign?: string }) {
  const h = Math.max(2, (value / max) * 56);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-sm" style={{ height: h, width: '100%', background: color }} aria-hidden="true" />
      <span className="text-[8px] text-[#6077a6]">{label}</span>
      <span className={`text-[9px] font-semibold ${textColor}`}>{sign}{fmt(value)}</span>
    </div>
  );
}
