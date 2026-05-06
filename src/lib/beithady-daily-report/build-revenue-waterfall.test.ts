import { describe, it, expect } from 'vitest';
import { buildRevenueWaterfall } from './build-revenue-waterfall';
import type { DailyReportPayload } from './types';

describe('buildRevenueWaterfall', () => {
  it('computes waterfall with V1 fee + tax estimates', () => {
    const out = buildRevenueWaterfall({
      all: { revenue_mtd_usd: 10000 },
    } as unknown as DailyReportPayload);

    expect(out).not.toBeNull();
    expect(out!.gross_usd).toBe(10000);
    expect(out!.channel_fees_usd).toBe(1000);
    // (10000 - 1000) * 0.14 = 9000 * 0.14 = 1260
    expect(out!.taxes_usd).toBeCloseTo(1260, 2);
    // 10000 - 1000 - 1260 = 7740
    expect(out!.net_usd).toBeCloseTo(7740, 2);
  });

  it('returns null for missing revenue', () => {
    expect(
      buildRevenueWaterfall({ all: {} } as unknown as DailyReportPayload)
    ).toBeNull();
  });

  it('returns null for negative revenue', () => {
    expect(
      buildRevenueWaterfall({
        all: { revenue_mtd_usd: -100 },
      } as unknown as DailyReportPayload)
    ).toBeNull();
  });

  it('handles zero revenue correctly (all zeros)', () => {
    const out = buildRevenueWaterfall({
      all: { revenue_mtd_usd: 0 },
    } as unknown as DailyReportPayload);

    expect(out).not.toBeNull();
    expect(out!.gross_usd).toBe(0);
    expect(out!.channel_fees_usd).toBe(0);
    expect(out!.taxes_usd).toBe(0);
    expect(out!.net_usd).toBe(0);
  });

  it('net is always less than gross when revenue > 0', () => {
    const out = buildRevenueWaterfall({
      all: { revenue_mtd_usd: 5000 },
    } as unknown as DailyReportPayload);

    expect(out).not.toBeNull();
    expect(out!.net_usd).toBeLessThan(out!.gross_usd);
    // Sanity: fees + taxes + net ≈ gross
    expect(out!.channel_fees_usd + out!.taxes_usd + out!.net_usd).toBeCloseTo(5000, 2);
  });
});
