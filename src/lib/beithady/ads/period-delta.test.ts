import { describe, it, expect } from 'vitest';
import { computePeriodDelta } from './period-delta';

describe('computePeriodDelta', () => {
  it('returns up direction when current > prior', () => {
    const d = computePeriodDelta(122, 100);
    expect(d).toEqual({ direction: 'up', pctChange: 22, label: '↑ 22%', tone: 'positive' });
  });
  it('returns down direction when current < prior', () => {
    const d = computePeriodDelta(92, 100);
    expect(d).toEqual({ direction: 'down', pctChange: -8, label: '↓ 8%', tone: 'negative' });
  });
  it('returns new when prior=0 and current>0', () => {
    const d = computePeriodDelta(50, 0);
    expect(d).toEqual({ direction: 'new', pctChange: null, label: 'new', tone: 'positive' });
  });
  it('returns null when both=0 (hidden)', () => {
    expect(computePeriodDelta(0, 0)).toBeNull();
  });
  it('returns down -100% when current=0, prior>0', () => {
    const d = computePeriodDelta(0, 50);
    expect(d).toEqual({ direction: 'down', pctChange: -100, label: '↓ 100%', tone: 'negative' });
  });
  it('returns flat when within 0.5% rounding', () => {
    const d = computePeriodDelta(100.4, 100);
    expect(d?.direction).toBe('flat');
    expect(d?.label).toBe('→');
  });
  it('inverts tone with reverseColor (e.g. CPL down is good)', () => {
    const d = computePeriodDelta(80, 100, { reverseColor: true });
    expect(d).toEqual({ direction: 'down', pctChange: -20, label: '↓ 20%', tone: 'positive' });
  });
  it('inverts tone up with reverseColor (CPL up is bad)', () => {
    const d = computePeriodDelta(120, 100, { reverseColor: true });
    expect(d?.tone).toBe('negative');
  });
});
