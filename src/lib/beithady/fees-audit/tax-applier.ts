// Beithady · Fee Audit · tax applier.
// Per Q4: pulls taxes from Guesty listing as-is, NEVER computes/derives.
// We just sum what Guesty configured.

import type { ListingTax } from './types';

export type TaxBase = {
  accommodation_usd: number;
  cleaning_usd: number;
};

export type TaxApplied = {
  total_usd: number;
  breakdown: Array<{ type: string; amount_usd: number }>;
  total_pct_of_accommodation: number;
};

/**
 * Apply Guesty-configured taxes to a base. Each tax has either a `rate_pct`
 * (percent) or a fixed `amount` (in `amount_currency`, USD-converted upstream).
 * `applies_to` controls the base: 'accommodation' (default), 'cleaning', or 'all'.
 */
export function applyTaxes(taxes: ListingTax[], base: TaxBase): TaxApplied {
  const breakdown: Array<{ type: string; amount_usd: number }> = [];
  let total = 0;

  for (const t of taxes || []) {
    let taxBase = base.accommodation_usd;
    if (t.applies_to === 'cleaning') taxBase = base.cleaning_usd;
    else if (t.applies_to === 'all')
      taxBase = base.accommodation_usd + base.cleaning_usd;

    let amount = 0;
    if (typeof t.rate_pct === 'number') {
      amount = (taxBase * t.rate_pct) / 100;
    } else if (typeof t.amount === 'number') {
      amount = t.amount;
    }
    if (!Number.isFinite(amount) || amount <= 0) continue;
    breakdown.push({ type: t.type || 'tax', amount_usd: amount });
    total += amount;
  }

  return {
    total_usd: total,
    breakdown,
    total_pct_of_accommodation:
      base.accommodation_usd > 0 ? (total / base.accommodation_usd) * 100 : 0,
  };
}
