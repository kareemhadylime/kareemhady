// src/lib/beithady/hr/hr-salary-access-queries.test.ts
import { describe, it, expect } from 'vitest';
import { validateSalaryTier, SALARY_TIERS } from './hr-salary-access-queries';

describe('SALARY_TIERS', () => {
  it('has 5 entries with correct tier values', () => {
    expect(SALARY_TIERS).toHaveLength(5);
    expect(SALARY_TIERS.map(t => t.tier)).toEqual([0, 1, 2, 3, 4]);
  });
  it('tier 0 label is No Access', () => {
    expect(SALARY_TIERS[0].label).toBe('No Access');
  });
  it('tier 4 label is Unlimited', () => {
    expect(SALARY_TIERS[4].label).toBe('Unlimited');
  });
});

describe('validateSalaryTier', () => {
  it('accepts 0', () => expect(validateSalaryTier(0)).toBe(true));
  it('accepts 4', () => expect(validateSalaryTier(4)).toBe(true));
  it('accepts 1, 2, 3', () => {
    expect(validateSalaryTier(1)).toBe(true);
    expect(validateSalaryTier(2)).toBe(true);
    expect(validateSalaryTier(3)).toBe(true);
  });
  it('rejects -1', () => expect(validateSalaryTier(-1)).toBe(false));
  it('rejects 5', () => expect(validateSalaryTier(5)).toBe(false));
  it('rejects non-integer 1.5', () => expect(validateSalaryTier(1.5)).toBe(false));
  it('rejects string "2"', () => expect(validateSalaryTier('2')).toBe(false));
  it('rejects null', () => expect(validateSalaryTier(null)).toBe(false));
});
