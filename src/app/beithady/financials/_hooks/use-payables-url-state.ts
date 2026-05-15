'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';
import type { FinScope } from './url-state-types';
import { VALID_FIN_SCOPES } from './url-state-types';

export type FinPayablesUrlState = {
  scope: FinScope;
  asof: string;  // 'YYYY-MM-DD'
};

const BASE_PATH = '/beithady/financials/payables';

const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseFinPayablesState(search: URLSearchParams): FinPayablesUrlState {
  const scopeRaw = search.get('scope');
  const scope: FinScope = scopeRaw && VALID_FIN_SCOPES.has(scopeRaw)
    ? (scopeRaw as FinScope)
    : 'consolidated';

  const asofRaw = search.get('asof');
  const asof = asofRaw && ASOF_PATTERN.test(asofRaw) ? asofRaw : todayYmd();

  return { scope, asof };
}

export function serializeFinPayablesState(state: FinPayablesUrlState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('asof', state.asof);
  if (state.scope !== 'consolidated') params.set('scope', state.scope);
  return params;
}

export function buildFinPayablesUrl(
  current: FinPayablesUrlState,
  patch: Partial<FinPayablesUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinPayablesState,
    basePath: BASE_PATH,
  });
}

// `defaults` is built per-call (NOT module-scope) so `asof` reflects today
// at hook invocation, not at module load. `useBHUrlState` only reads
// parse/serialize/basePath for memo deps, so the per-call object is harmless.
function makePayablesDefaults(): FinPayablesUrlState {
  return { scope: 'consolidated', asof: todayYmd() };
}

export function usePayablesUrlState() {
  return useBHUrlState<FinPayablesUrlState>({
    defaults: makePayablesDefaults(),
    parse: parseFinPayablesState,
    serialize: serializeFinPayablesState,
    basePath: BASE_PATH,
  });
}
