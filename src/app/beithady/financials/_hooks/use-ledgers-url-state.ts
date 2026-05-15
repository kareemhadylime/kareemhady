'use client';
import { useBHUrlState } from '@/app/beithady/_components/dashboard-shell';
import {
  LEDGERS_BASE_PATH,
  makeLedgersDefaults,
  parseFinLedgersState,
  serializeFinLedgersState,
  type FinLedgersUrlState,
} from './ledgers-url-state';

// Re-export pure helpers + types so consumers can keep importing from this
// module path. Pure logic lives in `./ledgers-url-state.ts` (no 'use client').
export type { LedgerKind, FinLedgersUrlState } from './ledgers-url-state';
export {
  parseFinLedgersState,
  serializeFinLedgersState,
  buildFinLedgersUrl,
} from './ledgers-url-state';

export function useLedgersUrlState() {
  return useBHUrlState<FinLedgersUrlState>({
    defaults: makeLedgersDefaults(),
    parse: parseFinLedgersState,
    serialize: serializeFinLedgersState,
    basePath: LEDGERS_BASE_PATH,
  });
}
