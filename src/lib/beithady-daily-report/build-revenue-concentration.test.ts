import { describe, it, expect } from 'vitest';
import { buildRevenueConcentration } from './build-revenue-concentration';
import type { DailyReportPayload, BuildingCode } from './types';

const PER_BUILDING_FIXTURE: Record<BuildingCode, { revenue_mtd_usd: number }> = {
  'BH-26': { revenue_mtd_usd: 6400 },
  'BH-73': { revenue_mtd_usd: 5400 },
  'BH-435': { revenue_mtd_usd: 4400 },
  'BH-OK': { revenue_mtd_usd: 1800 },
  'OTHER': { revenue_mtd_usd: 1000 },
};

const CHANNEL_FIXTURE = [
  { channel: 'Airbnb', revenue_usd: 13800, pct: 73 },
  { channel: 'Direct', revenue_usd: 4500, pct: 23.7 },
  { channel: 'Booking.com', revenue_usd: 700, pct: 3.3 },
];

describe('buildRevenueConcentration', () => {
  it('sorts buildings by revenue desc and computes pct of total', () => {
    const out = buildRevenueConcentration(PER_BUILDING_FIXTURE as any, CHANNEL_FIXTURE as any);
    expect(out.by_building[0]).toMatchObject({ key: 'BH-26', revenue_usd: 6400 });
    expect(out.by_building[1]).toMatchObject({ key: 'BH-73' });
    const sumPct = out.by_building.reduce((s, r) => s + r.pct_of_total, 0);
    expect(sumPct).toBeCloseTo(100, 1);
  });

  it('top3_building_pct sums first three rows', () => {
    const out = buildRevenueConcentration(PER_BUILDING_FIXTURE as any, CHANNEL_FIXTURE as any);
    const expected = out.by_building.slice(0, 3).reduce((s, r) => s + r.pct_of_total, 0);
    expect(out.top3_building_pct).toBeCloseTo(expected, 1);
  });

  it('top1_channel_pct equals the largest channel pct (recomputed from revenue_usd)', () => {
    const out = buildRevenueConcentration(PER_BUILDING_FIXTURE as any, CHANNEL_FIXTURE as any);
    // Total channel revenue: 13800+4500+700=19000; Airbnb = 13800/19000*100 = 72.63
    expect(out.top1_channel_pct).toBeCloseTo(72.63, 1);
  });

  it('returns zeros when revenue is zero', () => {
    const empty = Object.fromEntries(Object.keys(PER_BUILDING_FIXTURE).map((k) => [k, { revenue_mtd_usd: 0 }])) as any;
    const out = buildRevenueConcentration(empty, []);
    expect(out.by_building.every((r) => r.pct_of_total === 0)).toBe(true);
    expect(out.top3_building_pct).toBe(0);
    expect(out.top1_channel_pct).toBe(0);
  });
});
