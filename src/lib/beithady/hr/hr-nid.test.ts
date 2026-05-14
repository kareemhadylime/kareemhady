import { describe, it, expect } from 'vitest';
import { parseEgyptianNid } from './hr-nid';

describe('parseEgyptianNid', () => {
  it('parses a 1990s male NID', () => {
    // century=2→1900, YY=90, MM=06, DD=15, govt=01, seq ends in 1(odd→male)
    expect(parseEgyptianNid('29006150100014')).toEqual({
      dateOfBirth: '1990-06-15',
      gender: 'male',
    });
  });

  it('parses a 2005 female NID', () => {
    // century=3→2000, YY=05, MM=03, DD=22, seq ends in 2(even→female)
    expect(parseEgyptianNid('30503221100027')).toEqual({
      dateOfBirth: '2005-03-22',
      gender: 'female',
    });
  });

  it('returns null for fewer than 14 digits', () => {
    expect(parseEgyptianNid('1234567')).toBeNull();
  });

  it('returns null for non-digit characters', () => {
    expect(parseEgyptianNid('XXXXXXXXXXXXXX')).toBeNull();
  });

  it('returns null for invalid century digit', () => {
    // century digit = 1 is not valid (only 2 or 3)
    expect(parseEgyptianNid('19001010100011')).toBeNull();
  });

  it('returns null for invalid month', () => {
    // MM=13 is invalid
    expect(parseEgyptianNid('29013010100011')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseEgyptianNid('')).toBeNull();
  });
});
