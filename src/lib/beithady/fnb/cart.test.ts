import { describe, it, expect } from 'vitest';
import { computeCartTotals, computeLineTotal } from './cart';

describe('cart math', () => {
  it('computeLineTotal handles modifiers and qty', () => {
    expect(computeLineTotal({
      unit_price_usd: 8, quantity: 2,
      modifiers: [{ price_delta_usd: 3 }, { price_delta_usd: 5 }],
    })).toBeCloseTo(32);  // (8 + 3 + 5) * 2
  });

  it('computeCartTotals breaks down inclusive total', () => {
    const t = computeCartTotals([
      { unit_price_usd: 7, quantity: 1, modifiers: [] },
      { unit_price_usd: 19, quantity: 1, modifiers: [] },
    ]);
    expect(t.total_usd).toBe(26);
    expect(t.vat_usd).toBeCloseTo(26 * 14 / 126, 2);
    expect(t.service_usd).toBeCloseTo(26 * 12 / 126, 2);
    expect(t.subtotal_usd).toBeCloseTo(26 - t.vat_usd - t.service_usd, 2);
    // breakdown sums back to total (within 1¢ rounding tolerance)
    expect(t.subtotal_usd + t.vat_usd + t.service_usd).toBeCloseTo(t.total_usd, 1);
  });

  it('handles zero items', () => {
    const t = computeCartTotals([]);
    expect(t.total_usd).toBe(0);
  });
});
