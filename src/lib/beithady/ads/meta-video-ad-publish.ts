import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, metaPost, metaGet } from './meta-client';
import { MetaVideoUploadError } from './meta-video-ad-errors';
import { recordAudit } from '@/lib/beithady/audit';

// NEW Meta video-ad publishing pipeline (YouTube V1.2 cross-post).
// Unlike boost-publish.ts (which boosts an existing organic IG post),
// this takes a raw video URL → uploads to Meta → creates the full
// campaign/adset/creative/ad stack, all PAUSED for operator review.
//
// 6 step functions + 1 orchestrator. Each step throws
// MetaVideoUploadError(step, msg) on failure so the orchestrator can
// surface the failed step name in its typed error result.

export type MetaVideoAdInput = {
  accountId: number;             // ads_accounts.id (platform=meta)
  videoUrl: string;
  title: string;
  description: string;
  callToAction?: 'LEARN_MORE' | 'BOOK_NOW' | 'SHOP_NOW' | 'CONTACT_US';
  landingUrl: string;
  thumbnailUrl?: string | null;
  campaignName?: string;
  dailyBudgetUsd: number;
  ageMin?: number;
  ageMax?: number;
  countryCodes?: string[];
  buildingCodes?: string[];
  createdBy?: string | null;
};

export type MetaVideoAdResult =
  | { ok: true; mode: 'live'; campaign_id: number; campaign_external_id: string; ad_external_id: string; review_url: string | null }
  | { ok: false; mode: 'live'; step: string; error: string; raw?: unknown };

// Step 1: Upload video to Meta via /act_{id}/advideos endpoint.
// Meta fetches the bytes from file_url server-side, so the URL must be
// publicly accessible (HTTPS, signed Supabase URL, etc.).
export async function uploadMetaVideo(input: {
  accessToken: string;
  adAccountId: string;
  file_url: string;
}): Promise<{ video_id: string }> {
  const res = await metaPost<{ id: string }>(
    `${input.adAccountId}/advideos`,
    { file_url: input.file_url },
    input.accessToken
  );
  const id = (res.ok ? (res.data as { id?: string })?.id : null) ?? null;
  if (!res.ok || !id) {
    throw new MetaVideoUploadError('advideos', JSON.stringify(res.raw ?? { error: 'no_id' }));
  }
  return { video_id: String(id) };
}

// Step 2: Poll the uploaded video's processing status until 'ready'.
// Meta processes uploaded videos for ~5-30s before they're usable as
// ad creatives. Throws on either explicit error status or max-tries
// exhaustion.
export async function pollMetaVideoStatus(input: {
  accessToken: string;
  video_id: string;
  maxTries?: number;
  intervalMs?: number;
}): Promise<{ status: 'ready' }> {
  const max = input.maxTries ?? 30;
  const interval = input.intervalMs ?? 6_000;
  for (let i = 0; i < max; i++) {
    const res = await metaGet<{ status?: { video_status?: string } }>(
      `${input.video_id}?fields=status`,
      input.accessToken
    );
    const status = res.ok
      ? (res.data as { status?: { video_status?: string } } | undefined)?.status?.video_status
      : undefined;
    if (status === 'ready') return { status: 'ready' };
    if (status === 'error') throw new MetaVideoUploadError('status_poll', 'video status=error');
    await new Promise(r => setTimeout(r, interval));
  }
  throw new MetaVideoUploadError('status_poll', `did not reach ready after ${max} tries`);
}

// Step 3: Create a Meta campaign. Always PAUSED so operator reviews
// before activating. OUTCOME_ENGAGEMENT matches the rest of the BH ad
// stack (boost-publish, etc.).
export async function createMetaCampaign(input: {
  accessToken: string;
  adAccountId: string;
  campaignName: string;
}): Promise<{ campaign_id: string }> {
  const res = await metaPost<{ id: string }>(
    `${input.adAccountId}/campaigns`,
    {
      name: input.campaignName,
      objective: 'OUTCOME_ENGAGEMENT',
      status: 'PAUSED',
      special_ad_categories: [],
    },
    input.accessToken
  );
  const id = (res.ok ? (res.data as { id?: string })?.id : null) ?? null;
  if (!res.ok || !id) {
    throw new MetaVideoUploadError('campaign', JSON.stringify(res.raw ?? { error: 'no_id' }));
  }
  return { campaign_id: String(id) };
}
