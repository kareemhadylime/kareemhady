// src/lib/beithady/youtube/types.ts
import { z } from 'zod';

export type YouTubeStatus = 'queued' | 'uploading' | 'processing' | 'published' | 'error';
export type PrivacyStatus = 'private' | 'unlisted' | 'public';

export const PublishInputSchema = z.object({
  account_id: z.number().int().positive(),
  asset_id: z.string().uuid().optional(),
  building_code: z.string().optional(),
  source_url: z.string().url(),
  file_size_bytes: z.number().int().positive(),
  duration_seconds: z.number().int().nonnegative().optional(),
  is_shorts: z.boolean(),
  title: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  category_id: z.number().int().default(19),
  privacy_status: z.enum(['private', 'unlisted', 'public']).default('unlisted'),
  language: z.string().default('en'),
  template_id: z.string().optional(),
  ai_generated: z.boolean().default(false),
  ai_cost_usd: z.number().nonnegative().optional(),
});
export type PublishInput = z.infer<typeof PublishInputSchema>;

export type PublishedVideo = {
  video_id: string;
  watch_url: string;
  upload_status?: string;
};

export class YouTubeAuthError extends Error {
  constructor(public reason: 'refresh_failed' | 'invalid_grant' | 'no_token') {
    super(reason);
    this.name = 'YouTubeAuthError';
  }
}

export class YouTubeUploadError extends Error {
  constructor(message: string, public retriable: boolean = true) {
    super(message);
    this.name = 'YouTubeUploadError';
  }
}

export class YouTubeQuotaError extends Error {
  constructor() {
    super('quotaExceeded');
    this.name = 'YouTubeQuotaError';
  }
}

export class YouTubeRejectedError extends Error {
  constructor(public rejectionReason: string) {
    super(rejectionReason);
    this.name = 'YouTubeRejectedError';
  }
}

export const SYNC_DURATION_MAX_S = 60;
export const SYNC_SIZE_MAX_BYTES = 200 * 1024 * 1024;
export const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;          // 8 MiB
export const CHUNK_BUDGET_MS = 700_000;                   // 700s per cron invocation
export const SESSION_URL_MAX_AGE_MS = 6 * 24 * 3600 * 1000;  // 6 days (YT expires at 7)
