// Single source of truth for "what should we pay per UoM unit of this item?"
//
// Five cost fields exist on items:
//   - amazon_eg_price_egp / amazon_eg_pack_size : live scraped Amazon EG price
//   - avg_cost_egp                              : moving avg from posted GRNs
//   - last_cost_egp                             : most recent posted GRN cost
//   - default_cost_egp                          : operator-set seed
//
// Before this helper, four UI surfaces (items list cost cell, estimator,
// rules cost calculator, dashboard reorder) each picked a different
// preference order — same item showed three different unit costs across
// pages, last_cost_egp was never read, and the dashboard reorder list
// always used the seed regardless of more authoritative data.
//
// Documented preference order (most → least authoritative):
//   1. Live Amazon price-per-UoM-unit (price ÷ pack_size, when pack_size > 0)
//   2. Live Amazon raw price (when price set but no pack_size; flagged as
//      estimate because per-pack vs per-UoM mixes concepts)
//   3. Moving-average from GRN postings (avg_cost_egp > 0)
//   4. Last GRN cost (last_cost_egp not null)
//   5. Operator-set seed (default_cost_egp; flagged as estimate)
//
// The helper is intentionally tiny and pure — call from server (estimator,
// rules, dashboard, GRN draft seed) or client (items-section-list CostCell).

export type UnitCostSource = 'amazon' | 'avg' | 'last' | 'default';

// Numeric fields may arrive as string (Supabase numeric → string) or
// number (after explicit Number()/parseFloat()). Helper coerces.
type Num = number | string | null | undefined;

export type UnitCostInput = {
  amazon_eg_price_egp?: Num;
  amazon_eg_pack_size?: Num;
  avg_cost_egp?: Num;
  last_cost_egp?: Num;
  default_cost_egp?: Num;
};

export type UnitCostResult = {
  /** Resolved unit cost in EGP per UoM unit. */
  unitCostEgp: number;
  /** Which field provided the value. */
  source: UnitCostSource;
  /** True if the caller should visually flag the cost as approximate
   *  (seed value, or live Amazon without pack_size disambiguation). */
  isEstimate: boolean;
};

function toNum(v: Num): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

export function resolveUnitCostEgp(item: UnitCostInput): UnitCostResult {
  const amazonPrice = toNum(item.amazon_eg_price_egp);
  const packSize = toNum(item.amazon_eg_pack_size);

  if (amazonPrice != null && packSize != null && packSize > 0) {
    return {
      unitCostEgp: amazonPrice / packSize,
      source: 'amazon',
      isEstimate: false,
    };
  }
  if (amazonPrice != null) {
    return {
      unitCostEgp: amazonPrice,
      source: 'amazon',
      isEstimate: true, // raw price without pack_size = unclear unit
    };
  }

  const avg = toNum(item.avg_cost_egp) ?? 0;
  if (avg > 0) {
    return { unitCostEgp: avg, source: 'avg', isEstimate: false };
  }

  const last = toNum(item.last_cost_egp);
  if (last != null) {
    return { unitCostEgp: last, source: 'last', isEstimate: false };
  }

  return {
    unitCostEgp: toNum(item.default_cost_egp) ?? 0,
    source: 'default',
    isEstimate: true,
  };
}
