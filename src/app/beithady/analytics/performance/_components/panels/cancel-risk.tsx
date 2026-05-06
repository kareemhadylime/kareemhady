'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function CancelRisk({ payload, onHide }: Props) {
  const c = payload.cancel_risk;
  if (!c || c.count === 0) {
    return (
      <PanelFrame
        label="⚠ Cancel risk · next 21d"
        onHide={onHide}
        drillTo="/beithady/operations/cancel-risk?min=50&days=21"
      >
        <div
          className="text-2xl font-semibold text-emerald-600 leading-tight"
          style={{ fontFamily: 'var(--bh-heading)' }}
        >
          0
        </div>
        <div className="text-[10px] text-[#6077a6]">no flagged reservations</div>
      </PanelFrame>
    );
  }
  return (
    <PanelFrame
      label="⚠ Cancel risk · next 21d"
      onHide={onHide}
      drillTo="/beithady/operations/cancel-risk?min=50&days=21"
    >
      <div
        className="text-2xl font-semibold text-amber-600 leading-tight"
        style={{ fontFamily: 'var(--bh-heading)' }}
      >
        {c.count}
      </div>
      <div className="text-[10px] text-[#6077a6]">
        ${c.value_at_risk_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })} at risk · score ≥50
      </div>
      <ul className="mt-2 flex flex-col gap-0.5 text-[10px] text-[#003462]">
        {c.reservations.slice(0, 3).map((r) => (
          <li key={r.code ?? `${r.unit}-${r.check_in}`}>
            <span className="font-semibold">{r.unit}</span>
            <span className="text-[#6077a6]">
              {' '}· {r.check_in ?? '—'} · {r.score}
            </span>
          </li>
        ))}
      </ul>
    </PanelFrame>
  );
}
