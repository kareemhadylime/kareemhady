'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';

export type FinPerfPeriod =
  | { kind: 'preset'; id: 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' }
  | { kind: 'month'; ym: string };

export type FinPerfScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';

export type FinPerfBuilding = 'all' | 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';

export type FinPerfUrlState = {
  scope: FinPerfScope;
  period: FinPerfPeriod;
  building: FinPerfBuilding;
  lob?: string;
};

const BASE_PATH = '/beithady/financials/performance';

const DEFAULTS: FinPerfUrlState = {
  scope: 'consolidated',
  period: { kind: 'preset', id: 'last_month' },
  building: 'all',
};

const VALID_PRESETS = new Set([
  'this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year',
]);

const VALID_SCOPES = new Set(['consolidated', 'egypt', 'dubai', 'a1']);
const VALID_BUILDINGS = new Set(['all', 'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'OTHER']);

export function parseFinPerfState(search: URLSearchParams): FinPerfUrlState {
  const scopeRaw = search.get('scope');
  const scope: FinPerfScope = scopeRaw && VALID_SCOPES.has(scopeRaw)
    ? (scopeRaw as FinPerfScope)
    : 'consolidated';

  // month takes precedence over preset (operator picked an arbitrary month)
  const month = search.get('month');
  let period: FinPerfPeriod;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    period = { kind: 'month', ym: month };
  } else {
    const preset = search.get('preset');
    period = preset && VALID_PRESETS.has(preset)
      ? { kind: 'preset', id: preset as FinPerfPeriod extends { kind: 'preset'; id: infer K } ? K : never }
      : { kind: 'preset', id: 'last_month' };
  }

  const buildingRaw = search.get('building');
  const building: FinPerfBuilding = buildingRaw && VALID_BUILDINGS.has(buildingRaw)
    ? (buildingRaw as FinPerfBuilding)
    : 'all';

  const lob = search.get('lob') ?? undefined;

  return { scope, period, building, lob };
}

export function serializeFinPerfState(state: FinPerfUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.scope !== 'consolidated') params.set('scope', state.scope);
  if (state.period.kind === 'month') {
    params.set('month', state.period.ym);
  } else if (state.period.id !== 'last_month') {
    params.set('preset', state.period.id);
  }
  if (state.building !== 'all') params.set('building', state.building);
  if (state.lob) params.set('lob', state.lob);
  return params;
}

// Pure helper exported for unit testing without next/navigation.
export function buildFinPerfUrl(
  current: FinPerfUrlState,
  patch: Partial<FinPerfUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinPerfState,
    basePath: BASE_PATH,
  });
}

export function usePerfPnlUrlState() {
  return useBHUrlState<FinPerfUrlState>({
    defaults: DEFAULTS,
    parse: parseFinPerfState,
    serialize: serializeFinPerfState,
    basePath: BASE_PATH,
  });
}
