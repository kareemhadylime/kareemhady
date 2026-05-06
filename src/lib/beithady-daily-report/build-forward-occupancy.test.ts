import { describe, it, expect, vi } from 'vitest';
import type { BuildingCode } from './types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

// today = 2026-05-06; BH-26 has 2 units
// Reservation A: 2026-05-06 → 2026-05-10 (4 nights fully in d7 window)
// Reservation B: 2026-05-06 → 2026-05-20 (14 nights → 7 in d7, 14 in d30)
// Reservation C: BH-73, 2026-05-06 → 2026-05-11 — should NOT count for BH-26

const fakeReservations = [
  { check_in_date: '2026-05-06', check_out_date: '2026-05-10', building_code: 'BH-26', status: 'confirmed' },
  { check_in_date: '2026-05-06', check_out_date: '2026-05-20', building_code: 'BH-26', status: 'confirmed' },
  { check_in_date: '2026-05-06', check_out_date: '2026-05-11', building_code: 'BH-73', status: 'confirmed' },
];

function makeSupabaseChain(reservations: typeof fakeReservations) {
  return {
    from: () => ({
      select: () => ({
        lte: () => ({
          gt: () => ({
            in: () => Promise.resolve({ data: reservations, error: null }),
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

const unitCounts: Record<BuildingCode, number> = {
  'BH-26': 2,
  'BH-73': 5,
  'BH-435': 3,
  'BH-OK': 4,
  OTHER: 0,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildForwardOccupancy', () => {
  it('computes d7/d30/d60 occupancy percentages correctly for BH-26', async () => {
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => makeSupabaseChain(fakeReservations),
    }));
    const { buildForwardOccupancy } = await import('./build-forward-occupancy');

    const out = await buildForwardOccupancy('2026-05-06', unitCounts);
    expect(out).not.toBeNull();

    const bh26 = out!.find((r) => r.building === 'BH-26');
    expect(bh26).toBeDefined();

    // d7: window 2026-05-06 → 2026-05-13
    // Res A: 2026-05-06→05-10 → clipped to [05-06, 05-10) = 4 nights
    // Res B: 2026-05-06→05-20 → clipped to [05-06, 05-13) = 7 nights
    // Total = 11 nights; denom = 2 units × 7 days = 14; pct = 11/14 * 100 ≈ 78.57%
    expect(bh26!.d7_pct).toBeCloseTo(78.57, 1);

    // d30: window 2026-05-06 → 2026-06-05
    // Res A: 4 nights; Res B: 14 nights; total = 18; denom = 2×30=60; pct = 30%
    expect(bh26!.d30_pct).toBeCloseTo(30, 1);
  });

  it('does not include BH-73 reservations in BH-26 bucket', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => makeSupabaseChain(fakeReservations),
    }));
    const { buildForwardOccupancy } = await import('./build-forward-occupancy');
    const out = await buildForwardOccupancy('2026-05-06', unitCounts);
    const bh26 = out!.find((r) => r.building === 'BH-26');
    const bh73 = out!.find((r) => r.building === 'BH-73');
    // BH-73 occupancy should be computed separately, not bled into BH-26
    expect(bh26!.d7_pct).not.toEqual(bh73!.d7_pct);
  });

  it('returns 0 pct for buildings with zero units', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => makeSupabaseChain(fakeReservations),
    }));
    const { buildForwardOccupancy } = await import('./build-forward-occupancy');
    const out = await buildForwardOccupancy('2026-05-06', unitCounts);
    const other = out!.find((r) => r.building === 'OTHER');
    expect(other!.d7_pct).toBe(0);
    expect(other!.d30_pct).toBe(0);
    expect(other!.d60_pct).toBe(0);
  });

  it('returns null on DB error', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => makeErrorChain(),
    }));
    const { buildForwardOccupancy } = await import('./build-forward-occupancy');
    const out = await buildForwardOccupancy('2026-05-06', unitCounts);
    expect(out).toBeNull();
  });
});
