'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { BH_BUILDINGS, UNATTRIBUTED } from '@/lib/beithady/buildings';

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

export function PerBuildingFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get('building') ?? '';

  function push(building: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (building) params.set('building', building);
    else params.delete('building');
    router.push(`${pathname}?${params.toString()}`);
  }

  function chip(label: string, value: string | null) {
    const isActive = (value === null && current === '') || current === value;
    return (
      <button
        key={label}
        type="button"
        onClick={() => push(value)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${isActive ? ACTIVE : INACTIVE}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">Building</span>
      {chip('All', null)}
      {BH_BUILDINGS.map(b => chip(b.code, b.code))}
      {chip(UNATTRIBUTED, UNATTRIBUTED)}
    </div>
  );
}
