import type { Category, ServiceLine } from './types';

export interface InflationKnobs {
  revenue: number;
  manpower: number;
  other: number;
}

export type LineKind = 'manpower' | 'other' | 'revenue_pct';

interface LineLike {
  line_code: string;
  service_line: ServiceLine;
  category: Category;
  qty: number;
  unit_cost: number;
}

/**
 * Classify a line into one of three inflation kinds:
 *   - manpower: any manning category line
 *   - revenue_pct: % of revenue items (currently just gov_taminat) — track revenue knob
 *   - other: everything else (tools, ppe, consumables, transport, it, governmental except taminat)
 */
export function classifyLine(l: { line_code: string; category: Category; service_line: ServiceLine }): LineKind {
  if (l.category === 'manning') return 'manpower';
  if (l.category === 'governmental' && l.line_code.includes('taminat')) return 'revenue_pct';
  return 'other';
}

/**
 * Apply inflation to a single line. Resolution order:
 *   1. Per-line override pct (if line_code in `perLineOverridePct`)
 *   2. Uniform knob based on classifyLine() result
 *
 * Returns a new line object with updated unit_cost; qty is preserved.
 */
export function applyInflation(
  line: LineLike,
  knobs: InflationKnobs,
  perLineOverridePct: Record<string, number>,
): LineLike {
  const kind = classifyLine(line);
  const override = perLineOverridePct[line.line_code];
  let pct: number;
  if (override !== undefined) {
    pct = override;
  } else if (kind === 'manpower') {
    pct = knobs.manpower;
  } else if (kind === 'revenue_pct') {
    pct = knobs.revenue;
  } else {
    pct = knobs.other;
  }
  return { ...line, unit_cost: round2(line.unit_cost * (1 + pct / 100)) };
}

/**
 * Project an entire year forward: applies inflation to every line and returns
 * the inflated lines + total annualized cost + projected revenue.
 *
 * `currentRevenue` is annual EGP — projectedRevenue = currentRevenue × (1 + revenue/100).
 */
export function projectYear(
  lines: LineLike[],
  knobs: InflationKnobs,
  perLineOverridePct: Record<string, number>,
  currentRevenue: number,
): { lines: LineLike[]; totalCost: number; projectedRevenue: number } {
  const projected = lines.map(l => applyInflation(l, knobs, perLineOverridePct));
  // Total cost is annual: qty × unit_cost × 12 months
  const totalCost = projected.reduce((a, l) => a + l.qty * l.unit_cost, 0);
  const projectedRevenue = round2(currentRevenue * (1 + knobs.revenue / 100));
  return { lines: projected, totalCost: round2(totalCost), projectedRevenue };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
