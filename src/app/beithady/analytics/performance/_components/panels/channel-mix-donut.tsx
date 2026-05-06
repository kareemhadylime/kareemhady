'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const SLICE_COLORS = ['#003462', '#6077a6', '#b3bbcb', '#7a8aa3', '#cdd5e3', '#dfe4ee'];

export function ChannelMixDonut({ payload, onHide }: Props) {
  const slices = (payload.channel_mix ?? []).slice(0, 6);
  return (
    <PanelFrame label="📊 Channel Mix · MTD" onHide={onHide} drillTo="/beithady/financials?breakdown=channel">
      <div className="flex items-center gap-4">
        <Donut slices={slices} />
        <ul className="flex flex-col gap-1 text-[10px] text-[#003462]">
          {slices.map((s, i) => (
            <li key={s.channel} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: SLICE_COLORS[i] }} aria-hidden="true" />
              <span className="font-medium">{s.channel}</span>
              <span className="text-[#6077a6]">{s.pct.toFixed(1)}%</span>
            </li>
          ))}
          {slices.length === 0 && <li className="text-[#6077a6]">No channel data</li>}
        </ul>
      </div>
    </PanelFrame>
  );
}

function Donut({ slices }: { slices: { channel: string; pct: number }[] }) {
  const size = 76;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eae9f3" strokeWidth={stroke} />
      {slices.map((s, i) => {
        const len = (s.pct / 100) * c;
        const dasharray = `${len} ${c - len}`;
        const node = (
          <circle
            key={s.channel}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={SLICE_COLORS[i] || '#dfe4ee'}
            strokeWidth={stroke}
            strokeDasharray={dasharray}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += len;
        return node;
      })}
    </svg>
  );
}
