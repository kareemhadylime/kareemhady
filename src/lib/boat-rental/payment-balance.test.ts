import { describe, it, expect } from 'vitest';
import { computeBalance, validatePaymentAmount } from './payment-balance';

describe('computeBalance', () => {
  it('returns full remaining when no payments', () => {
    expect(computeBalance(8000, [])).toEqual({
      total_paid: 0, remaining: 8000, is_complete: false,
    });
  });
  it('subtracts partial payments', () => {
    expect(computeBalance(8000, [3000, 2000])).toEqual({
      total_paid: 5000, remaining: 3000, is_complete: false,
    });
  });
  it('flags complete when sum equals total', () => {
    expect(computeBalance(8000, [3000, 2000, 3000])).toEqual({
      total_paid: 8000, remaining: 0, is_complete: true,
    });
  });
  it('handles numeric strings (Postgres numeric returns string)', () => {
    expect(computeBalance('8000', ['3000', '5000'])).toEqual({
      total_paid: 8000, remaining: 0, is_complete: true,
    });
  });
  it('throws on non-numeric total', () => {
    expect(() => computeBalance('abc', [])).toThrow();
  });
  it('throws on non-numeric payment amount', () => {
    expect(() => computeBalance(8000, ['xyz'])).toThrow();
  });
});

describe('validatePaymentAmount', () => {
  it('accepts a payment that fits exactly', () => {
    expect(validatePaymentAmount(8000, [3000, 2000], 3000)).toEqual({ ok: true });
  });
  it('accepts a partial payment', () => {
    expect(validatePaymentAmount(8000, [3000], 2000)).toEqual({ ok: true });
  });
  it('rejects a payment that would overpay', () => {
    expect(validatePaymentAmount(8000, [3000, 2000], 4000)).toEqual({
      ok: false,
      error: 'Would overpay by EGP 1000',
      overage: 1000,
    });
  });
  it('rejects zero or negative amounts', () => {
    expect(validatePaymentAmount(8000, [], 0)).toEqual({
      ok: false, error: 'Amount must be greater than zero',
    });
    expect(validatePaymentAmount(8000, [], -100)).toEqual({
      ok: false, error: 'Amount must be greater than zero',
    });
  });
  it('throws on non-numeric total in validate', () => {
    expect(() => validatePaymentAmount('abc' as unknown as number, [], 100)).toThrow();
  });
  it('throws on non-numeric existing payment in validate', () => {
    expect(() => validatePaymentAmount(8000, ['xyz' as unknown as number], 100)).toThrow();
  });
});
