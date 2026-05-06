// src/lib/fmplus/performance/derive-anomalies.test.ts
import { describe, expect, test } from 'vitest';
import { deriveAnomalies } from './derive-anomalies';

const baseInput: Parameters<typeof deriveAnomalies>[0] = {
  contract_id: 1,
  manning: [],
  unmapped_total: 0,
  period_total_actual: 1_000_000,
  forecast: null,
  signoff_days_stale: 5,
  vendors: [],
  ar_overdue_amount: 0,
  ar_overdue_count: 0,
  amber_pct: 0.15,
};

describe('deriveAnomalies', () => {
  test('all clean → no anomalies', () => {
    const a = deriveAnomalies(baseInput);
    expect(a).toEqual([]);
  });

  test('manning over amber threshold triggers rule 1', () => {
    const a = deriveAnomalies({
      ...baseInput,
      manning: [{ service_line: 'hk', service_label: 'HK', spend_variance_pct: 0.20 } as never],
    });
    expect(a).toHaveLength(1);
    expect(a[0].rule_id).toBe('manning_over');
    expect(a[0].severity).toBe('amber');
    expect(a[0].message).toContain('HK');
  });

  test('unmapped > 5% but ≤ 15% → amber', () => {
    const a = deriveAnomalies({ ...baseInput, unmapped_total: 80_000 });   // 8%
    expect(a[0].rule_id).toBe('unmapped_pct');
    expect(a[0].severity).toBe('amber');
  });

  test('unmapped > 15% → red', () => {
    const a = deriveAnomalies({ ...baseInput, unmapped_total: 200_000 });  // 20%
    expect(a[0].severity).toBe('red');
  });

  test('forecast over amber → triggers rule 3', () => {
    const a = deriveAnomalies({
      ...baseInput,
      forecast: { variance_pct: 0.18, projected_year_actual: 12_000_000, budget_year: 10_000_000 } as never,
    });
    expect(a.find(x => x.rule_id === 'forecast_breach')).toBeTruthy();
  });

  test('signoff > 30d stale → triggers rule 4', () => {
    const a = deriveAnomalies({ ...baseInput, signoff_days_stale: 45 });
    expect(a.find(x => x.rule_id === 'signoff_stale')).toBeTruthy();
  });

  test('vendor concentration > 40% → triggers rule 5', () => {
    const a = deriveAnomalies({
      ...baseInput,
      vendors: [{ partner_name: 'BigCo', pct_of_period: 0.45 } as never],
    });
    expect(a.find(x => x.rule_id === 'vendor_concentration')).toBeTruthy();
  });

  test('AR overdue triggers rule 6', () => {
    const a = deriveAnomalies({ ...baseInput, ar_overdue_amount: 50_000, ar_overdue_count: 2 });
    expect(a.find(x => x.rule_id === 'ar_overdue')).toBeTruthy();
  });
});
