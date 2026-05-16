import { describe, it, expect, vi } from 'vitest';
import { POST } from './route';

// Minimal supabase mock: returns no users, so the route's per-user loop is a
// no-op and we exercise just the auth + Cairo-gate branches in this file.
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  }),
}));
vi.mock('@/lib/personal/networth/snapshot', () => ({
  takeSnapshot: vi.fn().mockResolvedValue({ snapshotId: 'snap-1', netWorthEgp: 1234 }),
}));

process.env.CRON_SECRET = 'test-secret';

function req(opts: { authHeader?: string; url?: string } = {}): Request {
  return new Request(opts.url ?? 'http://localhost/api/cron/personal-networth-snapshot', {
    method: 'POST',
    headers: opts.authHeader ? { authorization: opts.authHeader } : {},
  });
}

describe('personal-networth-snapshot cron route', () => {
  it('rejects without bearer', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('rejects wrong bearer', async () => {
    const res = await POST(req({ authHeader: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('skips outside Cairo 9am without force', async () => {
    // Mock Date so Cairo hour is not 9. Must use `function()` (not an arrow),
    // because `new Date()` calls the constructor and arrow functions cannot be
    // constructed — vitest itself warns about this pattern.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T02:00:00Z')); // Cairo = 05:00
    try {
      const res = await POST(req({ authHeader: 'Bearer test-secret' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.skipped).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs with ?force=1 regardless of hour', async () => {
    const res = await POST(req({
      authHeader: 'Bearer test-secret',
      url: 'http://localhost/api/cron/personal-networth-snapshot?force=1',
    }));
    expect(res.status).toBe(200);
  });
});
