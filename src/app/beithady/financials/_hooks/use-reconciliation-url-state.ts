'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';

export type FinReconciliationUrlState = {
  snapshot_id: string | undefined;
};

const BASE_PATH = '/beithady/financials/reconciliation';

export function parseFinReconciliationState(search: URLSearchParams): FinReconciliationUrlState {
  const raw = search.get('snapshot');
  return { snapshot_id: raw ?? undefined };
}

export function serializeFinReconciliationState(state: FinReconciliationUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.snapshot_id) params.set('snapshot', state.snapshot_id);
  return params;
}

export function buildFinReconciliationUrl(
  current: FinReconciliationUrlState,
  patch: Partial<FinReconciliationUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinReconciliationState,
    basePath: BASE_PATH,
  });
}

const DEFAULTS: FinReconciliationUrlState = { snapshot_id: undefined };

export function useReconciliationUrlState() {
  return useBHUrlState<FinReconciliationUrlState>({
    defaults: DEFAULTS,
    parse: parseFinReconciliationState,
    serialize: serializeFinReconciliationState,
    basePath: BASE_PATH,
  });
}
