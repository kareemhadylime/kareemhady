'use client';
import { useBHUrlState } from '@/app/beithady/_components/dashboard-shell';
import {
  PAYABLES_BASE_PATH,
  makePayablesDefaults,
  parseFinPayablesState,
  serializeFinPayablesState,
  type FinPayablesUrlState,
} from './payables-url-state';

// Re-export pure helpers + types so consumers can keep importing from this
// module path. Pure logic lives in `./payables-url-state.ts` (no 'use client').
export type { FinPayablesUrlState } from './payables-url-state';
export {
  parseFinPayablesState,
  serializeFinPayablesState,
  buildFinPayablesUrl,
} from './payables-url-state';

export function usePayablesUrlState() {
  return useBHUrlState<FinPayablesUrlState>({
    defaults: makePayablesDefaults(),
    parse: parseFinPayablesState,
    serialize: serializeFinPayablesState,
    basePath: PAYABLES_BASE_PATH,
  });
}
