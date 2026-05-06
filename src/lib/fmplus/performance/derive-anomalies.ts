// src/lib/fmplus/performance/derive-anomalies.ts
import type { Anomaly, ManningRow, ForecastBlock, VendorRow } from './types';

interface AnomalyInput {
  contract_id: number;
  manning: ManningRow[];
  unmapped_total: number;
  period_total_actual: number;
  forecast: ForecastBlock | null;
  signoff_days_stale: number | null;
  vendors: VendorRow[];
  amber_pct: number;             // expressed 0..1 (e.g. 0.15)
}

const RULE_UNMAPPED_AMBER = 0.05;
const RULE_UNMAPPED_RED = 0.15;
const RULE_SIGNOFF_DAYS = 30;
const RULE_VENDOR_CONC = 0.40;

export function deriveAnomalies(i: AnomalyInput): Anomaly[] {
  const out: Anomaly[] = [];

  // Rule 1 — manning service line over amber threshold
  for (const m of i.manning) {
    if (m.spend_variance_pct > i.amber_pct) {
      out.push({
        rule_id: 'manning_over',
        severity: m.spend_variance_pct > i.amber_pct * 2 ? 'red' : 'amber',
        message: `Manning spend in ${m.service_label} is ${(m.spend_variance_pct * 100).toFixed(1)}% over budget — investigate overtime`,
        action_url: `/fmplus/financial/budget/variance?contract=${i.contract_id}&service=${m.service_line}&category=manning`,
      });
    }
  }

  // Rule 2 — unmapped %
  const unmappedPct = i.period_total_actual > 0 ? i.unmapped_total / i.period_total_actual : 0;
  if (unmappedPct > RULE_UNMAPPED_AMBER) {
    out.push({
      rule_id: 'unmapped_pct',
      severity: unmappedPct > RULE_UNMAPPED_RED ? 'red' : 'amber',
      message: `${Math.round(i.unmapped_total / 1000)}K unmapped (${(unmappedPct * 100).toFixed(1)}%) — categorise before close`,
      action_url: '#perf-unmapped',
    });
  }

  // Rule 3 — forecast breach
  if (i.forecast && Math.abs(i.forecast.variance_pct) > i.amber_pct) {
    out.push({
      rule_id: 'forecast_breach',
      severity: Math.abs(i.forecast.variance_pct) > i.amber_pct * 2 ? 'red' : 'amber',
      message: `At current pace, year-end actual = ${(i.forecast.projected_year_actual / 1e6).toFixed(2)}M vs budget ${(i.forecast.budget_year / 1e6).toFixed(2)}M (${(i.forecast.variance_pct * 100).toFixed(1)}%)`,
      action_url: '#perf-forecast',
    });
  }

  // Rule 4 — sign-off stale
  if (i.signoff_days_stale !== null && i.signoff_days_stale > RULE_SIGNOFF_DAYS) {
    out.push({
      rule_id: 'signoff_stale',
      severity: 'amber',
      message: `Sign-off is ${i.signoff_days_stale} days stale`,
      action_url: '#perf-signoff',
    });
  }

  // Rule 5 — vendor concentration
  for (const v of i.vendors) {
    if (v.pct_of_period > RULE_VENDOR_CONC) {
      out.push({
        rule_id: 'vendor_concentration',
        severity: 'amber',
        message: `${v.partner_name} accounts for ${(v.pct_of_period * 100).toFixed(1)}% of period spend`,
        action_url: '#perf-vendors',
      });
      break;     // one vendor concentration anomaly is enough
    }
  }

  return out;
}
