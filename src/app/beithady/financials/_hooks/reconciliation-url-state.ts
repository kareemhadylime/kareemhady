// Pure URL-state helpers for the Reconciliation page. See perf-pnl-url-state.ts
// for the rationale on the pure/hook split (Next.js 16 client-server boundary).

import { buildBHUrl } from '@/app/beithady/_components/dashboard-shell';

export type FinReconciliationUrlState = {
  snapshot_id: string | undefined;
};

export const RECONCILIATION_BASE_PATH = '/beithady/financials/reconciliation';

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
    basePath: RECONCILIATION_BASE_PATH,
  });
}

export const RECONCILIATION_DEFAULTS: FinReconciliationUrlState = { snapshot_id: undefined };
