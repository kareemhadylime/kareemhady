import { describe, it, expect } from 'vitest';
import { bucketCohort } from './cohorts';

describe('bucketCohort', () => {
  it('returns same_month when booking created in check-in month', () => {
    expect(bucketCohort('2026-05-10T08:00:00Z', '2026-05-20')).toBe('same_month');
    expect(bucketCohort('2026-05-01T00:00:00Z', '2026-05-31')).toBe('same_month');
  });
  it('returns one_month when booking created month-1', () => {
    expect(bucketCohort('2026-04-20T08:00:00Z', '2026-05-10')).toBe('one_month');
  });
  it('returns two_month when booking created month-2', () => {
    expect(bucketCohort('2026-03-20T08:00:00Z', '2026-05-10')).toBe('two_month');
  });
  it('returns three_to_five_month for 3 to 5 month lead', () => {
    expect(bucketCohort('2026-02-20T08:00:00Z', '2026-05-10')).toBe('three_to_five_month');
    expect(bucketCohort('2025-12-20T08:00:00Z', '2026-05-10')).toBe('three_to_five_month');
  });
  it('returns six_plus_month for ≥6 month lead', () => {
    expect(bucketCohort('2025-11-20T08:00:00Z', '2026-05-10')).toBe('six_plus_month');
    expect(bucketCohort('2024-05-01T08:00:00Z', '2026-05-10')).toBe('six_plus_month');
  });
  it('returns same_month when created_at is null (fallback — undated bookings should not be excluded)', () => {
    expect(bucketCohort(null, '2026-05-10')).toBe('same_month');
  });
});
