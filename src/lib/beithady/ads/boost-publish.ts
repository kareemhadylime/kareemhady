import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import { loadMetaCredentials, metaPost, buildMetaTargetingSpec } from './meta-client';
import { buildBhWaLink } from './platforms';

// "Boost existing post" flow for Instagram. Operator picks a Reel /
// Post / Carousel already published to their IG Business account
// and we wrap it in a Meta Ad with the existing object_story_id —
// no new creative upload needed.
//
// Object_story_id format for IG: <ig_business_id>_<media_id>. Meta
// resolves that to the underlying boosted post. Comments + likes from
// the original organic post stay attached to the ad, which is the
// whole reason operators want this over publishing a fresh creative.

export type BoostIgInput = {
  accountId: number;                  // ads_accounts.id (platform=meta)
  igBusinessId: string;
  igMediaId: string;                  // the existing post/Reel id
  permalink: string | null;
  caption: string | null;
  campaignName?: string;
  buildingCodes: string[];
  targetCountries: string[];          // ISO alpha-2
  targetGroupId?: number;             // ads_target_groups.id — stored for attribution
  ageMin?: number;
  ageMax?: number;
  dailyBudgetUsd: number;
  monthlyBudgetCapUsd?: number | null;
  durationDays?: number;
  ctwa?: boolean;                     // route to WhatsApp (default) or to a website?
  landingUrl?: string;                // overrides wa.me default
  createdBy?: string | null;
};

export type BoostIgResult =
  | {
      ok: true;
      mode: 'live' | 'draft';
      campaign_id: number;
      campaign_external_id: string;
      ad_set_external_id: string;
      ad_external_id: string;
      review_url: string | null;
    }
  | { ok: false; mode: 'live' | 'draft'; step: string; error: string; raw?: unknown };

export async function boostInstagramPost(input: BoostIgInput): Promise<BoostIgResult> {
  const sb = supabaseAdmin();
  const creds = await loadMetaCredentials();
  const isDraft = !creds.ok;

  // Get or create the Meta ads_accounts row
  const { data: accRow } = await sb
    .from('ads_accounts')
    .select('id, external_id, fb_page_id, ig_business_id, name')
    .eq('id', input.accountId)
    .maybeSingle();
  const acc = accRow as { id: number; external_id: string; fb_page_id: string | null; ig_business_id: string | null; name: string } | null;
  if (!acc) return { ok: false, mode: isDraft ? 'draft' : 'live', step: 'load_account', error: 'account_not_found' };
  if (!acc.ig_business_id) return { ok: false, mode: isDraft ? 'draft' : 'live', step: 'load_account', error: 'ig_business_id_missing — run resolve_ig first' };

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const campaignName = (input.campaignName || `[Beit Hady] Boost ${stamp}`).trim();
  const dailyBudgetMicros = Math.round(input.dailyBudgetUsd * 1_000_000);
  const dailyBudgetCents = Math.round(input.dailyBudgetUsd * 100);

  // Draft mode if creds missing
  if (isDraft) {
    const seed = `draft_boost_${Date.now()}`;
    const { data: campIns } = await sb
      .from('ads_campaigns')
      .insert({
        account_id: acc.id,
        platform: 'meta',
        external_id: `${seed}_camp`,
        name: campaignName,
        status: 'DRAFT',
        objective: input.ctwa === false ? 'OUTCOME_TRAFFIC' : 'OUTCOME_ENGAGEMENT',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes,
        monthly_budget_cap_usd: input.monthlyBudgetCapUsd ?? null,
        target_group_id: input.targetGroupId ?? null,
        raw: { kind: 'boost_existing_ig_post', ig_media_id: input.igMediaId, permalink: input.permalink } as object,
      })
      .select('id').single();
    if (!campIns) return { ok: false, mode: 'draft', step: 'draft_insert', error: 'insert_failed' };
    const dbCampId = (campIns as { id: number }).id;

    const { data: setIns } = await sb.from('ads_ad_sets').insert({
      campaign_id: dbCampId,
      platform: 'meta',
      external_id: `${seed}_adset`,
      name: `${campaignName} — adset`,
      status: 'DRAFT',
      optimization_goal: input.ctwa === false ? 'LINK_CLICKS' : 'CONVERSATIONS',
      daily_budget_micros: dailyBudgetMicros,
      target_countries: input.targetCountries,
      age_min: input.ageMin ?? 25,
      age_max: input.ageMax ?? 65,
    }).select('id').single();

    await sb.from('ads_ads').insert({
      ad_set_id: (setIns as { id: number } | null)?.id,
      platform: 'meta',
      external_id: `${seed}_ad`,
      name: `${campaignName} — boost`,
      status: 'DRAFT',
      creative_type: 'boost_existing_post',
      creative_url: input.permalink,
      headline: null,
      body: input.caption?.slice(0, 500) || null,
      landing_url: input.ctwa === false ? input.landingUrl : buildBhWaLink(),
    });

    await recordAudit({
      module: 'ads',
      action: 'campaign_drafted',
      target_type: 'campaign',
      target_id: String(dbCampId),
      metadata: { platform: 'meta', kind: 'boost_existing_ig_post', ig_media_id: input.igMediaId, reason: 'meta_creds_missing' },
    });

    return {
      ok: true,
      mode: 'draft',
      campaign_id: dbCampId,
      campaign_external_id: `${seed}_camp`,
      ad_set_external_id: `${seed}_adset`,
      ad_external_id: `${seed}_ad`,
      review_url: null,
    };
  }

  // === LIVE MODE ===
  const c = creds.creds;
  const adAccountPath = c.adAccountId;

  // 1. Campaign
  const useCtwa = input.ctwa !== false;
  const campPayload: Record<string, unknown> = {
    name: campaignName,
    objective: useCtwa ? 'OUTCOME_ENGAGEMENT' : 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
    special_ad_categories: [],
    // buying_type defaults to AUCTION — omitting explicit field to avoid
    // "Invalid parameter" on accounts that don't support the field
  };
  // CTWA requires promoted_object at campaign level in Meta API v21+
  if (useCtwa && c.fbPageId) {
    campPayload.promoted_object = { page_id: c.fbPageId };
  }
  const campRes = await metaPost<{ id: string }>(
    `${adAccountPath}/campaigns`,
    campPayload,
    c.token
  );
  if (!campRes.ok) {
    console.error('[boost-publish] create_campaign failed', JSON.stringify(campRes.raw));
    return { ok: false, mode: 'live', step: 'create_campaign', error: campRes.error, raw: campRes.raw };
  }
  const campaignExternalId = (campRes.data as { id: string }).id;

  // 2. Ad set — resolve interest/behavior IDs from target group if provided
  let targetingExtras: Record<string, unknown> = {
    age_min: input.ageMin ?? 25,
    age_max: input.ageMax ?? 55,
  };
  if (input.targetGroupId) {
    const { data: grp } = await supabaseAdmin()
      .from('ads_target_groups')
      .select('id,slug,age_min,age_max,meta_locales,meta_interest_names,meta_behavior_names,spending_power')
      .eq('id', input.targetGroupId)
      .single();
    if (grp) {
      targetingExtras = await buildMetaTargetingSpec(
        grp as Parameters<typeof buildMetaTargetingSpec>[0],
        c.token
      );
    }
  }
  const landingUrl = useCtwa ? buildBhWaLink(`Hi Beit Hady — interested in this post`) : (input.landingUrl || buildBhWaLink());
  const adsetPayload: Record<string, unknown> = {
    name: `${campaignName} — adset`,
    campaign_id: campaignExternalId,
    status: 'PAUSED',
    billing_event: 'IMPRESSIONS',
    optimization_goal: useCtwa ? 'CONVERSATIONS' : 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: dailyBudgetCents,
    targeting: {
      ...targetingExtras,
      geo_locations: { countries: input.targetCountries },
      publisher_platforms: ['instagram', 'facebook'],
      instagram_positions: ['stream', 'story', 'explore', 'reels'],
      facebook_positions: ['feed', 'story'],
      targeting_automation: { advantage_audience: 0 },
    },
    start_time: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
  if (useCtwa) {
    adsetPayload.destination_type = 'WHATSAPP';
    adsetPayload.promoted_object = { page_id: c.fbPageId };
  }
  if (input.durationDays && input.durationDays > 0) {
    adsetPayload.end_time = new Date(Date.now() + input.durationDays * 86_400_000).toISOString();
  }
  const adsetRes = await metaPost<{ id: string }>(`${adAccountPath}/adsets`, adsetPayload, c.token);
  if (!adsetRes.ok) return { ok: false, mode: 'live', step: 'create_adset', error: adsetRes.error, raw: adsetRes.raw };
  const adsetExternalId = (adsetRes.data as { id: string }).id;

  // 3. Creative — reference the existing IG post
  // The supported way to promote an existing IG media is via object_story_id
  // formatted as "<ig_business_id>_<media_id>". Meta resolves it to the
  // underlying post/Reel. Comments + likes from the organic post stay
  // attached to the ad creative.
  const objectStoryId = `${input.igBusinessId}_${input.igMediaId}`;
  const creativeRes = await metaPost<{ id: string }>(
    `${adAccountPath}/adcreatives`,
    {
      name: `${campaignName} — boost creative`,
      object_story_id: objectStoryId,
      // For CTWA, we have to also set instagram_actor_id so the WhatsApp
      // CTA renders under the boosted post.
      ...(useCtwa ? {
        instagram_actor_id: input.igBusinessId,
        instagram_user_id: input.igBusinessId,
      } : {}),
    },
    c.token
  );
  if (!creativeRes.ok) return { ok: false, mode: 'live', step: 'create_creative', error: creativeRes.error, raw: creativeRes.raw };

  // 4. Ad
  const adRes = await metaPost<{ id: string }>(
    `${adAccountPath}/ads`,
    {
      name: `${campaignName} — boost ad`,
      adset_id: adsetExternalId,
      creative: { creative_id: (creativeRes.data as { id: string }).id },
      status: 'PAUSED',
    },
    c.token
  );
  if (!adRes.ok) return { ok: false, mode: 'live', step: 'create_ad', error: adRes.error, raw: adRes.raw };
  const adExternalId = (adRes.data as { id: string }).id;

  // Persist locally
  const { data: campIns } = await sb
    .from('ads_campaigns')
    .upsert(
      {
        account_id: acc.id,
        platform: 'meta',
        external_id: campaignExternalId,
        name: campaignName,
        status: 'PAUSED',
        objective: useCtwa ? 'OUTCOME_ENGAGEMENT' : 'OUTCOME_TRAFFIC',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes,
        monthly_budget_cap_usd: input.monthlyBudgetCapUsd ?? null,
        target_group_id: input.targetGroupId ?? null,
        raw: { kind: 'boost_existing_ig_post', ig_media_id: input.igMediaId, permalink: input.permalink, object_story_id: objectStoryId } as object,
      },
      { onConflict: 'platform,external_id' }
    )
    .select('id').single();
  const dbCampId = (campIns as { id: number } | null)?.id || 0;

  const { data: setIns } = await sb
    .from('ads_ad_sets')
    .upsert(
      {
        campaign_id: dbCampId,
        platform: 'meta',
        external_id: adsetExternalId,
        name: `${campaignName} — adset`,
        status: 'PAUSED',
        optimization_goal: useCtwa ? 'CONVERSATIONS' : 'LINK_CLICKS',
        daily_budget_micros: dailyBudgetMicros,
        target_countries: input.targetCountries,
        age_min: input.ageMin ?? 25,
        age_max: input.ageMax ?? 65,
      },
      { onConflict: 'platform,external_id' }
    )
    .select('id').single();

  await sb.from('ads_ads').upsert(
    {
      ad_set_id: (setIns as { id: number } | null)?.id,
      platform: 'meta',
      external_id: adExternalId,
      name: `${campaignName} — boost ad`,
      status: 'PAUSED',
      creative_type: 'boost_existing_post',
      creative_url: input.permalink,
      headline: null,
      body: input.caption?.slice(0, 500) || null,
      landing_url: landingUrl,
      raw: { ig_media_id: input.igMediaId, object_story_id: objectStoryId } as object,
    },
    { onConflict: 'platform,external_id' }
  );

  await recordAudit({
    module: 'ads',
    action: 'campaign_published',
    target_type: 'campaign',
    target_id: String(dbCampId),
    metadata: {
      platform: 'meta',
      kind: 'boost_existing_ig_post',
      ig_media_id: input.igMediaId,
      permalink: input.permalink,
      daily_budget_usd: input.dailyBudgetUsd,
      ctwa: useCtwa,
      building_codes: input.buildingCodes,
      target_countries: input.targetCountries,
    },
  });

  return {
    ok: true,
    mode: 'live',
    campaign_id: dbCampId,
    campaign_external_id: campaignExternalId,
    ad_set_external_id: adsetExternalId,
    ad_external_id: adExternalId,
    review_url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${c.adAccountId.replace(/^act_/, '')}&selected_ad_ids=${adExternalId}`,
  };
}
