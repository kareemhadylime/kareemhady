import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: [
        { category: 'consumables', amount: 178202.71, lines: 74 },
        { category: 'manning',     amount:  50000.00, lines: 12 },
      ],
      error: null,
    }),
  }),
}));

const { variationOrdersBlock } = await import('./derive-variation-orders');

describe('variationOrdersBlock', () => {
  test('rolls up totals + labels categories', async () => {
    const r = await variationOrdersBlock({ project_id: 33, from: '2026-03-01', to: '2026-03-31' });
    expect(r).not.toBeNull();
    expect(r!.total_amount).toBeCloseTo(228202.71, 2);
    expect(r!.total_lines).toBe(86);
    expect(r!.rows[0].category_label).toBe('Consumables');
  });
});
