'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export function PeriodControl({
  yearOptions = [2025, 2026, 2027],
  scenarioOptions = ['initial', 'revised', 'reforecast'] as const,
  showThrough = true,
}: {
  yearOptions?: number[];
  scenarioOptions?: readonly ('initial' | 'revised' | 'reforecast')[];
  showThrough?: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const year = Number(sp.get('year') ?? new Date().getUTCFullYear());
  const scenario = sp.get('scenario') ?? 'initial';
  const through = sp.get('through') ?? String(new Date().getUTCMonth() + 1);

  const update = (k: string, v: string) => {
    const params = new URLSearchParams(sp);
    params.set(k, v);
    router.push(`${path}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
              value={year} onChange={e => update('year', e.target.value)}>
        {yearOptions.map(y => <option key={y} value={y}>{`FY ${y}`}</option>)}
      </select>
      <select className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
              value={scenario} onChange={e => update('scenario', e.target.value)}>
        {scenarioOptions.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
      </select>
      {showThrough && (
        <select className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
                value={through} onChange={e => update('through', e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{`YTD ${new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })}`}</option>
          ))}
        </select>
      )}
    </div>
  );
}
