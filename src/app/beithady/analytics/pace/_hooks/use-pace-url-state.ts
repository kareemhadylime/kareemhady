'use client';
import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { PaceCountry, PaceFilters } from '@/lib/pace-report/types';

export type PacePeriodKey = 'this-month' | 'last-month' | 'last-30-days' | string; // `custom:YYYY-MM-DD:YYYY-MM-DD`

export type PaceUrlState = {
  period: PacePeriodKey;
  filters: PaceFilters;
};

const VALID_COUNTRY: PaceCountry[] = ['EG', 'AE'];

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parsePaceSearchParams(
  search: Record<string, string | string[] | undefined>,
): PaceUrlState {
  const first = (k: string) => {
    const v = search[k];
    if (Array.isArray(v)) return v[0];
    return v ?? undefined;
  };
  const period = first('period') || 'this-month';
  const countries = parseCsv(first('country'))
    .filter((c): c is PaceCountry => (VALID_COUNTRY as string[]).includes(c));
  const cities = parseCsv(first('city'));
  const tags = parseCsv(first('tag'));
  const listingIds = parseCsv(first('listing'));
  const includeInactive = first('inactive') === '1';
  const includeHistorical = first('historical') === '1';
  return {
    period,
    filters: { countries, cities, tags, listingIds, includeInactive, includeHistorical },
  };
}

export function paceStateToSearchParams(state: PaceUrlState): URLSearchParams {
  const usp = new URLSearchParams();
  if (state.period !== 'this-month') usp.set('period', state.period);
  if (state.filters.countries.length) usp.set('country', state.filters.countries.join(','));
  if (state.filters.cities.length) usp.set('city', state.filters.cities.join(','));
  if (state.filters.tags.length) usp.set('tag', state.filters.tags.join(','));
  if (state.filters.listingIds.length) usp.set('listing', state.filters.listingIds.join(','));
  if (state.filters.includeInactive) usp.set('inactive', '1');
  if (state.filters.includeHistorical) usp.set('historical', '1');
  return usp;
}

/** Client-side hook for reading + updating URL state. */
export function usePaceUrlState(): {
  state: PaceUrlState;
  update: (patch: Partial<PaceUrlState> | ((s: PaceUrlState) => PaceUrlState)) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const record: Record<string, string> = {};
  sp.forEach((v, k) => { record[k] = v; });
  const state = parsePaceSearchParams(record);
  const update = useCallback(
    (patch: Partial<PaceUrlState> | ((s: PaceUrlState) => PaceUrlState)) => {
      const next = typeof patch === 'function'
        ? patch(state)
        : { ...state, ...patch, filters: { ...state.filters, ...(patch.filters || {}) } };
      const qs = paceStateToSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, state],
  );
  return { state, update };
}
