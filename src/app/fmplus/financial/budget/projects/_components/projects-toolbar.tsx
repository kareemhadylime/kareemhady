'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Search } from 'lucide-react';

export function ProjectsToolbar({ currentSearch }: { currentSearch: { q: string; service: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
      <label className="relative">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
        <input
          type="search"
          placeholder="Search project / customer..."
          defaultValue={currentSearch.q}
          onBlur={(e) => update('q', e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') update('q', e.currentTarget.value); }}
          className="pl-7 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded w-56"
        />
      </label>
      <select
        value={currentSearch.service}
        onChange={(e) => update('service', e.currentTarget.value)}
        className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5"
      >
        <option value="">All services</option>
        <option value="hk">HK</option>
        <option value="mep">MEP</option>
        <option value="landscape">Landscape</option>
        <option value="security">Security</option>
        <option value="pest_ctrl">Pest Ctrl</option>
        <option value="waste_mgmt">Waste</option>
        <option value="back_office">Back Office</option>
      </select>
      {isPending && <span className="text-[10px] text-slate-500 dark:text-slate-400">…</span>}
    </div>
  );
}
