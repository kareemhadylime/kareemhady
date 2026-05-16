import { describe, it, expect } from 'vitest';
import {
  cairoIsoWeekStart, lagWeeksBetween, computeCohortMatrix,
  cellColorBucket, type CohortLeadInput,
} from './cohort';

describe('cairoIsoWeekStart', () => {
  it('returns Monday for a Wednesday Cairo-time date', () => {
    // 2026-05-13 Wed in Cairo → Mon May 11
    const r = cairoIsoWeekStart('2026-05-13T12:00:00+03:00');
    expect(r).toBe('2026-05-11');
  });
  it('returns same date for Monday Cairo time', () => {
    const r = cairoIsoWeekStart('2026-05-11T08:00:00+03:00');
    expect(r).toBe('2026-05-11');
  });
});

describe('lagWeeksBetween', () => {
  it('returns 0 for same week', () => expect(lagWeeksBetween('2026-05-11', '2026-05-13')).toBe(0));
  it('returns 1 for next week', () => expect(lagWeeksBetween('2026-05-04', '2026-05-12')).toBe(1));
  it('returns 4 for 4 weeks later', () => expect(lagWeeksBetween('2026-04-13', '2026-05-13')).toBe(4));
});

describe('cellColorBucket', () => {
  it('maps 0 → slate', () => expect(cellColorBucket(0)).toContain('slate'));
  it('maps 3 → emerald-50', () => expect(cellColorBucket(3)).toContain('emerald-50'));
  it('maps 15 → emerald-400/40', () => expect(cellColorBucket(15)).toContain('emerald-400/40'));
  it('maps 30 → emerald-500/40', () => expect(cellColorBucket(30)).toContain('emerald-500/40'));
});

describe('computeCohortMatrix', () => {
  it('buckets leads by Cairo-local ISO week and computes lag distribution', () => {
    const leads: CohortLeadInput[] = [
      { created_at: '2026-05-04T10:00:00+03:00', matched_at: '2026-05-12T10:00:00+03:00' },  // W18, lag 1
      { created_at: '2026-05-04T10:00:00+03:00', matched_at: '2026-05-19T10:00:00+03:00' },  // W18, lag 2
      { created_at: '2026-05-04T10:00:00+03:00', matched_at: null },                          // W18, unbooked
    ];
    const out = computeCohortMatrix(leads, { todayIso: '2026-05-13', weeksBack: 1 });
    expect(out.cohorts).toHaveLength(1);
    expect(out.cohorts[0].leads).toBe(3);
    expect(out.cohorts[0].bookings_by_lag[0]).toBe(1);   // W+1
    expect(out.cohorts[0].bookings_by_lag[1]).toBe(1);   // W+2
    expect(out.cohorts[0].conversion_pcts_by_lag[0]).toBeCloseTo(33.3, 1);
  });
  it('excludes leads from the current partial week', () => {
    const leads: CohortLeadInput[] = [
      { created_at: '2026-05-13T10:00:00+03:00', matched_at: null },   // current week
    ];
    const out = computeCohortMatrix(leads, { todayIso: '2026-05-13', weeksBack: 1 });
    expect(out.cohorts[0].leads).toBe(0);
  });
});
