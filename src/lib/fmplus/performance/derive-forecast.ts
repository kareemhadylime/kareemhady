import type { ForecastBlock } from './types';

export interface ForecastInput {
  period_actual: number;
  months_elapsed: number;
  months_total: number;
  budget_year: number;
  amber_pct: number;
  red_pct: number;
}

export function linearForecast(i: ForecastInput): ForecastBlock | null {
  if (i.months_elapsed <= 0) return null;
  const projected = (i.period_actual / i.months_elapsed) * i.months_total;
  const variance_pct = i.budget_year > 0 ? (projected - i.budget_year) / i.budget_year : 0;
  const abs = Math.abs(variance_pct);
  const status: ForecastBlock['status'] = abs < i.amber_pct ? 'good' : abs < i.red_pct ? 'warn' : 'bad';
  return {
    period_actual: i.period_actual,
    months_elapsed: i.months_elapsed,
    months_total: i.months_total,
    projected_year_actual: projected,
    budget_year: i.budget_year,
    variance_pct,
    status,
    caveat: 'Linear projection — does not account for ramp / seasonality',
  };
}
