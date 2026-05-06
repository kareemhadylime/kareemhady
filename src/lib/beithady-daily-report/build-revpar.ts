import type { AllBucket, BuildingBucket, BuildingCode, RevparBucket } from './types';
import { BUILDING_CODES } from './types';

type Input = {
  all: AllBucket;
  perBuilding: Record<BuildingCode, BuildingBucket>;
  daysElapsed: number;
};

/**
 * Pure function: computes Revenue per Available Night (RevPAR) per building
 * and aggregate. `daysElapsed` comes from `payload.month_days_elapsed`.
 * Returns 0 for buckets with zero units or zero days. No IO.
 */
export function buildRevpar({ all, perBuilding, daysElapsed }: Input): RevparBucket {
  const byBuilding = {} as Record<BuildingCode, number>;
  let totalUnits = 0;
  for (const code of BUILDING_CODES) {
    const b = perBuilding[code];
    const units = b?.total_units ?? 0;
    totalUnits += units;
    const denom = units * daysElapsed;
    byBuilding[code] = denom > 0 ? (b!.revenue_mtd_usd / denom) : 0;
  }
  const allDenom = totalUnits * daysElapsed;
  return {
    all: allDenom > 0 ? (all.revenue_mtd_usd / allDenom) : 0,
    by_building: byBuilding,
  };
}
