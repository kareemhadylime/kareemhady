import type { CohortBucket } from './types';

/**
 * Bucket a reservation by how far ahead of check-in it was created.
 * Lead = whole calendar months between createdAt and checkInDate.
 *
 *   0   → same_month
 *   1   → one_month
 *   2   → two_month
 *   3-5 → three_to_five_month
 *   ≥6  → six_plus_month
 *
 * Null createdAt buckets to `same_month` so legacy rows with no Guesty
 * createdAt don't drop out of the pickup chart.
 */
export function bucketCohort(createdAtIso: string | null, checkInYmd: string): CohortBucket {
  if (!createdAtIso) return 'same_month';
  const [cy, cm] = checkInYmd.split('-').map(Number);
  const created = new Date(createdAtIso);
  const ay = created.getUTCFullYear();
  const am = created.getUTCMonth() + 1;
  const monthLead = (cy - ay) * 12 + (cm - am);
  if (monthLead <= 0) return 'same_month';
  if (monthLead === 1) return 'one_month';
  if (monthLead === 2) return 'two_month';
  if (monthLead <= 5) return 'three_to_five_month';
  return 'six_plus_month';
}
