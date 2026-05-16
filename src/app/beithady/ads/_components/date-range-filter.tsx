'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const PRESETS: Array<{ key: '7d' | '30d' | '90d' | 'lifetime'; label: string }> = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'lifetime', label: 'Lifetime' },
];

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const currentPreset = (sp.get('preset') as '7d' | '30d' | '90d' | 'lifetime' | 'custom' | null) ?? '30d';
  const currentFrom = sp.get('from') ?? '';
  const currentTo = sp.get('to') ?? '';
  const compare = sp.get('compare') === '1';

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function setPreset(key: string) {
    push({ preset: key, from: null, to: null });
  }

  function setCustom() {
    push({ preset: 'custom' });
  }

  return (
    <div className="ix-card p-3 flex flex-wrap items-center gap-3 text-xs">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">Date range</span>
      {PRESETS.map(p => {
        const isActive = currentPreset === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${isActive ? ACTIVE : INACTIVE}`}
          >
            {p.label}
          </button>
        );
      })}
      <span className="text-slate-300 dark:text-slate-700">|</span>
      <input
        type="date"
        value={currentFrom}
        onChange={e => push({ from: e.target.value, preset: 'custom' })}
        className="ix-input !min-h-0 !py-1 text-xs w-[140px]"
        aria-label="from date"
      />
      <span className="text-slate-400">→</span>
      <input
        type="date"
        value={currentTo}
        onChange={e => push({ to: e.target.value, preset: 'custom' })}
        className="ix-input !min-h-0 !py-1 text-xs w-[140px]"
        aria-label="to date"
      />
      <button type="button" onClick={setCustom} className="ix-btn-ghost text-xs">Apply</button>
      <span className="text-slate-300 dark:text-slate-700">|</span>
      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={compare}
          onChange={e => push({ compare: e.target.checked ? '1' : null })}
          aria-label="compare to prior period"
          className="accent-emerald-600"
        />
        <span className="text-slate-600 dark:text-slate-300">Compare to prior period</span>
      </label>
    </div>
  );
}
