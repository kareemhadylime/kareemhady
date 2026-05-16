import { describe, it, expect } from 'vitest';
import { getOverviewKpis, getUpcomingPayments, getCharityYtd } from './queries';

describe('queries module — overview group', () => {
  it('exports all 3 functions', () => {
    expect(typeof getOverviewKpis).toBe('function');
    expect(typeof getUpcomingPayments).toBe('function');
    expect(typeof getCharityYtd).toBe('function');
  });
});
