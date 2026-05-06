'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { PerfUrlState } from '../_hooks/use-url-state';

type Props = {
  state: PerfUrlState;
  generatedAt: string;
  reportDate: string;
  hiddenCount: number;
  onCustomizeClick: () => void;
  onDateChange: (date: string) => void;
};

export function TopBar({ state, generatedAt, reportDate, hiddenCount, onCustomizeClick, onDateChange }: Props) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const cairoTime = new Date(generatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
  const dateLabel = new Date(reportDate + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="border-b border-[#003462]/10 bg-white px-6 py-5">
      <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#6077a6]/70">BEIT HADY · ANALYTICS · PERFORMANCE</div>
      {/* Title row: wordmark + heading; below 900px the actions wrap to a 3rd row via flex-wrap */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-y-3">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/beithady/Wordmark-03.png"
            alt="Beit Hady"
            width={120}
            height={48}
            className="h-9 w-auto"
            priority
          />
          <span className="text-[#6077a6]/40" aria-hidden="true">·</span>
          <h1 className="text-2xl font-semibold tracking-tight text-[#003462]" style={{ fontFamily: 'var(--bh-heading)' }}>
            Performance Dashboard
          </h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-md border border-[#003462]/15 bg-white px-3 py-1.5 text-xs text-[#003462] hover:bg-[#eae9f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
          >
            ⤓ Export PDF
          </button>
          <button
            type="button"
            onClick={onCustomizeClick}
            className="rounded-md border border-[#003462] bg-[#003462] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#003462]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
          >
            ⚙ Customize{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#6077a6]">
        <span>{dateLabel} · Data as of {cairoTime} Cairo</span>
        <button
          type="button"
          onClick={() => setShowDatePicker((v) => !v)}
          className="rounded-full border border-[#003462] bg-[#003462] px-3 py-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
          aria-label={`Change report date (currently ${state.date ?? 'today'})`}
        >
          📅 {state.date ?? 'today'}
        </button>
        {showDatePicker && (
          <input
            type="date"
            defaultValue={state.date ?? reportDate}
            onChange={(e) => { onDateChange(e.target.value); setShowDatePicker(false); }}
            className="rounded border border-[#003462]/20 bg-white px-2 py-1 text-[#003462] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40"
            aria-label="Pick report date"
          />
        )}
      </div>
    </div>
  );
}
