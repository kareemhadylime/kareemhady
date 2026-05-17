import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

// AI ad copy generator. Per Plan v0.3 §F.3, generates 3 variants per
// language (en, ar, de, fr, ru) for a given building + season + target
// market. Pulls Beithady brand voice from the persona briefs (Phase G)
// when available, falls back to generic hospitality tone.
//
// Cost: ~$0.003 per language (3 variants in one call).

const MODEL = 'claude-haiku-4-5-20251001';
const PROMPT_VERSION = 'v1';

export const SUPPORTED_LANGUAGES = ['en', 'ar', 'de', 'fr', 'ru', 'it', 'es', 'pl', 'cs'] as const;
export type AdCopyLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type AdCopyInput = {
  buildingCode: string | null;
  buildingName?: string | null;
  targetCountry: string | null;       // ISO alpha-2; drives language tone + cultural cues
  language: AdCopyLanguage;
  season?: string;                    // 'winter' | 'eid' | 'summer' | ...
  tagline?: string;                   // optional brand-positioning override
  goalText?: string;                  // 'fill the gap' | 'returning guest discount' | ...
};

export type AdCopyVariant = {
  variant: number;
  headline: string;
  primary_text: string;
  cta: string;
};

export type AdCopyResult = {
  variants: AdCopyVariant[];
  language: string;
  prompt_version: string;
  model: string;
};

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

export async function generateAdCopy(input: AdCopyInput): Promise<AdCopyResult> {
  const client = getClient();
  const personaBrief = await getPersonaBrief(input.targetCountry);

  const prompt = buildPrompt(input, personaBrief);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    temperature: 0.7,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = res.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  const parsed = parseJsonish(text);
  const variants = normalizeVariants(parsed);
  return {
    variants,
    language: input.language,
    prompt_version: PROMPT_VERSION,
    model: MODEL,
  };
}

export async function logAdCopy(
  campaignId: number,
  result: AdCopyResult,
  raw: unknown
): Promise<string[]> {
  const sb = supabaseAdmin();
  const ids: string[] = [];
  for (const v of result.variants) {
    const { data } = await sb
      .from('beithady_ads_ai_copy_log')
      .insert({
        campaign_id: campaignId,
        language: result.language,
        variant: v.variant,
        headline: v.headline,
        primary_text: v.primary_text,
        cta: v.cta,
        prompt_version: result.prompt_version,
        model: result.model,
        raw: raw as object,
      })
      .select('id')
      .single();
    if (data) ids.push((data as { id: string }).id);
  }
  return ids;
}

// ---- helpers ----

async function getPersonaBrief(country: string | null): Promise<string | null> {
  if (!country) return null;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_market_signals')
    .select('ai_persona, signal_type')
    .eq('origin_country', country.toUpperCase())
    .maybeSingle();
  return ((data as { ai_persona: string | null; signal_type: string } | null)?.ai_persona) || null;
}

function buildPrompt(input: AdCopyInput, persona: string | null): string {
  const lang = languageNames[input.language] || input.language;
  return `You are writing 3 ad-copy variants for Beit Hady, a serviced-apartment business in Egypt + Dubai. Write the variants in ${lang}.

Building/property: ${input.buildingName || input.buildingCode || 'Beit Hady apartments'}
Target market: ${input.targetCountry ? `travelers from ${input.targetCountry}` : 'general'}
Season/context: ${input.season || 'year-round'}
Goal: ${input.goalText || 'drive Click-to-WhatsApp inquiries for direct bookings'}
${persona ? `\nMarket persona brief:\n${persona}\n` : ''}

For EACH of the 3 variants, write:
- headline: max 40 chars, punchy
- primary_text: 80-140 chars, single paragraph, opens with a hook, ends with a soft CTA
- cta: one of "Send Message", "Learn More", "Book Now", "Contact Us"

Tone: warm hospitality, premium-but-approachable. No emojis unless the language commonly uses them. No exclamation marks. Don't promise specific prices, dates, or availability — that's the host's job.

Return STRICT JSON only, no markdown fences:
{
  "variants": [
    { "variant": 1, "headline": "...", "primary_text": "...", "cta": "..." },
    { "variant": 2, "headline": "...", "primary_text": "...", "cta": "..." },
    { "variant": 3, "headline": "...", "primary_text": "...", "cta": "..." }
  ]
}`;
}

const languageNames: Record<string, string> = {
  en: 'English', ar: 'Arabic (modern standard)', de: 'German', fr: 'French',
  ru: 'Russian', it: 'Italian', es: 'Spanish', pl: 'Polish', cs: 'Czech',
};

function parseJsonish(text: string): { variants?: unknown[] } | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch { /* */ } }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}

function normalizeVariants(parsed: { variants?: unknown[] } | null): AdCopyVariant[] {
  if (!parsed || !Array.isArray(parsed.variants)) return [];
  return parsed.variants.slice(0, 3).map((v, i) => {
    const r = v as Record<string, unknown>;
    return {
      variant: typeof r.variant === 'number' ? r.variant : i + 1,
      headline: typeof r.headline === 'string' ? r.headline.slice(0, 80) : '',
      primary_text: typeof r.primary_text === 'string' ? r.primary_text.slice(0, 500) : '',
      cta: typeof r.cta === 'string' ? r.cta : 'Send Message',
    };
  });
}

// =====================================================================
// Image-aware caption generation (Phase H+) — used by the IG Reels +
// TikTok Reels publishers. Takes a public image/thumbnail URL and the
// building context, returns a single caption + suggested hashtags in
// the requested language.
// =====================================================================

export type CaptionSurface = 'meta_ctwa' | 'ig_caption' | 'tiktok_caption' | 'google_rsa' | 'manual';

export type GenerateCaptionInput = {
  imageUrl: string | null;         // public HTTPS — passed to Claude vision
  buildingCode: string | null;
  buildingName?: string | null;
  language: AdCopyLanguage;
  targetCountry?: string | null;
  vibe?: string;                   // e.g. "rooftop sunset", "Eid family escape"
  surface: CaptionSurface;
};

export type GeneratedCaption = {
  caption: string;
  hashtags: string[];              // 5-10 tags, no leading #
  model: string;
  prompt_version: string;
};

export async function generateCaption(input: GenerateCaptionInput): Promise<GeneratedCaption> {
  const client = getClient();
  const personaBrief = await getPersonaBrief(input.targetCountry || null);
  const lang = languageNames[input.language] || input.language;

  const sys = `You write social-media captions for Beit Hady, a serviced-apartment business in Egypt + Dubai. Premium hospitality, warm not salesy, no exclamation marks, no all-caps. Match the cultural register of the target language.`;

  const ask = `Write ONE caption + 5–10 hashtags in ${lang} for this ${captionSurfaceLabel(input.surface)} post.

Building/property: ${input.buildingName || input.buildingCode || 'Beit Hady apartments'}
${input.targetCountry ? `Audience: travelers from ${input.targetCountry}` : ''}
${input.vibe ? `Vibe/context: ${input.vibe}` : ''}
${personaBrief ? `\nMarket persona brief:\n${personaBrief}\n` : ''}

Caption rules:
- 1–3 short sentences (TikTok/Reels < 150 chars; FB feed can be longer).
- Open with a hook (no greetings).
- Don't promise specific prices or dates.
- If the image hints at a feature (pool, rooftop, view), reference it.

Hashtag rules:
- 5–10 tags. No # prefix. Mix branded (BeitHady, BeitHadyApartments), location (Cairo, NewCairo, Dubai), and vibe (luxurystay, citybreak).
- Avoid banned/spammy generic tags.

Return STRICT JSON only, no markdown fences:
{ "caption": "...", "hashtags": ["BeitHady", "Cairo", "..."] }`;

  type ContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'url'; url: string } };
  const content: ContentBlock[] = [];
  if (input.imageUrl?.startsWith('https://')) {
    content.push({ type: 'image', source: { type: 'url', url: input.imageUrl } });
  }
  content.push({ type: 'text', text: ask });

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    temperature: 0.75,
    system: sys,
    messages: [{ role: 'user', content: content as never }],
  });
  const text = res.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  const parsed = parseJsonish(text) as { caption?: string; hashtags?: unknown[] } | null;
  const caption = typeof parsed?.caption === 'string' ? parsed.caption.slice(0, 2200) : '';
  const hashtags = Array.isArray(parsed?.hashtags)
    ? (parsed!.hashtags as unknown[])
        .map(t => String(t || '').replace(/^#/, '').trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  return { caption, hashtags, model: MODEL, prompt_version: 'v1-caption' };
}

function captionSurfaceLabel(s: CaptionSurface): string {
  if (s === 'ig_caption') return 'Instagram Reel';
  if (s === 'tiktok_caption') return 'TikTok video';
  if (s === 'google_rsa') return 'Google Search ad';
  if (s === 'meta_ctwa') return 'Meta CTWA';
  return 'social-media';
}
