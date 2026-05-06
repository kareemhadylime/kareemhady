'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface Props {
  mode: 'projects' | 'yoy';
}

export function YoyModeToggle({ mode }: Props) {
  const params = useSearchParams();
  const service = params.get('service') ?? 'hk';

  return (
    <div className="inline-flex bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 gap-0.5">
      <Link href={`?mode=projects&service=${service}`}
        className={`px-3 py-1 text-xs font-semibold rounded ${mode === 'projects' ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}>
        Cross-project
      </Link>
      <Link href={`?mode=yoy&service=${service}`}
        className={`px-3 py-1 text-xs font-semibold rounded ${mode === 'yoy' ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}>
        Year-vs-Year
      </Link>
    </div>
  );
}
