// src/lib/fmplus/performance/derive-ar-aging.test.ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: [
        { move_id: 100, line_id: 200, partner_id: 1, partner_name: 'BigCo',  invoice_ref: 'INV-001', invoice_date: '2026-03-01', amount_residual: 100000, currency: 'EGP', days_outstanding: 66, days_overdue: 6,  bucket: 'overdue_1_30' },
        { move_id: 101, line_id: 201, partner_id: 1, partner_name: 'BigCo',  invoice_ref: 'INV-002', invoice_date: '2026-04-01', amount_residual: 50000,  currency: 'EGP', days_outstanding: 35, days_overdue: 0,  bucket: 'within_terms' },
        { move_id: 102, line_id: 202, partner_id: 2, partner_name: 'SmallCo', invoice_ref: 'INV-003', invoice_date: '2025-12-01', amount_residual: 200000, currency: 'EGP', days_outstanding: 156, days_overdue: 96, bucket: 'overdue_90_plus' },
      ],
      error: null,
    }),
  }),
}));

const { arAging } = await import('./derive-ar-aging');

describe('arAging', () => {
  test('rolls up totals + buckets correctly', async () => {
    const r = await arAging({ project_id: 33, payment_terms_days: 60 });
    expect(r).not.toBeNull();
    expect(r!.total_outstanding).toBe(350000);
    expect(r!.within_terms_amount).toBe(50000);
    expect(r!.overdue_amount).toBe(300000);
    expect(r!.overdue_count).toBe(2);
    expect(r!.lines).toHaveLength(3);
    const wt = r!.buckets.find(b => b.bucket === 'within_terms')!;
    expect(wt.count).toBe(1);
    expect(wt.amount).toBe(50000);
    const r90 = r!.buckets.find(b => b.bucket === 'overdue_90_plus')!;
    expect(r90.count).toBe(1);
    expect(r90.amount).toBe(200000);
  });

  test('returns null when RPC returns empty', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    }));
    const { arAging: aa } = await import('./derive-ar-aging');
    const r = await aa({ project_id: 99, payment_terms_days: null });
    expect(r).toBeNull();
  });
});
