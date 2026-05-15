// src/lib/beithady/youtube/cross-post-audit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseInserts: Array<Record<string, unknown>> = [];

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (_table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        supabaseInserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

beforeEach(() => { supabaseInserts.length = 0; });

import { recordCrossPost } from './cross-post-audit';

describe('recordCrossPost', () => {
  it('inserts a row for local-DB source', async () => {
    await recordCrossPost({
      ads_youtube_video_id: 42,
      youtube_video_id: '9fmAI8RJRr8',
      target_platform: 'instagram_reel',
      target_post_id: 7,
      status: 'published',
    });
    expect(supabaseInserts.length).toBe(1);
    const row = supabaseInserts[0];
    expect(row.ads_youtube_video_id).toBe(42);
    expect(row.youtube_video_id).toBe('9fmAI8RJRr8');
    expect(row.target_platform).toBe('instagram_reel');
    expect(row.status).toBe('published');
  });

  it('inserts a row for YT-only source (null ads_youtube_video_id)', async () => {
    await recordCrossPost({
      ads_youtube_video_id: null,
      youtube_video_id: 'qW3eR4t',
      target_platform: 'google_pmax',
      target_campaign_id: 100,
      status: 'published',
    });
    expect(supabaseInserts.length).toBe(1);
    expect(supabaseInserts[0].ads_youtube_video_id).toBeNull();
  });

  it('swallows insert errors (best-effort)', async () => {
    // Re-mock supabase to fail
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({
        from: () => ({
          insert: async () => { throw new Error('db down'); },
        }),
      }),
    }));
    // Re-import to pick up the new mock
    const { recordCrossPost: fresh } = await import('./cross-post-audit');
    // Must not throw
    await expect(fresh({
      ads_youtube_video_id: 1,
      youtube_video_id: 'x',
      target_platform: 'instagram_reel',
      status: 'published',
    })).resolves.toBeUndefined();
  });
});
