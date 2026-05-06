// src/lib/fmplus/performance/derive-actual-revenue.test.ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({ data: 1972171.81, error: null }),
  }),
}));

const { actualRevenue } = await import('./derive-actual-revenue');

describe('actualRevenue', () => {
  test('returns the numeric revenue for the period', async () => {
    const r = await actualRevenue({ project_id: 33, from: '2026-03-01', to: '2026-03-31' });
    expect(r).toBeCloseTo(1972171.81, 2);
  });
});
