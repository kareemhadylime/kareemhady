// src/lib/fmplus/performance/derive-overtime.ts
import type { OvertimeBlock } from './types';

interface Input {
  ot_actual: number;
  manning_actual: number;
  ot_budget: number;
  manning_budget: number;
  spark: { date: string; value: number }[];
  drill_url: string;
  amber_pct: number;
}

export function computeOvertimeBlock(i: Input): OvertimeBlock | null {
  if (i.manning_actual <= 0 && i.manning_budget <= 0) return null;
  const ot_pct_actual = i.manning_actual > 0 ? i.ot_actual / i.manning_actual : 0;
  const ot_pct_budget = i.manning_budget > 0 ? i.ot_budget / i.manning_budget : 0;
  const variance = ot_pct_actual - ot_pct_budget;
  const abs = Math.abs(variance);
  const status: OvertimeBlock['status'] =
    abs < i.amber_pct ? 'good' :
    abs < i.amber_pct * 1.5 ? 'warn' : 'bad';
  return {
    ot_actual: i.ot_actual,
    manning_actual: i.manning_actual,
    ot_pct_actual,
    ot_pct_budget,
    variance_pct: variance,
    status,
    spark: i.spark,
    drill_url: i.drill_url,
  };
}
