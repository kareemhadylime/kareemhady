// Pure URL-state helpers for the Balance Sheet page. See perf-pnl-url-state.ts
// for the rationale on the pure/hook split (Next.js 16 client-server boundary).

import { buildBHUrl } from '@/app/beithady/_components/dashboard-shell';
import type { FinScope } from './url-state-types';
import { VALID_FIN_SCOPES } from './url-state-types';

// Backward-compat alias; `FinScope` from shared types is the source of truth.
export type FinBSScope = FinScope;

export type FinBSBuilding = 'all' | 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';

export type FinBSUrlState = {
  scope: FinBSScope;
  asof: string;  // 'YYYY-MM-DD'
  building: FinBSBuilding;
};

export const BS_BASE_PATH = '/beithady/financials/balance-sheet';

const VALID_BUILDINGS = new Set(['all', 'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'OTHER']);
const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseFinBSState(search: URLSearchParams): FinBSUrlState {
  const scopeRaw = search.get('scope');
  const scope: FinBSScope = scopeRaw && VALID_FIN_SCOPES.has(scopeRaw)
    ? (scopeRaw as FinBSScope)
    : 'consolidated';

  const asofRaw = search.get('asof');
  const asof = asofRaw && ASOF_PATTERN.test(asofRaw) ? asofRaw : todayYmd();

  const buildingRaw = search.get('building');
  const building: FinBSBuilding = buildingRaw && VALID_BUILDINGS.has(buildingRaw)
    ? (buildingRaw as FinBSBuilding)
    : 'all';

  return { scope, asof, building };
}

export function serializeFinBSState(state: FinBSUrlState): URLSearchParams {
  const params = new URLSearchParams();
  // asof is always written so the URL is reproducible (today changes daily).
  params.set('asof', state.asof);
  if (state.scope !== 'consolidated') params.set('scope', state.scope);
  if (state.building !== 'all') params.set('building', state.building);
  return params;
}

export function buildFinBSUrl(
  current: FinBSUrlState,
  patch: Partial<FinBSUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinBSState,
    basePath: BS_BASE_PATH,
  });
}

// `defaults` is built per-call (NOT module-scope) so `asof` reflects today
// at hook invocation, not at module load.
export function makeBSDefaults(): FinBSUrlState {
  return { scope: 'consolidated', asof: todayYmd(), building: 'all' };
}
