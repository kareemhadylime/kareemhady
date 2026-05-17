import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCurrentUser = vi.fn();
const mockHasPermission = vi.fn();
const mockGetSnapshotData = vi.fn();
const mockGenerateAiSummary = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock('@/lib/auth', () => ({ getCurrentUser: mockCurrentUser }));
vi.mock('@/lib/beithady/auth', () => ({
  hasBeithadyPermission: mockHasPermission,
  requireBeithadyPermission: vi.fn(),
}));
vi.mock('@/lib/beithady/ads/snapshot', async () => {
  const actual = await vi.importActual<typeof import('@/lib/beithady/ads/snapshot')>('@/lib/beithady/ads/snapshot');
  return { ...actual, getAdsSnapshotData: mockGetSnapshotData, generateSnapshotToken: () => 'fixed-token-32-chars-base64url--xx' };
});
vi.mock('@/lib/beithady/ads/ai-summary', () => ({
  generateAiSummary: mockGenerateAiSummary,
  AI_SUMMARY_DAILY_CAP: 20,
}));
vi.mock('@/lib/beithady/audit', () => ({ recordAudit: mockRecordAudit }));

const insertMock = vi.fn().mockResolvedValue({ error: null });
const auditCountMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'ads_dashboard_snapshots') return { insert: insertMock };
      if (table === 'beithady_audit_log') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: auditCountMock,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentUser.mockResolvedValue({ id: 'user-1', username: 'kareem', email: 'k@x' });
  mockHasPermission.mockResolvedValue(true);
  mockGetSnapshotData.mockResolvedValue({
    kpis: { current: {}, prior: null }, campaigns: [], recent_leads: [],
    platform_status: { meta: {}, google: {}, tiktok: {} },
    frt: null, spend_pacing: {}, anomalies: [], audience_summary: {},
    audience_geo: [], audience_demo: [], audience_device: [],
    funnel: {}, quality: [], cohort: { buckets: [] },
    time: { lead_density: [], meta_hourly: [] }, optimize: { top_ads: [], top_assets: [] },
  });
  mockGenerateAiSummary.mockResolvedValue({ ok: true, text: 'P1\n\nP2\n\nP3', cost_usd: 0.01 });
  auditCountMock.mockResolvedValue({ count: 0, error: null });
});

describe('createAdsShareLinkAction', () => {
  it('success path returns token + URL + expires_at', async () => {
    const { createAdsShareLinkAction } = await import('./actions');
    const r = await createAdsShareLinkAction({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: null, building: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.token).toBe('fixed-token-32-chars-base64url--xx');
    expect(r.url).toMatch(/\/r\/beithady\/ads\/fixed-token-32-chars-base64url--xx$/);
    expect(insertMock).toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalledWith(expect.objectContaining({
      module: 'ads', action: 'ads_share_link_created',
    }));
  });

  it('rate_limit when audit log already has 5 entries today', async () => {
    auditCountMock.mockResolvedValueOnce({ count: 5, error: null });
    const { createAdsShareLinkAction } = await import('./actions');
    const r = await createAdsShareLinkAction({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: null, building: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('rate_limit');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('graceful AI cap-skip — snapshot succeeds with ai_skipped_reason', async () => {
    mockGenerateAiSummary.mockResolvedValueOnce({ ok: false, error: 'cap_reached', cost_usd: 0, detail: 'over cap' });
    const { createAdsShareLinkAction } = await import('./actions');
    const r = await createAdsShareLinkAction({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: null, building: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.ai_skipped_reason).toBe('cap_reached');
    // Inserted payload should have ai_summary=null
    const insertedPayload = insertMock.mock.calls[0][0].payload;
    expect(insertedPayload.ai_summary).toBeNull();
    expect(insertedPayload.meta.ai_skipped_reason).toBe('cap_reached');
  });

  it('data_error when getAdsSnapshotData throws', async () => {
    mockGetSnapshotData.mockRejectedValueOnce(new Error('supabase down'));
    const { createAdsShareLinkAction } = await import('./actions');
    const r = await createAdsShareLinkAction({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: null, building: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('data_error');
    expect(r.message).toContain('supabase down');
  });
});
