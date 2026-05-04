'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Plus, Copy } from 'lucide-react';

interface YearInfo {
  year_index: number;
  fiscal_year: number | null;
  status: 'draft' | 'published';
}

interface Props {
  contractId: number;
  years: YearInfo[];
  activeYearIndex: number;
}

export function YearTabs({ years, activeYearIndex }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const switchYear = (yi: number) => {
    const np = new URLSearchParams(params);
    np.set('year', String(yi));
    startTransition(() => {
      router.replace(`?${np.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-text-secondary uppercase font-semibold">Year</span>
      {years.map(y => (
        <button key={y.year_index} type="button" onClick={() => switchYear(y.year_index)}
          className={`px-3 py-1 text-xs font-semibold rounded ${
            y.year_index === activeYearIndex
              ? 'bg-accent text-white'
              : 'bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}>
          Y{y.year_index}
          <span className={`ml-1 text-[9px] ${y.status === 'published' ? 'text-green-300' : 'text-amber-300'}`}>
            {y.status === 'published' ? '✓' : 'draft'}
          </span>
        </button>
      ))}
      <button type="button" disabled
        className="px-2 py-1 text-xs border border-dashed border-border rounded text-text-secondary opacity-60 cursor-not-allowed"
        title="Add year ships with Task 24">
        <Plus size={11} className="inline" /> Add year
      </button>
      <span className="flex-1" />
      <button type="button" disabled
        className="px-2 py-1 text-xs bg-bg-tertiary border border-border rounded text-text-secondary opacity-60 cursor-not-allowed"
        title="Copy Y1 → Y2 dialog ships in Task 27">
        <Copy size={11} className="inline" /> Copy year
      </button>
      {isPending && <span className="text-[10px] text-text-secondary">…</span>}
    </div>
  );
}
