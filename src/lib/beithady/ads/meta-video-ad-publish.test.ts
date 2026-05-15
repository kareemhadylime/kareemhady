import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 1 } }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

vi.mock('./meta-client', () => ({
  loadMetaCredentials: async () => ({
    ok: true,
    creds: {
      token: 'fake_token',
      businessId: 'biz_999',
      adAccountId: 'act_123',
      fbPageId: 'page_456',
    },
  }),
  metaPost: vi.fn(),
  metaGet: vi.fn(),
}));

vi.mock('@/lib/beithady/audit', () => ({
  recordAudit: async () => undefined,
}));

import { uploadMetaVideo, pollMetaVideoStatus, createMetaCampaign } from './meta-video-ad-publish';

beforeEach(() => { vi.clearAllMocks(); });

describe('uploadMetaVideo', () => {
  it('POSTs to /act_{id}/advideos and returns video_id', async () => {
    const { metaPost } = await import('./meta-client');
    (metaPost as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { id: 'video_abc' }, raw: { id: 'video_abc' } });
    const result = await uploadMetaVideo({
      accessToken: 'fake_token',
      adAccountId: 'act_123',
      file_url: 'https://example.com/video.mp4',
    });
    expect(result.video_id).toBe('video_abc');
    expect(metaPost).toHaveBeenCalled();
  });

  it('throws MetaVideoUploadError(advideos) when API returns no id', async () => {
    const { metaPost } = await import('./meta-client');
    (metaPost as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 400, error: 'boom', raw: { error: { message: 'boom' } } });
    await expect(uploadMetaVideo({
      accessToken: 'fake', adAccountId: 'act_123', file_url: 'https://x.com/v.mp4',
    })).rejects.toMatchObject({ step: 'advideos' });
  });
});

describe('pollMetaVideoStatus', () => {
  it('returns ready when status=ready', async () => {
    const { metaGet } = await import('./meta-client');
    (metaGet as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { status: { video_status: 'ready' } }, raw: {} });
    const result = await pollMetaVideoStatus({ accessToken: 'fake', video_id: 'video_abc', maxTries: 1, intervalMs: 1 });
    expect(result.status).toBe('ready');
  });

  it('throws after max tries when status stays processing', async () => {
    const { metaGet } = await import('./meta-client');
    (metaGet as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { status: { video_status: 'processing' } }, raw: {} });
    await expect(pollMetaVideoStatus({ accessToken: 'fake', video_id: 'video_abc', maxTries: 1, intervalMs: 1 }))
      .rejects.toMatchObject({ step: 'status_poll' });
  });

  it('throws when status=error', async () => {
    const { metaGet } = await import('./meta-client');
    (metaGet as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { status: { video_status: 'error' } }, raw: {} });
    await expect(pollMetaVideoStatus({ accessToken: 'fake', video_id: 'video_abc', maxTries: 1, intervalMs: 1 }))
      .rejects.toMatchObject({ step: 'status_poll' });
  });
});

describe('createMetaCampaign', () => {
  it('POSTs to /campaigns with status=PAUSED and returns id', async () => {
    const { metaPost } = await import('./meta-client');
    (metaPost as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { id: 'camp_789' }, raw: {} });
    const result = await createMetaCampaign({
      accessToken: 'fake', adAccountId: 'act_123', campaignName: 'Test',
    });
    expect(result.campaign_id).toBe('camp_789');
  });

  it('throws MetaVideoUploadError(campaign) when API fails', async () => {
    const { metaPost } = await import('./meta-client');
    (metaPost as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 400, error: 'permission', raw: { error: 'permission' } });
    await expect(createMetaCampaign({
      accessToken: 'fake', adAccountId: 'act_123', campaignName: 'Test',
    })).rejects.toMatchObject({ step: 'campaign' });
  });
});
