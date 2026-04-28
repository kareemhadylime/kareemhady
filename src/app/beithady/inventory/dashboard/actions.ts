'use server';

import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { computeCostSample, type CostSample } from '@/lib/beithady/inventory/rules';

export async function computeCostSampleAction(
  guests: number,
  nights: number,
  buildingCode: string | null,
): Promise<CostSample | { error: string }> {
  await requireBeithadyPermission('inventory', 'read');
  if (guests < 1 || guests > 50) return { error: 'Guests must be 1-50' };
  if (nights < 1 || nights > 365) return { error: 'Nights must be 1-365' };
  return computeCostSample({
    guests,
    nights,
    building_code: buildingCode,
    listing_id: null,
  });
}
