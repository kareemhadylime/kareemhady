import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('backfillAdsBreakdownsAction (shape)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 's3');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.limeinc.cc');
  });

  it('builds the cron URL with from = today-90d and force=1', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, summary: [] }), { status: 200 }));
    const { backfillAdsBreakdownsAction } = await import('./backfill-ads-breakdowns-action');
    await backfillAdsBreakdownsAction();
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('/api/cron/beithady-ads-breakdowns');
    expect(url).toContain('force=1');
    expect(url).toContain('secret=s3');
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}/);
    expect(url).toMatch(/to=\d{4}-\d{2}-\d{2}/);
  });

  it('returns ok=false on cron failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const { backfillAdsBreakdownsAction } = await import('./backfill-ads-breakdowns-action');
    const r = await backfillAdsBreakdownsAction();
    expect(r.ok).toBe(false);
    expect(r.error).toContain('500');
  });
});
