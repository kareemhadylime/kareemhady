import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { isoCountriesToGoogleGeo } from './platforms';

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
  marketingImageUrl: string | null;   // first ad's creative_url (operator uploads to Google UI)
  headlines: string[];                 // ≤30 chars, ≥3
  longHeadlines: string[];             // ≤90 chars, ≥1
  descriptions: string[];              // ≤90 chars, ≥2
  locationIds: string[];               // Google geoTargetConstant IDs
  notes: string[];                     // human-readable warnings shown above the form
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

  const notes: string[] = [];
  if (urlNote) notes.push(urlNote);
  if (targetCountries.length && !geo.length) notes.push(`No Google geo mapping for: ${targetCountries.join(', ')}. Targeting defaulted to Egypt — adjust in Google Ads UI.`);
  else if (targetCountries.length > geo.length) {
    const missing = targetCountries.filter(c => !geo.length || isoCountriesToGoogleGeo([c]).length === 0);
    if (missing.length) notes.push(`Dropped unmapped countries: ${missing.join(', ')}.`);
  }
  if (!adRow?.creative_url) notes.push('No image from Meta ad — you will need to upload assets in Google Ads UI after publishing.');

  return {
    found: true,
    campaignName: `${camp.name} — Google PMax`,
    dailyBudgetUsd: camp.daily_budget_micros ? camp.daily_budget_micros / 1_000_000 : 30,
    monthlyBudgetCapUsd: camp.monthly_budget_cap_usd != null ? Number(camp.monthly_budget_cap_usd) : null,
    buildingCodes: camp.building_codes || [],
    finalUrl: final,
    marketingImageUrl: adRow?.creative_url || null,
    headlines: short,
    longHeadlines: long,
    descriptions: descs,
    locationIds: geo,
    notes,
  };
}
