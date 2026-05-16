import { describe, it, expect, vi } from 'vitest';
import { GET } from './route';

// Minimal supabase mock: returns no due templates, so the per-template loop is
// a no-op and we exercise just the auth + Cairo-gate branches. Chain shape
// mirrors the route's query: from().select().eq('active', true).lte('next_run_date', today)
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ lte: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  }),
}));
vi.mock('@/lib/personal/networth/payment', () => ({
  recordPaymentForRecurringTemplate: vi.fn().mockResolvedValue('pay-1'),
}));

process.env.CRON_SECRET = 'test-secret';

function req(opts: { authHeader?: string; url?: string } = {}): Request {
  return new Request(opts.url ?? 'http://localhost/api/cron/personal-networth-recurring', {
    method: 'GET',
    headers: opts.authHeader ? { authorization: opts.authHeader } : {},
  });
}

describe('personal-networth-recurring cron route', () => {
  it('rejects without bearer', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('runs with ?force=1', async () => {
    const res = await GET(req({
      authHeader: 'Bearer test-secret',
      url: 'http://localhost/api/cron/personal-networth-recurring?force=1',
    }));
    expect(res.status).toBe(200);
  });
});
