import { describe, it, expect } from 'vitest';
import { buildFinLedgersUrl, parseFinLedgersState, type FinLedgersUrlState } from './use-ledgers-url-state';

describe('buildFinLedgersUrl', () => {
  function makeDefaults(today: string): FinLedgersUrlState {
    return { scope: 'consolidated', kind: 'supplier', asof: today };
  }

  it('writes asof always; omits scope+kind at defaults', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinLedgersUrl(defaults, {});
    expect(url).toBe('/beithady/financials/ledgers?asof=2026-05-15');
  });

  it('serializes kind when non-default', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinLedgersUrl(defaults, { kind: 'owner' });
    expect(url).toBe('/beithady/financials/ledgers?asof=2026-05-15&kind=owner');
  });

  it('serializes scope + kind together', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinLedgersUrl(defaults, { scope: 'egypt', kind: 'customer' });
    expect(url).toBe('/beithady/financials/ledgers?asof=2026-05-15&scope=egypt&kind=customer');
  });

  it('preserves A1 scope for URL backward-compat', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinLedgersUrl(defaults, { scope: 'a1' });
    expect(url).toBe('/beithady/financials/ledgers?asof=2026-05-15&scope=a1');
  });
});

describe('parseFinLedgersState', () => {
  it('falls back to supplier when ?kind= is missing', () => {
    const state = parseFinLedgersState(new URLSearchParams('asof=2026-05-15'));
    expect(state.kind).toBe('supplier');
  });

  it('falls back to supplier when ?kind= is invalid', () => {
    const state = parseFinLedgersState(new URLSearchParams('asof=2026-05-15&kind=nonsense'));
    expect(state.kind).toBe('supplier');
  });
});
