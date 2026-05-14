import { describe, it, expect } from 'vitest';
import { formatTrainingDateRange } from './hr-training-types';

describe('formatTrainingDateRange', () => {
  it('returns — when both dates are null', () => {
    expect(formatTrainingDateRange(null, null)).toBe('—');
  });
  it('returns completed date when only date is set', () => {
    expect(formatTrainingDateRange('2026-03-01', null)).toBe('Completed 2026-03-01');
  });
  it('returns expires date when only expiry is set', () => {
    expect(formatTrainingDateRange(null, '2027-06-30')).toBe('Expires 2027-06-30');
  });
  it('returns range when both are set', () => {
    expect(formatTrainingDateRange('2026-03-01', '2027-03-01')).toBe('2026-03-01 → 2027-03-01');
  });
});
