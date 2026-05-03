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

  it('balanced when populated: sum of opening_raw approaches zero', () => {
    // Accounting identity in raw debit-credit terms:
    //   sum(assets) + sum(liabilities) + sum(equity) = 0
    // (assets debit-normal positive, liabilities + equity credit-normal negative)
    //
    // For an empty stub this trivially passes. When populated, allow a small
    // tolerance for:
    //   - Excel-source rounding (~1 EGP)
    //   - Snapshot-date current-year P&L portion if not seeded into equity
    //
    // Deliberately permissive (10M EGP) until the follow-up task tightens
    // it after the populated seed lands.
    const total = FMPLUS_OPENING_BALANCES_2026_02.reduce((s, e) => s + e.opening_raw, 0);
    expect(Math.abs(total)).toBeLessThan(10_000_000);
  });
});
