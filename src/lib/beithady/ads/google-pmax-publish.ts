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

// Beithady brand assets — uploaded once to beithady-gallery-public, reused as
// default Google Ads assets so every PMax campaign is fully populated on create.
const BH_LOGO_URL      = 'https://bpjproljatbrbmszwbov.supabase.co/storage/v1/object/public/beithady-gallery-public/brand/bh-logo.png';
const BH_WORDMARK_URL  = 'https://bpjproljatbrbmszwbov.supabase.co/storage/v1/object/public/beithady-gallery-public/brand/bh-wordmark-landscape.png';
const BH_STACKED_URL   = 'https://bpjproljatbrbmszwbov.supabase.co/storage/v1/object/public/beithady-gallery-public/brand/bh-logo-stacked.jpg';

async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString('base64');
  } catch {
    return null;
  }
}

// Performance Max campaign creator. PMax is Google's hybrid campaign type
// that runs Search + Display + YouTube + Discover + Gmail + Maps all
// at once, with Google's AI optimizing the placement mix. For STR /
// hospitality businesses without a structured property feed, PMax is
// the closest practical alternative to Hotel Ads (which requires a
// hotel listings feed + price+availability integration we don't have
// yet).
//
// Flow:
//   1. campaignBudgets:mutate -> budget
//   2. campaigns:mutate -> Campaign (PERFORMANCE_MAX, MAXIMIZE_CONVERSIONS)
//   3. campaignCriteria:mutate -> geo + language
//   4. assetGroups:mutate -> Asset Group (PMax's equivalent of an ad group)
//   5. assetGroupAssets:mutate -> attach headlines, descriptions,
//      long_headlines, business_name, images, logos
//
// All steps create entities in PAUSED state for operator review.

export type GooglePMaxInput = {
  accountId: number;
  campaignName?: string;
  dailyBudgetUsd: number;
  monthlyBudgetCapUsd?: number | null;
  headlines: string[];          // 3-15, each <=30 chars
  longHeadlines: string[];      // 1-5, each <=90 chars
  descriptions: string[];       // 2-5, each <=90 chars
  businessName: string;         // <=25 chars — "Beit Hady" or similar
  finalUrl?: string;            // default Beithady wa.me
  marketingImageUrls?: string[];   // 1.91:1 landscape, 1+
  squareImageUrls?: string[];      // 1:1, 1+
  logoUrls?: string[];             // square logo
  locationIds?: string[];
  languageIds?: string[];
  buildingCodes?: string[];
};

export type GooglePMaxResult =
  | {
      ok: true;
      mode: 'live' | 'draft';
      campaign_id: number;
      campaign_external_id: string;
      asset_group_external_id: string | null;
      review_url: string | null;
    }
  | { ok: false; mode: 'live' | 'draft'; step: string; error: string; raw?: unknown };

export async function publishGooglePerformanceMax(
  input: GooglePMaxInput
): Promise<GooglePMaxResult> {
  const sb = supabaseAdmin();

  if (!input.accountId) return { ok: false, mode: 'live', step: 'validate', error: 'account_id required' };
  if (!Number.isFinite(input.dailyBudgetUsd) || input.dailyBudgetUsd < 1) {
    return { ok: false, mode: 'live', step: 'validate', error: 'daily_budget_usd >= 1 required' };
  }
  const headlines = (input.headlines || []).map(h => (h || '').trim()).filter(Boolean).map(h => h.slice(0, 30));
  const longHeadlines = (input.longHeadlines || []).map(h => (h || '').trim()).filter(Boolean).map(h => h.slice(0, 90));
  const descriptions = (input.descriptions || []).map(d => (d || '').trim()).filter(Boolean).map(d => d.slice(0, 90));
  if (headlines.length < 3) return { ok: false, mode: 'live', step: 'validate', error: 'min 3 headlines (≤30 chars each)' };
  if (longHeadlines.length < 1) return { ok: false, mode: 'live', step: 'validate', error: 'min 1 long headline (≤90 chars)' };
  if (descriptions.length < 2) return { ok: false, mode: 'live', step: 'validate', error: 'min 2 descriptions (≤90 chars each)' };
  const businessName = (input.businessName || 'Beit Hady').slice(0, 25);

  const finalUrl = (input.finalUrl || buildBhWaLink()).trim();
  if (!finalUrl.startsWith('https://')) return { ok: false, mode: 'live', step: 'validate', error: 'final_url must be https' };

  const { data: acc } = await sb.from('ads_accounts').select('id, platform, external_id, name').eq('id', input.accountId).maybeSingle();
  if (!acc) return { ok: false, mode: 'live', step: 'load_account', error: 'account_not_found' };
  const account = acc as { id: number; platform: string; external_id: string; name: string };
  if (account.platform !== 'google') return { ok: false, mode: 'live', step: 'load_account', error: 'account_not_google' };
  const customerId = String(account.external_id || '').replace(/[^\d]/g, '');

  const credsRes = await loadGoogleAdsCredentials();
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const campaignName = (input.campaignName || `[Beit Hady] PMax ${stamp}`).trim();
  const assetGroupName = `[Beit Hady] AssetGroup ${stamp}`;
  const dailyBudgetMicros = Math.round(input.dailyBudgetUsd * 1_000_000);
  const locationIds = (input.locationIds && input.locationIds.length ? input.locationIds : DEFAULT_GEO_IDS.google) as readonly string[];
  const languageIds = (input.languageIds && input.languageIds.length ? input.languageIds : DEFAULT_GOOGLE_LANGUAGE_IDS) as readonly string[];

  // Draft mode if creds missing
  if (!credsRes.ok) {
    const seed = `draft_gpmax_${Date.now()}`;
    const { data: campIns } = await sb
      .from('ads_campaigns')
      .insert({
        account_id: input.accountId,
        platform: 'google',
        external_id: `${seed}_camp`,
        name: campaignName,
        status: 'DRAFT',
        objective: 'PERFORMANCE_MAX',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes || [],
        monthly_budget_cap_usd: input.monthlyBudgetCapUsd ?? null,
        raw: { intent: 'pmax_draft', reason: credsRes.error, missing: credsRes.missing } as object,
      })
      .select('id').single();
    if (!campIns) return { ok: false, mode: 'draft', step: 'draft_insert', error: 'insert_failed' };
    await recordAudit({
      module: 'ads',
      action: 'campaign_drafted',
      target_type: 'campaign',
      target_id: String((campIns as { id: number }).id),
      metadata: { platform: 'google', kind: 'pmax', reason: credsRes.error },
    });
    return {
      ok: true,
      mode: 'draft',
      campaign_id: (campIns as { id: number }).id,
      campaign_external_id: `${seed}_camp`,
      asset_group_external_id: null,
      review_url: null,
    };
  }

  const creds = credsRes.creds;
  const tokRes = await getGoogleAccessToken(creds);
  if (!tokRes.ok) return { ok: false, mode: 'live', step: 'oauth', error: tokRes.error };
  const accessToken = tokRes.access_token;

  // 1. Budget
  const budgetRes = await gadsMutate(customerId, 'campaignBudgets', [{
    create: { name: `${campaignName} budget`, amountMicros: String(dailyBudgetMicros), deliveryMethod: 'STANDARD', explicitlyShared: false },
  }], creds, accessToken);
  if (!budgetRes.ok) return { ok: false, mode: 'live', step: 'create_budget', error: 'mutate_failed', raw: budgetRes.body };
  const budgetResource = budgetRes.body.results?.[0]?.resourceName;
  if (!budgetResource) return { ok: false, mode: 'live', step: 'create_budget', error: 'no_budget_resource', raw: budgetRes.body };

  // 2. Campaign — Performance Max + Maximize Conversions
  const campRes = await gadsMutate(customerId, 'campaigns', [{
    create: {
      name: campaignName,
      advertisingChannelType: 'PERFORMANCE_MAX',
      status: 'PAUSED',
      campaignBudget: budgetResource,
      maximizeConversions: {},
      finalUrlExpansionOptOut: false,
    },
  }], creds, accessToken);
  if (!campRes.ok) return { ok: false, mode: 'live', step: 'create_campaign', error: 'mutate_failed', raw: campRes.body };
  const campaignResource = campRes.body.results?.[0]?.resourceName;
  if (!campaignResource) return { ok: false, mode: 'live', step: 'create_campaign', error: 'no_campaign_resource', raw: campRes.body };
  const campaignExternalId = String(campaignResource).split('/').pop() || '';

  // 3. Geo + language criteria
  const criteriaOps: Array<Record<string, unknown>> = [];
  for (const locId of locationIds) criteriaOps.push({ create: { campaign: campaignResource, location: { geoTargetConstant: `geoTargetConstants/${locId}` } } });
  for (const langId of languageIds) criteriaOps.push({ create: { campaign: campaignResource, language: { languageConstant: `languageConstants/${langId}` } } });
  if (criteriaOps.length) {
    const cRes = await gadsMutate(customerId, 'campaignCriteria', criteriaOps, creds, accessToken);
    if (!cRes.ok) return { ok: false, mode: 'live', step: 'campaign_criteria', error: 'mutate_failed', raw: cRes.body };
  }

  // 4. Asset group
  const agRes = await gadsMutate(customerId, 'assetGroups', [{
    create: {
      name: assetGroupName,
      campaign: campaignResource,
      finalUrls: [finalUrl],
      status: 'PAUSED',
    },
  }], creds, accessToken);
  if (!agRes.ok) return { ok: false, mode: 'live', step: 'create_asset_group', error: 'mutate_failed', raw: agRes.body };
  const agResource = agRes.body.results?.[0]?.resourceName;
  const agExternalId = agResource ? (String(agResource).split('/').pop() || null) : null;

  // 5. Text + image assets attached to the group.
  //    Create text assets first, then link via assetGroupAssets.
  const assetCreates: Array<{ create: { textAsset?: { text: string }; name?: string } }> = [];
  for (const h of headlines) assetCreates.push({ create: { textAsset: { text: h } } });
  for (const h of longHeadlines) assetCreates.push({ create: { textAsset: { text: h } } });
  for (const d of descriptions) assetCreates.push({ create: { textAsset: { text: d } } });
  assetCreates.push({ create: { textAsset: { text: businessName } } });
  const assetsRes = await gadsMutate(customerId, 'assets', assetCreates, creds, accessToken);

  if (assetsRes.ok && agResource) {
    const fieldTypeFor = (idx: number): string => {
      if (idx < headlines.length) return 'HEADLINE';
      if (idx < headlines.length + longHeadlines.length) return 'LONG_HEADLINE';
      if (idx < headlines.length + longHeadlines.length + descriptions.length) return 'DESCRIPTION';
      return 'BUSINESS_NAME';
    };
    const linkOps: Array<Record<string, unknown>> = [];
    (assetsRes.body.results || []).forEach((r, i) => {
      if (!r.resourceName) return;
      linkOps.push({
        create: {
          assetGroup: agResource,
          asset: r.resourceName,
          fieldType: fieldTypeFor(i),
        },
      });
    });
    if (linkOps.length) {
      const linkRes = await gadsMutate(customerId, 'assetGroupAssets', linkOps, creds, accessToken);
      if (!linkRes.ok) console.warn('[google-pmax] asset-group link failed:', linkRes.body);
    }
  }

  // Upload images: Meta creative(s) + brand defaults.
  // The Meta creative is tried as both MARKETING_IMAGE and SQUARE_MARKETING_IMAGE — Google
  // accepts whichever matches the actual dimensions. Brand defaults guarantee all three
  // required slots (landscape, square, logo) are always populated on first publish.
  // All failures are soft-warned and never abort campaign creation.
  if (agResource) {
    type ImgJob = { url: string; fieldTypes: string[] };
    const imgJobs: ImgJob[] = [
      ...(input.marketingImageUrls || []).filter(Boolean).slice(0, 3).map(url => ({
        url,
        fieldTypes: ['MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE'],
      })),
      { url: BH_WORDMARK_URL, fieldTypes: ['MARKETING_IMAGE']        },
      { url: BH_STACKED_URL,  fieldTypes: ['SQUARE_MARKETING_IMAGE'] },
      { url: BH_LOGO_URL,     fieldTypes: ['LOGO']                   },
    ];
    for (const { url, fieldTypes } of imgJobs) {
      const b64 = await fetchImageBase64(url);
      if (!b64) { console.warn('[google-pmax] could not fetch image:', url); continue; }
      const imgAssetRes = await gadsMutate(customerId, 'assets', [{
        create: { name: `img_${Date.now()}`, imageAsset: { data: b64 } },
      }], creds, accessToken);
      if (!imgAssetRes.ok) { console.warn('[google-pmax] image asset create failed:', imgAssetRes.body); continue; }
      const imgResource = imgAssetRes.body.results?.[0]?.resourceName;
      if (!imgResource) continue;
      for (const fieldType of fieldTypes) {
        const linkRes = await gadsMutate(customerId, 'assetGroupAssets', [{
          create: { assetGroup: agResource, asset: imgResource, fieldType },
        }], creds, accessToken);
        if (!linkRes.ok) console.warn(`[google-pmax] ${fieldType} link failed:`, linkRes.body);
      }
    }
  }

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
        objective: 'PERFORMANCE_MAX',
        buying_type: 'AUCTION',
        daily_budget_micros: dailyBudgetMicros,
        building_codes: input.buildingCodes || [],
        monthly_budget_cap_usd: input.monthlyBudgetCapUsd ?? null,
        raw: { customer_id: customerId, budget_resource: budgetResource, kind: 'pmax' } as object,
      },
      { onConflict: 'platform,external_id' }
    )
    .select('id')
    .single();
  const dbCampId = (campIns as { id: number } | null)?.id || 0;

  await recordAudit({
    module: 'ads',
    action: 'campaign_published',
    target_type: 'campaign',
    target_id: String(dbCampId),
    metadata: {
      platform: 'google',
      kind: 'pmax',
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
    asset_group_external_id: agExternalId,
    review_url: `https://ads.google.com/aw/campaigns?campaignId=${campaignExternalId}&__c=${customerId}`,
  };
}
