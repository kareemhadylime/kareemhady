import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import { loadMetaCredentials, metaPost, buildMetaTargetingSpec } from './meta-client';

// Publish a CTWA campaign to Meta. Mirrors Voltauto's ads-meta-publish
// edge function (C:\Voltauto-pricing\supabase\functions\ads-meta-publish\
// index.ts) but as a Next.js server action wrapper. Always creates the
// ad as PAUSED so the operator reviews in Ads Manager before activation.
//
// Falls back to "draft" mode when meta_marketing credentials aren't
// configured: still creates ads_campaigns/ads_ad_sets/ads_ads rows
// (status='DRAFT', external_id synthetic) so the UI works pre-WABA.

const CTWA_PHONE = '+201101300300'; // Beithady WABA — replace once Q-C provisioned

export type PublishCtwaInput = {
  ctaText?: 'Send Message' | 'Learn More' | 'Book Now' | 'Contact Us';
  campaignName: string;
  buildingCodes: string[];
  targetCountries: string[];
  targetGroupId?: number;              // ads_target_groups.id — stored for attribution
  ageMin?: number;
  ageMax?: number;
  dailyBudgetUsd: number;
  monthlyBudgetCapUsd?: number | null;   // optional auto-pause cap (Phase H+ budget guard)
  durationDays?: number;          // 0 = no end_time
  galleryAssetIds: string[];      // beithady_gallery_assets.id[]
  headline: string;
  primaryText: string;
  language: string;
  // For draft mode + DB linking
  copyLogIds?: string[];
};

export type PublishCtwaResult =
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

export async function publishCtwaCampaign(input: PublishCtwaInput): Promise<PublishCtwaResult> {
  const sb = supabaseAdmin();
  const creds = await loadMetaCredentials();
  const isDraft = !creds.ok;

  // Upsert/find Beithady's Meta ads_account row first
  let accountId: number | null = null;
  if (creds.ok) {
    const { data: acc } = await sb
      .from('ads_accounts')
      .upsert(
        {
          platform: 'meta',
          external_id: creds.creds.adAccountId,
          name: 'Beit Hady Meta Ads',
          currency: 'USD',
          fb_page_id: creds.creds.fbPageId,
          meta_business_id: creds.creds.businessId,
          status: 'active',
        },
        { onConflict: 'platform,external_id' }
      )
      .select('id')
      .single();
    accountId = (acc as { id: number } | null)?.id || null;
  } else {
    // Draft mode — use a synthetic placeholder account
    const { data: acc } = await sb
      .from('ads_accounts')
      .upsert(
        {
          platform: 'meta',
          external_id: 'draft_account',
          name: 'Beit Hady Meta Ads (draft — credentials missing)',
          currency: 'USD',
          status: 'paused',
          notes: 'Meta Marketing credentials not configured; campaigns saved as drafts.',
        },
        { onConflict: 'platform,external_id' }
      )
      .select('id')
      .single();
    accountId = (acc as { id: number } | null)?.id || null;
  }
  if (!accountId) return { ok: false, mode: isDraft ? 'draft' : 'live', step: 'load_account', error: 'no_ads_account' };

  // Resolve gallery → ad-eligible public URLs
  const { data: galleryRows } = await sb
    .from('beithady_gallery_assets')
    .select('id, public_url, ad_eligible')
    .in('id', input.galleryAssetIds);
  const eligibleUrls = ((galleryRows as Array<{ id: string; public_url: string | null; ad_eligible: boolean }> | null) || [])
    .filter(g => g.public_url && g.ad_eligible)
    .map(g => g.public_url as string);

  const isCarousel = eligibleUrls.length >= 2;
  const dailyBudgetCents = Math.round(input.dailyBudgetUsd * 100);
  const dailyBudgetMicros = Math.round(input.dailyBudgetUsd * 1_000_000);

  // === DRAFT MODE === — credentials missing, just persist intent
  if (isDraft) {
    const externalIdSeed = `draft_${Date.now()}`;
    const { data: campIns } = await sb
      .from('ads_campaigns')
      .insert({
        account_id: accountId,
        platform: 'meta',
        external_id: `${externalIdSeed}_camp`,
        name: input.campaignName,
        status: 'DRAFT',
        objective: 'OUTCOME_ENGAGEMENT',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes,
        monthly_budget_cap_usd: input.monthlyBudgetCapUsd ?? null,
        target_group_id: input.targetGroupId ?? null,
      })
      .select('id')
      .single();
    if (!campIns) return { ok: false, mode: 'draft', step: 'draft_campaign_insert', error: 'insert_failed' };
    const dbCampId = (campIns as { id: number }).id;

    const { data: setIns } = await sb
      .from('ads_ad_sets')
      .insert({
        campaign_id: dbCampId,
        platform: 'meta',
        external_id: `${externalIdSeed}_adset`,
        name: `${input.campaignName} — adset`,
        status: 'DRAFT',
        optimization_goal: 'CONVERSATIONS',
        daily_budget_micros: dailyBudgetMicros,
        target_countries: input.targetCountries,
        age_min: input.ageMin ?? 25,
        age_max: input.ageMax ?? 65,
      })
      .select('id')
      .single();

    await sb.from('ads_ads').insert({
      ad_set_id: (setIns as { id: number } | null)?.id,
      platform: 'meta',
      external_id: `${externalIdSeed}_ad`,
      name: `${input.campaignName} — ad`,
      status: 'DRAFT',
      creative_type: isCarousel ? 'carousel' : 'link',
      creative_url: eligibleUrls[0] || null,
      headline: input.headline,
      body: input.primaryText,
      cta: input.ctaText || 'Send Message',
      gallery_asset_ids: input.galleryAssetIds,
      language: input.language,
    });

    await recordAudit({
      module: 'ads',
      action: 'campaign_drafted',
      target_type: 'campaign',
      target_id: String(dbCampId),
      metadata: {
        reason: creds.error,
        missing: 'missing' in creds ? creds.missing : [],
        building_codes: input.buildingCodes,
        target_countries: input.targetCountries,
      },
    });

    return {
      ok: true,
      mode: 'draft',
      campaign_id: dbCampId,
      campaign_external_id: `${externalIdSeed}_camp`,
      ad_set_external_id: `${externalIdSeed}_adset`,
      ad_external_id: `${externalIdSeed}_ad`,
      review_url: null,
    };
  }

  // === LIVE MODE === — call Meta Marketing API
  const c = creds.creds;
  const adAccountPath = c.adAccountId;

  // 1. Campaign
  const campRes = await metaPost<{ id: string }>(
    `${adAccountPath}/campaigns`,
    {
      name: input.campaignName,
      objective: 'OUTCOME_ENGAGEMENT',
      status: 'PAUSED',
      special_ad_categories: [],
      buying_type: 'AUCTION',
      is_adset_budget_sharing_enabled: false,
    },
    c.token
  );
  if (!campRes.ok) return { ok: false, mode: 'live', step: 'create_campaign', error: campRes.error, raw: campRes.raw };
  const campaignExternalId = (campRes.data as { id: string }).id;

  // 2. Ad Set — build targeting spec (resolves interest/behavior IDs if a group is set)
  let targetingExtras: Record<string, unknown> = {
    age_min: input.ageMin ?? 25,
    age_max: input.ageMax ?? 65,
  };
  if (input.targetGroupId) {
    const sb = supabaseAdmin();
    const { data: grp } = await sb
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
  const adsetPayload: Record<string, unknown> = {
    name: `${input.campaignName} — adset`,
    campaign_id: campaignExternalId,
    status: 'PAUSED',
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'CONVERSATIONS',
    destination_type: 'WHATSAPP',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: dailyBudgetCents,
    promoted_object: { page_id: c.fbPageId },
    targeting: {
      ...targetingExtras,
      geo_locations: { countries: input.targetCountries },
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed', 'story'],
      instagram_positions: ['stream', 'story', 'explore'],
      targeting_automation: { advantage_audience: 0 },
    },
    start_time: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
  if (input.durationDays && input.durationDays > 0) {
    adsetPayload.end_time = new Date(Date.now() + input.durationDays * 86400e3).toISOString();
  }
  const adsetRes = await metaPost<{ id: string }>(`${adAccountPath}/adsets`, adsetPayload, c.token);
  if (!adsetRes.ok) return { ok: false, mode: 'live', step: 'create_adset', error: adsetRes.error, raw: adsetRes.raw };
  const adsetExternalId = (adsetRes.data as { id: string }).id;

  // 3. Creative
  const waLink = `https://wa.me/${CTWA_PHONE.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi Beit Hady — interested in ${input.campaignName}`)}`;
  const ctaWhats = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', link: waLink } };
  const linkData = isCarousel
    ? {
        message: input.primaryText,
        link: waLink,
        child_attachments: eligibleUrls.map(url => ({ link: waLink, picture: url, name: input.headline, call_to_action: ctaWhats })),
        multi_share_optimized: true,
        multi_share_end_card: false,
        call_to_action: ctaWhats,
      }
    : {
        message: input.primaryText,
        name: input.headline,
        link: waLink,
        picture: eligibleUrls[0] || '',
        call_to_action: ctaWhats,
      };
  const creativeRes = await metaPost<{ id: string }>(
    `${adAccountPath}/adcreatives`,
    {
      name: `${input.campaignName} — creative`,
      object_story_spec: { page_id: c.fbPageId, link_data: linkData },
    },
    c.token
  );
  if (!creativeRes.ok) return { ok: false, mode: 'live', step: 'create_creative', error: creativeRes.error, raw: creativeRes.raw };

  // 4. Ad
  const adRes = await metaPost<{ id: string }>(
    `${adAccountPath}/ads`,
    {
      name: `${input.campaignName} — ad`,
      adset_id: adsetExternalId,
      creative: { creative_id: (creativeRes.data as { id: string }).id },
      status: 'PAUSED',
    },
    c.token
  );
  if (!adRes.ok) return { ok: false, mode: 'live', step: 'create_ad', error: adRes.error, raw: adRes.raw };
  const adExternalId = (adRes.data as { id: string }).id;

  // 5. Persist locally
  const { data: campIns } = await sb
    .from('ads_campaigns')
    .upsert(
      {
        account_id: accountId,
        platform: 'meta',
        external_id: campaignExternalId,
        name: input.campaignName,
        status: 'PAUSED',
        objective: 'OUTCOME_ENGAGEMENT',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes,
        monthly_budget_cap_usd: input.monthlyBudgetCapUsd ?? null,
        target_group_id: input.targetGroupId ?? null,
        raw: campRes.data as object,
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
        platform: 'meta',
        external_id: adsetExternalId,
        name: `${input.campaignName} — adset`,
        status: 'PAUSED',
        optimization_goal: 'CONVERSATIONS',
        daily_budget_micros: dailyBudgetMicros,
        target_countries: input.targetCountries,
        age_min: input.ageMin ?? 25,
        age_max: input.ageMax ?? 65,
        raw: adsetRes.data as object,
      },
      { onConflict: 'platform,external_id' }
    )
    .select('id')
    .single();

  await sb.from('ads_ads').upsert(
    {
      ad_set_id: (setIns as { id: number } | null)?.id,
      platform: 'meta',
      external_id: adExternalId,
      name: `${input.campaignName} — ad`,
      status: 'PAUSED',
      creative_type: isCarousel ? 'carousel' : 'link',
      creative_url: eligibleUrls[0] || null,
      headline: input.headline,
      body: input.primaryText,
      cta: input.ctaText || 'Send Message',
      gallery_asset_ids: input.galleryAssetIds,
      language: input.language,
      landing_url: waLink,
      raw: { ad: adRes.data, creative: creativeRes.data, card_count: eligibleUrls.length },
    },
    { onConflict: 'platform,external_id' }
  );

  await recordAudit({
    module: 'ads',
    action: 'campaign_published',
    target_type: 'campaign',
    target_id: String(dbCampId),
    metadata: {
      external_id: campaignExternalId,
      kind: isCarousel ? 'carousel' : 'single',
      card_count: eligibleUrls.length,
      building_codes: input.buildingCodes,
      target_countries: input.targetCountries,
      daily_budget_usd: input.dailyBudgetUsd,
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
