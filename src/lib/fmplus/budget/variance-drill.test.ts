// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import { describe, it, expect } from 'vitest';
import { matchesCellFilter } from './variance-drill';

describe('matchesCellFilter', () => {
  const map = [
    { category: 'manning', code_patterns: ['^500001$', '^500002$'] },
  ];
  it('keeps move-line whose account-code matches the cell category', () => {
    expect(matchesCellFilter(
      { date: '2026-02-12', account_code: '500001' },
      { category: 'manning', month: 2, year: 2026 }, map,
    )).toBe(true);
  });
  it('rejects different month', () => {
    expect(matchesCellFilter(
      { date: '2026-01-12', account_code: '500001' },
      { category: 'manning', month: 2, year: 2026 }, map,
    )).toBe(false);
  });
  it('rejects different category', () => {
    expect(matchesCellFilter(
      { date: '2026-02-12', account_code: '900000' },
      { category: 'manning', month: 2, year: 2026 }, map,
    )).toBe(false);
  });
});
