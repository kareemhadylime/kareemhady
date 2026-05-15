'use client';
import { useBHUrlState } from '@/app/beithady/_components/dashboard-shell';
import {
  RECONCILIATION_BASE_PATH,
  RECONCILIATION_DEFAULTS,
  parseFinReconciliationState,
  serializeFinReconciliationState,
  type FinReconciliationUrlState,
} from './reconciliation-url-state';

// Re-export pure helpers + types so consumers can keep importing from this
// module path. Pure logic lives in `./reconciliation-url-state.ts`.
export type { FinReconciliationUrlState } from './reconciliation-url-state';
export {
  parseFinReconciliationState,
  serializeFinReconciliationState,
  buildFinReconciliationUrl,
} from './reconciliation-url-state';

export function useReconciliationUrlState() {
  return useBHUrlState<FinReconciliationUrlState>({
    defaults: RECONCILIATION_DEFAULTS,
    parse: parseFinReconciliationState,
    serialize: serializeFinReconciliationState,
    basePath: RECONCILIATION_BASE_PATH,
  });
}
