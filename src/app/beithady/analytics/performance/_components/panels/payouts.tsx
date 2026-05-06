'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function Payouts({ payload, onHide }: Props) {
  const p = payload.payouts;
  return (
    <PanelFrame label="💸 Payouts · MTD" onHide={onHide} drillTo="/beithady/financials">
      <div className="text-2xl font-semibold text-emerald-600 leading-tight" style={{ fontFamily: 'var(--bh-heading)' }}>
        ${p.mtd_received_total_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </div>
      <div className="mt-1 text-[10px] text-[#6077a6] leading-relaxed">
        Airbnb ${p.mtd_received_airbnb_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })} ·
        Stripe ${p.mtd_received_stripe_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        <br />
        Settling today ${p.expected_today_total_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })} ·
        Next 7d ${p.next_7d_projected_total_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </div>
    </PanelFrame>
  );
}
