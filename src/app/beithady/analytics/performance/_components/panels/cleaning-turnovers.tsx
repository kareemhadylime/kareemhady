'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function CleaningTurnovers({ payload, onHide }: Props) {
  const rows = payload.cleaning_ops_today;
  return (
    <PanelFrame
      label={`🧹 Cleaning today (${rows.length})`}
      onHide={onHide}
      drillTo="/beithady/operations"
    >
      <ul className="flex flex-col gap-1.5 text-[10px] text-[#003462]">
        {rows.length === 0 && <li className="text-[#6077a6]">No turnovers today</li>}
        {rows.map((row, i) => (
          <li key={i}>
            <span className="font-semibold">{row.unit}</span>
            <span className="text-[#6077a6]"> · {row.building}</span>
            {row.checkout_guest && <div className="text-[#6077a6]">out: {row.checkout_guest}</div>}
            {row.checkin_guest && <div className="text-[#6077a6]">in: {row.checkin_guest}</div>}
          </li>
        ))}
      </ul>
    </PanelFrame>
  );
}
