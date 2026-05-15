// src/app/beithady/gallery/youtube/picker/_components/picker-filters.tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

export function PickerFilters({
  buildings,
}: {
  buildings: string[];
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();

  const set = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value && value !== 'all' && value !== '') next.set(key, value);
    else next.delete(key);
    router.push(`${path}?${next.toString()}`, { scroll: false });
  }, [router, path, sp]);

  const format = sp.get('format') ?? 'all';
  const building = sp.get('building') ?? 'all';
  const search = sp.get('search') ?? '';
  const sort = sp.get('sort') ?? 'recent';

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="inline-flex items-center gap-1">
        Format
        <select className="ix-input" value={format} onChange={e => set('format', e.target.value)}>
          <option value="all">All</option>
          <option value="shorts">Shorts (≤60s)</option>
          <option value="longform">Long-form</option>
        </select>
      </label>
      <label className="inline-flex items-center gap-1">
        Building
        <select className="ix-input" value={building} onChange={e => set('building', e.target.value)}>
          <option value="all">All</option>
          {buildings.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <label className="inline-flex items-center gap-1">
        Search
        <input className="ix-input" value={search}
               onChange={e => set('search', e.target.value)}
               placeholder="Title…" />
      </label>
      <label className="inline-flex items-center gap-1">
        Sort
        <select className="ix-input" value={sort} onChange={e => set('sort', e.target.value)}>
          <option value="recent">Recent</option>
          <option value="views">Views</option>
          <option value="likes">Likes</option>
        </select>
      </label>
    </div>
  );
}
