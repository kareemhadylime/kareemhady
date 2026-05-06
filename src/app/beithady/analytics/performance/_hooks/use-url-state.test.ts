import { describe, it, expect } from 'vitest';
import { buildPerfUrl } from './use-url-state';

describe('buildPerfUrl', () => {
  it('keeps existing params when only one changes', () => {
    const url = buildPerfUrl({ date: '2026-05-05', building: 'BH-26', compare: 'last-week' }, { building: 'BH-73' });
    expect(url).toBe('/beithady/analytics/performance?date=2026-05-05&building=BH-73&compare=last-week');
  });

  it('omits default values', () => {
    const url = buildPerfUrl({ date: undefined, building: 'all', compare: 'yesterday' }, {});
    expect(url).toBe('/beithady/analytics/performance');
  });

  it('handles compare=none by writing it explicitly', () => {
    const url = buildPerfUrl({ date: undefined, building: 'all', compare: 'yesterday' }, { compare: 'none' });
    expect(url).toBe('/beithady/analytics/performance?compare=none');
  });
});
