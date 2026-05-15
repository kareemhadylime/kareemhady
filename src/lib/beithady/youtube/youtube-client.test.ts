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

import { getYouTubeAccessToken } from './youtube-client';

const supabaseUpdates: Array<{ table: string; update: Record<string, unknown>; eqId: number }> = [];

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: 42,
              youtube_refresh_token: 'enc:1//AbCdEf',
              youtube_access_token: null,
              youtube_access_token_expires_at: null,
            },
            error: null,
          }),
        }),
      }),
      update: (update: Record<string, unknown>) => ({
        eq: (_col: string, eqId: number) => {
          supabaseUpdates.push({ table, update, eqId });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

beforeEach(() => {
  supabaseUpdates.length = 0;
  process.env.GOOGLE_CLIENT_ID = 'fake';
  process.env.GOOGLE_CLIENT_SECRET = 'fake';
});

describe('getYouTubeAccessToken — invalid_grant clears dead token', () => {
  it('clears youtube_refresh_token and throws refresh_failed when Google returns invalid_grant', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ error: 'invalid_grant' }),
    }) as unknown as typeof fetch;

    await expect(getYouTubeAccessToken(42)).rejects.toMatchObject({ reason: 'refresh_failed' });
    const cleared = supabaseUpdates.find(u => u.update.youtube_refresh_token === null);
    expect(cleared).toBeDefined();
  });
});
