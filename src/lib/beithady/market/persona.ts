import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { countryName } from './countries';
import type { MarketSignal } from './signals';

// Per-country AI persona brief. Generates a 4-6 sentence operator-
// facing summary of the typical traveler from <country> visiting
// Egypt + serviced apartments, with hospitality-relevant context
// (typical group size, season, language, halal needs, family vs
// couple, average stay length, ad-channel preference).
//
// Cost: ~$0.001 per country with claude-haiku-4-5. Persisted on the
// signal row + invalidated after 30 days.

const MODEL = 'claude-haiku-4-5-20251001';
const STALE_DAYS = 30;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

export function isStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  const age = Date.now() - new Date(updatedAt).getTime();
  return age > STALE_DAYS * 86400e3;
}

export async function generatePersona(signal: MarketSignal): Promise<string> {
  const client = getClient();
  const country = countryName(signal.origin_country);
  const cls = signal.signal_type;

  const prompt = `You are a hospitality market analyst writing for Beit Hady, a serviced-apartment operator with 91 units across 5 buildings in Egypt + Dubai (BH-26, BH-73, BH-435, BH-OK, BH-34). Write a 4-6 sentence operator-facing brief on ${country} (${signal.origin_country}) travelers visiting Egypt and the serviced-apartment segment specifically.

Context:
- Our share of guests from ${country}: ${signal.our_share_pct ?? 0}%
- Egypt national share of inbound visitors from ${country}: ${signal.egypt_share_pct ?? 0}%
- Signal classification: ${cls.replace('_', ' ')}
${cls === 'under_indexed' ? '- This is an ad-targeting OPPORTUNITY — they visit Egypt at higher rates than they book with us' : ''}
${cls === 'over_indexed' ? '- This is our COMPETITIVE MOAT — we capture them better than the national mix' : ''}
${cls === 'unique_to_us' ? '- This market is unique to us; we should investigate why and double down' : ''}

Cover: typical group composition (family / couple / business / student), most active season for Egypt travel, language preference, dietary needs (halal? vegetarian?), average stay length expectations, ad-channel preference (Meta vs TikTok vs Google vs OTA), and one specific recommendation for how Beit Hady should adjust messaging or amenities for this market.

Write in plain English, 4-6 sentences. No greeting, no preamble, no headings.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    temperature: 0.5,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
}

export async function getOrGeneratePersona(country: string): Promise<{ persona: string | null; generated: boolean }> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_market_signals')
    .select('id, signal_type, origin_country, our_share_pct, egypt_share_pct, delta_pct, ai_persona, ai_persona_lang, ai_persona_at, computed_at')
    .eq('origin_country', country.toUpperCase())
    .maybeSingle();

  if (!data) return { persona: null, generated: false };
  const signal = data as MarketSignal;
  if (signal.ai_persona && !isStale(signal.ai_persona_at)) {
    return { persona: signal.ai_persona, generated: false };
  }

  // Generate fresh
  try {
    const persona = await generatePersona(signal);
    await sb
      .from('beithady_market_signals')
      .update({
        ai_persona: persona,
        ai_persona_lang: 'en',
        ai_persona_at: new Date().toISOString(),
      })
      .eq('id', signal.id);
    return { persona, generated: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[market/persona] generate failed:', e);
    return { persona: signal.ai_persona, generated: false };
  }
}
