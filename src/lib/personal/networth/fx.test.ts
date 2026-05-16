import { describe, it, expect, vi, beforeEach } from 'vitest';
import { convertToEgp, latestRate, ratesAsOf } from './fx';

vi.mock('@/lib/supabase', () => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ data: { rate_to_egp: 48.2 }, error: null }),
    then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return { supabaseAdmin: () => ({ from: vi.fn(() => chain) }) };
});

describe('latestRate', () => {
  it('returns 1 for EGP without hitting DB', async () => {
    const r = await latestRate('EGP');
    expect(r).toBe(1);
  });
});

describe('ratesAsOf', () => {
  it('always includes EGP=1 in the result', async () => {
    const r = await ratesAsOf('2026-05-01');
    expect(r.EGP).toBe(1);
  });
});

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
