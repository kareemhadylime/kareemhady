import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

// Cache English translations of inbound guest messages so the agent
// doesn't have to copy-paste through Google Translate. Skips messages
// that look like English (mostly ASCII) or Arabic (Arabic block chars
// detected) — those don't need translation.

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = `You are a translation assistant for a hospitality CRM. The agent reads English and Arabic. Translate the guest message into clear, natural English. Preserve the original tone (formal/casual). If the message is already English or Arabic, set "skip" to true and leave "translation_en" empty. Always identify the source language (ISO 639-1 code, e.g. tr, ru, fr, es, de, en, ar).

Return ONLY a JSON object — no prose:
{"lang": "<iso639-1>", "skip": <bool>, "translation_en": "<english translation or empty>"}`;

export type TranslateResult =
  | { ok: true; lang: string; skip: boolean; translation_en: string | null }
  | { ok: false; error: string };

// Heuristic — is this message a candidate for translation? Skip pure
// ASCII (probably English), pure punctuation/numbers, and anything
// containing Arabic chars.
export function looksTranslatable(body: string | null): boolean {
  if (!body || body.length < 5) return false;
  // Arabic block — already a language the agent reads.
  if (/[؀-ۿ]/.test(body)) return false;
  // Mostly ASCII = probably English (or numbers/punctuation only).
  const nonAscii = body.match(/[^\x00-\x7F]/g);
  if (!nonAscii || nonAscii.length / body.length < 0.05) return false;
  return true;
}

// One-shot translation via Claude Haiku. Returns the structured result
// without persisting — the caller decides whether to write the cache.
export async function translateMessageBody(body: string): Promise<TranslateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'anthropic_api_key_missing' };
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: body.slice(0, 4000) }],
    });
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim();
    // Strip ```json fences if Claude added them.
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(jsonText) as {
      lang?: string;
      skip?: boolean;
      translation_en?: string;
    };
    return {
      ok: true,
      lang: (parsed.lang || 'unknown').toLowerCase().slice(0, 5),
      skip: !!parsed.skip,
      translation_en: parsed.translation_en?.trim() || null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// For a list of pending message IDs, translate + persist in parallel.
// Returns the count successfully translated. Failures are logged but
// don't stop the batch — the message just won't have a translation
// next render and will be retried.
export async function translateMessagesBatch(messageIds: string[]): Promise<number> {
  if (messageIds.length === 0) return 0;
  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_messages')
    .select('id, body')
    .in('id', messageIds)
    .is('translation_en', null);
  const candidates = ((rows as Array<{ id: string; body: string | null }> | null) || [])
    .filter(r => looksTranslatable(r.body));
  if (candidates.length === 0) return 0;

  // Cap concurrency at 8 to avoid blowing through Anthropic rate limits
  // on a thread with many old non-EN/AR messages. Sequential within a
  // chunk; parallel across chunks.
  const CHUNK = 8;
  let translated = 0;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map(async c => {
        const r = await translateMessageBody(c.body || '');
        if (!r.ok) return null;
        return { id: c.id, ...r };
      }),
    );
    const updates = results.filter((x): x is NonNullable<typeof x> => !!x);
    await Promise.all(
      updates.map(u =>
        sb
          .from('beithady_messages')
          .update({
            translation_en: u.skip ? null : u.translation_en,
            translation_lang: u.lang,
            translated_at: new Date().toISOString(),
          })
          .eq('id', u.id),
      ),
    );
    translated += updates.filter(u => !u.skip && u.translation_en).length;
  }
  return translated;
}
