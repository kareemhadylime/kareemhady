'use client';
import { PanelFrame } from '../panel-frame';
import { bandForOccupancy } from '../../_lib/color-thresholds';
import { BUILDING_LABEL } from '@/lib/beithady-daily-report/types';
import type { DailyReportPayload, BuildingCode } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function ForwardOccupancyBars({ payload, onHide }: Props) {
  const rows = payload.forward_occupancy ?? [];
  return (
    <PanelFrame
      label="📅 Forward occupancy · next 30 days"
      onHide={onHide}
      drillTo="/beithady/analytics"
    >
      {rows.length === 0 ? (
        <p className="text-[10px] text-[#6077a6]">No forward-occupancy data yet · waits for next snapshot.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const band = bandForOccupancy(r.d30_pct);
            const tone =
              band === 'green'
                ? 'text-emerald-700'
                : band === 'amber'
                ? 'text-amber-700'
                : 'text-red-700';
            const label = BUILDING_LABEL[r.building as BuildingCode] ?? r.building;
            return (
              <li
                key={r.building}
                className="grid items-center gap-2 text-[10px] text-[#003462]"
                style={{ gridTemplateColumns: '64px 1fr 38px' }}
              >
                <span className="font-semibold">{label}</span>
                <div
                  className="relative h-2.5 overflow-hidden rounded bg-[#eae9f3]"
                  role="img"
                  aria-label={`${label}: ${r.d7_pct.toFixed(0)}% next 7d, ${r.d30_pct.toFixed(0)}% next 30d, ${r.d60_pct.toFixed(0)}% next 60d`}
                >
                  {/* d60 base bar (lightest, widest) */}
                  <div
                    className="absolute inset-y-0 left-0 bg-[#6077a6]/40"
                    style={{ width: `${Math.min(r.d60_pct, 100)}%` }}
                  />
                  {/* d30 mid bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-[#6077a6]"
                    style={{ width: `${Math.min(r.d30_pct, 100)}%` }}
                  />
                  {/* d7 foreground bar (darkest, narrowest) */}
                  <div
                    className="absolute inset-y-0 left-0 bg-[#003462]"
                    style={{ width: `${Math.min(r.d7_pct, 100)}%` }}
                  />
                </div>
                <span className={`text-right font-semibold ${tone}`}>
                  {r.d30_pct.toFixed(0)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </PanelFrame>
  );
}
