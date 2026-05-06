import { describe, it, expect, vi } from 'vitest';

// Mock must be declared before importing the module under test.
// The builder does a two-step query: first beithady_reservation_grid_v,
// then beithady_reservation_overrides. We mock the full Supabase chain
// and branch on `from()` argument.

vi.mock('@/lib/supabase', () => {
  const gridRows = [
    { reservation_id: 'RES-001', listing_nickname: 'BH-26-301', building_code: 'BH-26', guest_name: 'Smith', check_in_date: '2026-05-15' },
    { reservation_id: 'RES-002', listing_nickname: 'BH-73-12', building_code: 'BH-73', guest_name: 'Doe', check_in_date: '2026-05-20' },
  ];
  const overrideRows = [
    { reservation_id: 'RES-001', cancel_risk_score: 72, cancel_risk_breakdown: { unpaid: 300, late_checkin: 180 } },
    { reservation_id: 'RES-002', cancel_risk_score: 55, cancel_risk_breakdown: { unpaid: 200, late_checkin: 120 } },
  ];

  const makeGridChain = () => ({
    select: () => ({
      gte: () => ({
        lte: () => ({
          neq: () => Promise.resolve({ data: gridRows, error: null }),
        }),
      }),
    }),
  });

  const makeOverridesChain = () => ({
    select: () => ({
      in: () => ({
        gte: () => ({
          order: () => Promise.resolve({ data: overrideRows, error: null }),
        }),
      }),
    }),
  });

  return {
    supabaseAdmin: () => ({
      from: (table: string) => {
        if (table === 'beithady_reservation_grid_v') return makeGridChain();
        if (table === 'beithady_reservation_overrides') return makeOverridesChain();
        throw new Error(`Unexpected table: ${table}`);
      },
    }),
  };
});

import { buildCancelRisk } from './build-cancel-risk';

describe('buildCancelRisk', () => {
  it('aggregates count + value_at_risk and maps reservation rows', async () => {
    const out = await buildCancelRisk('2026-05-05');
    expect(out).not.toBeNull();
    expect(out!.count).toBe(2);
    // RES-001: 300+180=480, RES-002: 200+120=320 → total 800
    expect(out!.value_at_risk_usd).toBe(800);
    expect(out!.reservations[0].score).toBe(72);
    expect(out!.reservations[0].unit).toBe('BH-26-301');
    expect(out!.reservations[0].guest).toBe('Smith');
    expect(out!.reservations[0].check_in).toBe('2026-05-15');
  });

  it('returns empty section when no reservations exist', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            gte: () => ({
              lte: () => ({
                neq: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { buildCancelRisk: b } = await import('./build-cancel-risk');
    const out = await b('2026-05-05');
    expect(out).toEqual({ count: 0, value_at_risk_usd: 0, reservations: [] });
  });

  it('returns null on DB error', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            gte: () => ({
              lte: () => ({
                neq: () => Promise.resolve({ data: null, error: { message: 'DB down' } }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { buildCancelRisk: b } = await import('./build-cancel-risk');
    const out = await b('2026-05-05');
    expect(out).toBeNull();
  });
});
