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

// Step 4: Create adset under the campaign with targeting + budget.
// daily_budget is cents (Meta API quirk). Defaults: EG-only, 18-65.
export async function createMetaAdset(input: {
  accessToken: string;
  adAccountId: string;
  campaign_id: string;
  dailyBudgetUsd: number;
  ageMin?: number;
  ageMax?: number;
  countryCodes?: string[];
}): Promise<{ adset_id: string }> {
  const targeting = {
    geo_locations: { countries: input.countryCodes ?? ['EG'] },
    age_min: input.ageMin ?? 18,
    age_max: input.ageMax ?? 65,
  };
  const res = await metaPost<{ id: string }>(
    `${input.adAccountId}/adsets`,
    {
      name: `auto · ${new Date().toISOString().slice(0, 10)}`,
      campaign_id: input.campaign_id,
      daily_budget: Math.round(input.dailyBudgetUsd * 100),   // cents
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'POST_ENGAGEMENT',
      targeting,
      status: 'PAUSED',
    },
    input.accessToken
  );
  const id = (res.ok ? (res.data as { id?: string })?.id : null) ?? null;
  if (!res.ok || !id) {
    throw new MetaVideoUploadError('adset', JSON.stringify(res.raw ?? { error: 'no_id' }));
  }
  return { adset_id: String(id) };
}

// Step 5: Create ad creative wrapping the video with CTA.
// object_story_spec.video_data ties together: FB page, uploaded video,
// optional thumbnail, title/body copy, and CTA → landingUrl.
export async function createMetaAdCreative(input: {
  accessToken: string;
  adAccountId: string;
  pageId: string;
  video_id: string;
  thumbnailUrl: string | null;
  title: string;
  body: string;
  callToAction: 'LEARN_MORE' | 'BOOK_NOW' | 'SHOP_NOW' | 'CONTACT_US';
  landingUrl: string;
}): Promise<{ creative_id: string }> {
  const videoData: Record<string, unknown> = {
    video_id: input.video_id,
    title: input.title,
    message: input.body,
    call_to_action: {
      type: input.callToAction,
      value: { link: input.landingUrl },
    },
  };
  if (input.thumbnailUrl) videoData.image_url = input.thumbnailUrl;
  const objectStorySpec = {
    page_id: input.pageId,
    video_data: videoData,
  };
  const res = await metaPost<{ id: string }>(
    `${input.adAccountId}/adcreatives`,
    { object_story_spec: objectStorySpec },
    input.accessToken
  );
  const id = (res.ok ? (res.data as { id?: string })?.id : null) ?? null;
  if (!res.ok || !id) {
    throw new MetaVideoUploadError('creative', JSON.stringify(res.raw ?? { error: 'no_id' }));
  }
  return { creative_id: String(id) };
}

// Step 6: Create the ad linking creative + adset. PAUSED for operator
// review — operator must explicitly flip in Ads Manager.
export async function createMetaAd(input: {
  accessToken: string;
  adAccountId: string;
  adset_id: string;
  creative_id: string;
  name: string;
}): Promise<{ ad_id: string }> {
  const res = await metaPost<{ id: string }>(
    `${input.adAccountId}/ads`,
    {
      name: input.name,
      adset_id: input.adset_id,
      creative: { creative_id: input.creative_id },
      status: 'PAUSED',
    },
    input.accessToken
  );
  const id = (res.ok ? (res.data as { id?: string })?.id : null) ?? null;
  if (!res.ok || !id) {
    throw new MetaVideoUploadError('ad', JSON.stringify(res.raw ?? { error: 'no_id' }));
  }
  return { ad_id: String(id) };
}

// Orchestrator: runs all 6 steps, persists a campaign row + audit entry,
// returns success or a typed error result. Always returns "live" mode —
// callers that need a draft-mode fallback should check creds upstream.
export async function publishMetaVideoAd(input: MetaVideoAdInput): Promise<MetaVideoAdResult> {
  try {
    const credsRes = await loadMetaCredentials();
    if (!credsRes.ok) {
      return { ok: false, mode: 'live', step: 'credentials', error: credsRes.error };
    }
    const { token: accessToken, adAccountId, fbPageId } = credsRes.creds;
    if (!fbPageId) {
      return { ok: false, mode: 'live', step: 'credentials', error: 'meta_fb_page_id_missing' };
    }

    const { video_id } = await uploadMetaVideo({ accessToken, adAccountId, file_url: input.videoUrl });
    await pollMetaVideoStatus({ accessToken, video_id });

    const campaignName = input.campaignName ?? `YT cross-post · ${new Date().toISOString().slice(0, 10)}`;
    const { campaign_id } = await createMetaCampaign({ accessToken, adAccountId, campaignName });
    const { adset_id } = await createMetaAdset({
      accessToken, adAccountId, campaign_id,
      dailyBudgetUsd: input.dailyBudgetUsd,
      ageMin: input.ageMin, ageMax: input.ageMax,
      countryCodes: input.countryCodes,
    });
    const { creative_id } = await createMetaAdCreative({
      accessToken, adAccountId, pageId: fbPageId,
      video_id, thumbnailUrl: input.thumbnailUrl ?? null,
      title: input.title, body: input.description,
      callToAction: input.callToAction ?? 'LEARN_MORE',
      landingUrl: input.landingUrl,
    });
    const { ad_id } = await createMetaAd({
      accessToken, adAccountId, adset_id, creative_id,
      name: input.title.slice(0, 80),
    });

    // Persist campaign row. Schema uses daily_budget_micros + objective
    // (NOT daily_budget_usd + campaign_objective). No created_by column.
    const sb = supabaseAdmin();
    const { data } = await sb.from('ads_campaigns').insert({
      account_id: input.accountId,
      platform: 'meta',
      external_id: campaign_id,
      name: campaignName,
      status: 'PAUSED',
      objective: 'OUTCOME_ENGAGEMENT',
      buying_type: 'AUCTION',
      daily_budget_micros: Math.round(input.dailyBudgetUsd * 1_000_000),
      building_codes: input.buildingCodes ?? null,
      raw: {
        kind: 'meta_video_ad_publish',
        video_id, adset_id, creative_id, ad_id,
        landing_url: input.landingUrl,
        cta: input.callToAction ?? 'LEARN_MORE',
      } as object,
    }).select('id').single();

    await recordAudit({
      module: 'ads',
      action: 'meta_video_ad_published',
      target_type: 'campaign',
      target_id: String(campaign_id),
      actor_user_id: input.createdBy ?? null,
      metadata: {
        platform: 'meta',
        kind: 'meta_video_ad_publish',
        external_campaign_id: campaign_id,
        adset_id, creative_id, ad_id, video_id,
        daily_budget_usd: input.dailyBudgetUsd,
        country_codes: input.countryCodes ?? ['EG'],
        building_codes: input.buildingCodes ?? null,
      },
    });

    return {
      ok: true,
      mode: 'live',
      campaign_id: Number((data as { id?: number } | null)?.id ?? 0),
      campaign_external_id: campaign_id,
      ad_external_id: ad_id,
      review_url: `https://www.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace(/^act_/, '')}`,
    };
  } catch (e) {
    const step = e instanceof MetaVideoUploadError ? e.step : 'unknown';
    return { ok: false, mode: 'live', step, error: e instanceof Error ? e.message : String(e) };
  }
}
