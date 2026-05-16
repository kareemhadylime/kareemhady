import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchTikTokIntegratedReport } from './tiktok-client';

describe('fetchTikTokIntegratedReport', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('posts to report/integrated/get/ with given dimensions', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0, message: 'OK',
      data: {
        list: [
          { dimensions: { country_code: 'EGY', campaign_id: '123' },
            metrics: { impressions: '100', clicks: '5', spend: '1.50' } },
        ],
        page_info: { has_more: false, page: 1, total_number: 1 },
      },
    }), { status: 200 }));
    const r = await fetchTikTokIntegratedReport({
      advertiserId: '7000', campaignIds: ['123'],
      dimensions: ['country_code'],
      fromDate: '2026-05-10', toDate: '2026-05-10',
      marketingToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.report_type).toBe('AUDIENCE');
    expect(body.data_level).toBe('AUCTION_CAMPAIGN');
    expect(body.dimensions).toContain('country_code');
    // Cron normalizers all expect stat_time_day on every row — the fetcher
    // must inject it regardless of what the caller asks for.
    expect(body.dimensions).toContain('stat_time_day');
    expect(body.dimensions).toContain('campaign_id');
    expect(body.advertiser_id).toBe('7000');
    expect(body.start_date).toBe('2026-05-10');
    expect(body.end_date).toBe('2026-05-10');
  });

  it('paginates while page_info.has_more', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, data: {
          list: [{ dimensions: { country_code: 'EGY', campaign_id: '1' }, metrics: { impressions: '1', clicks: '1', spend: '1' } }],
          page_info: { has_more: true, page: 1 },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, data: {
          list: [{ dimensions: { country_code: 'ARE', campaign_id: '1' }, metrics: { impressions: '2', clicks: '2', spend: '2' } }],
          page_info: { has_more: false, page: 2 },
        },
      }), { status: 200 }));
    const r = await fetchTikTokIntegratedReport({
      advertiserId: '7000', campaignIds: ['1'],
      dimensions: ['country_code'],
      fromDate: '2026-05-10', toDate: '2026-05-10',
      marketingToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
  });

  it('returns ok=false on tiktok error code', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      code: 40103, message: 'access_token expired',
    }), { status: 200 }));
    const r = await fetchTikTokIntegratedReport({
      advertiserId: '7000', campaignIds: ['1'],
      dimensions: ['country_code'],
      fromDate: '2026-05-10', toDate: '2026-05-10',
      marketingToken: 'tok',
    });
    expect(r.ok).toBe(false);
  });
});
