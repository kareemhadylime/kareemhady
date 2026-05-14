import 'server-only';
import { loadMetaCredentials, metaPost, metaGet } from './meta-client';

// Per-recommendation appliers — take a recommendation type + the system user
// token and execute the underlying Meta Marketing API call that the user
// would otherwise click in Ads Manager.
//
// Some recommendations CAN'T be auto-applied (e.g. PARTNERSHIP_ADS needs a
// creator handshake, PIXEL_INSTALLATION needs website code). For those we
// return { ok: false, manualOnly: true, reason } so the UI shows a clear
// "this one requires manual setup" message instead of pretending to apply.

export type ApplyResult =
  | { ok: true; applied: number; details?: string }
  | { ok: false; manualOnly?: boolean; reason: string };

const STANDARD_CREATIVE_ENHANCEMENTS = {
  // Meta's "Advantage+ creative enhancements" — opts each ad creative in
  // to ML-driven visual + text tweaks. These are the same toggles that
  // appear in the Manage Automatic Adjustments dialog.
  standard_enhancements: { enroll_status: 'OPT_IN' as const },
  image_enhancement:     { enroll_status: 'OPT_IN' as const },
  text_optimizations:    { enroll_status: 'OPT_IN' as const },
  image_uncrop:          { enroll_status: 'OPT_IN' as const },
  // Music + catalog enhancements left OPT_OUT — these can hurt brand
  // control for hospitality content where we curate music/visuals.
  add_music:                  { enroll_status: 'OPT_OUT' as const },
  catalog_item_enhancements:  { enroll_status: 'OPT_OUT' as const },
};

async function applyAdvantagePlusCreative(): Promise<ApplyResult> {
  const creds = await loadMetaCredentials();
  if (!creds.ok) return { ok: false, reason: 'meta_credentials_missing' };

  // Fetch all live ad creatives owned by the account
  type Creative = { id: string; effective_authorization_category?: string };
  const listRes = await metaGet<{ data: Creative[] }>(
    `${creds.creds.adAccountId}/adcreatives?fields=id&limit=200`,
    creds.creds.token
  );
  if (!listRes.ok) return { ok: false, reason: `list_creatives_failed: ${listRes.error}` };

  const creatives = (listRes.data?.data || []) as Creative[];
  if (!creatives.length) return { ok: false, reason: 'no_creatives_found' };

  let applied = 0;
  const errors: string[] = [];

  for (const c of creatives) {
    const r = await metaPost(
      c.id,
      {
        degrees_of_freedom_spec: {
          creative_features_spec: STANDARD_CREATIVE_ENHANCEMENTS,
        },
      },
      creds.creds.token
    );
    if (r.ok) applied += 1;
    else errors.push(`${c.id}: ${r.error}`);
  }

  if (applied === 0) return { ok: false, reason: errors.length ? errors[0] : 'no_creatives_updated' };
  return {
    ok: true,
    applied,
    details:
      errors.length === 0
        ? `Applied to ${applied} creative${applied === 1 ? '' : 's'}`
        : `Applied to ${applied}/${creatives.length}; ${errors.length} failed`,
  };
}

async function applyAdvantagePlusAudience(): Promise<ApplyResult> {
  const creds = await loadMetaCredentials();
  if (!creds.ok) return { ok: false, reason: 'meta_credentials_missing' };

  // Enable audience expansion on all live ad sets
  type AdSet = { id: string };
  const listRes = await metaGet<{ data: AdSet[] }>(
    `${creds.creds.adAccountId}/adsets?fields=id&limit=200&effective_status=${encodeURIComponent('["ACTIVE","PAUSED"]')}`,
    creds.creds.token
  );
  if (!listRes.ok) return { ok: false, reason: `list_adsets_failed: ${listRes.error}` };

  const adsets = (listRes.data?.data || []) as AdSet[];
  if (!adsets.length) return { ok: false, reason: 'no_adsets_found' };

  let applied = 0;
  for (const a of adsets) {
    const r = await metaPost(
      a.id,
      { targeting_automation: { advantage_audience: 1 } },
      creds.creds.token
    );
    if (r.ok) applied += 1;
  }

  if (applied === 0) return { ok: false, reason: 'no_adsets_updated' };
  return {
    ok: true,
    applied,
    details: `Enabled on ${applied} ad set${applied === 1 ? '' : 's'}`,
  };
}

async function applyAdvantagePlusPlacements(): Promise<ApplyResult> {
  const creds = await loadMetaCredentials();
  if (!creds.ok) return { ok: false, reason: 'meta_credentials_missing' };

  // Remove explicit placement restrictions on all ad sets so Meta uses all
  type AdSet = { id: string };
  const listRes = await metaGet<{ data: AdSet[] }>(
    `${creds.creds.adAccountId}/adsets?fields=id&limit=200&effective_status=${encodeURIComponent('["ACTIVE","PAUSED"]')}`,
    creds.creds.token
  );
  if (!listRes.ok) return { ok: false, reason: `list_adsets_failed: ${listRes.error}` };

  const adsets = (listRes.data?.data || []) as AdSet[];
  if (!adsets.length) return { ok: false, reason: 'no_adsets_found' };

  let applied = 0;
  for (const a of adsets) {
    // null/empty publisher_platforms = all placements (Advantage+ placements)
    const r = await metaPost(
      a.id,
      {
        targeting: {
          publisher_platforms: ['facebook', 'instagram', 'audience_network', 'messenger'],
          // Let Meta pick positions for each surface
        },
      },
      creds.creds.token
    );
    if (r.ok) applied += 1;
  }

  if (applied === 0) return { ok: false, reason: 'no_adsets_updated' };
  return {
    ok: true,
    applied,
    details: `Expanded placements on ${applied} ad set${applied === 1 ? '' : 's'}`,
  };
}

// Type → handler map. Add new entries here as we support more rec types.
const HANDLERS: Record<string, () => Promise<ApplyResult>> = {
  ADVANTAGE_PLUS_CREATIVE: applyAdvantagePlusCreative,
  CREATIVE_FEATURES: applyAdvantagePlusCreative,
  OPTIMIZE_AD_CREATIVE: applyAdvantagePlusCreative,
  ADVANTAGE_PLUS_CREATIVE_ENHANCEMENT: applyAdvantagePlusCreative,

  ADVANTAGE_PLUS_AUDIENCE: applyAdvantagePlusAudience,
  AUDIENCE_OPTIMIZATION: applyAdvantagePlusAudience,

  ADVANTAGE_PLUS_PLACEMENTS: applyAdvantagePlusPlacements,
  EXPAND_PLACEMENTS: applyAdvantagePlusPlacements,
};

// Types Meta surfaces that genuinely need external action (no API path)
const MANUAL_ONLY_TYPES = new Set<string>([
  'PARTNERSHIP_ADS',         // needs creator handshake
  'PIXEL_INSTALLATION',      // needs website code change
  'CONVERSIONS_API',         // needs server-side instrumentation
  'CATALOG_CREATION',        // needs product catalog upload
  'DOMAIN_VERIFICATION',     // needs DNS / meta tag
]);

export async function applyMetaRecommendation(type: string): Promise<ApplyResult> {
  const handler = HANDLERS[type];
  if (handler) return handler();
  if (MANUAL_ONLY_TYPES.has(type)) {
    return {
      ok: false,
      manualOnly: true,
      reason: humanizeManualReason(type),
    };
  }
  return {
    ok: false,
    manualOnly: true,
    reason: `${type} doesn't have an in-app applier yet — open Meta Ads Manager to apply.`,
  };
}

function humanizeManualReason(type: string): string {
  switch (type) {
    case 'PARTNERSHIP_ADS':
      return 'Partnership ads require a creator/brand handshake in Meta — cannot be enabled from API.';
    case 'PIXEL_INSTALLATION':
      return 'Meta Pixel installation requires website code changes — done by your developer.';
    case 'CONVERSIONS_API':
      return 'Conversions API needs server-side event instrumentation — requires backend work.';
    case 'CATALOG_CREATION':
      return 'Creating a product catalog needs a CSV/feed upload in Meta Commerce Manager.';
    case 'DOMAIN_VERIFICATION':
      return 'Domain verification requires DNS records or a meta tag on your website.';
    default:
      return `${type} requires manual setup outside the API.`;
  }
}
