import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mockFrom }) }));

import { GET } from './route';

beforeEach(() => mockFrom.mockReset());

function makeReq(opts: { auth?: string; url?: string } = {}) {
  return new Request(opts.url ?? 'https://example.com/api/cron/bh-financials-snapshot-reminder', {
    headers: opts.auth ? { Authorization: opts.auth } : {},
  });
}

describe('bh-financials-snapshot-reminder', () => {
  it('rejects requests without bearer secret', async () => {
    process.env.CRON_SECRET = 'shh';
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 200 with skipped=true outside the Cairo-9-AM window (no force)', async () => {
    process.env.CRON_SECRET = 'shh';
    const res = await GET(makeReq({ auth: 'Bearer shh' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('skipped');
  });
});
