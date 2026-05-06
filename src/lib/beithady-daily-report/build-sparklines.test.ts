import { describe, it, expect, vi } from 'vitest';

const fakeRows = [
  {
    report_date: '2026-04-29',
    payload: {
      all: { occupancy_today_pct: 38, revenue_mtd_usd: 4000, pickup_vs_prior_month_pct: 50 },
      reviews: { avg_rating_mtd: 4.7 },
      conversations: { yesterday: { avg_response_minutes: 50 } },
    },
  },
  {
    report_date: '2026-04-30',
    payload: {
      all: { occupancy_today_pct: 42, revenue_mtd_usd: 9000, pickup_vs_prior_month_pct: 55 },
      reviews: { avg_rating_mtd: 4.8 },
      conversations: { yesterday: { avg_response_minutes: 45 } },
    },
  },
];

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        gte: () => ({
          lte: () => ({
            order: () => Promise.resolve({ data: fakeRows, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

describe('buildSparklines', () => {
  it('returns chronological series per hero KPI', async () => {
    const { buildSparklines } = await import('./build-sparklines');
    const out = await buildSparklines('2026-04-30');
    expect(out).not.toBeNull();
    expect(out!.occupancy).toEqual([38, 42]);
    expect(out!.mtd_revenue).toEqual([4000, 9000]);
    expect(out!.reviews_avg).toEqual([4.7, 4.8]);
    expect(out!.response_time).toEqual([50, 45]);
    expect(out!.pace).toEqual([50, 55]);
  });

  it('returns null when no snapshots found', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            gte: () => ({
              lte: () => ({
                order: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { buildSparklines: b } = await import('./build-sparklines');
    const out = await b('2026-04-30');
    expect(out).toBeNull();
  });

  it('returns null on DB error', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            gte: () => ({
              lte: () => ({
                order: () => Promise.resolve({ data: null, error: { message: 'timeout' } }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { buildSparklines: b } = await import('./build-sparklines');
    const out = await b('2026-04-30');
    expect(out).toBeNull();
  });
});
