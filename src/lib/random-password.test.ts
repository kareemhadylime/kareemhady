import { describe, it, expect } from 'vitest';
import { randomFriendlyPassword, FRIENDLY_ALPHABET } from './random-password';

describe('randomFriendlyPassword', () => {
  it('returns 12 characters by default', () => {
    expect(randomFriendlyPassword()).toHaveLength(12);
  });

  it('respects custom length', () => {
    expect(randomFriendlyPassword(20)).toHaveLength(20);
  });

  it('uses only friendly alphabet characters (no 0, O, 1, l, i)', () => {
    const allowed = new Set(FRIENDLY_ALPHABET.split(''));
    for (let i = 0; i < 50; i++) {
      const pw = randomFriendlyPassword(12);
      for (const ch of pw) {
        expect(allowed.has(ch)).toBe(true);
      }
      // explicit negatives
      expect(pw).not.toMatch(/[0O1lI]/);
    }
  });

  it('produces distinct outputs across many calls (probabilistic)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(randomFriendlyPassword(12));
    // 100 calls of 12-char from a 31-char alphabet → collisions are astronomically rare
    expect(seen.size).toBeGreaterThanOrEqual(99);
  });

  it('throws on length < 8', () => {
    expect(() => randomFriendlyPassword(7)).toThrow(/at least 8/);
  });
});
