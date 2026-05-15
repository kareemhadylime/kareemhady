import { describe, it, expect } from 'vitest';
import { buildFinPerfUrl, parseFinPerfState, type FinPerfUrlState } from './use-perf-pnl-url-state';

describe('buildFinPerfUrl', () => {
  const defaults: FinPerfUrlState = {
    scope: 'consolidated',
    period: { kind: 'preset', id: 'last_month' },
    building: 'all',
  };

  it('returns basePath alone when all values are at defaults', () => {
    const url = buildFinPerfUrl(defaults, {});
    expect(url).toBe('/beithady/financials/performance');
  });

  it('serializes a non-default preset as ?preset=...', () => {
    const url = buildFinPerfUrl(defaults, { period: { kind: 'preset', id: 'this_year' } });
    expect(url).toBe('/beithady/financials/performance?preset=this_year');
  });

  it('serializes a month-kind period as ?month=YYYY-MM (no preset)', () => {
    const url = buildFinPerfUrl(defaults, { period: { kind: 'month', ym: '2026-02' } });
    expect(url).toBe('/beithady/financials/performance?month=2026-02');
  });

  it('serializes scope+building+lob together; omits defaults', () => {
    const url = buildFinPerfUrl(defaults, {
      scope: 'egypt',
      building: 'BH-26',
      lob: 'Turnkey Egypt',
    });
    // Order: scope, preset/month (default omitted), building, lob
    expect(url).toBe('/beithady/financials/performance?scope=egypt&building=BH-26&lob=Turnkey+Egypt');
  });

  it('preserves A1 scope for URL backward-compat (UI-hide-only per P0-1)', () => {
    const url = buildFinPerfUrl(defaults, { scope: 'a1' });
    expect(url).toBe('/beithady/financials/performance?scope=a1');
  });
});

describe('parseFinPerfState', () => {
  it('returns defaults when search is empty', () => {
    const state = parseFinPerfState(new URLSearchParams());
    expect(state.scope).toBe('consolidated');
    expect(state.period).toEqual({ kind: 'preset', id: 'last_month' });
    expect(state.building).toBe('all');
  });

  it('prefers month over preset when both are present (month is the override)', () => {
    const state = parseFinPerfState(new URLSearchParams('preset=this_year&month=2026-02'));
    expect(state.period).toEqual({ kind: 'month', ym: '2026-02' });
  });
});
