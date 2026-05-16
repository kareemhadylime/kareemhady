import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchGoogleGeoView, fetchGoogleDemoView, fetchGoogleDeviceView } from './google-client';

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

describe('fetchGoogleDemoView', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('runs gender_view + age_range_view queries and returns both arrays', async () => {
    const spy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        results: [
          { segments: { date: '2026-05-10', gender: 'GENDER_FEMALE' },
            metrics: { impressions: '10', clicks: '1', costMicros: '1000', conversions: '0' },
            campaign: { id: '5' } },
        ],
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        results: [
          { segments: { date: '2026-05-10', ageRange: 'AGE_RANGE_25_34' },
            metrics: { impressions: '20', clicks: '2', costMicros: '2000', conversions: '0' },
            campaign: { id: '5' } },
        ],
      }]), { status: 200 }));
    const r = await fetchGoogleDemoView({
      customerId: '1', campaignId: '5',
      fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gender).toHaveLength(1);
    expect(r.ageRange).toHaveLength(1);
    const q1 = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string).query as string;
    const q2 = JSON.parse((spy.mock.calls[1][1] as RequestInit).body as string).query as string;
    expect(q1).toContain('gender_view');
    expect(q2).toContain('age_range_view');
  });

  it('returns ok=false if gender query fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await fetchGoogleDemoView({
      customerId: '1', campaignId: '5',
      fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(false);
  });
});

describe('fetchGoogleDeviceView', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('uses device_view + returns rows', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([{
      results: [
        { segments: { date: '2026-05-10', device: 'MOBILE' },
          metrics: { impressions: '50', clicks: '5', costMicros: '5000', conversions: '0' },
          campaign: { id: '5' } },
      ],
    }]), { status: 200 }));
    const r = await fetchGoogleDeviceView({
      customerId: '1', campaignId: '5',
      fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toContain('FROM device_view');
    expect(body.query).toContain('segments.device');
  });
});
