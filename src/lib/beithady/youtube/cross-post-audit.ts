// src/lib/beithady/youtube/cross-post-audit.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { TargetPlatform } from './picker-errors';

export type RecordCrossPostInput = {
  ads_youtube_video_id: number | null;
  youtube_video_id: string;
  target_platform: TargetPlatform;
  target_post_id?: number | null;
  target_campaign_id?: number | null;
  status: 'queued' | 'published' | 'error';
  error?: string | null;
  created_by_user_id?: string | null;
};

// Best-effort audit row insert. Wrapped in try/catch so publish success
// is never blocked by an audit failure.
export async function recordCrossPost(input: RecordCrossPostInput): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb.from('ads_youtube_cross_posts').insert({
      ads_youtube_video_id: input.ads_youtube_video_id,
      youtube_video_id: input.youtube_video_id,
      target_platform: input.target_platform,
      target_post_id: input.target_post_id ?? null,
      target_campaign_id: input.target_campaign_id ?? null,
      status: input.status,
      error: input.error ?? null,
      created_by_user_id: input.created_by_user_id ?? null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[yt-cross-post] audit insert failed', e);
  }
}
