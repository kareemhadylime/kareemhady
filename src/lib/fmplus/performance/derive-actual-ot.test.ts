import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({ data: 195162.00, error: null }),
  }),
}));

const { actualOt } = await import('./derive-actual-ot');

describe('actualOt', () => {
  test('returns the period OT total', async () => {
    const r = await actualOt({ project_id: 33, from: '2026-03-01', to: '2026-03-31' });
    expect(r).toBeCloseTo(195162.00, 2);
  });
});
