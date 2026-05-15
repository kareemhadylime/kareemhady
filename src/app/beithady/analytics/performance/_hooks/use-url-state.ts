'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';

export type CompareMode = 'yesterday' | 'last-week' | 'last-month' | 'last-year' | 'none';

export type PerfUrlState = {
  date: string | undefined;
  building: string;
  compare: CompareMode;
};

const BASE_PATH = '/beithady/analytics/performance';

const DEFAULTS: PerfUrlState = {
  date: undefined,
  building: 'all',
  compare: 'yesterday',
};

function parsePerf(search: URLSearchParams): PerfUrlState {
  return {
    date: search.get('date') ?? undefined,
    building: search.get('building') ?? 'all',
    compare: (search.get('compare') as CompareMode | null) ?? 'yesterday',
  };
}

function serializePerf(state: PerfUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.date) params.set('date', state.date);
  if (state.building && state.building !== 'all') params.set('building', state.building);
  if (state.compare && state.compare !== 'yesterday') params.set('compare', state.compare);
  return params;
}

// Kept as a named export for the existing test (`use-url-state.test.ts`)
// which exercises the pure URL-building path without spinning up next/navigation.
export function buildPerfUrl(current: PerfUrlState, patch: Partial<PerfUrlState>): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializePerf,
    basePath: BASE_PATH,
  });
}

export function usePerfUrlState() {
  return useBHUrlState<PerfUrlState>({
    defaults: DEFAULTS,
    parse: parsePerf,
    serialize: serializePerf,
    basePath: BASE_PATH,
  });
}
