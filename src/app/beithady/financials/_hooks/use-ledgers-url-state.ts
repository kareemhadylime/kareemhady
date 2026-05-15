'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';
import type { FinScope } from './url-state-types';
import { VALID_FIN_SCOPES } from './url-state-types';

export type LedgerKind = 'supplier' | 'owner' | 'customer' | 'landlord' | 'employee' | 'noteholder' | 'all';

export type FinLedgersUrlState = {
  scope: FinScope;
  kind: LedgerKind;
  asof: string;  // 'YYYY-MM-DD'
};

const BASE_PATH = '/beithady/financials/ledgers';

const VALID_KINDS = new Set<string>(['supplier', 'owner', 'customer', 'landlord', 'employee', 'noteholder', 'all']);
const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseFinLedgersState(search: URLSearchParams): FinLedgersUrlState {
  const scopeRaw = search.get('scope');
  const scope: FinScope = scopeRaw && VALID_FIN_SCOPES.has(scopeRaw)
    ? (scopeRaw as FinScope)
    : 'consolidated';

  const kindRaw = search.get('kind');
  const kind: LedgerKind = kindRaw && VALID_KINDS.has(kindRaw)
    ? (kindRaw as LedgerKind)
    : 'supplier';

  const asofRaw = search.get('asof');
  const asof = asofRaw && ASOF_PATTERN.test(asofRaw) ? asofRaw : todayYmd();

  return { scope, kind, asof };
}

export function serializeFinLedgersState(state: FinLedgersUrlState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('asof', state.asof);
  if (state.scope !== 'consolidated') params.set('scope', state.scope);
  if (state.kind !== 'supplier') params.set('kind', state.kind);
  return params;
}

export function buildFinLedgersUrl(
  current: FinLedgersUrlState,
  patch: Partial<FinLedgersUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinLedgersState,
    basePath: BASE_PATH,
  });
}

function makeLedgersDefaults(): FinLedgersUrlState {
  return { scope: 'consolidated', kind: 'supplier', asof: todayYmd() };
}

export function useLedgersUrlState() {
  return useBHUrlState<FinLedgersUrlState>({
    defaults: makeLedgersDefaults(),
    parse: parseFinLedgersState,
    serialize: serializeFinLedgersState,
    basePath: BASE_PATH,
  });
}
