'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export type CompareMode = 'yesterday' | 'last-week' | 'last-month' | 'last-year' | 'none';

export type PerfUrlState = {
  date: string | undefined;
  building: string;
  compare: CompareMode;
};

export function buildPerfUrl(current: PerfUrlState, patch: Partial<PerfUrlState>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.date) params.set('date', next.date);
  if (next.building && next.building !== 'all') params.set('building', next.building);
  if (next.compare && next.compare !== 'yesterday') params.set('compare', next.compare);
  const qs = params.toString();
  return `/beithady/analytics/performance${qs ? `?${qs}` : ''}`;
}

export function usePerfUrlState() {
  const router = useRouter();
  const search = useSearchParams();
  const current: PerfUrlState = {
    date: search.get('date') ?? undefined,
    building: search.get('building') ?? 'all',
    compare: (search.get('compare') as CompareMode | null) ?? 'yesterday',
  };
  const update = useCallback((patch: Partial<PerfUrlState>) => {
    router.push(buildPerfUrl(current, patch), { scroll: false });
  }, [router, current.date, current.building, current.compare]);
  return { state: current, update };
}
