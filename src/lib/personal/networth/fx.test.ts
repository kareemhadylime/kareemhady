import { describe, it, expect, vi, beforeEach } from 'vitest';
import { convertToEgp, latestRate, ratesAsOf } from './fx';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { rate_to_egp: 48.2 }, error: null }),
    })),
  }),
}));

describe('convertToEgp', () => {
  it('returns amount unchanged for EGP', async () => {
    const r = await convertToEgp(100, 'EGP', '2026-05-01');
    expect(r).toEqual({ egp: 100, rate: 1, rateAsOf: '2026-05-01' });
  });

  it('multiplies by FX rate for non-EGP', async () => {
    const r = await convertToEgp(100, 'USD', '2026-05-01');
    if ('error' in r) throw new Error('expected success');
    expect(r.egp).toBeCloseTo(4820, 2);
    expect(r.rate).toBe(48.2);
  });
});
