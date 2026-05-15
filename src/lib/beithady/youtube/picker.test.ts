import { describe, it, expect } from 'vitest';
import { computeActions, computeIsShorts, dedupeByVideoId, type LocalRow, type YouTubeApiRow } from './picker';

describe('computeIsShorts', () => {
  it('returns true for <=60s vertical', () => {
    expect(computeIsShorts(45, 1080, 1920)).toBe(true);
  });
  it('returns false for >60s', () => {
    expect(computeIsShorts(120, 1080, 1920)).toBe(false);
  });
  it('returns false for horizontal even when short', () => {
    expect(computeIsShorts(30, 1920, 1080)).toBe(false);
  });
  it('returns true when width/height unknown but duration <=60', () => {
    expect(computeIsShorts(30, null, null)).toBe(true);
  });
});

describe('computeActions', () => {
  it('Shorts local-DB row -> all 5 actions available', () => {
    const actions = computeActions({ is_shorts: true, in_local_db: true });
    expect(actions.instagram_reel.available).toBe(true);
    expect(actions.tiktok_organic.available).toBe(true);
    expect(actions.tiktok_paid.available).toBe(true);
    expect(actions.meta_video_ad.available).toBe(true);
    expect(actions.google_pmax.available).toBe(true);
  });

  it('long-form local-DB row -> IG Reel + TikTok organic blocked', () => {
    const actions = computeActions({ is_shorts: false, in_local_db: true });
    expect(actions.instagram_reel.available).toBe(false);
    expect(actions.instagram_reel.reason).toContain('Long-form');
    expect(actions.tiktok_organic.available).toBe(false);
    expect(actions.tiktok_paid.available).toBe(true);
    expect(actions.meta_video_ad.available).toBe(true);
    expect(actions.google_pmax.available).toBe(true);
  });

  it('YT-only Shorts row -> only google_pmax available', () => {
    const actions = computeActions({ is_shorts: true, in_local_db: false });
    expect(actions.instagram_reel.available).toBe(false);
    expect(actions.instagram_reel.reason).toContain('upload via app');
    expect(actions.tiktok_organic.available).toBe(false);
    expect(actions.tiktok_paid.available).toBe(false);
    expect(actions.meta_video_ad.available).toBe(false);
    expect(actions.google_pmax.available).toBe(true);
  });

  it('YT-only long-form row -> only google_pmax available', () => {
    const actions = computeActions({ is_shorts: false, in_local_db: false });
    expect(actions.google_pmax.available).toBe(true);
    expect(actions.instagram_reel.available).toBe(false);
  });
});

describe('dedupeByVideoId', () => {
  it('local row wins when same youtube_video_id appears in both', () => {
    const local: LocalRow[] = [{
      id: 42, youtube_video_id: 'x',
      title: 'Local Title', source_url: 'https://sb.url',
      file_size_bytes: 1000, duration_seconds: 60, is_shorts: true,
      building_code: 'BH-26', view_count: 100, like_count: 5, comment_count: 0,
      privacy_status: 'unlisted', published_at: '2026-01-01', stats_synced_at: null,
      thumbnail_url: null, description: null,
    }];
    const api: YouTubeApiRow[] = [{
      youtube_video_id: 'x',
      title: 'API Title',
      thumbnail_url: 'https://yt.thumb',
      duration_seconds: 60,
      published_at: '2026-01-01',
      privacy_status: 'public',
      description: null,
    }];
    const merged = dedupeByVideoId(local, api);
    expect(merged.length).toBe(1);
    expect(merged[0].title).toBe('Local Title');     // local wins
    expect(merged[0].in_local_db).toBe(true);
    expect(merged[0].source_url).toBe('https://sb.url');
  });

  it('YT-only row included when not in local DB', () => {
    const local: LocalRow[] = [];
    const api: YouTubeApiRow[] = [{
      youtube_video_id: 'yt-only',
      title: 'YT Studio Upload',
      thumbnail_url: 'https://yt.thumb',
      duration_seconds: 45,
      published_at: '2026-01-01',
      privacy_status: 'public',
      description: null,
    }];
    const merged = dedupeByVideoId(local, api);
    expect(merged.length).toBe(1);
    expect(merged[0].in_local_db).toBe(false);
    expect(merged[0].source_url).toBeNull();
    expect(merged[0].title).toBe('YT Studio Upload');
  });
});
