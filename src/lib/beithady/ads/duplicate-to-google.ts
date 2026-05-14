import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { isoCountriesToGoogleGeo } from './platforms';
import type { IgMediaItem } from './meta-client';

// Pulls a Meta campaign's content + targeting + budget and maps it onto the
// fields Google Performance Max needs. Used to pre-fill the PMax publish form
// when the operator clicks "Duplicate to Google" from a Meta campaign page.
//
// What carries over directly:
//  - daily budget, monthly cap, building codes
//  - target countries (ISO → Google geoTargetConstant)
//  - first ad's image URL and landing URL
//
// What needs reshaping (Meta has one caption + headline; PMax requires 3-15
// short headlines ≤30c, 1-5 long headlines ≤90c, 2-5 descriptions ≤90c):
//  - we mine the IG caption for sentences and stuff them into the right
//    char-limit buckets; falls back to generic Beithady defaults so the
//    form never blocks the operator with an empty required field

export type PmaxDefaults = {
  found: boolean;
  campaignName: string;
  dailyBudgetUsd: number;
  monthlyBudgetCapUsd: number | null;
  buildingCodes: string[];
  finalUrl: string;
  marketingImageUrl: string | null;
  headlines: string[];                 // ≤30 chars, ≥3
  longHeadlines: string[];             // ≤90 chars, ≥1
  descriptions: string[];              // ≤90 chars, ≥2
  locationIds: string[];               // Google geoTargetConstant IDs
  targetCountriesIso: string[];        // ISO alpha-2 codes for the form display
  notes: string[];
};

const DEFAULT_HEADLINES = ['Beit Hady Apartments', 'Luxury Cairo Stays', 'Book Direct With Host'];
const DEFAULT_LONG_HEADLINES = ['Premium serviced apartments in Cairo — direct host, 24/7 concierge'];
const DEFAULT_DESCRIPTIONS = [
  'Premium furnishings, direct host, WhatsApp booking. Message us for live availability.',
  'Book direct, no booking fees. Multiple Cairo locations.',
];

function clip(s: string, max: number): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  // Try to cut at last space within the budget so we don't slice a word in half
  const lastSpace = t.slice(0, max).lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? t.slice(0, lastSpace) : t.slice(0, max)).trim();
}

function buildTextBuckets(caption: string | null, headline: string | null): { short: string[]; long: string[]; descs: string[] } {
  const text = `${headline || ''} ${caption || ''}`.trim();
  if (!text) return { short: DEFAULT_HEADLINES, long: DEFAULT_LONG_HEADLINES, descs: DEFAULT_DESCRIPTIONS };

  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);

  // Short headlines (≤30): use shortest sentences first, then truncate longer ones
  const short: string[] = [];
  for (const s of sentences) {
    if (short.length >= 5) break;
    const c = clip(s, 30);
    if (c && c.length >= 6 && !short.includes(c)) short.push(c);
  }
  for (const d of DEFAULT_HEADLINES) {
    if (short.length >= 3) break;
    if (!short.includes(d)) short.push(d);
  }

  // Long headlines (≤90): use the first sentence (or pairs of short sentences) up to 90 chars
  const long: string[] = [];
  if (sentences[0]) long.push(clip(sentences[0], 90));
  if (sentences.length >= 2 && long[0]!.length < 50) {
    const combined = clip(`${sentences[0]} ${sentences[1]}`, 90);
    if (combined !== long[0]) long.push(combined);
  }
  if (!long.length) long.push(...DEFAULT_LONG_HEADLINES);

  // Descriptions (≤90): take full sentences clipped to 90, distinct from long headlines
  const descs: string[] = [];
  for (const s of sentences) {
    if (descs.length >= 4) break;
    const c = clip(s, 90);
    if (c && c.length >= 20 && !descs.includes(c) && !long.includes(c)) descs.push(c);
  }
  for (const d of DEFAULT_DESCRIPTIONS) {
    if (descs.length >= 2) break;
    if (!descs.includes(d)) descs.push(d);
  }

  return { short, long, descs };
}

// wa.me URLs are not allowed as the Final URL of a Google PMax campaign — Google
// rejects them as invalid landing pages. Fall back to the Beithady site instead.
function sanitiseFinalUrl(url: string | null): { final: string; note: string | null } {
  const u = (url || '').trim();
  if (!u) return { final: 'https://beithady.com', note: null };
  if (/^https?:\/\/wa\.me\//i.test(u) || /^https?:\/\/(api\.)?whatsapp\.com/i.test(u)) {
    return { final: 'https://beithady.com', note: 'Meta ad pointed to WhatsApp (wa.me). Google PMax rejects wa.me URLs — defaulted to beithady.com. Adjust if needed.' };
  }
  if (!u.startsWith('https://')) return { final: 'https://beithady.com', note: `Meta ad landing URL "${u.slice(0, 40)}" is not https — defaulted to beithady.com.` };
  return { final: u, note: null };
}

// Meta CDN URLs (scontent-*.cdninstagram.com) cannot be fetched server-side from Vercel
// — Meta blocks hotlinking. Mirror the image to our own public bucket so the Google Ads
// upload step (which also runs server-side) has a stable, always-accessible URL.
// keyBase: path without extension, e.g. "ads-creatives/42/creative"
async function mirrorMetaCreative(url: string, keyBase: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return url;
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const sb = supabaseAdmin();
    const path = `${keyBase}.${ext}`;
    const { error } = await sb.storage
      .from('beithady-gallery-public')
      .upload(path, Buffer.from(buf), { contentType, upsert: true });
    if (error) return url;
    const { data: { publicUrl } } = sb.storage.from('beithady-gallery-public').getPublicUrl(path);
    return publicUrl;
  } catch {
    return url;
  }
}

export async function buildPmaxDefaultsFromMetaCampaign(metaCampaignId: number): Promise<PmaxDefaults> {
  const empty: PmaxDefaults = {
    found: false,
    campaignName: '',
    dailyBudgetUsd: 30,
    monthlyBudgetCapUsd: null,
    buildingCodes: [],
    finalUrl: 'https://beithady.com',
    marketingImageUrl: null,
    headlines: DEFAULT_HEADLINES,
    longHeadlines: DEFAULT_LONG_HEADLINES,
    descriptions: DEFAULT_DESCRIPTIONS,
    locationIds: [],
    targetCountriesIso: [],
    notes: [],
  };

  if (!Number.isFinite(metaCampaignId) || metaCampaignId <= 0) return empty;

  const sb = supabaseAdmin();
  const { data: campRaw } = await sb
    .from('ads_campaigns')
    .select('id, platform, name, daily_budget_micros, monthly_budget_cap_usd, building_codes')
    .eq('id', metaCampaignId)
    .maybeSingle();
  if (!campRaw) return empty;
  const camp = campRaw as { id: number; platform: string; name: string; daily_budget_micros: number | null; monthly_budget_cap_usd: number | null; building_codes: string[] | null };
  if (camp.platform !== 'meta') return { ...empty, notes: ['Source campaign is not on Meta — defaults shown.'] };

  // First ad set: gives us target_countries
  const { data: setRaw } = await sb
    .from('ads_ad_sets')
    .select('id, target_countries')
    .eq('campaign_id', camp.id)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  const targetCountries = ((setRaw as { target_countries: string[] | null } | null)?.target_countries || []);

  // First ad: gives us creative + caption + landing URL
  type AdRow = { creative_url: string | null; headline: string | null; body: string | null; landing_url: string | null };
  const setIdsRes = await sb.from('ads_ad_sets').select('id').eq('campaign_id', camp.id);
  const setIds = ((setIdsRes.data as Array<{ id: number }> | null) || []).map(r => r.id);
  let adRow: AdRow | null = null;
  if (setIds.length) {
    const { data: adRaw } = await sb
      .from('ads_ads')
      .select('creative_url, headline, body, landing_url')
      .in('ad_set_id', setIds)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    adRow = (adRaw as AdRow | null) || null;
  }

  const { short, long, descs } = buildTextBuckets(adRow?.body || null, adRow?.headline || null);
  const { final, note: urlNote } = sanitiseFinalUrl(adRow?.landing_url || null);
  const geo = isoCountriesToGoogleGeo(targetCountries);

  // Mirror the Meta CDN image to our own storage so the Google Ads upload step can fetch it.
  const rawCreativeUrl = adRow?.creative_url || null;
  const marketingImageUrl = rawCreativeUrl
    ? await mirrorMetaCreative(rawCreativeUrl, `ads-creatives/${camp.id}/creative`)
    : null;

  const notes: string[] = [];
  if (urlNote) notes.push(urlNote);
  if (targetCountries.length && !geo.length) notes.push(`No Google geo mapping for: ${targetCountries.join(', ')}. Targeting defaulted to Egypt — adjust in Google Ads UI.`);
  else if (targetCountries.length > geo.length) {
    const missing = targetCountries.filter(c => !geo.length || isoCountriesToGoogleGeo([c]).length === 0);
    if (missing.length) notes.push(`Dropped unmapped countries: ${missing.join(', ')}.`);
  }
  if (!rawCreativeUrl) notes.push('No image from Meta ad — upload assets in Google Ads UI after publishing.');

  return {
    found: true,
    campaignName: `${camp.name} — Google PMax`,
    dailyBudgetUsd: camp.daily_budget_micros ? camp.daily_budget_micros / 1_000_000 : 30,
    monthlyBudgetCapUsd: camp.monthly_budget_cap_usd != null ? Number(camp.monthly_budget_cap_usd) : null,
    buildingCodes: camp.building_codes || [],
    finalUrl: final,
    marketingImageUrl,
    headlines: short,
    longHeadlines: long,
    descriptions: descs,
    locationIds: geo,
    targetCountriesIso: targetCountries,
    notes,
  };
}

// Build PMax defaults from a live Instagram media item (no Meta campaign needed).
// The IG image is mirrored to Supabase so the Google Ads upload step can fetch it.
export async function buildPmaxDefaultsFromIgMediaItem(item: IgMediaItem): Promise<PmaxDefaults> {
  const { short, long, descs } = buildTextBuckets(item.caption || null, null);
  const rawUrl = item.media_url || item.thumbnail_url || null;
  const marketingImageUrl = rawUrl
    ? await mirrorMetaCreative(rawUrl, `ig-media/${item.id}/creative`)
    : null;
  const dateStr = item.timestamp
    ? new Date(item.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  return {
    found: true,
    campaignName: `[Beit Hady] PMax ${dateStr}`.trim(),
    dailyBudgetUsd: 30,
    monthlyBudgetCapUsd: null,
    buildingCodes: [],
    finalUrl: 'https://beithady.com',
    marketingImageUrl,
    headlines: short,
    longHeadlines: long,
    descriptions: descs,
    locationIds: [],
    targetCountriesIso: [],
    notes: marketingImageUrl ? [] : ['No image for this post — upload assets manually in Google Ads UI.'],
  };
}
