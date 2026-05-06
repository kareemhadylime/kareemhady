'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function CheckInsPayment({ payload, onHide }: Props) {
  const cp = payload.checkin_payment;
  if (!cp) {
    return (
      <PanelFrame label="💰 Check-ins w/ payment" onHide={onHide}>
        <div className="text-2xl font-semibold text-[#6077a6]" style={{ fontFamily: 'var(--bh-heading)' }}>—</div>
        <div className="text-[10px] text-[#6077a6]">no data</div>
      </PanelFrame>
    );
  }
  const y = cp.yesterday;
  const m = cp.mtd;
  return (
    <PanelFrame label="💰 Check-ins w/ payment" onHide={onHide} drillTo="/beithady/operations">
      <div className="text-2xl font-semibold text-emerald-600 leading-tight" style={{ fontFamily: 'var(--bh-heading)' }}>
        {y.with_payment}/{y.checkins}
      </div>
      <div className="text-[10px] text-[#6077a6]">
        {y.pct.toFixed(0)}% yest · {m.with_payment}/{m.checkins} MTD
      </div>
    </PanelFrame>
  );
}
