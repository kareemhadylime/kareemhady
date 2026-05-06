import { describe, it, expect, vi } from 'vitest';
import type { BuildingCode } from './types';

// ── Fixtures ─────────────────────────────────────────────────────────────────
// today = 2026-05-06
// Minimal unit counts so we only test BH-26 (1 unit) and BH-73 (1 unit).
// Keeping other buildings at 0 avoids saturating MAX_GAPS with empty rows.
//
// Scenario:
//   BH-26: 1 unit; booked May 7 only → May 6 is a gap (0/1 = 0%), May 7 is full (100%)
//   BH-73: 1 unit; booked May 6 only → May 6 is full (100%), May 7 is a gap (0%)

const fakeReservations = [
  // BH-26 occupied May 7 only
  { check_in_date: '2026-05-07', check_out_date: '2026-05-08', building_code: 'BH-26', status: 'confirmed' },
  // BH-73 occupied May 6 only
  { check_in_date: '2026-05-06', check_out_date: '2026-05-07', building_code: 'BH-73', status: 'confirmed' },
];

// Reservation for exclusion test: BH-26 at 2 units, 2 occupied on May 9 → 100%
const highOccReservations = [
  { check_in_date: '2026-05-09', check_out_date: '2026-05-10', building_code: 'BH-26', status: 'confirmed' },
  { check_in_date: '2026-05-09', check_out_date: '2026-05-10', building_code: 'BH-26', status: 'checked_in' },
];

function makeSupabaseChain(data: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        lte: () => ({
          gt: () => ({
            in: () => Promise.resolve({ data, error: null }),
          }),
        }),
      }),
    }),
  };
}

function makeErrorChain() {
  return {
    from: () => ({
      select: () => ({
        lte: () => ({
          gt: () => ({
            in: () => Promise.resolve({ data: null, error: { message: 'db error' } }),
          }),
        }),
      }),
    }),
  };
}

// Only BH-26 + BH-73 have units; everything else 0 to avoid noise.
const sparseUnitCounts: Record<BuildingCode, number> = {
  'BH-26': 1,
  'BH-73': 1,
  'BH-435': 0,
  'BH-OK': 0,
  OTHER: 0,
};

const twoUnitCounts: Record<BuildingCode, number> = {
  'BH-26': 2,
  'BH-73': 0,
  'BH-435': 0,
  'BH-OK': 0,
  OTHER: 0,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildOccupancyGaps', () => {
  it('emits gap rows for low-occupancy days (< 50%)', async () => {
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => makeSupabaseChain(fakeReservations),
    }));
    const { buildOccupancyGaps } = await import('./build-occupancy-gaps');
    const out = await buildOccupancyGaps('2026-05-06', sparseUnitCounts);

    expect(out).not.toBeNull();
    expect(Array.isArray(out)).toBe(true);

    // BH-26 on May 6: 0/1 = 0% → should be in gaps
    const bh26May6 = out!.find((g) => g.building === 'BH-26' && g.date === '2026-05-06');
    expect(bh26May6).toBeDefined();
    expect(bh26May6!.occupancy_pct).toBeCloseTo(0, 1);
    expect(bh26May6!.current_price_usd).toBeNull();
    expect(bh26May6!.market_median_usd).toBeNull();

    // BH-73 on May 7: 0/1 = 0% → should be in gaps
    const bh73May7 = out!.find((g) => g.building === 'BH-73' && g.date === '2026-05-07');
    expect(bh73May7).toBeDefined();
    expect(bh73May7!.occupancy_pct).toBeCloseTo(0, 1);
  });

  it('excludes high-occupancy days (>= 50%)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => makeSupabaseChain(fakeReservations),
    }));
    const { buildOccupancyGaps } = await import('./build-occupancy-gaps');
    const out = await buildOccupancyGaps('2026-05-06', sparseUnitCounts);

    // BH-26 on May 7: 1/1 = 100% → NOT in gaps
    const bh26May7 = out!.find((g) => g.building === 'BH-26' && g.date === '2026-05-07');
    expect(bh26May7).toBeUndefined();

    // BH-73 on May 6: 1/1 = 100% → NOT in gaps
    const bh73May6 = out!.find((g) => g.building === 'BH-73' && g.date === '2026-05-06');
    expect(bh73May6).toBeUndefined();
  });

  it('excludes buildings with zero units', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => makeSupabaseChain(fakeReservations),
    }));
    const { buildOccupancyGaps } = await import('./build-occupancy-gaps');
    const out = await buildOccupancyGaps('2026-05-06', sparseUnitCounts);

    // BH-435, BH-OK, OTHER all have 0 units → never emit gaps
    const otherGaps = out!.filter(
      (g) => g.building === 'BH-435' || g.building === 'BH-OK' || g.building === 'OTHER'
    );
    expect(otherGaps).toHaveLength(0);
  });

  it('sorts by occupancy_pct ascending (lowest first)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => makeSupabaseChain(fakeReservations),
    }));
    const { buildOccupancyGaps } = await import('./build-occupancy-gaps');
    const out = await buildOccupancyGaps('2026-05-06', sparseUnitCounts);

    expect(out).not.toBeNull();
    for (let i = 1; i < out!.length; i++) {
      expect(out![i - 1].occupancy_pct).toBeLessThanOrEqual(out![i].occupancy_pct);
    }
  });

  it('returns null on DB error', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => makeErrorChain(),
    }));
    const { buildOccupancyGaps } = await import('./build-occupancy-gaps');
    const out = await buildOccupancyGaps('2026-05-06', sparseUnitCounts);
    expect(out).toBeNull();
  });
});
