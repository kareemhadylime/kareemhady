import { describe, it, expect } from 'vitest';
import { buildFinPayablesUrl, type FinPayablesUrlState } from './use-payables-url-state';

describe('buildFinPayablesUrl', () => {
  function makeDefaults(today: string): FinPayablesUrlState {
    return { scope: 'consolidated', asof: today };
  }

  it('writes asof always (since today changes daily)', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinPayablesUrl(defaults, {});
    expect(url).toBe('/beithady/financials/payables?asof=2026-05-15');
  });

  it('omits scope when consolidated, writes when not', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinPayablesUrl(defaults, { scope: 'egypt' });
    expect(url).toBe('/beithady/financials/payables?asof=2026-05-15&scope=egypt');
  });

  it('preserves A1 scope for URL backward-compat', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinPayablesUrl(defaults, { scope: 'a1' });
    expect(url).toBe('/beithady/financials/payables?asof=2026-05-15&scope=a1');
  });

  it('respects an overridden asof in the patch', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinPayablesUrl(defaults, { asof: '2026-03-31' });
    expect(url).toBe('/beithady/financials/payables?asof=2026-03-31');
  });
});
