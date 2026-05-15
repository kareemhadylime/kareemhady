// src/lib/beithady/youtube/picker-errors.ts

export type PickerSourceUnavailableReason =
  | 'not_found'
  | 'source_url_expired'
  | 'yt_only_no_bytes';

export class PickerSourceUnavailableError extends Error {
  constructor(public yt_video_id: string, public reason: PickerSourceUnavailableReason) {
    super(`picker_source_unavailable: ${yt_video_id} (${reason})`);
    this.name = 'PickerSourceUnavailableError';
  }
}

// Non-fatal — audit insert failures are logged but swallowed
export class CrossPostAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossPostAuditError';
  }
}

export type TargetPlatform =
  | 'instagram_reel'
  | 'tiktok_organic'
  | 'tiktok_paid'
  | 'meta_video_ad'
  | 'google_pmax';

export const TARGET_PLATFORMS: readonly TargetPlatform[] = [
  'instagram_reel',
  'tiktok_organic',
  'tiktok_paid',
  'meta_video_ad',
  'google_pmax',
] as const;
