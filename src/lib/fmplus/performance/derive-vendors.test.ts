// src/lib/fmplus/performance/derive-vendors.test.ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: [
        { partner_id: 1, partner_name: 'BigCo',  spend: 450_000, invoice_count: 4 },
        { partner_id: 2, partner_name: 'MidCo',  spend: 220_000, invoice_count: 2 },
        { partner_id: 3, partner_name: 'SmallCo', spend:  90_000, invoice_count: 1 },
      ],
      error: null,
    }),
  }),
}));

const { topVendors } = await import('./derive-vendors');

describe('topVendors', () => {
  test('ranks desc, computes pct of period total, includes drill_url', async () => {
    const r = await topVendors({
      contract_id: 1,
      project_id: 99,
      from: '2026-04-01',
      to: '2026-04-30',
      period_total: 1_000_000,
    });
    expect(r).toHaveLength(3);
    expect(r[0].partner_name).toBe('BigCo');
    expect(r[0].pct_of_period).toBeCloseTo(0.45, 2);
    expect(r[0].drill_url).toContain('partner=1');
  });
});
