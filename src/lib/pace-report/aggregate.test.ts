// src/lib/pace-report/aggregate.test.ts
import { describe, it, expect } from 'vitest';
import { aggregatePaceReport } from './aggregate';
import type { PaceListing } from './load-listings';
import type { PaceReservation } from './load-reservations';

const listing = (overrides: Partial<PaceListing> = {}): PaceListing => ({
  id: 'L1',
  nickname: 'Test Unit',
  active: true,
  bedrooms: 1,
  listing_type: 'SINGLE',
  master_listing_id: null,
  city: 'Sahel',
  country: 'EG',
  tags: [],
  building_code: 'BH-73',
  ...overrides,
});

const res = (overrides: Partial<PaceReservation> = {}): PaceReservation => ({
  id: 'R1',
  listing_id: 'L1',
  status: 'confirmed',
  check_in_date: '2026-05-01',
  check_out_date: '2026-05-04',
  nights: 3,
  host_payout_usd: 300,
  created_at_iso: '2026-04-15T10:00:00Z',
  is_canceled: false,
  ...overrides,
});

describe('aggregatePaceReport', () => {
  it('computes 4 KPIs in fixed order: revenue, booked_days, occupancy_pct, anr', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res()],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.kpis.map((k) => k.metric)).toEqual([
      'revenue', 'booked_days', 'occupancy_pct', 'anr',
    ]);
    expect(out.kpis[0].current_value).toBe(300);
    expect(out.kpis[1].current_value).toBe(3);
    // 3 booked / (1 unit × 31 days) = 9.677%
    expect(out.kpis[2].current_value).toBeCloseTo(9.677, 2);
    expect(out.kpis[3].current_value).toBeCloseTo(100, 2);  // 300/3
  });

  it('excludes canceled reservations when includeHistorical=false', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res({ status: 'canceled', is_canceled: true })],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.kpis[0].current_value).toBe(0);
    expect(out.kpis[1].current_value).toBe(0);
  });

  it('includes canceled when includeHistorical=true', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res({ status: 'canceled', is_canceled: true })],
      reservationsPrior: [],
      includeHistorical: true,
    });
    expect(out.kpis[1].current_value).toBe(3);
  });

  it('counts only nights anchored inside the period (not the full stay)', () => {
    // 5-night stay 2026-04-29 → 2026-05-04 should contribute 3 booked
    // days inside May (nights of 5/1, 5/2, 5/3). Revenue is pro-rated.
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res({
        id: 'R2', check_in_date: '2026-04-29', check_out_date: '2026-05-04',
        nights: 5, host_payout_usd: 500,
      })],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.kpis[1].current_value).toBe(3);
    expect(out.kpis[0].current_value).toBe(300);  // 500 × 3/5
  });

  it('buckets reservations into pickup cohorts by created-at lead time', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [
        res({ id: 'R-A', host_payout_usd: 100, created_at_iso: '2026-05-01T08:00:00Z' }), // same
        res({ id: 'R-B', host_payout_usd: 200, created_at_iso: '2026-04-15T08:00:00Z' }), // 1mo
        res({ id: 'R-C', host_payout_usd: 300, created_at_iso: '2026-03-15T08:00:00Z' }), // 2mo
        res({ id: 'R-D', host_payout_usd: 400, created_at_iso: '2026-01-15T08:00:00Z' }), // 3-5mo
      ],
      reservationsPrior: [],
      includeHistorical: false,
    });
    const may = out.pickup_cohorts.find((c) => c.check_in_month === '2026-05');
    expect(may?.buckets.same_month.revenue_usd).toBe(100);
    expect(may?.buckets.one_month.revenue_usd).toBe(200);
    expect(may?.buckets.two_month.revenue_usd).toBe(300);
    expect(may?.buckets.three_to_five_month.revenue_usd).toBe(400);
  });

  it('emits per-property and per-city rows', () => {
    const a = listing({ id: 'A', nickname: 'A1', city: 'Sahel' });
    const b = listing({ id: 'B', nickname: 'B1', city: 'Dubai', country: 'AE' });
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [a, b],
      reservationsCurrent: [
        res({ id: 'R-A', listing_id: 'A', host_payout_usd: 600, nights: 6,
              check_in_date: '2026-05-01', check_out_date: '2026-05-07' }),
        res({ id: 'R-B', listing_id: 'B', host_payout_usd: 300, nights: 3,
              check_in_date: '2026-05-10', check_out_date: '2026-05-13' }),
      ],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.by_property).toHaveLength(2);
    expect(out.by_property.find((p) => p.listing_id === 'A')?.revenue_usd).toBe(600);
    expect(out.by_city).toHaveLength(2);
    const sahel = out.by_city.find((c) => c.city === 'Sahel');
    expect(sahel?.unit_count).toBe(1);
    expect(sahel?.revenue_usd).toBe(600);
  });

  it('clamps delta_pct to null when prior is 0', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res()],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.kpis[0].delta_pct).toBeNull();
  });
});
