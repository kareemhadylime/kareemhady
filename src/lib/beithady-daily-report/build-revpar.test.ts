import { describe, it, expect } from 'vitest';
import { buildRevpar } from './build-revpar';
import type { BuildingBucket, BuildingCode } from './types';

const fx: Record<BuildingCode, BuildingBucket> = {
  'BH-26': { total_units: 22, revenue_mtd_usd: 6400 } as BuildingBucket,
  'BH-73': { total_units: 28, revenue_mtd_usd: 5400 } as BuildingBucket,
  'BH-435': { total_units: 14, revenue_mtd_usd: 4400 } as BuildingBucket,
  'BH-OK': { total_units: 9, revenue_mtd_usd: 1800 } as BuildingBucket,
  'OTHER': { total_units: 4, revenue_mtd_usd: 900 } as BuildingBucket,
};

describe('buildRevpar', () => {
  it('computes RevPAR per building and aggregate', () => {
    const out = buildRevpar({ all: { revenue_mtd_usd: 18900 } as any, perBuilding: fx, daysElapsed: 5 });
    // BH-26: 6400 / (22 * 5) = 58.18
    expect(out.by_building['BH-26']).toBeCloseTo(58.18, 1);
    // All: 18900 / ((22+28+14+9+4) * 5) = 18900 / 385 = 49.09
    expect(out.all).toBeCloseTo(49.09, 1);
  });

  it('returns 0 for zero days elapsed', () => {
    const out = buildRevpar({ all: { revenue_mtd_usd: 18900 } as any, perBuilding: fx, daysElapsed: 0 });
    expect(out.all).toBe(0);
    expect(out.by_building['BH-26']).toBe(0);
  });

  it('returns 0 when a building has zero units', () => {
    const zero = { ...fx, 'BH-26': { total_units: 0, revenue_mtd_usd: 0 } as BuildingBucket };
    const out = buildRevpar({ all: { revenue_mtd_usd: 18900 } as any, perBuilding: zero, daysElapsed: 5 });
    expect(out.by_building['BH-26']).toBe(0);
  });
});
