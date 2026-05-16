import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchMetaInsightsBreakdown } from './meta-client';

describe('fetchMetaInsightsBreakdown', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('builds a country-breakdown URL and parses one page', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: [
        { campaign_id: '123', country: 'EG', impressions: '1000', clicks: '40', spend: '5.50', reach: '900', date_start: '2026-05-10' },
        { campaign_id: '123', country: 'AE', impressions: '500',  clicks: '20', spend: '2.10', reach: '480', date_start: '2026-05-10' },
      ],
    }), { status: 200 }));
    const r = await fetchMetaInsightsBreakdown({
      entityId: '123', level: 'campaign', breakdowns: 'country',
      fromDate: '2026-05-10', toDate: '2026-05-10', token: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ country: 'EG', impressions: '1000' });
    const calledUrl = (spy.mock.calls[0][0] as string);
    expect(calledUrl).toContain('/123/insights');
    expect(calledUrl).toContain('breakdowns=country');
    expect(calledUrl).toContain('level=campaign');
    expect(calledUrl).toContain('time_increment=1');
  });

  it('follows paging.next across two pages', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ campaign_id: '1', country: 'EG', impressions: '1', clicks: '1', spend: '1', date_start: '2026-05-10' }],
        paging: { next: 'https://graph.facebook.com/v21.0/page2?access_token=tok' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ campaign_id: '1', country: 'AE', impressions: '2', clicks: '2', spend: '2', date_start: '2026-05-10' }],
      }), { status: 200 }));
    const r = await fetchMetaInsightsBreakdown({
      entityId: '1', level: 'campaign', breakdowns: 'country',
      fromDate: '2026-05-10', toDate: '2026-05-10', token: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
  });

  it('returns ok=false on http error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: '(#17) User request limit reached', code: 17 },
    }), { status: 400 }));
    const r = await fetchMetaInsightsBreakdown({
      entityId: '1', level: 'campaign', breakdowns: 'country',
      fromDate: '2026-05-10', toDate: '2026-05-10', token: 'tok',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('User request limit');
  });

  it('builds device breakdowns with publisher_platform + position', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await fetchMetaInsightsBreakdown({
      entityId: '7', level: 'adset',
      breakdowns: 'device_platform,publisher_platform,publisher_position',
      fromDate: '2026-05-01', toDate: '2026-05-07', token: 'tok',
    });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('breakdowns=device_platform%2Cpublisher_platform%2Cpublisher_position');
    expect(url).toContain('level=adset');
  });
});
