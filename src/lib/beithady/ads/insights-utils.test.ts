import { describe, it, expect } from 'vitest';
import { asInt, asMicros } from './insights-utils';

describe('asInt', () => {
  it('parses numeric strings', () => expect(asInt('42')).toBe(42));
  it('rounds decimals', () => expect(asInt('1.7')).toBe(2));
  it('returns 0 for non-numeric', () => expect(asInt('nope')).toBe(0));
  it('returns 0 for undefined', () => expect(asInt(undefined)).toBe(0));
  it('returns 0 for null', () => expect(asInt(null)).toBe(0));
});

describe('asMicros', () => {
  it('converts whole units to micros', () => expect(asMicros('5.50')).toBe(5_500_000));
  it('handles 0', () => expect(asMicros('0')).toBe(0));
  it('returns 0 for non-numeric', () => expect(asMicros('boom')).toBe(0));
});
