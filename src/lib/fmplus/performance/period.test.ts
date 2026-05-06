// src/lib/fmplus/performance/period.test.ts
import { describe, expect, test } from 'vitest';
import { resolvePeriod, resolvePriorPeriod } from './period';

describe('resolvePeriod', () => {
  const today = new Date('2026-04-15');

  test('this-month → first of month to today', () => {
    const r = resolvePeriod({ chip: 'this-month' }, today);
    expect(r.from).toBe('2026-04-01');
    expect(r.to).toBe('2026-04-15');
    expect(r.label).toBe('Apr 2026 (running)');
  });

  test('last-month → previous calendar month, complete', () => {
    const r = resolvePeriod({ chip: 'last-month' }, today);
    expect(r.from).toBe('2026-03-01');
    expect(r.to).toBe('2026-03-31');
    expect(r.label).toBe('Mar 2026');
  });

  test('last-3 → last 3 complete calendar months', () => {
    const r = resolvePeriod({ chip: 'last-3' }, today);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-03-31');
  });

  test('qtd → first of quarter to today', () => {
    const r = resolvePeriod({ chip: 'qtd' }, today);
    expect(r.from).toBe('2026-04-01');
    expect(r.to).toBe('2026-04-15');
  });

  test('ytd → Jan 1 to today', () => {
    const r = resolvePeriod({ chip: 'ytd' }, today);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-04-15');
  });

  test('custom → uses provided dates', () => {
    const r = resolvePeriod({ chip: 'custom', from: '2026-02-10', to: '2026-03-22' }, today);
    expect(r.from).toBe('2026-02-10');
    expect(r.to).toBe('2026-03-22');
  });

  test('throws on custom without dates', () => {
    expect(() => resolvePeriod({ chip: 'custom' }, today)).toThrow();
  });
});

describe('resolvePriorPeriod', () => {
  test('shifts last-month back one month', () => {
    const today = new Date('2026-04-15');
    const cur = resolvePeriod({ chip: 'last-month' }, today);    // Mar 2026
    const prior = resolvePriorPeriod(cur);
    expect(prior.from).toBe('2026-02-01');
    expect(prior.to).toBe('2026-02-28');
  });
});
