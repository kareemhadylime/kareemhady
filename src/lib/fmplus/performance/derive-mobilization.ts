import type { MobilizationRow } from './types';

interface MobInput {
  mob_line_id: number;
  label: string;
  total_cost: number;
  amortization: 'straight_line' | 'flat';
  amortization_months: number;
}

export function computeMobAmortization(m: MobInput, monthsElapsed: number): MobilizationRow {
  const elapsed = Math.max(0, monthsElapsed);
  let amortized: number;
  if (m.amortization === 'flat') {
    amortized = elapsed >= 1 ? m.total_cost : 0;
  } else {
    const frac = Math.min(1, elapsed / m.amortization_months);
    amortized = m.total_cost * frac;
  }
  return {
    mob_line_id: m.mob_line_id,
    label: m.label,
    total_cost: m.total_cost,
    amortized,
    remaining: Math.max(0, m.total_cost - amortized),
    months_elapsed: elapsed,
    months_total: m.amortization_months,
  };
}
