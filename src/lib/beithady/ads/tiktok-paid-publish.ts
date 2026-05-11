import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import {
  loadTikTokAppCredentials,
  ttBizPost,
  ttBizGet,
  ageGroupsFor,
} from './tiktok-client';
import { buildBhWaLink, DEFAULT_GEO_IDS } from './platforms';

// Publish a TikTok TRAFFIC ad via Business API v1.3.
// Ports C:\Voltauto-pricing\supabase\functions\ads-tiktok-paid-publish\index.ts.
//
// Flow: Campaign → Video upload → Cover upload → Ad Group → Ad.
// All steps create entities in DISABLE (paused) state for operator review.

export type TikTokPaidInput = {
  accountId: number;                  // ads_accounts.id (platform=tiktok)
  videoUrl: string;                   // public HTTPS
  adText: string;                     // ≤100 chars
  dailyBudgetUsd: number;
  ageMin?: number;                    // default 18
  ageMax?: number;                    // default 55
  gender?: 'GENDER_MALE' | 'GENDER_FEMALE' | 'GENDER_UNLIMITED';
  locationIds?: string[];             // default Egypt
  landingUrl?: string;                // default wa.me Beithady
  campaignName?: string;
  buildingCodes?: string[];
  createdBy?: string | null;
};

export type TikTokPaidResult =
  | {
      ok: true;
      mode: 'live' | 'draft';
      campaign_id: number;
      campaign_external_id: string;
      adgroup_external_id: string;
      ad_external_id: string | null;
      video_id: string | null;
      review_url: string | null;
    }
  | { ok: false; mode: 'live' | 'draft'; step: string; error: string; raw?: unknown };

export async function publishTikTokTrafficAd(input: TikTokPaidInput): Promise<TikTokPaidResult> {
  const sb = supabaseAdmin();

  // Validate
  if (!input.accountId) return { ok: false, mode: 'live', step: 'validate', error: 'account_id required' };
  if (!input.videoUrl?.startsWith('https://')) return { ok: false, mode: 'live', step: 'validate', error: 'video_url https required' };
  if (!input.adText?.trim()) return { ok: false, mode: 'live', step: 'validate', error: 'ad_text required' };
  if (!Number.isFinite(input.dailyBudgetUsd) || input.dailyBudgetUsd < 1) {
    return { ok: false, mode: 'live', step: 'validate', error: 'daily_budget_usd must be >= 1' };
  }

  // Load account
  const { data: acc } = await sb
    .from('ads_accounts')
    .select('id, platform, tiktok_advertiser_id, tiktok_identity_id, tiktok_identity_type')
    .eq('id', input.accountId)
    .maybeSingle();
  if (!acc) return { ok: false, mode: 'live', step: 'load_account', error: 'account_not_found' };
  const a = acc as {
    id: number;
    platform: string;
    tiktok_advertiser_id: string | null;
    tiktok_identity_id: string | null;
    tiktok_identity_type: string | null;
  };
  if (a.platform !== 'tiktok') return { ok: false, mode: 'live', step: 'load_account', error: 'account_not_tiktok' };

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const campaignName = (input.campaignName || `[Beit Hady] CTWA TikTok ${stamp}`).trim();
  const adgroupName = `[Beit Hady] AdGroup ${stamp}`;
  const adName = `[Beit Hady] Ad ${stamp}`;
  const dailyBudgetMicros = Math.round(input.dailyBudgetUsd * 1_000_000);
  const ageMin = Math.max(13, input.ageMin || 18);
  const ageMax = Math.min(100, input.ageMax || 55);
  const gender = input.gender || 'GENDER_UNLIMITED';
  const locationIds = (input.locationIds && input.locationIds.length ? input.locationIds : DEFAULT_GEO_IDS.tiktok) as readonly string[];
  let landingUrl = (input.landingUrl || buildBhWaLink()).trim();

  // Building-keyed UTM auto-append (mirrors Google publish behavior).
  if ((input.buildingCodes || []).length > 0 && !/[?&]utm_/.test(landingUrl)) {
    const sep = landingUrl.includes('?') ? '&' : '?';
    const utm = new URLSearchParams({
      utm_source: 'tiktok',
      utm_medium: 'cpc',
      utm_campaign: `${input.buildingCodes![0]}-tiktok`,
    });
    landingUrl = `${landingUrl}${sep}${utm.toString()}`;
  }

  // Load creds
  const credsRes = await loadTikTokAppCredentials();
  const hasLiveCreds = credsRes.ok && !!credsRes.creds.marketing_access_token && !!a.tiktok_advertiser_id && !!a.tiktok_identity_id;

  // DRAFT MODE — credentials/setup missing
  if (!hasLiveCreds) {
    const externalIdSeed = `draft_tt_${Date.now()}`;
    const { data: campIns } = await sb
      .from('ads_campaigns')
      .insert({
        account_id: input.accountId,
        platform: 'tiktok',
        external_id: `${externalIdSeed}_camp`,
        name: campaignName,
        status: 'DRAFT',
        objective: 'TRAFFIC',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes || [],
      })
      .select('id')
      .single();
    if (!campIns) return { ok: false, mode: 'draft', step: 'draft_insert', error: 'insert_failed' };
    const dbCampId = (campIns as { id: number }).id;

    const { data: setIns } = await sb
      .from('ads_ad_sets')
      .insert({
        campaign_id: dbCampId,
        platform: 'tiktok',
        external_id: `${externalIdSeed}_adgroup`,
        name: adgroupName,
        status: 'DRAFT',
        optimization_goal: 'CLICK',
        daily_budget_micros: dailyBudgetMicros,
        target_countries: locationIds as string[],
        age_min: ageMin,
        age_max: ageMax,
        targeting: { gender, age_groups: ageGroupsFor(ageMin, ageMax), location_ids: locationIds } as object,
      })
      .select('id')
      .single();

    await sb.from('ads_ads').insert({
      ad_set_id: (setIns as { id: number } | null)?.id,
      platform: 'tiktok',
      external_id: `${externalIdSeed}_ad`,
      name: adName,
      status: 'DRAFT',
      creative_type: 'video',
      creative_url: input.videoUrl,
      headline: input.adText.slice(0, 100),
      body: input.adText,
      landing_url: landingUrl,
    });

    await recordAudit({
      module: 'ads',
      action: 'campaign_drafted',
      target_type: 'campaign',
      target_id: String(dbCampId),
      metadata: {
        platform: 'tiktok',
        reason: credsRes.ok ? 'missing_advertiser_or_identity' : credsRes.error,
        missing: credsRes.ok ? [] : credsRes.missing,
      },
    });

    return {
      ok: true,
      mode: 'draft',
      campaign_id: dbCampId,
      campaign_external_id: `${externalIdSeed}_camp`,
      adgroup_external_id: `${externalIdSeed}_adgroup`,
      ad_external_id: `${externalIdSeed}_ad`,
      video_id: null,
      review_url: null,
    };
  }

  // LIVE MODE
  const marketingToken = (credsRes as { ok: true; creds: { marketing_access_token: string } }).creds.marketing_access_token;
  const advertiserId = a.tiktok_advertiser_id as string;
  const identityId = a.tiktok_identity_id as string;
  const identityType = a.tiktok_identity_type || 'CUSTOMIZED_USER';

  // Step 1: campaign (TRAFFIC, infinite budget; budget at adgroup level)
  const campRes = await ttBizPost('/campaign/create/', {
    advertiser_id: advertiserId,
    campaign_name: campaignName,
    objective_type: 'TRAFFIC',
    budget_mode: 'BUDGET_MODE_INFINITE',
    operation_status: 'DISABLE',
  }, marketingToken);
  if (!campRes.ok) return { ok: false, mode: 'live', step: 'create_campaign', error: 'biz_failed', raw: campRes.body };
  const campaignExternalId = String((campRes.body as { data?: { campaign_id?: string } }).data?.campaign_id || '');
  if (!campaignExternalId) return { ok: false, mode: 'live', step: 'create_campaign', error: 'no_campaign_id', raw: campRes.body };

  // Step 2: video upload (pull from URL)
  const vidRes = await ttBizPost('/file/video/ad/upload/', {
    advertiser_id: advertiserId,
    upload_type: 'UPLOAD_BY_URL',
    video_url: input.videoUrl,
  }, marketingToken);
  if (!vidRes.ok) return { ok: false, mode: 'live', step: 'upload_video', error: 'biz_failed', raw: vidRes.body };
  const vidList = (vidRes.body as { data?: unknown }).data;
  const video = Array.isArray(vidList) ? vidList[0] : ((vidList as { list?: unknown[] })?.list?.[0]);
  const videoId = String((video as { video_id?: string } | undefined)?.video_id || '');
  const videoCoverUrl = String((video as { video_cover_url?: string } | undefined)?.video_cover_url || '');
  if (!videoId) return { ok: false, mode: 'live', step: 'upload_video', error: 'no_video_id', raw: vidRes.body };

  // Step 3: cover image
  let coverImageId = '';
  if (videoCoverUrl) {
    const imgRes = await ttBizPost('/file/image/ad/upload/', {
      advertiser_id: advertiserId,
      upload_type: 'UPLOAD_BY_URL',
      image_url: videoCoverUrl,
      file_name: `cover_${videoId}.jpg`,
    }, marketingToken);
    if (imgRes.ok) {
      coverImageId = String((imgRes.body as { data?: { image_id?: string } }).data?.image_id || '');
    }
  }

  // Step 4: ad group
  const ageGroups = ageGroupsFor(ageMin, ageMax);
  const agRes = await ttBizPost('/adgroup/create/', {
    advertiser_id: advertiserId,
    campaign_id: campaignExternalId,
    adgroup_name: adgroupName,
    promotion_type: 'WEBSITE',
    placement_type: 'PLACEMENT_TYPE_NORMAL',
    placements: ['PLACEMENT_TIKTOK'],
    location_ids: locationIds,
    age_groups: ageGroups,
    gender,
    budget_mode: 'BUDGET_MODE_DAY',
    budget: input.dailyBudgetUsd,
    schedule_type: 'SCHEDULE_FROM_NOW',
    schedule_start_time: new Date(Date.now() + 60_000).toISOString().slice(0, 19).replace('T', ' '),
    pacing: 'PACING_MODE_SMOOTH',
    optimization_goal: 'CLICK',
    bid_type: 'BID_TYPE_NO_BID',
    billing_event: 'CPC',
    operating_systems: ['ANDROID', 'IOS'],
    operation_status: 'DISABLE',
  }, marketingToken);
  if (!agRes.ok) return { ok: false, mode: 'live', step: 'create_adgroup', error: 'biz_failed', raw: agRes.body };
  const adgroupExternalId = String((agRes.body as { data?: { adgroup_id?: string } }).data?.adgroup_id || '');
  if (!adgroupExternalId) return { ok: false, mode: 'live', step: 'create_adgroup', error: 'no_adgroup_id', raw: agRes.body };

  // Step 5: ad
  const creative: Record<string, unknown> = {
    ad_name: adName,
    ad_format: 'SINGLE_VIDEO',
    video_id: videoId,
    identity_type: identityType,
    identity_id: identityId,
    ad_text: input.adText.slice(0, 100),
    call_to_action: 'WHATSAPP',
    landing_page_url: landingUrl,
  };
  if (coverImageId) creative.image_ids = [coverImageId];

  const adRes = await ttBizPost('/ad/create/', {
    advertiser_id: advertiserId,
    adgroup_id: adgroupExternalId,
    creatives: [creative],
    operation_status: 'DISABLE',
  }, marketingToken);
  if (!adRes.ok) return { ok: false, mode: 'live', step: 'create_ad', error: 'biz_failed', raw: adRes.body };
  const adIds = ((adRes.body as { data?: { ad_ids?: unknown[] } }).data?.ad_ids) || [];
  const adExternalId = String(Array.isArray(adIds) ? adIds[0] : '') || null;

  // Persist
  const { data: campIns } = await sb
    .from('ads_campaigns')
    .upsert(
      {
        account_id: input.accountId,
        platform: 'tiktok',
        external_id: campaignExternalId,
        name: campaignName,
        status: 'PAUSED',
        objective: 'TRAFFIC',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes || [],
        raw: { advertiser_id: advertiserId } as object,
      },
      { onConflict: 'platform,external_id' }
    )
    .select('id')
    .single();
  const dbCampId = (campIns as { id: number } | null)?.id || 0;

  const { data: setIns } = await sb
    .from('ads_ad_sets')
    .upsert(
      {
        campaign_id: dbCampId,
        platform: 'tiktok',
        external_id: adgroupExternalId,
        name: adgroupName,
        status: 'PAUSED',
        optimization_goal: 'CLICK',
        daily_budget_micros: dailyBudgetMicros,
        target_countries: locationIds as string[],
        age_min: ageMin,
        age_max: ageMax,
        targeting: { gender, age_groups: ageGroups, location_ids: locationIds, placements: ['PLACEMENT_TIKTOK'] } as object,
        raw: { advertiser_id: advertiserId } as object,
      },
      { onConflict: 'platform,external_id' }
    )
    .select('id')
    .single();

  if (adExternalId) {
    await sb.from('ads_ads').upsert(
      {
        ad_set_id: (setIns as { id: number } | null)?.id,
        platform: 'tiktok',
        external_id: adExternalId,
        name: adName,
        status: 'PAUSED',
        creative_type: 'video',
        creative_url: input.videoUrl,
        headline: input.adText.slice(0, 100),
        body: input.adText,
        landing_url: landingUrl,
        raw: { video_id: videoId, cover_image_id: coverImageId, identity_id: identityId, identity_type: identityType } as object,
      },
      { onConflict: 'platform,external_id' }
    );
  }

  await recordAudit({
    module: 'ads',
    action: 'campaign_published',
    target_type: 'campaign',
    target_id: String(dbCampId),
    metadata: {
      platform: 'tiktok',
      external_id: campaignExternalId,
      daily_budget_usd: input.dailyBudgetUsd,
      building_codes: input.buildingCodes || [],
    },
  });

  return {
    ok: true,
    mode: 'live',
    campaign_id: dbCampId,
    campaign_external_id: campaignExternalId,
    adgroup_external_id: adgroupExternalId,
    ad_external_id: adExternalId,
    video_id: videoId,
    review_url: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${advertiserId}`,
  };
}

// List Business Center advertisers visible to the marketing token.
export async function listTikTokAdvertisers(): Promise<
  | { ok: true; advertisers: Array<{ bc_id: string; bc_name: string; advertiser_id: string; advertiser_name: string; currency: string; status: string }> }
  | { ok: false; error: string }
> {
  const credsRes = await loadTikTokAppCredentials();
  if (!credsRes.ok) return { ok: false, error: credsRes.error };
  const token = credsRes.creds.marketing_access_token;
  if (!token) return { ok: false, error: 'no_marketing_token' };
  const bcRes = await ttBizGet('/bc/get/', token);
  if (!bcRes.ok) return { ok: false, error: 'list_bc_failed' };
  const bcs = ((bcRes.body as { data?: { list?: Array<Record<string, unknown>> } }).data?.list) || [];
  const advertisers: Array<{ bc_id: string; bc_name: string; advertiser_id: string; advertiser_name: string; currency: string; status: string }> = [];
  for (const bc of bcs) {
    const bcId = String((bc as { bc_id?: string }).bc_id || '');
    const advRes = await ttBizGet(`/bc/advertiser/get/?bc_id=${bcId}`, token);
    if (advRes.ok) {
      const list = ((advRes.body as { data?: { list?: Array<Record<string, unknown>> } }).data?.list) || [];
      for (const adv of list) {
        const r = adv as { advertiser_id?: string; advertiser_name?: string; currency?: string; status?: string };
        advertisers.push({
          bc_id: bcId,
          bc_name: String((bc as { bc_name?: string }).bc_name || ''),
          advertiser_id: String(r.advertiser_id || ''),
          advertiser_name: String(r.advertiser_name || ''),
          currency: String(r.currency || ''),
          status: String(r.status || ''),
        });
      }
    }
  }
  return { ok: true, advertisers };
}

// List identities for an advertiser (CUSTOMIZED_USER, TT_USER, etc.)
export async function listTikTokIdentities(advertiserId: string): Promise<
  | { ok: true; identities: Array<{ identity_type: string; identity_id: string; display_name: string; profile_image: string }> }
  | { ok: false; error: string }
> {
  const credsRes = await loadTikTokAppCredentials();
  if (!credsRes.ok) return { ok: false, error: credsRes.error };
  const token = credsRes.creds.marketing_access_token;
  if (!token) return { ok: false, error: 'no_marketing_token' };
  const types = ['CUSTOMIZED_USER', 'TT_USER', 'BC_AUTH_TT', 'UNAUTH_TT_USER'];
  const out: Array<{ identity_type: string; identity_id: string; display_name: string; profile_image: string }> = [];
  for (const t of types) {
    const r = await ttBizGet(`/identity/get/?advertiser_id=${advertiserId}&identity_type=${t}`, token);
    if (r.ok) {
      const list = ((r.body as { data?: { identity_list?: Array<Record<string, unknown>> } }).data?.identity_list) || [];
      for (const i of list) {
        const x = i as { identity_id?: string; display_name?: string; profile_image?: string };
        out.push({
          identity_type: t,
          identity_id: String(x.identity_id || ''),
          display_name: String(x.display_name || ''),
          profile_image: String(x.profile_image || ''),
        });
      }
    }
  }
  return { ok: true, identities: out };
}

// Pause / resume a TikTok paid campaign.
export async function setTikTokCampaignStatus(
  campaignDbId: number,
  status: 'PAUSED' | 'ENABLED'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('ads_campaigns')
    .select('id, external_id, platform, account_id')
    .eq('id', campaignDbId)
    .maybeSingle();
  if (!row) return { ok: false, error: 'campaign_not_found' };
  const r = row as { id: number; external_id: string; platform: string; account_id: number };
  if (r.platform !== 'tiktok') return { ok: false, error: 'not_tiktok' };
  if (r.external_id.startsWith('draft_')) {
    await sb.from('ads_campaigns').update({ status: status === 'ENABLED' ? 'ACTIVE' : 'PAUSED' }).eq('id', campaignDbId);
    return { ok: true };
  }
  const { data: acc } = await sb.from('ads_accounts').select('tiktok_advertiser_id').eq('id', r.account_id).maybeSingle();
  const advertiserId = (acc as { tiktok_advertiser_id?: string } | null)?.tiktok_advertiser_id;
  if (!advertiserId) return { ok: false, error: 'no_advertiser_id' };
  const credsRes = await loadTikTokAppCredentials();
  if (!credsRes.ok) return { ok: false, error: credsRes.error };
  const token = credsRes.creds.marketing_access_token;
  if (!token) return { ok: false, error: 'no_marketing_token' };
  const opStatus = status === 'ENABLED' ? 'ENABLE' : 'DISABLE';
  const m = await ttBizPost('/campaign/status/update/', {
    advertiser_id: advertiserId,
    campaign_ids: [r.external_id],
    operation_status: opStatus,
  }, token);
  if (!m.ok) return { ok: false, error: 'biz_failed' };
  await sb.from('ads_campaigns').update({ status: status === 'ENABLED' ? 'ACTIVE' : 'PAUSED' }).eq('id', campaignDbId);
  return { ok: true };
}
