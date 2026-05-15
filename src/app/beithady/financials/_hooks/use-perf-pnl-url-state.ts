'use client';
import { useBHUrlState } from '@/app/beithady/_components/dashboard-shell';
import {
  PERF_PNL_BASE_PATH,
  PERF_PNL_DEFAULTS,
  parseFinPerfState,
  serializeFinPerfState,
  type FinPerfUrlState,
} from './perf-pnl-url-state';

// Re-export pure types + helpers so existing consumers (test files, server pages)
// can keep importing from this hook module path. The pure logic itself lives in
// `./perf-pnl-url-state.ts` (no 'use client') so server components can call it.
export type {
  FinPerfPresetId,
  FinPerfPeriod,
  FinPerfScope,
  FinPerfBuilding,
  FinPerfUrlState,
} from './perf-pnl-url-state';

export {
  parseFinPerfState,
  serializeFinPerfState,
  buildFinPerfUrl,
} from './perf-pnl-url-state';

export function usePerfPnlUrlState() {
  return useBHUrlState<FinPerfUrlState>({
    defaults: PERF_PNL_DEFAULTS,
    parse: parseFinPerfState,
    serialize: serializeFinPerfState,
    basePath: PERF_PNL_BASE_PATH,
  });
}
