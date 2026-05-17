'use client';
import { useState } from 'react';
import { usePaceUrlState, type PacePeriodKey } from '../_hooks/use-pace-url-state';

const PRESETS: { value: PacePeriodKey; label: string }[] = [
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-30-days', label: 'Last 30 days' },
];

export function PeriodPicker({ currentLabel }: { currentLabel: string }) {
  const { state, update } = usePaceUrlState();
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const applyCustom = () => {
    if (!from || !to || from > to) return;
    update({ period: `custom:${from}:${to}` });
    setCustomOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-[#6077a6]">Period</span>
      <div className="flex items-center gap-1 rounded-md border border-[#003462]/10 bg-white p-0.5">
        {PRESETS.map((p) => {
          const active = state.period === p.value;
          return (
            <button
              key={p.value}
              onClick={() => update({ period: p.value })}
              className={`px-2.5 py-1 rounded text-xs transition motion-reduce:transition-none ${
                active ? 'bg-[#003462] text-white' : 'text-[#003462] hover:bg-[#003462]/5'
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          onClick={() => setCustomOpen((v) => !v)}
          className={`px-2.5 py-1 rounded text-xs transition motion-reduce:transition-none ${
            state.period.startsWith('custom:') ? 'bg-[#003462] text-white' : 'text-[#003462] hover:bg-[#003462]/5'
          }`}
        >
          Custom
        </button>
      </div>
      <span className="text-xs text-[#6077a6] hidden md:inline">{currentLabel}</span>
      {customOpen && (
        <div className="absolute right-4 top-16 z-10 rounded-md border border-[#003462]/10 bg-white p-3 shadow-lg flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-xs px-2 py-1 rounded border border-[#003462]/10 text-[#003462]"
          />
          <span className="text-[#6077a6] text-xs">—</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-xs px-2 py-1 rounded border border-[#003462]/10 text-[#003462]"
          />
          <button
            onClick={applyCustom}
            className="text-xs px-2.5 py-1 bg-[#003462] text-white rounded hover:bg-[#003462]/90 transition motion-reduce:transition-none"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
