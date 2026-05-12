import { describe, it, expect } from 'vitest';
import { buildBuildingsTable } from './build-buildings';
import type { ReservationRow } from './reservations';
import type { AllInventories } from './units';
import type { MonthRange } from './cairo-dates';

// Minimal fixtures — May 2026 (31 days). "Today" = May 12 (12 days elapsed, 19 remaining).
const ctx: MonthRange = {
  today: '2026-05-12',
  start: '2026-05-01',
  end: '2026-05-31',
  days_total: 31,
  days_elapsed: 12,
  days_remaining: 19,
};

// 5 total units across BH-26 only — keep fixture small so the math is hand-checkable.
// Note: physical_listing_ids must include the listing IDs used in test reservations,
// otherwise the allowedListingIds filter in build-buildings.ts drops them.
const inventories: AllInventories = {
  'BH-26': { total_units: 5, physical_listing_ids: ['L-A', 'L-B', 'L-C'] },
  'BH-73': { total_units: 0, physical_listing_ids: [] },
  'BH-435': { total_units: 0, physical_listing_ids: [] },
  'BH-OK': { total_units: 0, physical_listing_ids: [] },
  OTHER: { total_units: 0, physical_listing_ids: [] },
  total_all: 5,
  physical_listing_ids_all: ['L-A', 'L-B', 'L-C'],
} as unknown as AllInventories;

function res(opts: {
  id: string;
  check_in: string;
  check_out: string;
  nights: number;
  host_payout: number;
  building?: 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';
}): ReservationRow {
  return {
    id: opts.id,
    listing_id: 'L-' + opts.id,
    building: opts.building ?? 'BH-26',
    check_in_date: opts.check_in,
    check_out_date: opts.check_out,
    nights: opts.nights,
    host_payout_usd: opts.host_payout,
    status: 'confirmed',
    created_at_iso: opts.check_in + 'T00:00:00Z',
    source: 'Airbnb',
    // remaining ReservationRow fields — not needed by the builder, cast erases them
    confirmation_code: null,
    listing_nickname: null,
    guest_name: null,
    guest_email: null,
    currency: 'USD',
    host_payout_raw: opts.host_payout,
    guest_paid_usd: null,
    updated_at_iso: null,
    cancelled_at_iso: null,
    effective_cancel_at_iso: null,
  } as unknown as ReservationRow;
}

describe('buildBuildingsTable — new month-oriented fields', () => {
  it('revenue_mtd_actual_usd includes past check-ins and excludes future ones', () => {
    const reservations: ReservationRow[] = [
      // Past check-in (May 5) — counts toward both fields
      res({ id: 'A', check_in: '2026-05-05', check_out: '2026-05-08', nights: 3, host_payout: 1000 }),
      // Today's check-in (May 12) — counts toward both fields (today is inclusive in actual)
      res({ id: 'B', check_in: '2026-05-12', check_out: '2026-05-15', nights: 3, host_payout: 600 }),
      // Future check-in (May 20) — counts toward revenue_mtd_usd (whole-month OTB) only
      res({ id: 'C', check_in: '2026-05-20', check_out: '2026-05-23', nights: 3, host_payout: 800 }),
    ];

    const out = buildBuildingsTable(reservations, inventories, ctx);

    expect(out.all.revenue_mtd_actual_usd).toBe(1600);     // A + B
    expect(out.all.revenue_mtd_usd).toBe(2400);             // A + B + C
    expect(out.per_building['BH-26'].revenue_mtd_actual_usd).toBe(1600);
    expect(out.per_building['BH-26'].revenue_mtd_usd).toBe(2400);
  });

  it('month_occupancy_pct blends past nights sold + forward nights booked over total month unit-nights', () => {
    // 1 reservation: May 8 → May 22 (14 nights total).
    // 5 units × 31 days = 155 total unit-nights for the month.
    // nights_mtd ([May 1, May 12]) covers May 8-12 = 5 nights.
    // forward_nights_booked ((May 12, May 31]) covers May 13-22 = 9 nights.
    // month_occupancy = (5 + 9) / 155 × 100 = 9.03%
    const reservations: ReservationRow[] = [
      res({ id: 'A', check_in: '2026-05-08', check_out: '2026-05-22', nights: 14, host_payout: 1400 }),
    ];

    const out = buildBuildingsTable(reservations, inventories, ctx);

    expect(out.all.month_occupancy_pct).toBeCloseTo(9.0, 1);
    expect(out.per_building['BH-26'].month_occupancy_pct).toBeCloseTo(9.0, 1);
  });

  it('month_occupancy_pct = 0 when no reservations', () => {
    const out = buildBuildingsTable([], inventories, ctx);
    expect(out.all.month_occupancy_pct).toBe(0);
    expect(out.all.revenue_mtd_actual_usd).toBe(0);
  });
});
