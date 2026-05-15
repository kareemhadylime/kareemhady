// src/lib/beithady/ads/meta-video-ad-errors.ts

export type MetaVideoUploadStep =
  | 'advideos'
  | 'status_poll'
  | 'campaign'
  | 'adset'
  | 'creative'
  | 'ad';

export class MetaVideoUploadError extends Error {
  constructor(public step: MetaVideoUploadStep, message: string) {
    super(`meta_video_upload_failed[${step}]: ${message}`);
    this.name = 'MetaVideoUploadError';
  }
}
