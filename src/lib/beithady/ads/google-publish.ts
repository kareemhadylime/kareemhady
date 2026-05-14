import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import {
  loadGoogleAdsCredentials,
  getGoogleAccessToken,
  gadsMutate,
} from './google-client';
import {
  buildBhWaLink,
  DEFAULT_GEO_IDS,
  DEFAULT_GOOGLE_LANGUAGE_IDS,
} from './platforms';

// Publish a Search campaign to Google Ads via 6-step v24 mutate flow.
// Ports C:\Voltauto-pricing\supabase\functions\ads-google-publish\index.ts.
// Always creates the campaign as PAUSED for operator review.

export type GoogleSearchInput = {
  accountId: number;                  // ads_accounts.id (platform=google)
  campaignName?: string;
  dailyBudgetUsd: number;
  monthlyBudgetCapUsd?: number | null;   // optional auto-pause cap
  cpcBidUsd?: number;
  keywords: string[];                 // "voltauto" → BROAD, "\"x\"" → PHRASE, "[x]" → EXACT
  negativeKeywords?: string[];        // operator-supplied, merged with brand-protection defaults
  headlines: string[];                // 3–15, each ≤30 chars
  descriptions: string[];             // 2–4, each ≤90 chars
  finalUrl?: string;                  // default = Beithady wa.me link
  path1?: string;
  path2?: string;
  locationIds?: string[];             // default Egypt countrywide [2818]
  languageIds?: string[];             // default English + Arabic
  buildingCodes?: string[];           // BH attribution
};

export type GoogleSearchResult =
  | {
      ok: true;
      mode: 'live' | 'draft';
      campaign_id: number;
      campaign_external_id: string;
      adgroup_external_id: string;
      ad_external_id: string | null;
      review_url: string | null;
    }
  | {
      ok: false;
      mode: 'live' | 'draft';
      step: string;
      error: string;
      raw?: unknown;
    };

function parseKeyword(line: string): { text: string; matchType: 'BROAD' | 'PHRASE' | 'EXACT' } | null {
  const s = (line || '').trim();
  if (!s) return null;
  if (s.startsWith('[') && s.endsWith(']')) return { text: s.slice(1, -1).trim(), matchType: 'EXACT' };
  if (s.startsWith('"') && s.endsWith('"')) return { text: s.slice(1, -1).trim(), matchType: 'PHRASE' };
  return { text: s, matchType: 'BROAD' };
}

// Merge per-campaign + global + google-platform default negative keywords.
// Returns a de-duplicated lowercase list.
async function mergeNegativeKeywords(perCampaign: string[]): Promise<string[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_brand_protection_defaults')
    .select('scope, platform, keywords')
    .or('scope.eq.global,platform.eq.google');
  const fromDb = ((data as Array<{ scope: string; platform: string | null; keywords: string[] | null }> | null) || [])
    .flatMap(r => r.keywords || []);
  const set = new Set<string>();
  for (const kw of [...fromDb, ...perCampaign]) {
    const v = (kw || '').trim().toLowerCase();
    if (v) set.add(v);
  }
  return Array.from(set).slice(0, 100); // Google limits ~5k negatives total per campaign; cap our auto-add at 100
}

export async function publishGoogleSearchCampaign(
  input: GoogleSearchInput
): Promise<GoogleSearchResult> {
  const sb = supabaseAdmin();

  // Validation
  if (!input.accountId) return { ok: false, mode: 'live', step: 'validate', error: 'account_id required' };
  if (!Number.isFinite(input.dailyBudgetUsd) || input.dailyBudgetUsd < 1) {
    return { ok: false, mode: 'live', step: 'validate', error: 'daily_budget_usd must be >= 1' };
  }
  const keywords = (input.keywords || []).map(parseKeyword).filter((k): k is NonNullable<ReturnType<typeof parseKeyword>> => !!k && !!k.text);
  if (!keywords.length) return { ok: false, mode: 'live', step: 'validate', error: 'at least 1 keyword required' };
  if (keywords.length > 100) return { ok: false, mode: 'live', step: 'validate', error: 'max 100 keywords' };
  const headlines = (input.headlines || []).map(h => (h || '').trim()).filter(Boolean).map(h => h.slice(0, 30));
  const descriptions = (input.descriptions || []).map(d => (d || '').trim()).filter(Boolean).map(d => d.slice(0, 90));
  if (headlines.length < 3) return { ok: false, mode: 'live', step: 'validate', error: 'min 3 headlines (≤30 chars each)' };
  if (headlines.length > 15) return { ok: false, mode: 'live', step: 'validate', error: 'max 15 headlines' };
  if (descriptions.length < 2) return { ok: false, mode: 'live', step: 'validate', error: 'min 2 descriptions (≤90 chars each)' };
  if (descriptions.length > 4) return { ok: false, mode: 'live', step: 'validate', error: 'max 4 descriptions' };

  let finalUrl = (input.finalUrl || buildBhWaLink()).trim();
  if (!finalUrl.startsWith('https://')) return { ok: false, mode: 'live', step: 'validate', error: 'final_url must be https' };

  // Building-keyed UTM auto-append. Only stamps if the operator didn't set utm_*
  // params themselves and at least one building_code is attached. utm_campaign
  // gets the first building code; analytics can split fan-outs per campaign later.
  if ((input.buildingCodes || []).length > 0 && !/[?&]utm_/.test(finalUrl)) {
    const sep = finalUrl.includes('?') ? '&' : '?';
    const utm = new URLSearchParams({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: `${input.buildingCodes![0]}-google`,
    });
    finalUrl = `${finalUrl}${sep}${utm.toString()}`;
  }

  // Load account
  const { data: acc } = await sb
    .from('ads_accounts')
    .select('id, platform, external_id, name, google_refresh_token')
    .eq('id', input.accountId)
    .maybeSingle();
  if (!acc) return { ok: false, mode: 'live', step: 'load_account', error: 'account_not_found' };
  if ((acc as { platform: string }).platform !== 'google') {
    return { ok: false, mode: 'live', step: 'load_account', error: 'account_not_google' };
  }
  const customerId = String((acc as { external_id: string }).external_id || '').replace(/[^\d]/g, '');
  if (!customerId) return { ok: false, mode: 'live', step: 'load_account', error: 'external_id_empty' };

  // Load credentials. If missing → draft mode (DB-only).
  const credsRes = await loadGoogleAdsCredentials((acc as { google_refresh_token?: string | null }).google_refresh_token);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const campaignName = (input.campaignName || `[Beit Hady] Search ${stamp}`).trim();
  const adgroupName = `[Beit Hady] AdGroup ${stamp}`;
  const dailyBudgetMicros = Math.round(input.dailyBudgetUsd * 1_000_000);
  const cpcBidUsd = Number.isFinite(input.cpcBidUsd) ? Math.max(0.05, Number(input.cpcBidUsd)) : 1;
  const locationIds = (input.locationIds && input.locationIds.length ? input.locationIds : DEFAULT_GEO_IDS.google) as readonly string[];
  const languageIds = (input.languageIds && input.languageIds.length ? input.languageIds : DEFAULT_GOOGLE_LANGUAGE_IDS) as readonly string[];

  if (!credsRes.ok) {
    // DRAFT MODE
    const externalIdSeed = `draft_g_${Date.now()}`;
    const { data: campIns } = await sb
      .from('ads_campaigns')
      .insert({
        account_id: input.accountId,
        platform: 'google',
        external_id: `${externalIdSeed}_camp`,
        name: campaignName,
        status: 'DRAFT',
        objective: 'SEARCH',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes || [],
        monthly_budget_cap_usd: input.monthlyBudgetCapUsd ?? null,
      })
      .select('id')
      .single();
    if (!campIns) return { ok: false, mode: 'draft', step: 'draft_insert', error: 'insert_failed' };
    const dbCampId = (campIns as { id: number }).id;

    const { data: setIns } = await sb
      .from('ads_ad_sets')
      .insert({
        campaign_id: dbCampId,
        platform: 'google',
        external_id: `${externalIdSeed}_adgroup`,
        name: adgroupName,
        status: 'DRAFT',
        optimization_goal: 'CLICKS',
        daily_budget_micros: dailyBudgetMicros,
        target_countries: locationIds as string[],
        targeting: { language_ids: languageIds, cpc_bid_usd: cpcBidUsd },
      })
      .select('id')
      .single();

    await sb.from('ads_ads').insert({
      ad_set_id: (setIns as { id: number } | null)?.id,
      platform: 'google',
      external_id: `${externalIdSeed}_ad`,
      name: `${campaignName} RSA`,
      status: 'DRAFT',
      creative_type: 'responsive_search_ad',
      headline: headlines[0] || null,
      body: descriptions[0] || null,
      landing_url: finalUrl,
    });

    await recordAudit({
      module: 'ads',
      action: 'campaign_drafted',
      target_type: 'campaign',
      target_id: String(dbCampId),
      metadata: { platform: 'google', reason: credsRes.error, missing: credsRes.missing },
    });

    return {
      ok: true,
      mode: 'draft',
      campaign_id: dbCampId,
      campaign_external_id: `${externalIdSeed}_camp`,
      adgroup_external_id: `${externalIdSeed}_adgroup`,
      ad_external_id: `${externalIdSeed}_ad`,
      review_url: null,
    };
  }

  // LIVE MODE — full 6-step Google Ads v24 mutate
  const creds = credsRes.creds;
  const tokRes = await getGoogleAccessToken(creds);
  if (!tokRes.ok) return { ok: false, mode: 'live', step: 'oauth', error: tokRes.error, raw: tokRes };
  const accessToken = tokRes.access_token;

  // Step 1: budget
  const budgetRes = await gadsMutate(
    customerId,
    'campaignBudgets',
    [{
      create: {
        name: `${campaignName} budget`,
        amountMicros: String(dailyBudgetMicros),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
    }],
    creds,
    accessToken
  );
  if (!budgetRes.ok) return { ok: false, mode: 'live', step: 'create_budget', error: 'mutate_failed', raw: budgetRes.body };
  const budgetResource = budgetRes.body.results?.[0]?.resourceName;
  if (!budgetResource) return { ok: false, mode: 'live', step: 'create_budget', error: 'no_budget_resource', raw: budgetRes.body };

  // Step 2: campaign
  const campRes = await gadsMutate(
    customerId,
    'campaigns',
    [{
      create: {
        name: campaignName,
        advertisingChannelType: 'SEARCH',
        status: 'PAUSED',
        campaignBudget: budgetResource,
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
        manualCpc: { enhancedCpcEnabled: false },
      },
    }],
    creds,
    accessToken
  );
  if (!campRes.ok) return { ok: false, mode: 'live', step: 'create_campaign', error: 'mutate_failed', raw: campRes.body };
  const campaignResource = campRes.body.results?.[0]?.resourceName;
  if (!campaignResource) return { ok: false, mode: 'live', step: 'create_campaign', error: 'no_campaign_resource', raw: campRes.body };
  const campaignExternalId = String(campaignResource).split('/').pop() || '';

  // Step 3: geo + language criteria
  const criteriaOps: Array<Record<string, unknown>> = [];
  for (const locId of locationIds) {
    criteriaOps.push({ create: { campaign: campaignResource, location: { geoTargetConstant: `geoTargetConstants/${locId}` } } });
  }
  for (const langId of languageIds) {
    criteriaOps.push({ create: { campaign: campaignResource, language: { languageConstant: `languageConstants/${langId}` } } });
  }
  if (criteriaOps.length) {
    const ccRes = await gadsMutate(customerId, 'campaignCriteria', criteriaOps, creds, accessToken);
    if (!ccRes.ok) return { ok: false, mode: 'live', step: 'campaign_criteria', error: 'mutate_failed', raw: ccRes.body };
  }

  // Step 4: ad group
  const cpcMicros = Math.round(cpcBidUsd * 1_000_000);
  const agRes = await gadsMutate(
    customerId,
    'adGroups',
    [{
      create: {
        name: adgroupName,
        campaign: campaignResource,
        status: 'PAUSED',
        type: 'SEARCH_STANDARD',
        cpcBidMicros: String(cpcMicros),
      },
    }],
    creds,
    accessToken
  );
  if (!agRes.ok) return { ok: false, mode: 'live', step: 'create_adgroup', error: 'mutate_failed', raw: agRes.body };
  const adgroupResource = agRes.body.results?.[0]?.resourceName;
  if (!adgroupResource) return { ok: false, mode: 'live', step: 'create_adgroup', error: 'no_adgroup_resource', raw: agRes.body };
  const adgroupExternalId = String(adgroupResource).split('/').pop() || '';

  // Step 5: keywords (positive + brand-protection negatives at campaign level)
  const kwOps = keywords.map(k => ({
    create: { adGroup: adgroupResource, status: 'ENABLED', keyword: { text: k.text, matchType: k.matchType } },
  }));
  const kwRes = await gadsMutate(customerId, 'adGroupCriteria', kwOps, creds, accessToken);
  if (!kwRes.ok) return { ok: false, mode: 'live', step: 'create_keywords', error: 'mutate_failed', raw: kwRes.body };

  // Step 5b: campaign-level negative keywords (brand protection + operator-supplied)
  const negatives = await mergeNegativeKeywords(input.negativeKeywords || []);
  if (negatives.length > 0) {
    const negOps = negatives.map(text => ({
      create: {
        campaign: campaignResource,
        negative: true,
        keyword: { text, matchType: 'PHRASE' as const },
      },
    }));
    const negRes = await gadsMutate(customerId, 'campaignCriteria', negOps, creds, accessToken);
    if (!negRes.ok) {
      // Negatives are nice-to-have — log but don't fail the whole publish.
      console.warn('[google-publish] negative_keywords mutate failed:', negRes.body);
    }
  }

  // Step 6: responsive search ad
  const rsa: Record<string, unknown> = {
    headlines: headlines.map(h => ({ text: h })),
    descriptions: descriptions.map(d => ({ text: d })),
  };
  if (input.path1) rsa.path1 = input.path1.slice(0, 15);
  if (input.path2) rsa.path2 = input.path2.slice(0, 15);
  const adRes = await gadsMutate(
    customerId,
    'adGroupAds',
    [{
      create: {
        adGroup: adgroupResource,
        status: 'PAUSED',
        ad: { finalUrls: [finalUrl], responsiveSearchAd: rsa },
      },
    }],
    creds,
    accessToken
  );
  if (!adRes.ok) return { ok: false, mode: 'live', step: 'create_ad', error: 'mutate_failed', raw: adRes.body };
  const adResource = adRes.body.results?.[0]?.resourceName;
  const adExternalId = String(adResource || '').split('~').pop() || null;

  // Persist
  const { data: campIns } = await sb
    .from('ads_campaigns')
    .upsert(
      {
        account_id: input.accountId,
        platform: 'google',
        external_id: campaignExternalId,
        name: campaignName,
        status: 'PAUSED',
        objective: 'SEARCH',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes || [],
        monthly_budget_cap_usd: input.monthlyBudgetCapUsd ?? null,
        raw: { customer_id: customerId, budget_resource: budgetResource } as object,
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
        platform: 'google',
        external_id: adgroupExternalId,
        name: adgroupName,
        status: 'PAUSED',
        optimization_goal: 'CLICKS',
        daily_budget_micros: dailyBudgetMicros,
        target_countries: locationIds as string[],
        targeting: { language_ids: languageIds, cpc_bid_usd: cpcBidUsd } as object,
        raw: { adgroup_resource: adgroupResource } as object,
      },
      { onConflict: 'platform,external_id' }
    )
    .select('id')
    .single();

  if (adExternalId) {
    await sb.from('ads_ads').upsert(
      {
        ad_set_id: (setIns as { id: number } | null)?.id,
        platform: 'google',
        external_id: adExternalId,
        name: `${campaignName} RSA`,
        status: 'PAUSED',
        creative_type: 'responsive_search_ad',
        headline: headlines[0] || null,
        body: descriptions[0] || null,
        landing_url: finalUrl,
        raw: { ad_resource: adResource, headlines, descriptions, path1: input.path1, path2: input.path2, keyword_count: keywords.length } as object,
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
      platform: 'google',
      external_id: campaignExternalId,
      daily_budget_usd: input.dailyBudgetUsd,
      keywords: keywords.length,
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
    review_url: `https://ads.google.com/aw/campaigns?campaignId=${campaignExternalId}&__c=${customerId}`,
  };
}

// Pause / resume a Google Search campaign.
export async function setGoogleCampaignStatus(
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
  if (r.platform !== 'google') return { ok: false, error: 'not_google' };
  if (r.external_id.startsWith('draft_')) {
    await sb.from('ads_campaigns').update({ status: status === 'ENABLED' ? 'ACTIVE' : 'PAUSED' }).eq('id', campaignDbId);
    return { ok: true };
  }
  const { data: acc } = await sb.from('ads_accounts').select('external_id, google_refresh_token').eq('id', r.account_id).maybeSingle();
  const customerId = String((acc as { external_id?: string } | null)?.external_id || '').replace(/[^\d]/g, '');
  if (!customerId) return { ok: false, error: 'no_customer_id' };
  const credsRes = await loadGoogleAdsCredentials((acc as { google_refresh_token?: string | null } | null)?.google_refresh_token);
  if (!credsRes.ok) return { ok: false, error: credsRes.error };
  const tokRes = await getGoogleAccessToken(credsRes.creds);
  if (!tokRes.ok) return { ok: false, error: tokRes.error };
  const m = await gadsMutate(
    customerId,
    'campaigns',
    [{
      update: { resourceName: `customers/${customerId}/campaigns/${r.external_id}`, status },
      updateMask: 'status',
    }],
    credsRes.creds,
    tokRes.access_token
  );
  if (!m.ok) return { ok: false, error: 'mutate_failed' };
  await sb.from('ads_campaigns').update({ status: status === 'ENABLED' ? 'ACTIVE' : 'PAUSED' }).eq('id', campaignDbId);
  return { ok: true };
}
