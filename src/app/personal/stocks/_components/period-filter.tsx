'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { Period } from '@/lib/personal/stocks/types';

const OPTIONS: Period[] = ['2024', '2025', '2026', 'all'];

export function PeriodFilter() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const active = (sp.get('period') ?? '2026') as Period;
  return (
    <div className="flex gap-1.5">
      {OPTIONS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => {
            const u = new URLSearchParams(sp.toString());
            u.set('period', p);
            router.replace(`${path}?${u.toString()}`);
          }}
          className={`text-[11px] px-2.5 py-1 rounded ${
            active === p
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-300 text-slate-600'
          }`}
        >
          {p === 'all' ? 'All time' : p}
        </button>
      ))}
    </div>
  );
}
