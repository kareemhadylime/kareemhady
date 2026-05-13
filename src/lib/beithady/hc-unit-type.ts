// src/lib/beithady/hc-unit-type.ts
import { getListingByGuestyId } from '@/lib/rules/beithady-listings';
import type { UnitTypeCounts } from './hc-estimator-types';

export type UnitTypeKey = keyof UnitTypeCounts;

export function resolveUnitType(listingId: string): UnitTypeKey | null {
  const cat = getListingByGuestyId(listingId);
  if (!cat) return null;

  if (cat.tags.includes('BH-ST')) return 'studio';
  if (cat.tags.includes('BH-1BR')) return 'oneBR';
  if (cat.tags.includes('BH-2BR')) return 'twoBR';
  if (cat.tags.includes('BH-3BR')) return 'threeBR';
  if (cat.tags.includes('BH-4BR')) return 'fourBR';

  const title = cat.title.toLowerCase();
  if (title.includes('studio')) return 'studio';
  if (/\b1[\s-]?br\b|\b1\s*bedroom\b/.test(title)) return 'oneBR';
  if (/\b2[\s-]?br\b|\b2\s*bedroom\b/.test(title)) return 'twoBR';
  if (/\b3[\s-]?br\b|\b3\s*bedroom\b/.test(title)) return 'threeBR';
  if (/\b4[\s-]?br\b|\b4\s*bedroom\b/.test(title)) return 'fourBR';

  return null;
}

export function isLargeUnit(type: UnitTypeKey): boolean {
  return type === 'twoBR' || type === 'threeBR' || type === 'fourBR';
}
