// src/app/fmplus/performance/_components/period-chips.tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

interface SimpleChip { id: Exclude<PeriodChip, 'prev-month' | 'custom'>; label: string; }
const SIMPLE_CHIPS: SimpleChip[] = [
  { id: 'last-3',       label: 'Last 3 Months' },
  { id: 'last-quarter', label: 'Last Quarter' },
  { id: 'ytd',          label: 'YTD' },
  { id: 'last-year',    label: 'Last Year' },
];

const MAX_PREV_MONTHS = 24;     // 2 years of selectable history

function monthLabelForOffset(offset: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export function PeriodChips({ resolvedLabel }: { resolvedLabel: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const current = (sp.get('chip') as PeriodChip) ?? 'prev-month';
  const currentOffset = Number(sp.get('offset') ?? '1') || 1;
  const compare = sp.get('compare') === '1';

  const [showPrevMenu, setShowPrevMenu] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const prevMenuRef = useRef<HTMLDivElement>(null);

  // Click-outside for the prev-month dropdown
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (showPrevMenu && prevMenuRef.current && !prevMenuRef.current.contains(e.target as Node)) {
        setShowPrevMenu(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showPrevMenu]);

  function setChip(chip: PeriodChip, extras?: Record<string, string>) {
    const next = new URLSearchParams(sp.toString());
    next.set('chip', chip);
    if (chip !== 'custom') { next.delete('from'); next.delete('to'); }
    if (chip !== 'prev-month') next.delete('offset');
    if (extras) for (const [k, v] of Object.entries(extras)) next.set(k, v);
    router.replace(`${path}?${next.toString()}`);
  }

  function pickPrevMonth(offset: number) {
    setShowPrevMenu(false);
    setChip('prev-month', { offset: String(offset) });
  }

  function applyCustom(from: string, to: string) {
    if (!from || !to) return;
    setShowCustom(false);
    const next = new URLSearchParams(sp.toString());
    next.set('chip', 'custom'); next.set('from', from); next.set('to', to);
    next.delete('offset');
    router.replace(`${path}?${next.toString()}`);
  }

  function toggleCompare() {
    const next = new URLSearchParams(sp.toString());
    if (compare) next.delete('compare'); else next.set('compare', '1');
    router.replace(`${path}?${next.toString()}`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1">
        {/* Previous Month — chip with dropdown */}
        <div className="relative" ref={prevMenuRef}>
          <button
            onClick={() => setShowPrevMenu(s => !s)}
            className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition flex items-center justify-between ${
              current === 'prev-month'
                ? 'bg-fmplus-yellow text-fmplus-black font-semibold'
                : 'hover:bg-slate-700/50 text-slate-300'
            }`}
          >
            <span>Previous Month{current === 'prev-month' ? ` · ${monthLabelForOffset(currentOffset)}` : ''}</span>
            <ChevronDown size={14} className={`transition-transform ${showPrevMenu ? 'rotate-180' : ''}`} />
          </button>
          {showPrevMenu && (
            <div className="absolute left-3 right-3 top-full mt-1 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {Array.from({ length: MAX_PREV_MONTHS }, (_, i) => i + 1).map(offset => (
                <button
                  key={offset}
                  onClick={() => pickPrevMonth(offset)}
                  className={`w-full text-left text-sm px-3 py-1.5 transition ${
                    current === 'prev-month' && currentOffset === offset
                      ? 'bg-fmplus-yellow text-fmplus-black font-semibold'
                      : 'text-slate-300 hover:bg-slate-700/50 hover:text-fmplus-yellow'
                  }`}
                >
                  {monthLabelForOffset(offset)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Other full-period chips */}
        {SIMPLE_CHIPS.map(c => (
          <button
            key={c.id}
            onClick={() => setChip(c.id)}
            className={`text-left text-sm px-3 py-1.5 rounded-lg transition ${
              current === c.id
                ? 'bg-fmplus-yellow text-fmplus-black font-semibold'
                : 'hover:bg-slate-700/50 text-slate-300'
            }`}
          >
            {c.label}
          </button>
        ))}

        {/* Custom — opens the popover; defensively falls back if user clicks but never picks */}
        <button
          onClick={() => setShowCustom(s => !s)}
          className={`text-left text-sm px-3 py-1.5 rounded-lg transition ${
            current === 'custom'
              ? 'bg-fmplus-yellow text-fmplus-black font-semibold'
              : 'hover:bg-slate-700/50 text-slate-300'
          }`}
        >
          Custom
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-300 px-3">
        <input type="checkbox" checked={compare} onChange={toggleCompare} className="accent-fmplus-yellow" />
        Compare to prior period
      </label>
      <p className="text-[11px] text-slate-300 px-3 mt-1">{resolvedLabel}</p>

      {showCustom && <CustomRange onApply={applyCustom} />}
    </div>
  );
}

function CustomRange({ onApply }: { onApply: (from: string, to: string) => void }) {
  // Snap to whole-month boundaries: from = 1st of selected month, to = last day of selected month.
  // Two month inputs (YYYY-MM) instead of full date pickers, so user can only pick whole months.
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');

  function apply() {
    if (!fromMonth || !toMonth) return;
    const [fy, fm] = fromMonth.split('-').map(Number);
    const [ty, tm] = toMonth.split('-').map(Number);
    if (!fy || !fm || !ty || !tm) return;
    const from = `${fy}-${String(fm).padStart(2, '0')}-01`;
    const lastDay = new Date(ty, tm, 0).getDate();
    const to = `${ty}-${String(tm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    onApply(from, to);
  }

  return (
    <div className="px-3 py-2 space-y-2 bg-slate-800/50 rounded-lg">
      <label className="block text-[11px] text-slate-400">From month</label>
      <input type="month" value={fromMonth} onChange={e => setFromMonth(e.target.value)} className="w-full bg-slate-900 text-slate-100 px-2 py-1 rounded text-sm" />
      <label className="block text-[11px] text-slate-400">To month</label>
      <input type="month" value={toMonth} onChange={e => setToMonth(e.target.value)} className="w-full bg-slate-900 text-slate-100 px-2 py-1 rounded text-sm" />
      <button onClick={apply} className="w-full bg-fmplus-yellow text-fmplus-black text-sm font-semibold py-1.5 rounded">
        Apply
      </button>
    </div>
  );
}
