import { describe, it, expect } from 'vitest';
import { getOverviewKpis, getUpcomingPayments, getCharityYtd } from './queries';
import { getAssetMix, getLiabilityMix, getMonthlyReport } from './queries';

describe('queries module — overview group', () => {
  it('exports all 3 functions', () => {
    expect(typeof getOverviewKpis).toBe('function');
    expect(typeof getUpcomingPayments).toBe('function');
    expect(typeof getCharityYtd).toBe('function');
  });
});

describe('queries module — mix + reports', () => {
  it('exports all 3 functions', () => {
    expect(typeof getAssetMix).toBe('function');
    expect(typeof getLiabilityMix).toBe('function');
    expect(typeof getMonthlyReport).toBe('function');
  });
});
