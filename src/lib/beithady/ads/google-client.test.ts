import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchGoogleGeoView } from './google-client';

const FAKE_CREDS = {
  developer_token: 'dev', client_id: 'c', client_secret: 's',
  refresh_token: 'r', login_customer_id: '395-304-4686',
};

describe('fetchGoogleGeoView', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns rows + uses geographic_view with date filter', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([{
      results: [
        { segments: { date: '2026-05-10', geoTargetCountry: 'geoTargetConstants/2818', geoTargetCity: null },
          metrics: { impressions: '100', clicks: '5', costMicros: '12345', conversions: '0' },
          campaign: { id: '999' } },
      ],
    }]), { status: 200 }));
    const r = await fetchGoogleGeoView({
      customerId: '1234567890', campaignId: '999',
      fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toContain('geographic_view');
    expect(body.query).toContain("segments.date BETWEEN '2026-05-10' AND '2026-05-10'");
    expect(body.query).toContain('campaign.id = 999');
  });

  it('returns ok=false on http error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
    const r = await fetchGoogleGeoView({
      customerId: '1', campaignId: '1', fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(false);
  });
});
