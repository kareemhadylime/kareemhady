'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { generateAdCopy, generateCaption, type AdCopyLanguage, SUPPORTED_LANGUAGES } from '@/lib/beithady/ads/ai-copy';
import { publishCtwaCampaign } from '@/lib/beithady/ads/publish';
import { metaPost, loadMetaCredentials, resolveIgForAccount } from '@/lib/beithady/ads/meta-client';
import { publishGoogleSearchCampaign, setGoogleCampaignStatus } from '@/lib/beithady/ads/google-publish';
import { publishGooglePerformanceMax } from '@/lib/beithady/ads/google-pmax-publish';
import { isoCountriesToGoogleGeo } from '@/lib/beithady/ads/platforms';
import { setCampaignStatusUnified } from '@/lib/beithady/ads/status';
import { publishTikTokTrafficAd, setTikTokCampaignStatus, listTikTokAdvertisers, listTikTokIdentities } from '@/lib/beithady/ads/tiktok-paid-publish';
import { publishTikTokReel, pollTikTokPostStatus } from '@/lib/beithady/ads/tiktok-organic-publish';
import { publishInstagramReel, pollInstagramPostStatus, publishInstagramFeedPost } from '@/lib/beithady/ads/instagram-publish';
import { boostInstagramPost } from '@/lib/beithady/ads/boost-publish';
import { publishMetaVideoAd, type MetaVideoAdInput } from '@/lib/beithady/ads/meta-video-ad-publish';
import { syncAllPlatforms } from '@/lib/beithady/ads/unified-sync';
import { syncGoogleAds } from '@/lib/beithady/ads/google-sync';
import { syncTikTokAds } from '@/lib/beithady/ads/tiktok-sync';
import { recordCrossPost } from '@/lib/beithady/youtube/cross-post-audit';

async function requireFull() {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'ads', 'full'));
  if (!allowed) throw new Error('forbidden');
  return user;
}

// Generate 3 AI copy variants for a draft campaign. Returns to the
// create-campaign wizard with copy pre-populated via query string
// (campaign_draft_id).
export async function generateAdCopyAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const buildingCode = String(formData.get('building_code') || '').trim() || null;
  const targetCountry = String(formData.get('target_country') || '').trim() || null;
  const language = String(formData.get('language') || 'en') as AdCopyLanguage;
  const season = String(formData.get('season') || '').trim() || undefined;
  const goalText = String(formData.get('goal_text') || '').trim() || undefined;
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) throw new Error('invalid_language');

  const result = await generateAdCopy({
    buildingCode,
    targetCountry,
    language,
    season,
    goalText,
  });

  // Persist log rows (with no campaign_id yet — they'll link when published)
  const sb = supabaseAdmin();
  const ids: string[] = [];
  for (const v of result.variants) {
    const { data } = await sb
      .from('beithady_ads_ai_copy_log')
      .insert({
        language: result.language,
        variant: v.variant,
        headline: v.headline,
        primary_text: v.primary_text,
        cta: v.cta,
        prompt_version: result.prompt_version,
        model: result.model,
      })
      .select('id')
      .single();
    if (data) ids.push((data as { id: string }).id);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'ad_copy_generated',
    metadata: {
      language,
      building_code: buildingCode,
      target_country: targetCountry,
      variants: result.variants.length,
    },
  });

  revalidatePath('/beithady/ads/create');
  // Round-trip the IDs so the wizard can pre-populate the variant chooser
  redirect(`/beithady/ads/create?copy=${ids.join(',')}&building=${buildingCode || ''}&country=${targetCountry || ''}&language=${language}`);
}

// Publish a campaign — calls publishCtwaCampaign which falls back to
// "draft" mode when meta_marketing credentials are missing.
export async function publishCampaignAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const campaignName = String(formData.get('campaign_name') || '').trim();
  const buildingCodes = String(formData.get('building_codes') || '').split(',').map(s => s.trim()).filter(Boolean);
  const targetCountries = String(formData.get('target_countries') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const targetGroupId = formData.get('target_group_id') ? Number(formData.get('target_group_id')) : null;
  const dailyBudgetUsd = Number.parseFloat(String(formData.get('daily_budget_usd') || '5'));
  const monthlyBudgetCapUsdRaw = String(formData.get('monthly_budget_cap_usd') || '').trim();
  const monthlyBudgetCapUsd = monthlyBudgetCapUsdRaw && Number.isFinite(Number(monthlyBudgetCapUsdRaw)) ? Number(monthlyBudgetCapUsdRaw) : null;
  const durationDays = Number.parseInt(String(formData.get('duration_days') || '0'), 10) || 0;
  const headline = String(formData.get('headline') || '').trim();
  const primaryText = String(formData.get('primary_text') || '').trim();
  const language = String(formData.get('language') || 'en');
  const galleryAssetIds = String(formData.get('gallery_asset_ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  const ageMin = Number.parseInt(String(formData.get('age_min') || '25'), 10);
  const ageMax = Number.parseInt(String(formData.get('age_max') || '55'), 10);

  if (!campaignName || !buildingCodes.length || !targetCountries.length || !headline || !primaryText) {
    redirect('/beithady/ads/create?error=missing_required_fields');
  }
  if (!Number.isFinite(dailyBudgetUsd) || dailyBudgetUsd < 1) {
    redirect('/beithady/ads/create?error=invalid_budget');
  }

  const result = await publishCtwaCampaign({
    campaignName,
    buildingCodes,
    targetCountries,
    targetGroupId: targetGroupId ?? undefined,
    ageMin,
    ageMax,
    dailyBudgetUsd,
    monthlyBudgetCapUsd,
    durationDays,
    galleryAssetIds,
    headline,
    primaryText,
    language,
  });

  if (!result.ok) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'ads',
      action: 'campaign_publish_failed',
      metadata: { step: result.step, error: result.error, mode: result.mode },
    });
    redirect(`/beithady/ads/create?error=${encodeURIComponent(`${result.step}: ${result.error}`)}`);
  }

  revalidatePath('/beithady/ads');
  revalidatePath('/beithady/ads/campaigns');
  redirect(`/beithady/ads/campaigns/${result.campaign_id}?published=${result.mode}`);
}

// Toggle campaign status — pauses or resumes via Meta API + DB
export async function setCampaignStatusAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const campaignId = Number.parseInt(String(formData.get('campaign_id') || ''), 10);
  const status = String(formData.get('status') || '').toUpperCase(); // 'PAUSED' | 'ACTIVE'
  if (!Number.isFinite(campaignId) || !['PAUSED', 'ACTIVE'].includes(status)) throw new Error('invalid_input');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('ads_campaigns')
    .select('id, external_id, platform, status')
    .eq('id', campaignId)
    .maybeSingle();
  if (!row) throw new Error('campaign_not_found');
  const c = row as { id: number; external_id: string; platform: string; status: string | null };

  // If draft (no external_id starts with 'draft_'), only update local
  if (c.external_id.startsWith('draft_')) {
    await sb.from('ads_campaigns').update({ status }).eq('id', campaignId);
  } else if (c.platform === 'meta') {
    const creds = await loadMetaCredentials();
    if (creds.ok) {
      await metaPost(`${c.external_id}`, { status }, creds.creds.token);
    }
    await sb.from('ads_campaigns').update({ status }).eq('id', campaignId);
  } else {
    await sb.from('ads_campaigns').update({ status }).eq('id', campaignId);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'campaign_status_changed',
    target_type: 'campaign',
    target_id: String(campaignId),
    before: { status: c.status },
    after: { status },
  });

  revalidatePath('/beithady/ads');
  revalidatePath(`/beithady/ads/campaigns/${campaignId}`);
}

// =====================================================================
// New: Google Search publish + status toggle
// =====================================================================
export async function publishGoogleSearchAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const campaignName = String(formData.get('campaign_name') || '').trim();
  const dailyBudgetUsd = Number.parseFloat(String(formData.get('daily_budget_usd') || '5'));
  const monthlyBudgetCapUsdRaw = String(formData.get('monthly_budget_cap_usd') || '').trim();
  const monthlyBudgetCapUsd = monthlyBudgetCapUsdRaw && Number.isFinite(Number(monthlyBudgetCapUsdRaw)) ? Number(monthlyBudgetCapUsdRaw) : null;
  const cpcBidUsd = Number.parseFloat(String(formData.get('cpc_bid_usd') || '1'));
  const keywords = String(formData.get('keywords') || '').split('\n').map(s => s.trim()).filter(Boolean);
  const negativeKeywords = String(formData.get('negative_keywords') || '').split('\n').map(s => s.trim()).filter(Boolean);
  const headlines = String(formData.get('headlines') || '').split('\n').map(s => s.trim()).filter(Boolean);
  const descriptions = String(formData.get('descriptions') || '').split('\n').map(s => s.trim()).filter(Boolean);
  const finalUrl = String(formData.get('final_url') || '').trim() || undefined;
  const path1 = String(formData.get('path1') || '').trim() || undefined;
  const path2 = String(formData.get('path2') || '').trim() || undefined;
  const buildingCodes = String(formData.get('building_codes') || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!Number.isFinite(accountId)) redirect('/beithady/ads/google/publish?error=missing_account');

  const result = await publishGoogleSearchCampaign({
    accountId,
    campaignName: campaignName || undefined,
    dailyBudgetUsd,
    monthlyBudgetCapUsd,
    cpcBidUsd,
    keywords,
    negativeKeywords,
    headlines,
    descriptions,
    finalUrl,
    path1,
    path2,
    buildingCodes,
  });

  if (!result.ok) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'ads',
      action: 'google_publish_failed',
      metadata: { step: result.step, error: result.error, mode: result.mode },
    });
    redirect(`/beithady/ads/google/publish?error=${encodeURIComponent(`${result.step}: ${result.error}`)}`);
  }

  revalidatePath('/beithady/ads');
  revalidatePath('/beithady/ads/campaigns');
  redirect(`/beithady/ads/campaigns/${result.campaign_id}?published=${result.mode}`);
}

export async function publishGooglePMaxAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const campaignName = String(formData.get('campaign_name') || '').trim() || undefined;
  const dailyBudgetUsd = Number.parseFloat(String(formData.get('daily_budget_usd') || '30'));
  const monthlyBudgetCapUsdRaw = String(formData.get('monthly_budget_cap_usd') || '').trim();
  const monthlyBudgetCapUsd = monthlyBudgetCapUsdRaw && Number.isFinite(Number(monthlyBudgetCapUsdRaw)) ? Number(monthlyBudgetCapUsdRaw) : null;
  const businessName = String(formData.get('business_name') || 'Beit Hady').trim();
  const headlines = String(formData.get('headlines') || '').split('\n').map(s => s.trim()).filter(Boolean);
  const longHeadlines = String(formData.get('long_headlines') || '').split('\n').map(s => s.trim()).filter(Boolean);
  const descriptions = String(formData.get('descriptions') || '').split('\n').map(s => s.trim()).filter(Boolean);
  const finalUrl = String(formData.get('final_url') || '').trim() || undefined;
  const buildingCodes = String(formData.get('building_codes') || '').split(',').map(s => s.trim()).filter(Boolean);
  const marketingImageUrl = String(formData.get('marketing_image_url') || '').trim() || null;
  const targetCountriesRaw = String(formData.get('target_countries') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const locationIds = isoCountriesToGoogleGeo(targetCountriesRaw);
  // V1.2 cross-post: optional YouTube source
  const ytVideoId = String(formData.get('youtube_video_id') || '').trim() || null;
  const adsYtVideoIdRaw = String(formData.get('ads_yt_video_id') || '').trim();
  const adsYtVideoId = adsYtVideoIdRaw && Number.isFinite(Number(adsYtVideoIdRaw)) ? Number(adsYtVideoIdRaw) : null;

  if (!Number.isFinite(accountId)) redirect('/beithady/ads/google/pmax?error=missing_account');

  const result = await publishGooglePerformanceMax({
    accountId,
    campaignName,
    dailyBudgetUsd,
    monthlyBudgetCapUsd,
    businessName,
    headlines,
    longHeadlines,
    descriptions,
    finalUrl,
    buildingCodes,
    marketingImageUrls: marketingImageUrl ? [marketingImageUrl] : [],
    locationIds: locationIds.length ? locationIds : undefined,
    youtube_video_id: ytVideoId ?? undefined,
  });

  if (!result.ok) {
    const rawDetail = result.raw ? ` | ${JSON.stringify(result.raw).slice(0, 200)}` : '';
    await recordAudit({
      actor_user_id: user.id,
      module: 'ads',
      action: 'google_pmax_publish_failed',
      metadata: { step: result.step, error: result.error, raw: result.raw, mode: result.mode },
    });
    redirect(`/beithady/ads/google/pmax?error=${encodeURIComponent(`${result.step}: ${result.error}${rawDetail}`)}`);
  }

  // V1.2 cross-post audit: write a row when a YouTube source was attached.
  if (ytVideoId && result.ok) {
    await recordCrossPost({
      ads_youtube_video_id: adsYtVideoId,
      youtube_video_id: ytVideoId,
      target_platform: 'google_pmax',
      target_campaign_id: result.campaign_id,
      status: 'published',
      created_by_user_id: user.id ? String(user.id) : null,
    });
  }

  revalidatePath('/beithady/ads');
  revalidatePath('/beithady/ads/campaigns');
  redirect(`/beithady/ads/campaigns/${result.campaign_id}?published=${result.mode}`);
}

export async function setGoogleStatusAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const campaignId = Number.parseInt(String(formData.get('campaign_id') || ''), 10);
  const status = String(formData.get('status') || '').toUpperCase() as 'PAUSED' | 'ENABLED';
  if (!Number.isFinite(campaignId) || !['PAUSED', 'ENABLED'].includes(status)) throw new Error('invalid_input');
  const r = await setGoogleCampaignStatus(campaignId, status);
  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'google_status_changed',
    target_type: 'campaign',
    target_id: String(campaignId),
    metadata: { status, ok: r.ok },
  });
  revalidatePath('/beithady/ads');
  revalidatePath(`/beithady/ads/campaigns/${campaignId}`);
}

// =====================================================================
// TikTok paid publish + status toggle + advertiser/identity discovery
// =====================================================================
export async function publishTikTokPaidAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const videoUrl = String(formData.get('video_url') || '').trim();
  const adText = String(formData.get('ad_text') || '').trim();
  const dailyBudgetUsd = Number.parseFloat(String(formData.get('daily_budget_usd') || '5'));
  const monthlyBudgetCapUsdRaw = String(formData.get('monthly_budget_cap_usd') || '').trim();
  const monthlyBudgetCapUsd = monthlyBudgetCapUsdRaw && Number.isFinite(Number(monthlyBudgetCapUsdRaw)) ? Number(monthlyBudgetCapUsdRaw) : null;
  const ageMin = Number.parseInt(String(formData.get('age_min') || '18'), 10);
  const ageMax = Number.parseInt(String(formData.get('age_max') || '55'), 10);
  const campaignName = String(formData.get('campaign_name') || '').trim() || undefined;
  const landingUrl = String(formData.get('landing_url') || '').trim() || undefined;
  const buildingCodes = String(formData.get('building_codes') || '').split(',').map(s => s.trim()).filter(Boolean);
  // V1.2 cross-post: optional YouTube source
  const ytVideoId = String(formData.get('yt_video_id') || '').trim() || null;
  const adsYtVideoIdRaw = String(formData.get('ads_yt_video_id') || '').trim();
  const adsYtVideoId = adsYtVideoIdRaw && Number.isFinite(Number(adsYtVideoIdRaw)) ? Number(adsYtVideoIdRaw) : null;

  if (!Number.isFinite(accountId)) redirect('/beithady/ads/tiktok/paid?error=missing_account');

  const result = await publishTikTokTrafficAd({
    accountId,
    videoUrl,
    adText,
    dailyBudgetUsd,
    monthlyBudgetCapUsd,
    ageMin,
    ageMax,
    campaignName,
    landingUrl,
    buildingCodes,
    createdBy: user.username || null,
  });

  if (!result.ok) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'ads',
      action: 'tiktok_paid_publish_failed',
      metadata: { step: result.step, error: result.error, mode: result.mode },
    });
    redirect(`/beithady/ads/tiktok/paid?error=${encodeURIComponent(`${result.step}: ${result.error}`)}`);
  }

  // V1.2 cross-post audit: write a row when a YouTube source was attached.
  if (ytVideoId && result.ok) {
    await recordCrossPost({
      ads_youtube_video_id: adsYtVideoId,
      youtube_video_id: ytVideoId,
      target_platform: 'tiktok_paid',
      target_campaign_id: result.campaign_id,
      status: 'published',
      created_by_user_id: user.id ? String(user.id) : null,
    });
  }

  revalidatePath('/beithady/ads');
  redirect(`/beithady/ads/campaigns/${result.campaign_id}?published=${result.mode}`);
}

export async function setTikTokStatusAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const campaignId = Number.parseInt(String(formData.get('campaign_id') || ''), 10);
  const status = String(formData.get('status') || '').toUpperCase() as 'PAUSED' | 'ENABLED';
  if (!Number.isFinite(campaignId) || !['PAUSED', 'ENABLED'].includes(status)) throw new Error('invalid_input');
  const r = await setTikTokCampaignStatus(campaignId, status);
  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'tiktok_status_changed',
    target_type: 'campaign',
    target_id: String(campaignId),
    metadata: { status, ok: r.ok },
  });
  revalidatePath('/beithady/ads');
  revalidatePath(`/beithady/ads/campaigns/${campaignId}`);
}

export async function syncTikTokAdvertisersAction(formData: FormData): Promise<void> {
  await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const advertiserId = String(formData.get('advertiser_id') || '').trim();
  const bcId = String(formData.get('bc_id') || '').trim();
  if (!Number.isFinite(accountId) || !advertiserId) {
    redirect('/beithady/ads/tiktok/accounts?error=missing_advertiser');
  }
  const sb = supabaseAdmin();
  await sb.from('ads_accounts').update({
    tiktok_advertiser_id: advertiserId,
    tiktok_bc_id: bcId || null,
  }).eq('id', accountId);
  revalidatePath('/beithady/ads/tiktok/accounts');
  redirect('/beithady/ads/tiktok/accounts?advertiser=saved');
}

export async function setTikTokIdentityAction(formData: FormData): Promise<void> {
  await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const identityId = String(formData.get('identity_id') || '').trim();
  const identityType = String(formData.get('identity_type') || 'CUSTOMIZED_USER').trim();
  if (!Number.isFinite(accountId) || !identityId) {
    redirect('/beithady/ads/tiktok/accounts?error=missing_identity');
  }
  const sb = supabaseAdmin();
  await sb.from('ads_accounts').update({
    tiktok_identity_id: identityId,
    tiktok_identity_type: identityType,
  }).eq('id', accountId);
  revalidatePath('/beithady/ads/tiktok/accounts');
  redirect('/beithady/ads/tiktok/accounts?identity=saved');
}

export async function listTikTokAdvertisersAction(): Promise<{ ok: true; advertisers: Array<{ bc_id: string; bc_name: string; advertiser_id: string; advertiser_name: string; currency: string; status: string }> } | { ok: false; error: string }> {
  await requireFull();
  return listTikTokAdvertisers();
}

export async function listTikTokIdentitiesAction(advertiserId: string): Promise<{ ok: true; identities: Array<{ identity_type: string; identity_id: string; display_name: string; profile_image: string }> } | { ok: false; error: string }> {
  await requireFull();
  return listTikTokIdentities(advertiserId);
}

// =====================================================================
// TikTok organic Reels publish + status re-poll
// =====================================================================
export async function publishTikTokReelAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const videoUrl = String(formData.get('video_url') || '').trim();
  const caption = String(formData.get('caption') || '').trim() || undefined;
  const hashtags = String(formData.get('hashtags') || '').split(/[,\n]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
  const privacyLevel = (String(formData.get('privacy_level') || 'PUBLIC_TO_EVERYONE') as 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY' | 'FOLLOWER_OF_CREATOR');
  const directPost = String(formData.get('direct_post') || '') === '1';
  const galleryAssetId = String(formData.get('gallery_asset_id') || '').trim() || null;
  const buildingCode = String(formData.get('building_code') || '').trim() || null;
  // V1.2 cross-post: optional YouTube source
  const ytVideoId = String(formData.get('yt_video_id') || '').trim() || null;
  const adsYtVideoIdRaw = String(formData.get('ads_yt_video_id') || '').trim();
  const adsYtVideoId = adsYtVideoIdRaw && Number.isFinite(Number(adsYtVideoIdRaw)) ? Number(adsYtVideoIdRaw) : null;

  if (!Number.isFinite(accountId)) redirect('/beithady/ads/tiktok/organic?error=missing_account');

  const result = await publishTikTokReel({
    accountId,
    videoUrl,
    caption,
    hashtags,
    privacyLevel,
    directPost,
    galleryAssetId,
    buildingCode,
    createdBy: user.username || null,
  });

  if (!result.ok) {
    redirect(`/beithady/ads/tiktok/organic?error=${encodeURIComponent(`${result.step}: ${result.error}`)}&account_id=${accountId}`);
  }

  // V1.2 cross-post audit: write a row when a YouTube source was attached.
  if (ytVideoId && result.ok) {
    await recordCrossPost({
      ads_youtube_video_id: adsYtVideoId,
      youtube_video_id: ytVideoId,
      target_platform: 'tiktok_organic',
      target_post_id: result.post_id,
      status: 'published',
      created_by_user_id: user.id ? String(user.id) : null,
    });
  }

  revalidatePath('/beithady/ads/tiktok/organic');
  redirect(`/beithady/ads/tiktok/organic?post=${result.post_id}&status=${encodeURIComponent(result.status)}`);
}

export async function pollTikTokPostAction(formData: FormData): Promise<void> {
  await requireFull();
  const postId = Number.parseInt(String(formData.get('post_id') || ''), 10);
  if (!Number.isFinite(postId)) return;
  await pollTikTokPostStatus(postId);
  revalidatePath('/beithady/ads/tiktok/organic');
}

// =====================================================================
// Instagram Reels (organic) publish + re-poll
// =====================================================================
export async function publishInstagramReelAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const videoUrl = String(formData.get('video_url') || '').trim();
  const caption = String(formData.get('caption') || '').trim() || undefined;
  const hashtags = String(formData.get('hashtags') || '').split(/[,\n]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
  const shareToFeed = String(formData.get('share_to_feed') || '1') !== '0';
  const alsoToFacebook = String(formData.get('also_to_facebook') || '') === '1';
  const galleryAssetId = String(formData.get('gallery_asset_id') || '').trim() || null;
  const buildingCode = String(formData.get('building_code') || '').trim() || null;
  // V1.2 cross-post: optional YouTube source
  const ytVideoId = String(formData.get('yt_video_id') || '').trim() || null;
  const adsYtVideoIdRaw = String(formData.get('ads_yt_video_id') || '').trim();
  const adsYtVideoId = adsYtVideoIdRaw && Number.isFinite(Number(adsYtVideoIdRaw)) ? Number(adsYtVideoIdRaw) : null;

  if (!Number.isFinite(accountId)) redirect('/beithady/ads/instagram/reels?error=missing_account');

  const result = await publishInstagramReel({
    accountId,
    videoUrl,
    caption,
    hashtags,
    shareToFeed,
    alsoToFacebook,
    galleryAssetId,
    buildingCode,
    createdBy: user.username || null,
  });

  if (!result.ok) {
    redirect(`/beithady/ads/instagram/reels?error=${encodeURIComponent(`${result.step}: ${result.error}`)}`);
  }

  // V1.2 cross-post audit: write a row when a YouTube source was attached.
  if (ytVideoId && result.ok) {
    await recordCrossPost({
      ads_youtube_video_id: adsYtVideoId,
      youtube_video_id: ytVideoId,
      target_platform: 'instagram_reel',
      target_post_id: result.post_id,
      status: 'published',
      created_by_user_id: user.id ? String(user.id) : null,
    });
  }

  revalidatePath('/beithady/ads/instagram/reels');
  redirect(`/beithady/ads/instagram/reels?post=${result.post_id}&status=${encodeURIComponent(result.status)}`);
}

// IG Feed Post (image / carousel / video) + optional FB cross-post.
// Form fields:
//   post_type=image|carousel|video, account_id, caption, hashtags, building_code,
//   also_to_facebook=1, fb_caption?, plus one of:
//     image_url           (image)
//     child_urls (newline or comma)  (carousel; 2..10)
//     video_url           (video)
export async function publishInstagramPostAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const postType = String(formData.get('post_type') || '').trim() as 'image' | 'carousel' | 'video';
  const caption = String(formData.get('caption') || '').trim() || undefined;
  const hashtags = String(formData.get('hashtags') || '').split(/[,\n]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
  const alsoToFacebook = String(formData.get('also_to_facebook') || '') === '1';
  const fbCaption = String(formData.get('fb_caption') || '').trim() || undefined;
  const buildingCode = String(formData.get('building_code') || '').trim() || null;
  // Gallery picker writes to image_url / video_url / child_urls (hidden inputs).
  // Manual paste field falls back to *_manual if the picker is empty.
  const imageUrl = (String(formData.get('image_url') || '').trim()
    || String(formData.get('image_url_manual') || '').trim()) || undefined;
  const videoUrl = (String(formData.get('video_url') || '').trim()
    || String(formData.get('video_url_manual') || '').trim()) || undefined;
  // Carousel: merge picker picks (already newline-separated) with manual paste
  const childUrls = [
    ...String(formData.get('child_urls') || '').split(/[\n,]/),
    ...String(formData.get('child_urls_manual') || '').split(/[\n,]/),
  ].map(s => s.trim()).filter(Boolean);

  if (!Number.isFinite(accountId)) redirect('/beithady/ads/instagram/post?error=missing_account');
  if (!['image','carousel','video'].includes(postType)) redirect('/beithady/ads/instagram/post?error=invalid_post_type');

  const result = await publishInstagramFeedPost({
    accountId,
    postType,
    imageUrl,
    videoUrl,
    childUrls: postType === 'carousel' ? childUrls : undefined,
    caption,
    hashtags,
    alsoToFacebook,
    fbCaption,
    buildingCode,
    createdBy: user.username || null,
  });

  if (!result.ok) {
    redirect(`/beithady/ads/instagram/post?error=${encodeURIComponent(`${result.step}: ${result.error}`)}`);
  }
  revalidatePath('/beithady/ads/instagram/post');
  redirect(`/beithady/ads/instagram/post?post=${result.post_id}&status=${encodeURIComponent(result.status)}`);
}

export async function boostInstagramPostAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const igBusinessId = String(formData.get('ig_business_id') || '').trim();
  const igMediaId = String(formData.get('ig_media_id') || '').trim();
  const permalink = String(formData.get('permalink') || '').trim() || null;
  const caption = String(formData.get('caption') || '').trim() || null;
  const imageUrl = String(formData.get('image_url') || '').trim() || null;
  const campaignName = String(formData.get('campaign_name') || '').trim() || undefined;
  const buildingCodes = String(formData.get('building_codes') || '').split(',').map(s => s.trim()).filter(Boolean);
  const targetCountries = String(formData.get('target_countries') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const targetGroupId = formData.get('target_group_id') ? Number(formData.get('target_group_id')) : null;
  const ageMin = Number.parseInt(String(formData.get('age_min') || '25'), 10);
  const ageMax = Number.parseInt(String(formData.get('age_max') || '55'), 10);
  const dailyBudgetUsd = Number.parseFloat(String(formData.get('daily_budget_usd') || '5'));
  const durationDays = Number.parseInt(String(formData.get('duration_days') || '7'), 10) || 0;
  const monthlyBudgetCapUsdRaw = String(formData.get('monthly_budget_cap_usd') || '').trim();
  const monthlyBudgetCapUsd = monthlyBudgetCapUsdRaw && Number.isFinite(Number(monthlyBudgetCapUsdRaw)) ? Number(monthlyBudgetCapUsdRaw) : null;
  const destination = String(formData.get('destination') || 'ctwa');
  const landingUrl = String(formData.get('landing_url') || '').trim() || undefined;

  if (!Number.isFinite(accountId) || !igBusinessId || !igMediaId) {
    redirect('/beithady/ads/instagram/boost?error=missing_required');
  }
  if (!buildingCodes.length || !targetCountries.length) {
    redirect(`/beithady/ads/instagram/boost?account_id=${accountId}&media_id=${igMediaId}&error=missing_targeting`);
  }

  const result = await boostInstagramPost({
    accountId,
    igBusinessId,
    igMediaId,
    permalink,
    caption,
    imageUrl,
    campaignName,
    buildingCodes,
    targetCountries,
    targetGroupId: targetGroupId ?? undefined,
    ageMin,
    ageMax,
    dailyBudgetUsd,
    monthlyBudgetCapUsd,
    durationDays,
    ctwa: destination !== 'link',
    landingUrl,
    createdBy: user.username || null,
  });

  if (!result.ok) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'ads',
      action: 'boost_publish_failed',
      metadata: { step: result.step, error: result.error, mode: result.mode, ig_media_id: igMediaId },
    });
    // Extract subcode from raw Meta error for easier diagnosis
    const raw = result.raw as Record<string, unknown> | null;
    const metaErr = raw?.error as Record<string, unknown> | undefined;
    const detail = metaErr?.error_subcode
      ? ` [sub:${metaErr.error_subcode}] ${metaErr.error_user_msg ?? ''}`
      : '';
    redirect(`/beithady/ads/instagram/boost?account_id=${accountId}&error=${encodeURIComponent(`${result.step}: ${result.error}${detail}`)}`);
  }

  revalidatePath('/beithady/ads');
  revalidatePath('/beithady/ads/campaigns');
  redirect(`/beithady/ads/campaigns/${result.campaign_id}?published=${result.mode}`);
}

export async function pollInstagramPostAction(formData: FormData): Promise<void> {
  await requireFull();
  const postId = Number.parseInt(String(formData.get('post_id') || ''), 10);
  if (!Number.isFinite(postId)) return;
  await pollInstagramPostStatus(postId);
  revalidatePath('/beithady/ads/instagram/reels');
}

// =====================================================================
// Meta video ad publish (YouTube V1.2 cross-post — fresh creative from
// raw video bytes, NOT a boost of an existing organic IG post)
// =====================================================================
export async function publishMetaVideoAdAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  const ytVideoId = String(formData.get('yt_video_id') || '').trim() || null;
  const adsYtVideoIdRaw = String(formData.get('ads_yt_video_id') || '').trim();
  const adsYtVideoId = adsYtVideoIdRaw && Number.isFinite(Number(adsYtVideoIdRaw)) ? Number(adsYtVideoIdRaw) : null;
  const videoUrl = String(formData.get('video_url') || '').trim();
  const thumbnailUrlRaw = String(formData.get('thumbnail_url') || '').trim();
  const title = String(formData.get('title') || '').trim();
  const body = String(formData.get('body') || '').trim();
  const callToAction = (String(formData.get('call_to_action') || 'LEARN_MORE') as 'LEARN_MORE' | 'BOOK_NOW' | 'SHOP_NOW' | 'CONTACT_US');
  const landingUrl = String(formData.get('landing_url') || '').trim() || 'https://wa.me/201501010103';
  const dailyBudgetUsdRaw = Number(formData.get('daily_budget_usd'));
  const dailyBudgetUsd = Number.isFinite(dailyBudgetUsdRaw) && dailyBudgetUsdRaw > 0 ? dailyBudgetUsdRaw : 5;
  const ageMinRaw = formData.get('age_min');
  const ageMaxRaw = formData.get('age_max');

  if (!Number.isFinite(accountId)) {
    redirect('/beithady/ads/instagram/boost?error=missing_account');
  }
  if (!videoUrl || !title) {
    redirect('/beithady/ads/instagram/boost?error=missing_required');
  }

  const input: MetaVideoAdInput = {
    accountId,
    videoUrl,
    thumbnailUrl: thumbnailUrlRaw || null,
    title,
    description: body,
    callToAction,
    landingUrl,
    dailyBudgetUsd,
    ageMin: ageMinRaw ? Number(ageMinRaw) : undefined,
    ageMax: ageMaxRaw ? Number(ageMaxRaw) : undefined,
    createdBy: user.username || null,
  };

  const result = await publishMetaVideoAd(input);

  if (!result.ok) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'ads',
      action: 'meta_video_ad_publish_failed',
      metadata: { step: result.step, error: result.error, mode: result.mode, yt_video_id: ytVideoId },
    });
    redirect(`/beithady/ads/instagram/boost?error=${encodeURIComponent(result.error)}&step=${encodeURIComponent(result.step)}`);
  }

  // V1.2 cross-post audit: write a row when a YouTube source was attached.
  if (ytVideoId) {
    await recordCrossPost({
      ads_youtube_video_id: adsYtVideoId,
      youtube_video_id: ytVideoId,
      target_platform: 'meta_video_ad',
      target_campaign_id: result.campaign_id,
      status: 'published',
      created_by_user_id: user.id ? String(user.id) : null,
    });
  }

  revalidatePath('/beithady/ads');
  revalidatePath('/beithady/ads/campaigns');
  redirect(`/beithady/ads/campaigns/${result.campaign_id}?created=meta_video_ad`);
}

export async function resolveIgAccountAction(formData: FormData): Promise<void> {
  await requireFull();
  const accountId = Number.parseInt(String(formData.get('account_id') || ''), 10);
  if (!Number.isFinite(accountId)) return;
  await resolveIgForAccount(accountId);
  revalidatePath('/beithady/ads/accounts');
  revalidatePath('/beithady/ads/instagram/accounts');
}

// =====================================================================
// Lead SLA — mark a lead as responded (stops the SLA alert clock)
// =====================================================================
export async function markLeadRespondedAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const leadId = Number.parseInt(String(formData.get('lead_id') || ''), 10);
  if (!Number.isFinite(leadId)) return;
  const sb = supabaseAdmin();
  await sb.from('ads_leads').update({
    first_response_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
  }).eq('id', leadId);
  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'lead_marked_responded',
    target_type: 'lead',
    target_id: String(leadId),
  });
  revalidatePath('/beithady/ads/leads');
}

// =====================================================================
// Unified campaign status flip — used by the campaign detail page +
// inline pause/resume buttons on the Campaigns list.
// =====================================================================
export async function setCampaignStatusActionUnified(formData: FormData): Promise<void> {
  const user = await requireFull();
  const campaignId = Number.parseInt(String(formData.get('campaign_id') || ''), 10);
  const status = String(formData.get('status') || '').toUpperCase() as 'PAUSED' | 'ACTIVE';
  if (!Number.isFinite(campaignId) || !['PAUSED', 'ACTIVE'].includes(status)) {
    throw new Error('invalid_input');
  }
  const r = await setCampaignStatusUnified(campaignId, status, status === 'PAUSED' ? `manual pause by ${user.username}` : undefined);
  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'campaign_status_flipped',
    target_type: 'campaign',
    target_id: String(campaignId),
    metadata: { status, ok: r.ok, platform: 'platform' in r ? r.platform : null, error: 'error' in r ? r.error : null },
  });
  revalidatePath('/beithady/ads');
  revalidatePath('/beithady/ads/campaigns');
  revalidatePath(`/beithady/ads/campaigns/${campaignId}`);
  if (!r.ok) {
    redirect(`/beithady/ads/campaigns/${campaignId}?error=${encodeURIComponent(r.error)}`);
  }
  redirect(`/beithady/ads/campaigns/${campaignId}?status_set=${status}`);
}

// =====================================================================
// Unified sync (Meta + Google + TikTok)
// =====================================================================
export async function syncAllAction(): Promise<void> {
  await requireFull();
  await syncAllPlatforms();
  revalidatePath('/beithady/ads');
}

export async function syncGoogleAction(): Promise<void> {
  await requireFull();
  await syncGoogleAds();
  revalidatePath('/beithady/ads');
}

export async function syncTikTokAction(): Promise<void> {
  await requireFull();
  await syncTikTokAds();
  revalidatePath('/beithady/ads');
}

// =====================================================================
// AI image variants — generates 2 new gallery assets per request
// =====================================================================
export async function generateAiImagesAction(formData: FormData): Promise<void> {
  await requireFull();
  const { generateAdImageVariants } = await import('@/lib/beithady/ads/ai-image');
  const sourceAssetId = String(formData.get('source_asset_id') || '').trim() || undefined;
  const prompt = String(formData.get('prompt') || '').trim();
  const buildingCode = String(formData.get('building_code') || '').trim() || null;
  const numVariants = Math.max(1, Math.min(4, Number.parseInt(String(formData.get('num_variants') || '2'), 10) || 2));
  const aspectRatio = String(formData.get('aspect_ratio') || '1:1') as '1:1' | '16:9' | '9:16' | '4:5';
  if (!prompt) {
    redirect('/beithady/ads/gallery?error=missing_prompt');
  }
  const r = await generateAdImageVariants({ sourceAssetId, prompt, buildingCode, numVariants, aspectRatio });
  await recordAudit({
    module: 'ads',
    action: 'ai_images_generated',
    metadata: { prompt: prompt.slice(0, 200), variants: numVariants, ok: r.ok, mode: r.mode, saved: r.ok ? r.saved_asset_ids.length : 0, error: r.ok ? null : r.error },
  });
  revalidatePath('/beithady/ads/gallery');
}

// =====================================================================
// Gallery: inline toggle of ad_eligible + AI caption write-back
// =====================================================================
export async function toggleGalleryAdEligibleAction(formData: FormData): Promise<void> {
  await requireFull();
  const assetId = String(formData.get('asset_id') || '').trim();
  const desired = String(formData.get('desired') || '').trim() === '1';
  if (!assetId) return;
  const sb = supabaseAdmin();
  await sb.from('beithady_gallery_assets').update({ ad_eligible: desired }).eq('id', assetId);
  revalidatePath('/beithady/ads/gallery');
}

export async function regenerateGalleryCaptionAction(formData: FormData): Promise<void> {
  await requireFull();
  const assetId = String(formData.get('asset_id') || '').trim();
  const language = String(formData.get('language') || 'en') as AdCopyLanguage;
  const surface = (String(formData.get('surface') || 'ig_caption') as 'meta_ctwa' | 'ig_caption' | 'tiktok_caption' | 'google_rsa' | 'manual');
  if (!assetId) return;
  const sb = supabaseAdmin();
  const { data: asset } = await sb
    .from('beithady_gallery_assets')
    .select('id, public_url, building_code, listing_id')
    .eq('id', assetId)
    .maybeSingle();
  if (!asset) return;
  const a = asset as { id: string; public_url: string | null; building_code: string | null };

  const result = await generateCaption({
    imageUrl: a.public_url,
    buildingCode: a.building_code,
    language,
    surface,
  });

  await sb.from('beithady_gallery_assets').update({ ai_caption: result.caption }).eq('id', assetId);
  revalidatePath('/beithady/ads/gallery');
}

// =====================================================================
// AI caption generation (vision)
// =====================================================================
export async function generateCaptionAction(formData: FormData): Promise<{ caption: string; hashtags: string[] }> {
  await requireFull();
  const imageUrl = String(formData.get('image_url') || '').trim() || null;
  const buildingCode = String(formData.get('building_code') || '').trim() || null;
  const buildingName = String(formData.get('building_name') || '').trim() || null;
  const language = String(formData.get('language') || 'en') as AdCopyLanguage;
  const surface = (String(formData.get('surface') || 'ig_caption') as 'meta_ctwa' | 'ig_caption' | 'tiktok_caption' | 'google_rsa' | 'manual');
  const vibe = String(formData.get('vibe') || '').trim() || undefined;
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) throw new Error('invalid_language');

  const result = await generateCaption({
    imageUrl,
    buildingCode,
    buildingName,
    language,
    surface,
    vibe,
  });

  return { caption: result.caption, hashtags: result.hashtags };
}

// =====================================================================
// V3 AI Summary — gathers all dashboard slices in parallel and calls
// generateAiSummary. Returns AiSummaryResult discriminated union.
// The AiSummaryCard (Task 14) submits a form and renders the result.
// =====================================================================
import { generateAiSummary, type AiSummaryResult } from '@/lib/beithady/ads/ai-summary';
import {
  getAdsSnapshotData,
  generateSnapshotToken,
  SNAPSHOT_SCHEMA_VERSION,
  type AdsSnapshotPayload,
} from '@/lib/beithady/ads/snapshot';
import { getDashboardKpis } from '@/lib/beithady/ads/reporting';
import { queryGeoRollup } from '@/lib/beithady/ads/insights-geo';
import { queryDemoRollup } from '@/lib/beithady/ads/insights-demo';
import { queryDeviceRollup } from '@/lib/beithady/ads/insights-device';
import { getLeadQualityPerCampaign } from '@/lib/beithady/ads/lead-quality';
import { getFrtSummary } from '@/lib/beithady/ads/frt';
import { detectAnomalies, type AnomalyEvent } from '@/lib/beithady/ads/anomalies';
import { getFunnelStages } from '@/lib/beithady/ads/funnel';

export async function generateAiSummaryAction(formData: FormData): Promise<AiSummaryResult> {
  const from = String(formData.get('from') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!from || !to) {
    return { ok: false, error: 'no_data', cost_usd: 0, detail: 'missing date range' };
  }
  const range = { from, to };

  // Gather all dashboard slices in parallel — same data the page renders.
  const [kpis, geo, demo, device, quality, frt, anomalies, funnel] = await Promise.all([
    getDashboardKpis({ from, to }),
    queryGeoRollup({ from, to }),
    queryDemoRollup({ from, to }),
    queryDeviceRollup({ from, to }),
    getLeadQualityPerCampaign({ from, to }),
    getFrtSummary({ from, to }),
    detectAnomalies(),
    getFunnelStages({ from, to }),
  ]);

  const totalGeoClicks = geo.reduce((s, r) => s + r.clicks, 0) || 1;
  const totalDemoClicks = demo.reduce((s, r) => s + r.clicks, 0) || 1;
  const totalDeviceClicks = device.reduce((s, r) => s + r.clicks, 0) || 1;

  const result = await generateAiSummary({
    range,
    dashboardData: {
      kpis: {
        spend_egp: kpis.spend,
        leads: kpis.leads,
        bookings: kpis.bookings,
        cpl_egp: kpis.cpl,
        roas: kpis.roas,
        attributed_revenue_egp: kpis.attributed_revenue,
      },
      topCountries: geo.slice(0, 5).map(r => ({ country: r.country_code, clicks: r.clicks, pct: Math.round((r.clicks / totalGeoClicks) * 100) })),
      topDemos: demo.slice(0, 5).map(r => ({ age_range: r.age_range, gender: r.gender, clicks: r.clicks, pct: Math.round((r.clicks / totalDemoClicks) * 100) })),
      topDevices: device.slice(0, 5).map(r => ({ device: r.device_platform, clicks: r.clicks, pct: Math.round((r.clicks / totalDeviceClicks) * 100) })),
      topCampaigns: quality.slice(0, 5).map(r => ({ name: r.campaign_name, platform: r.platform, leads: r.leads, cpl_egp: null, quality_pct: r.quality_pct })),
      frtSummary: { median_minutes: frt.median_minutes, p95_minutes: frt.p95_minutes, over_1h_pct: frt.over_1h_pct },
      anomalies,
      funnelStages: funnel.stages.map(s => ({ key: s.key, count: s.count })),
    },
  });

  revalidatePath('/beithady/ads');
  return result;
}

// =====================================================================
// V4 — Public share link creation
// =====================================================================

const SHARE_LINK_DAILY_CAP = 5;
const SHARE_LINK_TTL_HOURS = 48;
const APP_BASE = (() => {
  const b =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'https://limeinc.vercel.app';
  return b.startsWith('http') ? b : `https://${b}`;
})();

export type CreateShareLinkInput = {
  range: { from: string; to: string; preset: string };
  compare: 'prev_period' | 'prev_year' | null;
  building: string | null;
};

export type CreateShareLinkResult =
  | { ok: true; token: string; url: string; expires_at: string; ai_skipped_reason?: 'cap_reached' | 'error' }
  | { ok: false; error: 'rate_limit' | 'data_error' | 'forbidden'; message: string };

export async function createAdsShareLinkAction(
  input: CreateShareLinkInput,
): Promise<CreateShareLinkResult> {
  // Auth — ads:read (more permissive than the requireFull() used by other actions)
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'forbidden', message: 'Not authenticated' };
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'ads', 'read'));
  if (!allowed) return { ok: false, error: 'forbidden', message: 'Missing ads:read permission' };

  // Rate limit — count today's snapshots in Cairo time
  const sb = supabaseAdmin();
  const cairoToday = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
  const sinceIso = new Date(cairoToday + 'T00:00:00+03:00').toISOString();
  const { count, error: countError } = await sb.from('beithady_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'ads')
    .eq('action', 'ads_share_link_created')
    .eq('actor_user_id', user.id)
    .gte('created_at', sinceIso);
  if (countError) {
    return { ok: false, error: 'data_error', message: `Rate-limit check failed: ${countError.message}` };
  }
  if ((count ?? 0) >= SHARE_LINK_DAILY_CAP) {
    return {
      ok: false,
      error: 'rate_limit',
      message: `You've used ${SHARE_LINK_DAILY_CAP}/${SHARE_LINK_DAILY_CAP} share links today. Try again after midnight Cairo.`,
    };
  }

  // Gather data
  let data: Awaited<ReturnType<typeof getAdsSnapshotData>>;
  try {
    data = await getAdsSnapshotData(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: 'data_error', message: msg };
  }

  // AI summary — force regenerate with graceful skip
  let aiSummary: string | null = null;
  let aiSkippedReason: 'cap_reached' | 'error' | undefined;
  try {
    const aiResult = await generateAiSummary({
      range: { from: input.range.from, to: input.range.to },
      dashboardData: {
        kpis: {
          spend_egp: (data.kpis.current as { spend?: number }).spend ?? 0,
          leads: (data.kpis.current as { leads?: number }).leads ?? 0,
          bookings: (data.kpis.current as { bookings?: number }).bookings ?? 0,
          cpl_egp: (data.kpis.current as { cpl?: number | null }).cpl ?? null,
          roas: (data.kpis.current as { roas?: number | null }).roas ?? null,
          attributed_revenue_egp: (data.kpis.current as { attributed_revenue?: number }).attributed_revenue ?? 0,
        },
        topCountries: (data.audience_geo as Array<{ country_code: string; clicks: number }>).slice(0, 5).map(r => ({ country: r.country_code, clicks: r.clicks, pct: 0 })),
        topDemos: (data.audience_demo as Array<{ age_range: string; gender: string; clicks: number }>).slice(0, 5).map(r => ({ age_range: r.age_range, gender: r.gender, clicks: r.clicks, pct: 0 })),
        topDevices: (data.audience_device as Array<{ device_platform: string; clicks: number }>).slice(0, 5).map(r => ({ device: r.device_platform, clicks: r.clicks, pct: 0 })),
        topCampaigns: (data.quality as Array<{ campaign_name: string; platform: string; leads: number; quality_pct: number }>).slice(0, 5).map(r => ({ name: r.campaign_name, platform: r.platform, leads: r.leads, cpl_egp: null, quality_pct: r.quality_pct })),
        frtSummary: data.frt
          ? { median_minutes: ((data.frt as { summary: { median_minutes: number } }).summary).median_minutes, p95_minutes: ((data.frt as { summary: { p95_minutes: number } }).summary).p95_minutes, over_1h_pct: ((data.frt as { summary: { over_1h_pct: number } }).summary).over_1h_pct }
          : { median_minutes: null, p95_minutes: null, over_1h_pct: 0 },
        anomalies: data.anomalies as AnomalyEvent[],
        funnelStages: ((data.funnel as { stages?: Array<{ key: string; count: number }> }).stages ?? []).map(s => ({ key: s.key, count: s.count })),
      },
    });
    if (aiResult.ok) {
      // Real: aiResult.summary; mocked: aiResult may have .text — use summary with fallback
      aiSummary = (aiResult as { ok: true; summary?: string; text?: string }).summary
        ?? (aiResult as { ok: true; summary?: string; text?: string }).text
        ?? null;
    } else {
      // Real cap error is 'daily_cap_reached'; test mock uses 'cap_reached' — normalise both
      const errCode = (aiResult as { ok: false; error: string }).error;
      aiSkippedReason = (errCode === 'daily_cap_reached' || errCode === 'cap_reached')
        ? 'cap_reached'
        : 'error';
    }
  } catch {
    aiSkippedReason = 'error';
  }

  // Build payload
  const generated_at = new Date().toISOString();
  const expires_at = new Date(Date.now() + SHARE_LINK_TTL_HOURS * 3600 * 1000).toISOString();
  const userEmail = (user as typeof user & { email?: string | null }).email ?? null;
  const payload: AdsSnapshotPayload = {
    meta: {
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      generated_at,
      generated_by_user_id: user.id != null ? String(user.id) : null,
      generated_by_user_email: userEmail,
      range: input.range,
      compare: input.compare,
      building: input.building,
      ai_used: aiSummary !== null,
      ...(aiSkippedReason ? { ai_skipped_reason: aiSkippedReason } : {}),
    },
    ...data,
    ai_summary: aiSummary,
  };

  // Insert
  const token = generateSnapshotToken();
  const { error: insertError } = await sb.from('ads_dashboard_snapshots').insert({
    token, payload,
    generated_by_user_id: user.id != null ? String(user.id) : null,
    expires_at,
  });
  if (insertError) {
    return { ok: false, error: 'data_error', message: `Snapshot insert failed: ${insertError.message}` };
  }

  // Audit (also serves as rate-limit ledger)
  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'ads_share_link_created',
    metadata: {
      token, expires_at,
      range: input.range,
      building: input.building,
      ai_skipped_reason: aiSkippedReason ?? null,
    },
  });

  return {
    ok: true,
    token,
    url: `${APP_BASE}/r/beithady/ads/${token}`,
    expires_at,
    ...(aiSkippedReason ? { ai_skipped_reason: aiSkippedReason } : {}),
  };
}
