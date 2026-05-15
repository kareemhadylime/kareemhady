'use client';
import { useBHUrlState } from '@/app/beithady/_components/dashboard-shell';
import {
  BS_BASE_PATH,
  makeBSDefaults,
  parseFinBSState,
  serializeFinBSState,
  type FinBSUrlState,
} from './bs-url-state';

// Re-export pure helpers + types so the rest of the codebase (server pages,
// tests) can keep importing from this module path. Pure logic lives in
// `./bs-url-state.ts` (no 'use client') for server-component access.
export type {
  FinBSScope,
  FinBSBuilding,
  FinBSUrlState,
} from './bs-url-state';

export {
  parseFinBSState,
  serializeFinBSState,
  buildFinBSUrl,
} from './bs-url-state';

export function useBSUrlState() {
  return useBHUrlState<FinBSUrlState>({
    defaults: makeBSDefaults(),
    parse: parseFinBSState,
    serialize: serializeFinBSState,
    basePath: BS_BASE_PATH,
  });
}
