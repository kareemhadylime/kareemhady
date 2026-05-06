import { describe, it, expect } from 'vitest';
import { FMPLUS_OPENING_BALANCES_2026_02, OPENING_BALANCE_DATE } from './opening-balance';

describe('FMPLUS opening balance seed', () => {
  it('snapshot date is 2026-02-28 in YYYY-MM-DD format', () => {
    expect(OPENING_BALANCE_DATE).toBe('2026-02-28');
    expect(OPENING_BALANCE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('FMPLUS_OPENING_BALANCES_2026_02 is exported as an array', () => {
    expect(Array.isArray(FMPLUS_OPENING_BALANCES_2026_02)).toBe(true);
  });

  it('every entry (when populated) has the required shape', () => {
    // Trivially passes when the array is empty (initial stub state).
    // When the seed is populated in a follow-up task, this test locks the contract.
    for (const e of FMPLUS_OPENING_BALANCES_2026_02) {
      expect(typeof e.code).toBe('string');
      expect(typeof e.name).toBe('string');
      expect(e.name.length).toBeGreaterThan(0);
      expect(typeof e.account_type).toBe('string');
      expect(typeof e.opening_raw).toBe('number');
      expect(Number.isFinite(e.opening_raw)).toBe(true);
    }
  });

  it('balanced when populated: sum of opening_raw < 1 EGP (strict once data lands)', () => {
    // Accounting identity in raw debit-credit terms:
    //   sum(assets) + sum(liabilities) + sum(equity) = 0
    // Empty stub trivially passes via short-circuit; once entries are
    // populated, this enforces a hard <1 EGP tolerance so a partial seed
    // (e.g. assets only, no liabilities) fails loudly instead of silently
    // accepting a multi-million-EGP imbalance.
    if (FMPLUS_OPENING_BALANCES_2026_02.length === 0) return;
    const total = FMPLUS_OPENING_BALANCES_2026_02.reduce((s, e) => s + e.opening_raw, 0);
    expect(Math.abs(total)).toBeLessThan(1);
  });
});
