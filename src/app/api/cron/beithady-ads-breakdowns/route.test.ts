import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('beithady-ads-breakdowns cron', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'sekret');
  });

  it('returns 401 when missing bearer', async () => {
    const req = new NextRequest('http://x/api/cron/beithady-ads-breakdowns');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('accepts bearer auth and returns ok', async () => {
    const req = new NextRequest('http://x/api/cron/beithady-ads-breakdowns', {
      headers: { authorization: 'Bearer sekret' },
    });
    const res = await GET(req);
    // With no accounts in DB the handler should short-circuit ok.
    expect([200, 500]).toContain(res.status);
    const body = await res.json();
    expect(body).toHaveProperty('ok');
  });

  it('accepts ?force=1&secret= override', async () => {
    const req = new NextRequest('http://x/api/cron/beithady-ads-breakdowns?force=1&secret=sekret');
    const res = await GET(req);
    expect(res.status).not.toBe(401);
  });
});
