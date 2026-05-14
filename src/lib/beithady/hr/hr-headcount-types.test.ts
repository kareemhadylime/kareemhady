import { describe, it, expect } from 'vitest';
import { calcHcDelta } from './hr-headcount-types';

describe('calcHcDelta', () => {
  it('returns null when planned is null', () => {
    expect(calcHcDelta(10, null)).toBeNull();
  });
  it('positive delta when actual > planned', () => {
    expect(calcHcDelta(12, 10)).toBe(2);
  });
  it('negative delta when actual < planned', () => {
    expect(calcHcDelta(8, 10)).toBe(-2);
  });
  it('zero when equal', () => {
    expect(calcHcDelta(10, 10)).toBe(0);
  });
});
