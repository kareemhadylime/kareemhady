// Shared types + constants for the multi-platform BH Ads module.
// Used by lib helpers and UI components alike.

export const AD_PLATFORMS = ['meta', 'google', 'tiktok', 'youtube'] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const PAID_PLATFORMS = ['meta', 'google', 'tiktok'] as const;
export type PaidPlatform = (typeof PAID_PLATFORMS)[number];

export const ORGANIC_PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube'] as const;
export type OrganicPlatform = (typeof ORGANIC_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<AdPlatform | OrganicPlatform, string> = {
  meta: 'Meta',
  google: 'Google',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
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
export const BH_WA_PHONE_E164 = '+201501010103';
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

// ISO alpha-2 → Google geoTargetConstant ID. Covers Beithady's primary markets
// (Gulf + EU + NA). Add codes here as new targets get used.
// Reference: https://developers.google.com/google-ads/api/data/geotargets
export const ISO_TO_GOOGLE_GEO: Record<string, string> = {
  // GCC + MENA
  EG: '2818', SA: '2682', AE: '2784', OM: '2512', KW: '2414',
  QA: '2634', BH: '2048', JO: '2400', LB: '2422', PS: '2275',
  // Europe (Beithady frequent travellers / EU group)
  FR: '2250', IT: '2380', NL: '2528', DE: '2276', ES: '2724',
  GB: '2826', UK: '2826', IE: '2372', BE: '2056', CH: '2756',
  AT: '2040', SE: '2752', NO: '2578', DK: '2208', FI: '2246',
  PL: '2616', PT: '2620', GR: '2300', RU: '2643', UA: '2804',
  TR: '2792',
  // North America
  US: '2840', CA: '2124', MX: '2484',
  // Asia
  IN: '2356', SG: '2702', MY: '2458', TH: '2764', ID: '2360',
  // Misc frequent traveller countries
  AU: '2036', NZ: '2554', ZA: '2710', BR: '2076',
};

// Resolve a list of ISO alpha-2 country codes → Google geoTargetConstant IDs.
// Drops unknown codes silently (returns whatever matched; empty list if none).
export function isoCountriesToGoogleGeo(codes: string[] | null | undefined): string[] {
  if (!codes?.length) return [];
  const out: string[] = [];
  for (const c of codes) {
    const k = (c || '').trim().toUpperCase();
    if (ISO_TO_GOOGLE_GEO[k]) out.push(ISO_TO_GOOGLE_GEO[k]);
  }
  return out;
}

// Status normalization for the Pause/Activate UI gate. Each platform mirrors
// its own dialect into ads_campaigns.status (Google=ENABLED, Meta=ACTIVE,
// TikTok=ENABLE; PAUSED is common). The unified status dispatcher in
// status.ts speaks 'ACTIVE' | 'PAUSED' and translates per-platform, so the
// UI needs to recognize all dialects as "running" or "paused".
export function isRunningCampaignStatus(status: string | null | undefined): boolean {
  const u = (status || '').toUpperCase();
  return u === 'ACTIVE' || u === 'ENABLED' || u === 'ENABLE';
}
export function isPausedCampaignStatus(status: string | null | undefined): boolean {
  const u = (status || '').toUpperCase();
  return u === 'PAUSED' || u === 'DISABLE' || u === 'DISABLED';
}
export function isFlippableCampaignStatus(status: string | null | undefined): boolean {
  return isRunningCampaignStatus(status) || isPausedCampaignStatus(status);
}
export function nextFlipStatus(status: string | null | undefined): 'PAUSED' | 'ACTIVE' {
  return isRunningCampaignStatus(status) ? 'PAUSED' : 'ACTIVE';
}

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
