import { describe, it, expect } from 'vitest';
import { projectMonthlySpend, pctOfCap, type RawCampaignSpend } from './pacing';

describe('projectMonthlySpend', () => {
  it('extrapolates straight-line from current day-of-month', () => {
    // On day 10 of a 30-day month, EGP 5000 spent → projected EGP 15000
    expect(projectMonthlySpend(5000, 10, 30)).toBe(15000);
  });
  it('returns spend_mtd when on the last day of month', () => {
    expect(projectMonthlySpend(12000, 30, 30)).toBe(12000);
  });
  it('handles day_of_month=1 edge case', () => {
    expect(projectMonthlySpend(500, 1, 30)).toBe(15000);
  });
  it('returns 0 when spend_mtd=0', () => {
    expect(projectMonthlySpend(0, 15, 30)).toBe(0);
  });
});

describe('pctOfCap', () => {
  it('computes pct rounded to whole number', () => {
    expect(pctOfCap(8200, 10000)).toBe(82);
  });
  it('returns 0 when cap is null', () => {
    expect(pctOfCap(5000, null)).toBe(0);
  });
  it('returns 0 when cap is 0', () => {
    expect(pctOfCap(5000, 0)).toBe(0);
  });
  it('returns > 100 when over cap', () => {
    expect(pctOfCap(12000, 10000)).toBe(120);
  });
});
