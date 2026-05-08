// Beithady · Generate Report · bedroom int → bucket label.
// Studio (0 enclosed bedrooms = open plan), 1, 2, 3, 4+. Per user
// clarification: studios are their own band, NOT excluded from reports.

import type { BedroomBucket } from './types';

export function bucketBedrooms(n: number | null | undefined): BedroomBucket {
  if (n == null || !Number.isFinite(n)) return 'studio';
  if (n <= 0) return 'studio';
  if (n === 1) return '1';
  if (n === 2) return '2';
  if (n === 3) return '3';
  return '4_plus';
}

export const BEDROOM_LABEL: Record<BedroomBucket, string> = {
  studio: 'Studio',
  '1': '1 BR',
  '2': '2 BR',
  '3': '3 BR',
  '4_plus': '4+ BR',
};

