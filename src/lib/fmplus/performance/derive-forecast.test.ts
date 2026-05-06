import { describe, expect, test } from 'vitest';
import { linearForecast } from './derive-forecast';

describe('linearForecast', () => {
  test('over-pace — 4 months elapsed, 4M actual, 10M budget → projects 12M (+20%)', () => {
    const f = linearForecast({
      period_actual: 4_000_000,
      months_elapsed: 4,
      months_total: 12,
      budget_year: 10_000_000,
      amber_pct: 0.05,
      red_pct: 0.15,
    });
    expect(f!.projected_year_actual).toBe(12_000_000);
    expect(f!.variance_pct).toBeCloseTo(0.20, 2);
    expect(f!.status).toBe('bad');
  });

  test('under-pace — 4 months, 2M actual, 10M budget → projects 6M (-40%)', () => {
    const f = linearForecast({
      period_actual: 2_000_000,
      months_elapsed: 4,
      months_total: 12,
      budget_year: 10_000_000,
      amber_pct: 0.05,
      red_pct: 0.15,
    });
    expect(f!.projected_year_actual).toBe(6_000_000);
    expect(f!.variance_pct).toBeCloseTo(-0.40, 2);
    expect(f!.status).toBe('bad');
  });

  test('zero months elapsed → null forecast (cannot project)', () => {
    const f = linearForecast({
      period_actual: 0, months_elapsed: 0, months_total: 12, budget_year: 10_000_000,
      amber_pct: 0.05, red_pct: 0.15,
    });
    expect(f).toBeNull();
  });

  test('full year elapsed = no projection needed, variance is the actual', () => {
    const f = linearForecast({
      period_actual: 9_500_000, months_elapsed: 12, months_total: 12, budget_year: 10_000_000,
      amber_pct: 0.05, red_pct: 0.15,
    });
    expect(f!.projected_year_actual).toBe(9_500_000);
    expect(f!.variance_pct).toBeCloseTo(-0.05, 2);
    expect(f!.status).toBe('warn');
  });
});
