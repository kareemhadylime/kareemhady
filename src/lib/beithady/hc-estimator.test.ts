import { describe, it, expect } from 'vitest';
import { getLastMonthKey, getLastMonthWindow, assignWeek } from './hc-estimator';

describe('getLastMonthKey', () => {
  it('returns YYYY-MM for last month', () => {
    const may2026 = new Date('2026-05-13T00:00:00Z');
    expect(getLastMonthKey(may2026)).toBe('2026-04');
  });

  it('handles January (wraps to previous year)', () => {
    const jan2027 = new Date('2027-01-15T00:00:00Z');
    expect(getLastMonthKey(jan2027)).toBe('2026-12');
  });
});

describe('getLastMonthWindow', () => {
  it('returns first and last day of previous month', () => {
    const may2026 = new Date('2026-05-13T00:00:00Z');
    const { from, to, label } = getLastMonthWindow(may2026);
    expect(from).toBe('2026-04-01');
    expect(to).toBe('2026-04-30');
    expect(label).toBe('April 2026');
  });
});

describe('assignWeek', () => {
  it('assigns day 1 to week 1', () => expect(assignWeek(1)).toBe(1));
  it('assigns day 7 to week 1', () => expect(assignWeek(7)).toBe(1));
  it('assigns day 8 to week 2', () => expect(assignWeek(8)).toBe(2));
  it('assigns day 14 to week 2', () => expect(assignWeek(14)).toBe(2));
  it('assigns day 15 to week 3', () => expect(assignWeek(15)).toBe(3));
  it('assigns day 22 to week 4', () => expect(assignWeek(22)).toBe(4));
  it('assigns day 31 to week 4', () => expect(assignWeek(31)).toBe(4));
});
