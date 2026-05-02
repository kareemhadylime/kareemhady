import { describe, it, expect } from 'vitest';
import { computeNextRunDate } from './recurring';

describe('computeNextRunDate', () => {
  describe('monthly', () => {
    it('advances 1 month from a normal day', () => {
      expect(computeNextRunDate('monthly', 15, null, '2026-05-15')).toBe('2026-06-15');
    });
    it('handles December → January year rollover', () => {
      expect(computeNextRunDate('monthly', 1, null, '2026-12-01')).toBe('2027-01-01');
    });
    it('caps at day 28 (no Feb 30 issue)', () => {
      expect(computeNextRunDate('monthly', 28, null, '2026-01-28')).toBe('2026-02-28');
    });
  });
  describe('quarterly', () => {
    it('advances 3 months', () => {
      expect(computeNextRunDate('quarterly', 1, null, '2026-01-01')).toBe('2026-04-01');
    });
    it('handles year rollover', () => {
      expect(computeNextRunDate('quarterly', 15, null, '2026-10-15')).toBe('2027-01-15');
    });
  });
  describe('yearly', () => {
    it('advances 1 year', () => {
      expect(computeNextRunDate('yearly', 5, 1, '2026-01-05')).toBe('2027-01-05');
    });
    it('uses month_of_year for yearly schedules', () => {
      expect(computeNextRunDate('yearly', 5, 6, '2026-06-05')).toBe('2027-06-05');
    });
  });
});
