'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { YearInfo } from '@/lib/fmplus/budget/report/types';

interface ReportYearPickerProps {
  years: YearInfo[];
  currentYearId: number;
}

export function ReportYearPicker({ years, currentYearId }: ReportYearPickerProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();

  if (years.length <= 1) {
    const y = years[0];
    if (!y) return null;
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400 font-body">
        Y{y.year_index}{y.fiscal_year ? ` (FY ${y.fiscal_year})` : ''}
        {' · '}
        <span className={y.status === 'published' ? 'text-green-500' : 'text-amber-500'}>{y.status}</span>
      </span>
    );
  }

  function handleChange(yearId: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('year', yearId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 dark:text-slate-400">Year:</span>
      <select
        value={currentYearId}
        onChange={(e) => handleChange(e.target.value)}
        className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 font-body"
      >
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            Y{y.year_index}
            {y.fiscal_year ? ` (FY ${y.fiscal_year})` : ''}
            {' '}— {y.scenario}
            {y.status === 'draft' ? ' [DRAFT]' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
