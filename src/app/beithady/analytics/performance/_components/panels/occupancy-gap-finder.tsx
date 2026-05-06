'use client';
import { PanelFrame } from '../panel-frame';
import { BUILDING_LABEL } from '@/lib/beithady-daily-report/types';
import type { DailyReportPayload, BuildingCode } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function OccupancyGapFinder({ payload, onHide }: Props) {
  const gaps = payload.occupancy_gaps ?? [];
  return (
    <PanelFrame
      label="🔍 Occupancy gap finder · next 14d"
      onHide={onHide}
      drillTo="/beithady/pricing"
    >
      {gaps.length === 0 ? (
        <p className="text-[10px] text-[#6077a6]">No low-occupancy nights flagged.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-[10px] text-[#003462]">
          {gaps.slice(0, 5).map((g) => (
            <li key={`${g.date}-${g.building}`}>
              <span className="font-semibold">{g.date}</span>
              <span className="text-[#6077a6]">
                {' '}· {BUILDING_LABEL[g.building as BuildingCode] ?? g.building}
              </span>
              <span className="text-red-700"> · {g.occupancy_pct.toFixed(0)}% occupied</span>
              {g.current_price_usd != null &&
                g.market_median_usd != null &&
                g.current_price_usd > g.market_median_usd && (
                  <span className="text-amber-700"> · priced above market</span>
                )}
            </li>
          ))}
          {gaps.length > 5 && (
            <li className="text-[#6077a6]">+ {gaps.length - 5} more</li>
          )}
        </ul>
      )}
    </PanelFrame>
  );
}
