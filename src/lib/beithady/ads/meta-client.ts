import 'server-only';
import { getCredential, getProviderEnabled } from '@/lib/credentials';

// Thin Meta Graph API v21 wrapper for the Phase H ads module. Reads
// credentials from `meta_marketing` provider. Returns structured
// {ok, data, error} so callers can decide whether to fall back to
// "draft" mode when credentials aren't configured yet.

const API_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

export type MetaCredentials = {
  token: string;
  businessId: string;
  adAccountId: string;     // act_<numeric>
  fbPageId: string;
};

export async function loadMetaCredentials(): Promise<
  | { ok: true; creds: MetaCredentials }
  | { ok: false; error: string; missing: string[] }
> {
  const enabled = await getProviderEnabled('meta_marketing');
  if (!enabled) return { ok: false, error: 'meta_marketing_disabled', missing: [] };
  const [token, businessId, adAccountIdRaw, fbPageId] = await Promise.all([
    getCredential('meta_marketing', 'system_user_token'),
    getCredential('meta_marketing', 'business_id'),
    getCredential('meta_marketing', 'ad_account_id'),
    getCredential('meta_marketing', 'fb_page_id'),
  ]);
  const missing = [
    !token && 'system_user_token',
    !businessId && 'business_id',
    !adAccountIdRaw && 'ad_account_id',
    !fbPageId && 'fb_page_id',
  ].filter((x): x is string => !!x);
  if (missing.length) return { ok: false, error: 'missing_credentials', missing };
  const adAccountId = adAccountIdRaw.startsWith('act_') ? adAccountIdRaw : `act_${adAccountIdRaw}`;
  return { ok: true, creds: { token, businessId, adAccountId, fbPageId } };
}

export type GraphResult<T = unknown> =
  | { ok: true; data: T; raw: unknown }
  | { ok: false; status: number; error: string; raw: unknown };

export async function metaPost<T = unknown>(
  path: string,
  params: Record<string, unknown>,
  token: string
): Promise<GraphResult<T>> {
  const url = `${GRAPH}/${path}`;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  body.append('access_token', token);
  try {
    const r = await fetch(url, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const errMsg = (j.error as { message?: string } | undefined)?.message || `http_${r.status}`;
      return { ok: false, status: r.status, error: errMsg, raw: j };
    }
    return { ok: true, data: j as T, raw: j };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, error: msg, raw: null };
  }
}

export async function metaGet<T = unknown>(path: string, token: string): Promise<GraphResult<T>> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const errMsg = (j.error as { message?: string } | undefined)?.message || `http_${r.status}`;
      return { ok: false, status: r.status, error: errMsg, raw: j };
    }
    return { ok: true, data: j as T, raw: j };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, error: msg, raw: null };
  }
}

// === Instagram Graph API helpers (added Phase H+) ===
// Reels publishing flow uses the same Meta system-user token. The fb_page_id
// on ads_accounts resolves to an instagram_business_account.id via the Graph
// API once, then we POST media containers + media_publish against that.

export type IgAccountInfo = {
  fb_page_id: string;
  fb_page_name: string | null;
  ig_business_id: string;
  ig_username: string | null;
  ig_name: string | null;
  profile_picture_url: string | null;
};

// List IG Business accounts visible to the system-user token, joined to
// their parent FB Page.
export async function listIgAccounts(): Promise<
  | { ok: true; ig_accounts: IgAccountInfo[] }
  | { ok: false; error: string }
> {
  const credsRes = await loadMetaCredentials();
  if (!credsRes.ok) return { ok: false, error: credsRes.error };
  const r = await metaGet<{ data: Array<{ id: string; name?: string; instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } }> }>(
    'me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&limit=100',
    credsRes.creds.token
  );
  if (!r.ok) return { ok: false, error: r.error };
  const pages = ((r.data as { data?: Array<{ id: string; name?: string; instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } }> }).data || []);
  const ig_accounts: IgAccountInfo[] = pages
    .filter(p => !!p.instagram_business_account)
    .map(p => ({
      fb_page_id: p.id,
      fb_page_name: p.name || null,
      ig_business_id: p.instagram_business_account!.id,
      ig_username: p.instagram_business_account!.username || null,
      ig_name: p.instagram_business_account!.name || null,
      profile_picture_url: p.instagram_business_account!.profile_picture_url || null,
    }));
  return { ok: true, ig_accounts };
}

// Resolve ig_business_id for an ads_accounts row whose fb_page_id is set.
// Updates the row + returns the resolved ID + username.
export async function resolveIgForAccount(
  accountId: number
): Promise<
  | { ok: true; ig_business_id: string; ig_username: string | null }
  | { ok: false; error: string }
> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  const sb = supabaseAdmin();
  const { data: acc } = await sb
    .from('ads_accounts')
    .select('id, platform, fb_page_id, ig_business_id')
    .eq('id', accountId)
    .maybeSingle();
  if (!acc) return { ok: false, error: 'account_not_found' };
  const a = acc as { id: number; platform: string; fb_page_id: string | null };
  if (a.platform !== 'meta') return { ok: false, error: 'not_meta' };
  if (!a.fb_page_id) return { ok: false, error: 'fb_page_id_missing' };

  const credsRes = await loadMetaCredentials();
  if (!credsRes.ok) return { ok: false, error: credsRes.error };

  const r = await metaGet<{ instagram_business_account?: { id: string; username?: string; name?: string } }>(
    `${a.fb_page_id}?fields=instagram_business_account{id,username,name}`,
    credsRes.creds.token
  );
  if (!r.ok) return { ok: false, error: r.error };
  const ig = (r.data as { instagram_business_account?: { id: string; username?: string } }).instagram_business_account;
  if (!ig?.id) return { ok: false, error: 'page_has_no_ig_business_account' };
  await sb.from('ads_accounts').update({
    ig_business_id: ig.id,
    ig_username: ig.username || null,
  }).eq('id', accountId);
  return { ok: true, ig_business_id: ig.id, ig_username: ig.username || null };
}

// === Existing IG media listing (for boost-post flow) ===
// Returns the most recent N posts + reels + carousels from the connected
// IG Business account. Stories are excluded — they expire after 24h and
// have a separate /stories endpoint with different ad mechanics.

export type IgMediaItem = {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
  media_product_type: 'AD' | 'FEED' | 'STORY' | 'REELS' | string | null;
  permalink: string | null;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  timestamp: string;
  like_count: number | null;
  comments_count: number | null;
};

export async function listIgMedia(
  igBusinessId: string,
  limit = 25
): Promise<
  | { ok: true; media: IgMediaItem[] }
  | { ok: false; error: string }
> {
  const creds = await loadMetaCredentials();
  if (!creds.ok) return { ok: false, error: creds.error };

  // Use the Facebook Page API (requires pages_read_engagement, NOT instagram_basic).
  // This works correctly with System User tokens from the Marketing API.
  // Pattern: GET /{page_id}?fields=instagram_business_account{media{...}}
  const mediaFields = 'id,media_type,media_product_type,permalink,caption,media_url,thumbnail_url,timestamp,like_count,comments_count';
  const fields = `instagram_business_account{media.limit(${Math.min(50, Math.max(1, limit))}){${mediaFields}}}`;

  type PageResp = { instagram_business_account?: { media?: { data: IgMediaItem[] } } };
  const r = await metaGet<PageResp>(
    `${creds.creds.fbPageId}?fields=${encodeURIComponent(fields)}`,
    creds.creds.token
  );
  if (!r.ok) return { ok: false, error: r.error };

  const items = ((r.data as PageResp)?.instagram_business_account?.media?.data || [])
    // Exclude Stories — 24h expiry doesn't fit ad lifecycles
    .filter(m => m.media_product_type !== 'STORY');
  return { ok: true, media: items };
}

// === IG Stories (current 24h window only) ===
// Stories live for 24h on IG. The Graph API only returns currently active ones.
// Used by the TikTok cross-post flow: pick a still-live story, mirror its video
// to Supabase, publish to TikTok before the original IG story expires.
//
// Fields are a subset of IgMediaItem since stories never have like/comment counts.

export type IgStoryItem = {
  id: string;
  media_type: 'IMAGE' | 'VIDEO';
  permalink: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  timestamp: string;
};

export async function listIgStories(
  limit = 25
): Promise<
  | { ok: true; stories: IgStoryItem[] }
  | { ok: false; error: string }
> {
  const creds = await loadMetaCredentials();
  if (!creds.ok) return { ok: false, error: creds.error };

  // Nested query: page → ig_business_account → stories
  const storyFields = 'id,media_type,permalink,media_url,thumbnail_url,timestamp';
  const fields = `instagram_business_account{stories.limit(${Math.min(50, Math.max(1, limit))}){${storyFields}}}`;

  type PageResp = { instagram_business_account?: { stories?: { data: IgStoryItem[] } } };
  const r = await metaGet<PageResp>(
    `${creds.creds.fbPageId}?fields=${encodeURIComponent(fields)}`,
    creds.creds.token
  );
  if (!r.ok) return { ok: false, error: r.error };

  const items = (r.data as PageResp)?.instagram_business_account?.stories?.data || [];
  return { ok: true, stories: items };
}

// Probe — used by /admin/integrations to verify the token works.
export async function pingMetaMarketing(): Promise<
  | { ok: true; ad_account_name: string; pages_count: number }
  | { ok: false; error: string }
> {
  const c = await loadMetaCredentials();
  if (!c.ok) return { ok: false, error: c.error };
  const ad = await metaGet<{ name: string }>(`${c.creds.adAccountId}?fields=name,currency,timezone_name`, c.creds.token);
  if (!ad.ok) return { ok: false, error: `ad_account: ${ad.error}` };
  const pages = await metaGet<{ data: Array<{ id: string }> }>('me/accounts?fields=id,name&limit=100', c.creds.token);
  return {
    ok: true,
    ad_account_name: (ad.data as { name?: string }).name || c.creds.adAccountId,
    pages_count: pages.ok ? ((pages.data as { data?: unknown[] })?.data || []).length : 0,
  };
}

// ── Targeting helpers ─────────────────────────────────────────────────────────

export type MetaTargetingItem = { id: string; name: string };

// Resolves a single interest name → best-match {id, name} via Meta Targeting
// Search API. Returns null if the API call fails or no match found.
// Results are NOT cached here — callers batch names and deduplicate upstream.
export async function searchMetaInterest(
  name: string,
  token: string
): Promise<MetaTargetingItem | null> {
  const url =
    `${GRAPH}/search?type=adinterest&q=${encodeURIComponent(name)}&locale=EN&limit=5&access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: Array<{ id: string; name: string }> };
    // Exact match only — no fallback to j.data[0]. First-result fallback
    // can return deprecated interest IDs (Meta sub:1870247) for near-matches.
    const match = (j.data || []).find(
      d => d.name.toLowerCase() === name.toLowerCase()
    );
    return match ? { id: match.id, name: match.name } : null;
  } catch {
    return null;
  }
}

// Resolves a single behavior name → best-match {id, name}.
export async function searchMetaBehavior(
  name: string,
  token: string
): Promise<MetaTargetingItem | null> {
  const url =
    `${GRAPH}/search?type=TargetingCategory&class=behaviors&q=${encodeURIComponent(name)}&limit=5&access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: Array<{ id: string; name: string }> };
    const match = (j.data || []).find(
      d => d.name.toLowerCase().includes(name.toLowerCase())
    ) || j.data?.[0];
    return match ? { id: match.id, name: match.name } : null;
  } catch {
    return null;
  }
}

export type TargetGroupRow = {
  id: number;
  slug: string;
  age_min: number;
  age_max: number;
  countries?: string[];
  meta_locales?: number[];
  meta_interest_names?: string[];
  meta_behavior_names?: string[];
  spending_power?: string;
};

// Spending-power behavior names Meta understands (resolved via Targeting Search)
const SPENDING_POWER_BEHAVIORS: Record<string, string[]> = {
  top_25: ['High income earners', 'High-value individuals', 'Engaged shoppers'],
  top_50: ['Engaged shoppers', 'Online shoppers'],
  all:    [],
};

// Builds the full Meta ad-set targeting object for a given target group row.
// Resolves interest + behavior names to Meta IDs in parallel (best-effort;
// unresolved names are silently dropped so the campaign still publishes).
export async function buildMetaTargetingSpec(
  group: TargetGroupRow,
  token: string
): Promise<Record<string, unknown>> {
  const interestNames = group.meta_interest_names || [];
  const behaviorNamesFromGroup = group.meta_behavior_names || [];
  const spendingBehaviorNames = SPENDING_POWER_BEHAVIORS[group.spending_power || 'all'] || [];
  const allBehaviorNames = [...new Set([...behaviorNamesFromGroup, ...spendingBehaviorNames])];

  // Resolve in parallel — cap at 20 interest + 6 behavior lookups
  const [interestResults, behaviorResults] = await Promise.all([
    Promise.all(interestNames.slice(0, 20).map(n => searchMetaInterest(n, token))),
    Promise.all(allBehaviorNames.slice(0, 6).map(n => searchMetaBehavior(n, token))),
  ]);

  const interests = interestResults.filter((x): x is MetaTargetingItem => !!x);
  const behaviors = behaviorResults.filter((x): x is MetaTargetingItem => !!x);

  const spec: Record<string, unknown> = {
    age_min: group.age_min,
    age_max: group.age_max,
  };

  if ((group.meta_locales || []).length > 0) {
    spec.locales = group.meta_locales;
  }
  if (interests.length > 0) {
    // flexible_spec: OR between interest clusters (any-of semantics)
    spec.flexible_spec = [{ interests }];
  }
  if (behaviors.length > 0) {
    spec.behaviors = behaviors;
  }

  return spec;
}

// === Live entity status / delivery checker ===
// Fetches effective_status + issues_info for campaign / ad set / ad rows so the
// dashboard can show what Meta actually thinks (e.g. IN_REVIEW, DISAPPROVED,
// PENDING_BILLING_INFO). Our DB only tracks the manual status we set; this is
// the source of truth for delivery.

export type MetaIssue = {
  level: 'AD' | 'ADSET' | 'CAMPAIGN' | 'AD_ACCOUNT' | string;
  error_code: number;
  error_summary: string;
  error_message: string;
  error_type: string;
};

export type MetaLiveStatus = {
  external_id: string;
  effective_status: string;  // ACTIVE | IN_REVIEW | DISAPPROVED | PENDING_BILLING_INFO | ...
  configured_status?: string;
  issues_info: MetaIssue[];
  not_found?: boolean;
  error?: string;
};

export async function fetchMetaEntityStatus(
  externalId: string,
  token: string
): Promise<MetaLiveStatus> {
  if (!externalId || externalId.startsWith('draft_')) {
    return { external_id: externalId, effective_status: 'DRAFT', issues_info: [] };
  }
  const url = `${GRAPH}/${externalId}?fields=effective_status,configured_status,issues_info&access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const code = (j.error as { code?: number } | undefined)?.code;
      const msg = (j.error as { message?: string } | undefined)?.message || `http_${r.status}`;
      // 100 = "Unsupported get request" — entity might have been deleted in Meta
      const notFound = code === 100 || /does not exist|cannot be loaded/i.test(msg);
      return { external_id: externalId, effective_status: 'UNKNOWN', issues_info: [], not_found: notFound, error: msg };
    }
    return {
      external_id: externalId,
      effective_status: (j.effective_status as string) || 'UNKNOWN',
      configured_status: j.configured_status as string | undefined,
      issues_info: (j.issues_info as MetaIssue[] | undefined) || [],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { external_id: externalId, effective_status: 'UNKNOWN', issues_info: [], error: msg };
  }
}

export async function fetchMetaEntityStatusBatch(
  externalIds: string[],
  token: string
): Promise<Map<string, MetaLiveStatus>> {
  const out = new Map<string, MetaLiveStatus>();
  // Parallel fetch — for ~10 entities this is ~500ms, faster than Meta's batch endpoint setup
  const results = await Promise.all(externalIds.map(id => fetchMetaEntityStatus(id, token)));
  for (const r of results) out.set(r.external_id, r);
  return out;
}

// === Campaign real-time insights ===
// Calls /{campaign_id}/insights?date_preset=lifetime — returns whatever Meta
// has billed/counted so far (spend, impressions, clicks, reach, CPM, CPC,
// CTR). Meta returns numbers as strings; we parse them here. Empty data[]
// means the campaign has no spend yet (new / never delivered).

export type MetaInsightsSnapshot = {
  spend: number;          // USD float
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number | null;     // cost per mille (USD)
  cpc: number | null;     // cost per click (USD)
  ctr: number | null;     // click-through rate %
  fetched_at: string;     // ISO timestamp of when we fetched
};

export async function fetchMetaCampaignInsights(
  campaignId: string,
  token: string
): Promise<
  | { ok: true; data: MetaInsightsSnapshot }
  | { ok: false; error: string }
> {
  if (!campaignId || campaignId.startsWith('draft_')) {
    return { ok: false, error: 'draft_campaign' };
  }
  const fields = 'spend,impressions,clicks,reach,cpm,cpc,ctr';
  const url =
    `${GRAPH}/${campaignId}/insights` +
    `?fields=${encodeURIComponent(fields)}` +
    `&date_preset=lifetime` +
    `&access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const msg = (j.error as { message?: string } | undefined)?.message || `http_${r.status}`;
      return { ok: false, error: msg };
    }
    const rows = (j.data as Array<Record<string, unknown>>) || [];
    const d = rows[0];
    if (!d) {
      // No rows = campaign has never delivered — return zeroed snapshot
      return {
        ok: true,
        data: { spend: 0, impressions: 0, clicks: 0, reach: 0, cpm: null, cpc: null, ctr: null, fetched_at: new Date().toISOString() },
      };
    }
    const pf = (key: string): number | null => {
      const v = d[key];
      if (v == null || v === '') return null;
      const n = parseFloat(String(v));
      return isNaN(n) ? null : n;
    };
    return {
      ok: true,
      data: {
        spend:       pf('spend') ?? 0,
        impressions: parseInt(String(d.impressions ?? '0'), 10) || 0,
        clicks:      parseInt(String(d.clicks ?? '0'), 10) || 0,
        reach:       parseInt(String(d.reach ?? '0'), 10) || 0,
        cpm:         pf('cpm'),
        cpc:         pf('cpc'),
        ctr:         pf('ctr'),
        fetched_at:  new Date().toISOString(),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// === Ad-account recommendations (Opportunity Score) ===
// Meta's Advantage+ panel surfaces ML-driven optimization suggestions. The
// /act_<id>?fields=recommendations,opportunity_score endpoint returns the
// same content seen in Ads Manager's "Actions to take" section.

export type MetaRecommendation = {
  type: string;                          // e.g. PARTNERSHIP_ADS, ADVANTAGE_PLUS_CREATIVE
  recommendation_stage: string;          // pre_create_guidance, etc.
  recommendation_time: string;
  url: string;                           // deep link to Meta Ads Manager
  object_ids: string[];
  recommendation_content: {
    lift_estimate?: string;              // e.g. "19% lower cost per result"
    body?: string;
    opportunity_score_lift?: string;     // e.g. "1" (points)
  };
};

export type MetaRecommendationsBundle = {
  opportunity_score: number | null;
  recommendations: MetaRecommendation[];
};

export async function listMetaRecommendations(
  adAccountId: string,
  token: string
): Promise<
  | { ok: true; data: MetaRecommendationsBundle }
  | { ok: false; error: string }
> {
  const url = `${GRAPH}/${adAccountId}?fields=recommendations,opportunity_score&access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const msg = (j.error as { message?: string } | undefined)?.message || `http_${r.status}`;
      return { ok: false, error: msg };
    }
    // Shape: { opportunity_score, recommendations: { data: [ { recommendations: [...] } ] } }
    const groups = (j.recommendations as { data?: Array<{ recommendations?: MetaRecommendation[] }> } | undefined)?.data || [];
    const flat: MetaRecommendation[] = [];
    for (const g of groups) for (const rec of g.recommendations || []) flat.push(rec);
    return {
      ok: true,
      data: {
        opportunity_score: typeof j.opportunity_score === 'number' ? (j.opportunity_score as number) : null,
        recommendations: flat,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
