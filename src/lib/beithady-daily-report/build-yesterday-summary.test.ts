import { describe, it, expect } from 'vitest';
import { buildYesterdaySummary } from './build-yesterday-summary';
import type { ReservationRow } from './reservations';
import type { AllInventories } from './units';

const Y = '2026-05-11'; // yesterday-of-report

const baseInventory: AllInventories = {
  'BH-26': { total_units: 30, physical_listing_ids: [] },
  'BH-73': { total_units: 29, physical_listing_ids: [] },
  'BH-435': { total_units: 14, physical_listing_ids: [] },
  'BH-OK': { total_units: 4, physical_listing_ids: [] },
  OTHER: { total_units: 0, physical_listing_ids: [] },
  total_all: 77,
  physical_listing_ids_all: [],
};

function mkRow(p: Partial<ReservationRow>): ReservationRow {
  return {
    id: p.id || crypto.randomUUID(),
    confirmation_code: null,
    status: 'confirmed',
    source: 'Airbnb',
    listing_id: p.listing_id || 'L1',
    listing_nickname: null,
    guest_name: p.guest_name ?? 'Guest A',
    guest_email: null,
    check_in_date: p.check_in_date ?? null,
    check_out_date: p.check_out_date ?? null,
    nights: 1,
    currency: 'USD',
    host_payout_usd: p.host_payout_usd ?? 0,
    host_payout_raw: p.host_payout_usd ?? 0,
    guest_paid_usd: null,
    created_at_iso: null,
    updated_at_iso: null,
    cancelled_at_iso: null,
    effective_cancel_at_iso: null,
    building: 'BH-26',
  };
}

describe('buildYesterdaySummary', () => {
  it('counts check_ins, check_outs, and revenue on yesterday', () => {
    const active: ReservationRow[] = [
      mkRow({ check_in_date: Y, check_out_date: '2026-05-13', host_payout_usd: 300 }),
      mkRow({ check_in_date: Y, check_out_date: '2026-05-14', host_payout_usd: 200 }),
      mkRow({ check_in_date: '2026-05-09', check_out_date: Y, host_payout_usd: 999 }),
    ];
    const out = buildYesterdaySummary(active, baseInventory, Y);
    expect(out.check_ins).toBe(2);
    expect(out.check_outs).toBe(1);
    expect(out.revenue_usd).toBe(500); // host_payout_usd of yesterday check-ins
    expect(out.total_units).toBe(77);
  });

  it('excludes same-guest renewals from both check_ins and check_outs', () => {
    const active: ReservationRow[] = [
      // Same listing, same guest, checkout+checkin both = yesterday → renewal
      mkRow({ listing_id: 'L1', guest_name: 'A. Smith', check_in_date: '2026-05-09', check_out_date: Y }),
      mkRow({ listing_id: 'L1', guest_name: 'A. Smith', check_in_date: Y, check_out_date: '2026-05-13', host_payout_usd: 400 }),
      // Different listing, normal check-in
      mkRow({ listing_id: 'L2', guest_name: 'B. Jones', check_in_date: Y, check_out_date: '2026-05-14', host_payout_usd: 250 }),
    ];
    const out = buildYesterdaySummary(active, baseInventory, Y);
    expect(out.check_ins).toBe(1);  // only L2, L1 is a renewal
    expect(out.check_outs).toBe(0); // L1 checkout is part of the renewal
    expect(out.revenue_usd).toBe(250); // only non-renewal check-ins count toward revenue
  });

  it('counts turnovers as different-guest checkout+checkin on yesterday', () => {
    const active: ReservationRow[] = [
      mkRow({ listing_id: 'L1', guest_name: 'A', check_in_date: '2026-05-09', check_out_date: Y }),
      mkRow({ listing_id: 'L1', guest_name: 'B', check_in_date: Y, check_out_date: '2026-05-13' }),
      mkRow({ listing_id: 'L2', guest_name: 'C', check_in_date: '2026-05-08', check_out_date: Y }),
    ];
    const out = buildYesterdaySummary(active, baseInventory, Y);
    expect(out.turnovers).toBe(1);
  });

  it('counts occupied as listings whose stay straddles yesterday 23:59 (check_in <= Y AND check_out > Y)', () => {
    const active: ReservationRow[] = [
      mkRow({ listing_id: 'L1', check_in_date: '2026-05-10', check_out_date: '2026-05-12' }), // straddles
      mkRow({ listing_id: 'L2', check_in_date: Y, check_out_date: Y }), // checkin and checkout same day → NOT occupied at 23:59
      mkRow({ listing_id: 'L3', check_in_date: Y, check_out_date: '2026-05-13' }), // checkin yesterday, still there → occupied
    ];
    const out = buildYesterdaySummary(active, baseInventory, Y);
    expect(out.occupied).toBe(2);
  });

  it('handles empty active list without throwing', () => {
    const out = buildYesterdaySummary([], baseInventory, Y);
    expect(out.occupied).toBe(0);
    expect(out.check_ins).toBe(0);
    expect(out.check_outs).toBe(0);
    expect(out.turnovers).toBe(0);
    expect(out.revenue_usd).toBe(0);
    expect(out.total_units).toBe(77);
  });

  it('silently skips rows with null listing_id', () => {
    const active: ReservationRow[] = [
      mkRow({ listing_id: null as any, check_in_date: Y, check_out_date: '2026-05-13', host_payout_usd: 100 }),
      mkRow({ listing_id: 'L1', check_in_date: Y, check_out_date: '2026-05-14', host_payout_usd: 200 }),
    ];
    const out = buildYesterdaySummary(active, baseInventory, Y);
    // Null-listing rows still count toward check_ins/revenue (no listing-based dedupe applies),
    // but they cannot be part of a renewal pair (which requires a listing_id).
    expect(out.check_ins).toBe(2);
    expect(out.revenue_usd).toBe(300);
  });
});
