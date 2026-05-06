// src/app/fmplus/performance/_components/period-chips.tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState } from 'react';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

const CHIPS: { id: PeriodChip; label: string }[] = [
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'last-3', label: 'Last 3 Months' },
  { id: 'qtd', label: 'QTD' },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Custom' },
];

export function PeriodChips({ resolvedLabel }: { resolvedLabel: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const current = (sp.get('chip') as PeriodChip) ?? 'last-month';
  const compare = sp.get('compare') === '1';
  const [showCustom, setShowCustom] = useState(false);

  function setChip(chip: PeriodChip) {
    const next = new URLSearchParams(sp.toString());
    next.set('chip', chip);
    if (chip !== 'custom') { next.delete('from'); next.delete('to'); }
    router.replace(`${path}?${next.toString()}`);
    setShowCustom(chip === 'custom');
  }

  function toggleCompare() {
    const next = new URLSearchParams(sp.toString());
    if (compare) next.delete('compare'); else next.set('compare', '1');
    router.replace(`${path}?${next.toString()}`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1">
        {CHIPS.map(c => (
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
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-300 px-3">
        <input type="checkbox" checked={compare} onChange={toggleCompare} className="accent-fmplus-yellow" />
        Compare to prior period
      </label>
      <p className="text-[11px] text-slate-400 px-3 mt-1">{resolvedLabel}</p>
      {showCustom && (
        <CustomRange
          onApply={(from, to) => {
            const next = new URLSearchParams(sp.toString());
            next.set('chip', 'custom'); next.set('from', from); next.set('to', to);
            router.replace(`${path}?${next.toString()}`);
            setShowCustom(false);
          }}
        />
      )}
    </div>
  );
}

function CustomRange({ onApply }: { onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return (
    <div className="px-3 py-2 space-y-2 bg-slate-800/50 rounded-lg">
      <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full bg-slate-900 text-slate-100 px-2 py-1 rounded text-sm" />
      <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full bg-slate-900 text-slate-100 px-2 py-1 rounded text-sm" />
      <button onClick={() => from && to && onApply(from, to)} className="w-full bg-fmplus-yellow text-fmplus-black text-sm font-semibold py-1.5 rounded">
        Apply
      </button>
    </div>
  );
}
