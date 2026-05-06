// src/lib/fmplus/performance/period.test.ts
import { describe, expect, test } from 'vitest';
import { resolvePeriod, resolvePriorPeriod } from './period';
import type { PeriodChip } from './types';

describe('resolvePeriod', () => {
  const today = new Date('2026-04-15');

  test('prev-month default → previous calendar month, complete', () => {
    const r = resolvePeriod({ chip: 'prev-month' }, today);
    expect(r.from).toBe('2026-03-01');
    expect(r.to).toBe('2026-03-31');
    expect(r.label).toBe('Mar 2026');
    expect(r.offset).toBe(1);
  });

  test('prev-month offset=2 → month before previous', () => {
    const r = resolvePeriod({ chip: 'prev-month', offset: 2 }, today);
    expect(r.from).toBe('2026-02-01');
    expect(r.to).toBe('2026-02-28');
    expect(r.label).toBe('Feb 2026');
    expect(r.offset).toBe(2);
  });

  test('prev-month offset=12 → 12 months ago', () => {
    const r = resolvePeriod({ chip: 'prev-month', offset: 12 }, today);
    expect(r.from).toBe('2025-04-01');
    expect(r.to).toBe('2025-04-30');
    expect(r.label).toBe('Apr 2025');
    expect(r.offset).toBe(12);
  });

  test('last-3 → last 3 complete calendar months', () => {
    const r = resolvePeriod({ chip: 'last-3' }, today);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-03-31');
  });

  test('last-quarter → last completed calendar quarter', () => {
    // Apr 2026 is Q2 → expect Q1 2026 (Jan-Mar)
    const r = resolvePeriod({ chip: 'last-quarter' }, today);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-03-31');
    expect(r.label).toBe('Q1 2026');
  });

  test('last-quarter in January → Q4 of prior year', () => {
    const jan = new Date('2026-01-15');
    const r = resolvePeriod({ chip: 'last-quarter' }, jan);
    expect(r.from).toBe('2025-10-01');
    expect(r.to).toBe('2025-12-31');
    expect(r.label).toBe('Q4 2025');
  });

  test('last-year → full prior calendar year', () => {
    const r = resolvePeriod({ chip: 'last-year' }, today);
    expect(r.from).toBe('2025-01-01');
    expect(r.to).toBe('2025-12-31');
    expect(r.label).toBe('2025');
  });

  test('ytd → Jan 1 to end of last completed month', () => {
    // Mid-April 2026 → expect Jan 1 → Mar 31
    const r = resolvePeriod({ chip: 'ytd' }, today);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-03-31');
    expect(r.label).toBe('2026 YTD');
  });

  test('ytd in January → empty range with caveat label', () => {
    const jan5 = new Date('2026-01-05');
    const r = resolvePeriod({ chip: 'ytd' }, jan5);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-01-01');
    expect(r.label).toContain('no completed months');
  });

  test('custom → uses provided dates', () => {
    const r = resolvePeriod({ chip: 'custom', from: '2026-02-10', to: '2026-03-22' }, today);
    expect(r.from).toBe('2026-02-10');
    expect(r.to).toBe('2026-03-22');
  });

  test('custom without dates → falls back to prev-month', () => {
    const r = resolvePeriod({ chip: 'custom' }, today);
    expect(r.chip).toBe('prev-month');
    expect(r.from).toBe('2026-03-01');
    expect(r.to).toBe('2026-03-31');
  });

  test('legacy chip=last-month → resolves as prev-month', () => {
    const r = resolvePeriod({ chip: 'last-month' as PeriodChip }, today);
    expect(r.chip).toBe('prev-month');
    expect(r.from).toBe('2026-03-01');
    expect(r.to).toBe('2026-03-31');
  });

  test('legacy chip=this-month → resolves as prev-month', () => {
    const r = resolvePeriod({ chip: 'this-month' as PeriodChip }, today);
    expect(r.chip).toBe('prev-month');
    expect(r.from).toBe('2026-03-01');
    expect(r.to).toBe('2026-03-31');
  });

  test('legacy chip=qtd → resolves as last-quarter', () => {
    const r = resolvePeriod({ chip: 'qtd' as PeriodChip }, today);
    expect(r.chip).toBe('last-quarter');
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-03-31');
  });
});

describe('resolvePriorPeriod', () => {
  test('shifts prev-month back one month', () => {
    const today = new Date('2026-04-15');
    const cur = resolvePeriod({ chip: 'prev-month' }, today);    // Mar 2026
    const prior = resolvePriorPeriod(cur);
    expect(prior.from).toBe('2026-02-01');
    expect(prior.to).toBe('2026-02-28');
  });
});
