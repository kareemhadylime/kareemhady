'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function TopMoversRibbon({ payload, onHide }: Props) {
  const movers = payload.top_movers ?? [];
  if (movers.length === 0) {
    return (
      <PanelFrame label="📈 Top movers · last 7d" onHide={onHide}>
        <p className="text-[10px] text-[#6077a6]">No notable shifts since last week.</p>
      </PanelFrame>
    );
  }
  return (
    <PanelFrame label="📈 Top movers · last 7d" onHide={onHide}>
      <ul className="flex gap-3 overflow-x-auto text-[10px] text-[#003462]">
        {movers.map((m, i) => (
          <li key={i} className="whitespace-nowrap rounded bg-[#eae9f3] px-2 py-1">
            <span className={m.delta >= 0 ? 'text-emerald-700' : 'text-red-700'}>
              {m.delta >= 0 ? '▲' : '▼'}
            </span>
            <span className="ml-1.5">{m.one_liner}</span>
          </li>
        ))}
      </ul>
    </PanelFrame>
  );
}
