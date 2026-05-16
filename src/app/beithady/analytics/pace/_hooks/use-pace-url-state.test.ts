import { describe, it, expect } from 'vitest';
import { parsePaceSearchParams, paceStateToSearchParams } from './use-pace-url-state';

describe('parsePaceSearchParams', () => {
  it('returns defaults when no params given', () => {
    const s = parsePaceSearchParams({});
    expect(s.period).toBe('this-month');
    expect(s.filters.countries).toEqual([]);
    expect(s.filters.includeInactive).toBe(false);
    expect(s.filters.includeHistorical).toBe(false);
  });
  it('parses period, country, city, tag, listingIds, toggles', () => {
    const s = parsePaceSearchParams({
      period: 'last-month',
      country: 'EG,AE',
      city: 'Sahel,Dubai',
      tag: 'beach',
      listing: 'L1,L2',
      inactive: '1',
      historical: '1',
    });
    expect(s.period).toBe('last-month');
    expect(s.filters.countries).toEqual(['EG', 'AE']);
    expect(s.filters.cities).toEqual(['Sahel', 'Dubai']);
    expect(s.filters.tags).toEqual(['beach']);
    expect(s.filters.listingIds).toEqual(['L1', 'L2']);
    expect(s.filters.includeInactive).toBe(true);
    expect(s.filters.includeHistorical).toBe(true);
  });
  it('drops invalid country codes', () => {
    const s = parsePaceSearchParams({ country: 'EG,XX,AE' });
    expect(s.filters.countries).toEqual(['EG', 'AE']);
  });
});

describe('paceStateToSearchParams', () => {
  it('omits defaults so URL stays clean', () => {
    const usp = paceStateToSearchParams({
      period: 'this-month',
      filters: {
        countries: [], cities: [], tags: [], listingIds: [],
        includeInactive: false, includeHistorical: false,
      },
    });
    expect(usp.toString()).toBe('');
  });
  it('round-trips non-default state', () => {
    const usp = paceStateToSearchParams({
      period: 'last-month',
      filters: {
        countries: ['EG'], cities: ['Sahel'], tags: ['beach'], listingIds: [],
        includeInactive: false, includeHistorical: true,
      },
    });
    expect(usp.get('period')).toBe('last-month');
    expect(usp.get('country')).toBe('EG');
    expect(usp.get('city')).toBe('Sahel');
    expect(usp.get('tag')).toBe('beach');
    expect(usp.get('historical')).toBe('1');
    expect(usp.get('inactive')).toBeNull();
  });
});
