import { describe, it, expect } from 'vitest';
import { buildDxbSection } from './build-dxb-section';
import type { ReservationRow } from './reservations';
import type { DxbInventory } from './units';

const T = '2026-05-12';
const Y = '2026-05-11';

const dxbInventory: DxbInventory = {
  total_units: 8,
  physical_listing_ids: ['D1','D2','D3','D4','D5','D6','D7','D8'],
};

function mkDxb(p: Partial<ReservationRow>): ReservationRow {
  return {
    id: p.id || crypto.randomUUID(),
    confirmation_code: null,
    status: 'confirmed',
    source: p.source ?? 'Airbnb',
    listing_id: p.listing_id || 'D1',
    listing_nickname: null,
    guest_name: p.guest_name ?? 'DXB Guest',
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
    building: 'OTHER',
  };
}

describe('buildDxbSection', () => {
  it('counts today + yesterday + MTD for a DXB-only corpus', () => {
    const active: ReservationRow[] = [
      mkDxb({ listing_id: 'D1', check_in_date: T,  check_out_date: '2026-05-14', host_payout_usd: 600 }),
      mkDxb({ listing_id: 'D2', check_in_date: '2026-05-10', check_out_date: T,  host_payout_usd: 700 }),
      mkDxb({ listing_id: 'D3', check_in_date: Y,  check_out_date: '2026-05-13', host_payout_usd: 500 }),
      mkDxb({ listing_id: 'D4', check_in_date: '2026-05-05', check_out_date: '2026-05-08', host_payout_usd: 400 }),
    ];
    const out = buildDxbSection(active, dxbInventory, T, Y, '2026-05-01', '2026-05-31');
    expect(out.today.check_ins).toBe(1);
    expect(out.today.check_outs).toBe(1);
    expect(out.yesterday.check_ins).toBe(1);
    expect(out.revenue_mtd.check_in_attribution_usd).toBe(600 + 700 + 500 + 400); // all 4 rows have check_in_date in May
  });

  it('computes next_3d_total_usd as Airbnb-only sum of check-ins in [today, today+2]', () => {
    const active: ReservationRow[] = [
      mkDxb({ listing_id: 'D1', source: 'Airbnb',      check_in_date: T,             host_payout_usd: 100 }),
      mkDxb({ listing_id: 'D2', source: 'Airbnb',      check_in_date: '2026-05-13',  host_payout_usd: 200 }),
      mkDxb({ listing_id: 'D3', source: 'Airbnb',      check_in_date: '2026-05-14',  host_payout_usd: 300 }),
      mkDxb({ listing_id: 'D4', source: 'Airbnb',      check_in_date: '2026-05-15',  host_payout_usd: 999 }), // out of window
      mkDxb({ listing_id: 'D5', source: 'Booking.com', check_in_date: T,             host_payout_usd: 555 }), // non-Airbnb
    ];
    const out = buildDxbSection(active, dxbInventory, T, Y, '2026-05-01', '2026-05-31');
    expect(out.next_3d_total_usd).toBe(600); // 100+200+300
  });

  it('returns zeroed fields when inventory is empty', () => {
    const out = buildDxbSection([], { total_units: 0, physical_listing_ids: [] }, T, Y, '2026-05-01', '2026-05-31');
    expect(out.today.total_units).toBe(0);
    expect(out.yesterday.total_units).toBe(0);
    expect(out.next_3d_total_usd).toBe(0);
    expect(out.revenue_mtd.check_in_attribution_usd).toBe(0);
  });

  it('uses the same "exactly one check-in" renewal guard as buildYesterdaySummary', () => {
    // Two check-ins on D1 yesterday → renewal guard should NOT fire (count > 1)
    // → both should count as check_ins.
    const active: ReservationRow[] = [
      mkDxb({ listing_id: 'D1', guest_name: 'A', check_in_date: '2026-05-09', check_out_date: Y, host_payout_usd: 100 }),
      mkDxb({ listing_id: 'D1', guest_name: 'A', check_in_date: Y, check_out_date: '2026-05-13', host_payout_usd: 200 }),
      mkDxb({ listing_id: 'D1', guest_name: 'A', check_in_date: Y, check_out_date: '2026-05-14', host_payout_usd: 300 }),
    ];
    const out = buildDxbSection(active, dxbInventory, T, Y, '2026-05-01', '2026-05-31');
    // count > 1 on D1 → no renewal exclusion → both yesterday-checkins counted
    expect(out.yesterday.check_ins).toBe(2);
  });
});
