import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      update: () => ({
        lt: () => ({
          is: () => ({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

describe('snapshot.ts', () => {
  it('generateSnapshotToken returns 32-char base64url string', async () => {
    const { generateSnapshotToken } = await import('./snapshot');
    const t = generateSnapshotToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('generateSnapshotToken returns unique values across calls', async () => {
    const { generateSnapshotToken } = await import('./snapshot');
    const set = new Set(Array.from({ length: 50 }, () => generateSnapshotToken()));
    expect(set.size).toBe(50);
  });

  it('cleanupExpiredAdsSnapshots returns count of rows zeroed', async () => {
    const { cleanupExpiredAdsSnapshots } = await import('./snapshot');
    const r = await cleanupExpiredAdsSnapshots();
    expect(r.deleted).toBe(2);
  });
});
