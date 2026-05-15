// Shared types for the typed URL hooks under /beithady/financials/_hooks.
//
// `FinScope` is the BH-financials operating scope. `'a1'` stays in the union
// for URL backward-compat per P0-1's UI-hide-only strategy — direct
// ?scope=a1 URLs continue to resolve, but no UI surface renders the pill.

export type FinScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';

export const VALID_FIN_SCOPES = new Set<string>(['consolidated', 'egypt', 'dubai', 'a1']);
