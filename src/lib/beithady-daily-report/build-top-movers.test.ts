import { describe, it, expect, vi } from 'vitest';
import type { DailyReportPayload } from './types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const currentPayload = {
  all: { pickup_vs_prior_month_pct: 30 },
  per_building: {
    'BH-26': { occupancy_today_pct: 80 },
    'BH-73': { occupancy_today_pct: 50 },
    'BH-435': { occupancy_today_pct: 40 },
    'BH-OK': { occupancy_today_pct: 60 },
    OTHER: { occupancy_today_pct: 0 },
  },
  paired_channel_mix: [
    { channel: 'Airbnb', mtd_pct: 70 },
    { channel: 'Booking.com', mtd_pct: 30 },
  ],
} as unknown as DailyReportPayload;

const priorPayload = {
  all: { pickup_vs_prior_month_pct: 15 }, // delta = 15pp → above PACE_PP_THRESHOLD(10)
  per_building: {
    'BH-26': { occupancy_today_pct: 74 }, // delta = +6pp → above OCC threshold(5)
    'BH-73': { occupancy_today_pct: 48 }, // delta = +2pp → BELOW threshold, excluded
    'BH-435': { occupancy_today_pct: 40 }, // delta = 0pp → excluded
    'BH-OK': { occupancy_today_pct: 60 },  // delta = 0pp → excluded
    OTHER: { occupancy_today_pct: 0 },
  },
  paired_channel_mix: [
    { channel: 'Airbnb', mtd_pct: 55 }, // delta = +15pp → above CHANNEL threshold(5)
    { channel: 'Booking.com', mtd_pct: 45 }, // delta = -15pp → above threshold
  ],
};

function makeSnapshotChain(payload: unknown) {
  return {
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: { payload }, error: null }),
          }),
        }),
      }),
    }),
  };
}

function makeEmptyChain() {
  return {
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildTopMovers', () => {
  it('emits movers above threshold with correct deltas and one_liner format', async () => {
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({ from: () => makeSnapshotChain(priorPayload) }),
    }));
    const { buildTopMovers } = await import('./build-top-movers');
    const out = await buildTopMovers('2026-05-06', currentPayload);

    expect(out).not.toBeNull();
    expect(Array.isArray(out)).toBe(true);

    // Pace mover: delta = 30 - 15 = 15pp
    const paceMover = out!.find((m) => m.scope === 'pace');
    expect(paceMover).toBeDefined();
    expect(paceMover!.delta).toBeCloseTo(15, 1);
    expect(paceMover!.one_liner).toMatch(/Pace \+15\.0pp/);

    // BH-26 occupancy mover: delta = 80 - 74 = +6pp
    const bh26 = out!.find((m) => m.scope === 'building' && m.key === 'BH-26');
    expect(bh26).toBeDefined();
    expect(bh26!.delta).toBeCloseTo(6, 1);
    expect(bh26!.one_liner).toContain('+6.0pp WoW');

    // Airbnb channel mover: delta = 70 - 55 = +15pp
    const airbnb = out!.find((m) => m.scope === 'channel' && m.key === 'Airbnb');
    expect(airbnb).toBeDefined();
    expect(airbnb!.delta).toBeCloseTo(15, 1);
  });

  it('excludes movers below threshold', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({ from: () => makeSnapshotChain(priorPayload) }),
    }));
    const { buildTopMovers } = await import('./build-top-movers');
    const out = await buildTopMovers('2026-05-06', currentPayload);

    // BH-73 delta = 2pp (below 5pp threshold) — should NOT be in output
    const bh73 = out!.find((m) => m.scope === 'building' && m.key === 'BH-73');
    expect(bh73).toBeUndefined();
  });

  it('returns [] (empty array, not null) when prior snapshot is missing', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({ from: () => makeEmptyChain() }),
    }));
    const { buildTopMovers } = await import('./build-top-movers');
    const out = await buildTopMovers('2026-05-06', currentPayload);
    expect(out).toEqual([]);
  });

  it('returns at most MAX_MOVERS (5) entries, sorted by absolute delta desc', async () => {
    vi.resetModules();
    // Prior with large deltas across all dimensions
    const massivePrior = {
      all: { pickup_vs_prior_month_pct: -30 }, // delta = 60pp
      per_building: {
        'BH-26': { occupancy_today_pct: 10 },  // delta = 70pp
        'BH-73': { occupancy_today_pct: 10 },  // delta = 40pp
        'BH-435': { occupancy_today_pct: 10 }, // delta = 30pp
        'BH-OK': { occupancy_today_pct: 10 },  // delta = 50pp
        OTHER: { occupancy_today_pct: 0 },
      },
      paired_channel_mix: [
        { channel: 'Airbnb', mtd_pct: 10 },       // delta = 60pp
        { channel: 'Booking.com', mtd_pct: 80 },   // delta = -50pp
      ],
    };
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({ from: () => makeSnapshotChain(massivePrior) }),
    }));
    const { buildTopMovers } = await import('./build-top-movers');
    const out = await buildTopMovers('2026-05-06', currentPayload);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(5);
    // First entry should have the largest absolute delta
    if (out!.length >= 2) {
      expect(Math.abs(out![0].delta)).toBeGreaterThanOrEqual(Math.abs(out![1].delta));
    }
  });
});
