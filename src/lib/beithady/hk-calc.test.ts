// src/lib/beithady/hk-calc.test.ts
import { describe, it, expect } from 'vitest';
import { calculateHKWeeks, coverageFactor } from './hk-calc';
import type { HKBaseData, HKInputs } from './hc-estimator-types';

const INPUTS: HKInputs = {
  multiplier: 1,
  buildings: {
    'BH-26':  { generalAreaHrsPerDay: 2, nightShiftHKs: 1 },
    'BH-73':  { generalAreaHrsPerDay: 2, nightShiftHKs: 1 },
    'BH-435': { generalAreaHrsPerDay: 1, nightShiftHKs: 1 },
    'BH-OK':  { generalAreaHrsPerDay: 1, nightShiftHKs: 1 },
  },
};

const BASE: HKBaseData = {
  month: 'April 2026',
  totalCheckins: { studio: 2, oneBR: 2, twoBR: 2, threeBR: 0, fourBR: 0 },
  totalRollovers: 0,
  avgStayInsPerDay: 4,
  weeks: [
    {
      week: 1,
      days: [
        {
          date: '2026-04-01',
          building: 'BH-26',
          checkins: { studio: 1, oneBR: 1, twoBR: 1, threeBR: 0, fourBR: 0 },
          stayIns: 4,
          sameDayRollovers: 0,
        },
        // Remaining buildings contribute 0 for simplicity
        { date: '2026-04-01', building: 'BH-73',  checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
        { date: '2026-04-01', building: 'BH-435', checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
        { date: '2026-04-01', building: 'BH-OK',  checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
      ],
    },
    { week: 2, days: [] },
    { week: 3, days: [] },
    { week: 4, days: [] },
  ],
};

describe('coverageFactor', () => {
  it('rounds up correctly', () => {
    expect(coverageFactor(6)).toBe(7);   // 6 × 7/6 = 7
    expect(coverageFactor(10)).toBe(12); // 10 × 7/6 = 11.67 → 12
    expect(coverageFactor(0)).toBe(0);
  });
});

describe('calculateHKWeeks — W1 with known inputs', () => {
  it('computes turnover hours correctly', () => {
    const result = calculateHKWeeks(BASE, INPUTS);
    const w1 = result.weeks[0];
    // Studio(1) + 1BR(1) = 2 small × 1hr × 1HK = 2hrs
    // 2BR(1) = 1 large × 1hr × 2HKs = 2hrs
    // stayIns 4 × 5% × 1hr = 0.2hrs
    // areas = 2+2+1+1 = 6hrs
    // total = 2 + 2 + 0.2 + 6 = 10.2hrs
    // dayHKs = ceil(10.2 / 8) = 2
    expect(w1.dayHKs).toBe(2);
    expect(w1.nightHKs).toBe(4); // 1 per building × 4 buildings
  });

  it('applies rollover override when rollovers demand more HKs', () => {
    const withRollovers: HKBaseData = {
      ...BASE,
      weeks: [
        {
          week: 1,
          days: [
            {
              date: '2026-04-01', building: 'BH-26',
              checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 },
              stayIns: 0,
              sameDayRollovers: 9, // 9 rollovers → 9 HK-hrs ÷ 4hr window = 3 peak HKs
            },
            { date: '2026-04-01', building: 'BH-73',  checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
            { date: '2026-04-01', building: 'BH-435', checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
            { date: '2026-04-01', building: 'BH-OK',  checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
          ],
        },
        { week: 2, days: [] },
        { week: 3, days: [] },
        { week: 4, days: [] },
      ],
    };
    const result = calculateHKWeeks(withRollovers, INPUTS);
    const w1 = result.weeks[0];
    // Areas only: ceil(6/8) = 1 baseline day HK
    // Rollover: 9 rollovers → rolloverHKHrs = 9 × 1 = 9 → peakHKs = ceil(9/4) = 3 → override fires
    expect(w1.rolloverOverride).toBe(true);
    expect(w1.dayHKs).toBeGreaterThan(1);
  });
});
