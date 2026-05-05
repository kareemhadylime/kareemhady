'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { ReportMode } from '@/lib/fmplus/budget/report/types';

const MODES: { value: ReportMode; label: string }[] = [
  { value: 'pre', label: 'Pre-contract' },
  { value: 'signoff', label: 'Sign-off' },
  { value: 'customer', label: 'Customer' },
  { value: 'snapshot', label: 'Snapshot' },
];

interface ReportModeToggleProps {
  current: ReportMode;
}

export function ReportModeToggle({ current }: ReportModeToggleProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();

  function handleModeChange(mode: ReportMode) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('mode', mode);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
      {MODES.map(({ value, label }) => {
        const isActive = current === value;
        return (
          <button
            key={value}
            onClick={() => handleModeChange(value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              isActive
                ? 'bg-fmplus-yellow text-fmplus-black font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
