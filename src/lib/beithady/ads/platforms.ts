// Shared types + constants for the multi-platform BH Ads module.
// Used by lib helpers and UI components alike.

export const AD_PLATFORMS = ['meta', 'google', 'tiktok'] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const PAID_PLATFORMS = ['meta', 'google', 'tiktok'] as const;
export type PaidPlatform = (typeof PAID_PLATFORMS)[number];

export const ORGANIC_PLATFORMS = ['instagram', 'tiktok', 'facebook'] as const;
export type OrganicPlatform = (typeof ORGANIC_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<AdPlatform | OrganicPlatform, string> = {
  meta: 'Meta',
  google: 'Google',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

// Status normalised across platforms — UI uses these uppercase values.
export type CampaignStatus = 'DRAFT' | 'PAUSED' | 'ACTIVE' | 'ARCHIVED' | 'ERROR';

export type SyncResult = {
  ok: boolean;
  platform: AdPlatform;
  job_name: string;
  rows_upserted: number;
  leads_ingested: number;
  duration_ms: number;
  error?: string;
  details?: unknown;
};

// IG Reels publish state machine (Meta Graph API status_code values)
export type IgPublishStatus =
  | 'PENDING_CREATE'
  | 'IN_PROGRESS'
  | 'PUBLISHED'
  | 'ERROR'
  | 'EXPIRED';

export type FbCrossPostStatus = 'PENDING' | 'PUBLISHED' | 'ERROR' | 'SKIPPED';

// TikTok Content Posting API state machine
export type TikTokPublishStatus =
  | 'PENDING_CREATE'
  | 'PROCESSING_UPLOAD'
  | 'PROCESSING_DOWNLOAD'
  | 'SEND_TO_USER_INBOX'
  | 'PUBLISH_COMPLETE'
  | 'FAILED'
  | 'EXPIRED';

// Beithady CTWA WABA number — used as the default landing URL for paid ads
// that lack a custom final_url. Kept in one place so swapping the number
// (e.g. when Q-C provisions a different WABA line) only edits this file.
export const BH_WA_PHONE_E164 = '+201101300300';
export function buildBhWaLink(prefilledText?: string): string {
  const digits = BH_WA_PHONE_E164.replace(/[^0-9]/g, '');
  const tail = prefilledText ? `?text=${encodeURIComponent(prefilledText)}` : '';
  return `https://wa.me/${digits}${tail}`;
}

// Egypt countrywide geo IDs. Override per platform via UI for region-specific targeting.
export const DEFAULT_GEO_IDS = {
  google: ['2818'],          // geoTargetConstants/2818
  tiktok: ['6252001'],       // Egypt country code in TikTok geo
  meta: ['EG'],              // ISO alpha-2
} as const;

// Default Google Ads language IDs (English + Arabic)
export const DEFAULT_GOOGLE_LANGUAGE_IDS = ['1000', '1019'];

// Status badge classes (Tailwind) for any platform's campaign status
export function statusBadgeClass(status: string | null | undefined): string {
  if (!status) return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  const u = status.toUpperCase();
  if (u === 'ACTIVE' || u === 'ENABLED' || u === 'ENABLE') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200';
  if (u === 'PAUSED' || u === 'DISABLE' || u === 'DISABLED') return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200';
  if (u === 'DRAFT') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  if (u === 'PUBLISHED' || u === 'PUBLISH_COMPLETE' || u === 'SEND_TO_USER_INBOX') return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200';
  if (u === 'PROCESSING_UPLOAD' || u === 'PROCESSING_DOWNLOAD' || u === 'IN_PROGRESS' || u === 'PENDING_CREATE' || u === 'PENDING') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200';
}
