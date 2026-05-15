import { describe, it, expect } from 'vitest';
import { buildFinBSUrl, type FinBSUrlState } from './use-bs-url-state';

describe('buildFinBSUrl', () => {
  function makeDefaults(today: string): FinBSUrlState {
    return { scope: 'consolidated', asof: today, building: 'all' };
  }

  it('writes asof always (since today changes daily)', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinBSUrl(defaults, {});
    expect(url).toBe('/beithady/financials/balance-sheet?asof=2026-05-15');
  });

  it('omits scope when consolidated, writes when not', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinBSUrl(defaults, { scope: 'egypt' });
    expect(url).toBe('/beithady/financials/balance-sheet?asof=2026-05-15&scope=egypt');
  });

  it('writes building when not all', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinBSUrl(defaults, { building: 'BH-73' });
    expect(url).toBe('/beithady/financials/balance-sheet?asof=2026-05-15&building=BH-73');
  });

  it('preserves A1 scope for URL backward-compat', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinBSUrl(defaults, { scope: 'a1' });
    expect(url).toBe('/beithady/financials/balance-sheet?asof=2026-05-15&scope=a1');
  });
});
