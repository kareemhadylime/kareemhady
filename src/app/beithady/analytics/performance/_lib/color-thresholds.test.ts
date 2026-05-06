import { describe, it, expect } from 'vitest';
import { bandForOccupancy, BAND_CLASSES } from './color-thresholds';

describe('bandForOccupancy', () => {
  it('green at and above 70%', () => {
    expect(bandForOccupancy(70)).toBe('green');
    expect(bandForOccupancy(85.5)).toBe('green');
    expect(bandForOccupancy(100)).toBe('green');
  });

  it('amber between 40 (inclusive) and 70 (exclusive)', () => {
    expect(bandForOccupancy(40)).toBe('amber');
    expect(bandForOccupancy(55)).toBe('amber');
    expect(bandForOccupancy(69.99)).toBe('amber');
  });

  it('red below 40%', () => {
    expect(bandForOccupancy(39.99)).toBe('red');
    expect(bandForOccupancy(0)).toBe('red');
    expect(bandForOccupancy(-5)).toBe('red');
  });
});

describe('BAND_CLASSES', () => {
  it('returns light-theme classes for each band', () => {
    expect(BAND_CLASSES.green).toBe('bg-emerald-100 text-emerald-700');
    expect(BAND_CLASSES.amber).toBe('bg-amber-100 text-amber-700');
    expect(BAND_CLASSES.red).toBe('bg-red-100 text-red-700');
  });
});
