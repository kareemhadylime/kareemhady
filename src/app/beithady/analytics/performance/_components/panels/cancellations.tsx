'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function Cancellations({ payload, onHide }: Props) {
  const c = payload.cancellations;
  return (
    <PanelFrame label="❌ Cancellations" onHide={onHide} drillTo="/beithady/operations/cancel-risk">
      <div
        className={`text-2xl font-semibold leading-tight ${c.count_today > 0 ? 'text-red-600' : 'text-[#003462]'}`}
        style={{ fontFamily: 'var(--bh-heading)' }}
      >
        {c.count_today}
      </div>
      <div className="text-[10px] text-[#6077a6]">
        today · MTD {c.count_mtd} · ${c.value_mtd_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </div>
    </PanelFrame>
  );
}
