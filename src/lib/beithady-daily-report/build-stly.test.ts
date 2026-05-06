import { describe, it, expect, vi } from 'vitest';
import type { DailyReportPayload } from './types';

const currentPayload = {
  all: { revenue_mtd_usd: 18900, backward_occupancy_pct: 43, occupancy_today_pct: 43 },
} as unknown as DailyReportPayload;

const priorPayload = {
  all: { revenue_mtd_usd: 11600, backward_occupancy_pct: 38, occupancy_today_pct: 38 },
};

describe('buildStly', () => {
  it('returns YoY comparison when prior snapshot exists', async () => {
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: { payload: priorPayload }, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { buildStly: b } = await import('./build-stly');
    const out = await b('2026-05-05', currentPayload);
    expect(out).not.toBeNull();
    expect(out!.current_mtd_revenue_usd).toBe(18900);
    expect(out!.prior_mtd_revenue_usd).toBe(11600);
    // (18900 - 11600) / 11600 * 100 = 62.931...
    expect(out!.delta_pct).toBeCloseTo(62.93, 1);
    // 43 - 38 = 5
    expect(out!.delta_pp).toBeCloseTo(5, 1);
  });

  it('returns null when no prior snapshot', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { buildStly: b } = await import('./build-stly');
    const out = await b('2026-05-05', currentPayload);
    expect(out).toBeNull();
  });

  it('returns null on DB error', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: { message: 'connection error' } }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { buildStly: b } = await import('./build-stly');
    const out = await b('2026-05-05', currentPayload);
    expect(out).toBeNull();
  });
});
