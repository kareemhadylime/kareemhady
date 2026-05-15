// src/lib/beithady/youtube/youtube-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { unwrapStoredRefreshToken } from './youtube-client';

vi.mock('@/lib/crypto', () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => {
    if (s.startsWith('enc:')) return s.slice(4);
    throw new Error('not encrypted');
  },
}));

describe('unwrapStoredRefreshToken', () => {
  it('returns decrypted value when input is encrypted', () => {
    expect(unwrapStoredRefreshToken('enc:1//AbCdEf')).toBe('1//AbCdEf');
  });

  it('returns plaintext fallback when input is not encrypted', () => {
    expect(unwrapStoredRefreshToken('1//AbCdEf')).toBe('1//AbCdEf');
  });

  it('returns empty string when input is null', () => {
    expect(unwrapStoredRefreshToken(null)).toBe('');
  });
});
