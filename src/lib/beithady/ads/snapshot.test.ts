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

// server-only guard — stub it out so Vitest can import the module
vi.mock('server-only', () => ({}));

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

  it('cleanupExpiredAdsSnapshots returns ok + count of rows zeroed', async () => {
    const { cleanupExpiredAdsSnapshots } = await import('./snapshot');
    const r = await cleanupExpiredAdsSnapshots();
    expect(r.ok).toBe(true);
    expect(r.cleaned).toBe(2);
  });
});

describe('getAdsSnapshotData', () => {
  it('assembles all 13 slices into an AdsSnapshotPayload', async () => {
    vi.resetModules();

    // Mock every lib function used by the gather
    vi.doMock('@/lib/beithady/ads/reporting', () => ({
      getDashboardKpisWithCompare: vi.fn().mockResolvedValue({
        current: { spend: 100, leads: 5 }, prior: { spend: 80, leads: 4 },
      }),
      listCampaigns: vi.fn().mockResolvedValue([]),
      listLeadFunnel: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/frt', () => ({
      getFrtSummary: vi.fn().mockResolvedValue({ total_leads: 0 }),
      getFrtPerCampaign: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/pacing', () => ({
      getSpendPacing: vi.fn().mockResolvedValue({ daily: [], campaigns: [], total_spend_egp: 0, total_cap_egp: 0 }),
    }));
    vi.doMock('@/lib/beithady/ads/anomalies', () => ({
      detectAnomalies: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/insights-geo', () => ({
      queryGeoRollup: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/insights-demo', () => ({
      queryDemoRollup: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/insights-device', () => ({
      queryDeviceRollup: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/funnel', () => ({
      getFunnelStages: vi.fn().mockResolvedValue({ stages: [] }),
    }));
    vi.doMock('@/lib/beithady/ads/lead-quality', () => ({
      getLeadQualityPerCampaign: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/cohort', () => ({
      getLeadToBookingCohort: vi.fn().mockResolvedValue({ buckets: [] }),
      cellColorBucket: vi.fn().mockReturnValue(''),
    }));
    vi.doMock('@/lib/beithady/ads/hourly', () => ({
      getLeadDensityHeatmap: vi.fn().mockResolvedValue([]),
      getMetaHourlyHeatmap: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/top-ads', () => ({
      getTopAds: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/top-assets', () => ({
      getTopAssets: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/credentials', () => ({
      getProviderEnabled: vi.fn().mockResolvedValue(true),
      getProviderStatus: vi.fn().mockResolvedValue({ config_keys_set: [], has_env_fallback: [] }),
    }));
    vi.doMock('@/lib/fx-rates', () => ({
      convertManyToEgp: vi.fn().mockResolvedValue([]),
    }));

    const { getAdsSnapshotData } = await import('./snapshot');
    const data = await getAdsSnapshotData({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: 'prev_period',
      building: null,
    });

    expect(data.kpis.current).toEqual({ spend: 100, leads: 5 });
    expect(data.kpis.prior).toEqual({ spend: 80, leads: 4 });
    expect(data.campaigns).toEqual([]);
    expect(data.anomalies).toEqual([]);
    expect(data.audience_geo).toEqual([]);
    expect(data.optimize.top_ads).toEqual([]);
  });
});
