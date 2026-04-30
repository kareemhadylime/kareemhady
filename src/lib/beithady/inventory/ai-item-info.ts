import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import type { AiItemInfoPayload } from './catalog';

// Phase M.16 — AI-generated item info cards.
//
// Calls Claude Haiku 4.5 with the server-managed web_fetch tool enabled.
// Claude tries the canonical Amazon EG product URL; if that 403s / blocks /
// returns nothing useful, it falls back to general housekeeping knowledge
// for the named SKU. Either way it returns the structured info-card JSON
// below; the `source` field flags which path was taken so the UI can show
// a "from Amazon" or "general knowledge" badge.

const MODEL = 'claude-haiku-4-5-20251001';
const SYSTEM_PROMPT =
  'You enrich housekeeping inventory metadata for Beit Hady, a serviced-apartment business in Egypt. Output strict JSON only — no preamble, no code fence.';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export type AiItemInfo = AiItemInfoPayload;

export type AiInfoTrigger = 'url_change' | 'manual' | 'bulk';

export type ItemInfoInput = {
  id: string;
  sku: string;
  name_en: string;
  name_ar: string;
  brand: string | null;
  uom: string;
  category_name_en: string;
  amazon_eg_url: string | null;
};

function buildUserPrompt(item: ItemInfoInput): string {
  const url = item.amazon_eg_url ?? '(none)';
  const brand = item.brand ?? '—';
  return `Generate an info card for this housekeeping inventory item.

If an Amazon EG URL is provided, USE the web_fetch tool to fetch the product page and base your card on the live page; set "source":"amazon_eg_fetch". If web_fetch fails, returns an empty result, or the page is unreachable, use general housekeeping knowledge for the named product and set "source":"general_knowledge". Always populate every required field — never return null/undefined for required strings; use a 1-sentence best-guess instead.

Item:
- SKU: ${item.sku}
- Name (EN): ${item.name_en}
- Name (AR): ${item.name_ar}
- Category: ${item.category_name_en}
- Brand: ${brand}
- Unit of measure: ${item.uom}
- Amazon EG URL: ${url}

Output a single JSON object with exactly these keys:
{
  "summary_en": "string, ≤25 words, present tense, plain English, what it is + primary use",
  "summary_ar": "string, same length, written in Modern Standard Arabic",
  "key_features": ["3 to 5 short bullet strings"],
  "usage_tips": "string, 1–2 sentences for a housekeeping operator",
  "ingredients_or_materials": "string OR null — active ingredients / fabric / material; null if N/A",
  "warnings": "string OR null — safety/handling notes; null if none apply",
  "pack_details": "string describing ONE purchasable unit (e.g. '1L bottle', '12-pack')",
  "source": "amazon_eg_fetch" | "general_knowledge",
  "source_url": "string OR null — set to the URL you actually fetched, or null if you used general knowledge"
}

Return JSON only. No markdown fences. No prose before or after.`;
}

/**
 * Pulls the first JSON object out of a Claude response. Claude is
 * normally compliant with "JSON only" but occasionally wraps in fences
 * or adds a single line of explanation — strip both.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Direct parse fast-path
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  // Strip code fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
  }
  // Take the substring from the first '{' to the matching last '}'
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* nothing else to try */ }
  }
  throw new Error('No valid JSON object in Claude response');
}

function validate(o: unknown): AiItemInfo {
  if (!o || typeof o !== 'object') throw new Error('Response is not a JSON object');
  const r = o as Record<string, unknown>;

  const requireString = (k: string, max = 600): string => {
    const v = r[k];
    if (typeof v !== 'string' || v.trim().length === 0) {
      throw new Error(`Field "${k}" must be a non-empty string`);
    }
    return v.length > max ? v.slice(0, max) : v;
  };

  const optString = (k: string, max = 600): string | null => {
    const v = r[k];
    if (v == null) return null;
    if (typeof v !== 'string') throw new Error(`Field "${k}" must be string or null`);
    const t = v.trim();
    if (t.length === 0) return null;
    return t.length > max ? t.slice(0, max) : t;
  };

  const features = r.key_features;
  if (!Array.isArray(features) || features.length < 1) {
    throw new Error('key_features must be a non-empty array');
  }
  const cleanedFeatures = features
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .slice(0, 6)
    .map(s => (s.length > 200 ? s.slice(0, 200) : s));
  if (cleanedFeatures.length === 0) throw new Error('key_features had no valid strings');

  const source = r.source;
  if (source !== 'amazon_eg_fetch' && source !== 'general_knowledge') {
    throw new Error('source must be "amazon_eg_fetch" or "general_knowledge"');
  }

  return {
    summary_en: requireString('summary_en', 300),
    summary_ar: requireString('summary_ar', 400),
    key_features: cleanedFeatures,
    usage_tips: requireString('usage_tips', 400),
    ingredients_or_materials: optString('ingredients_or_materials', 400),
    warnings: optString('warnings', 400),
    pack_details: requireString('pack_details', 200),
    source,
    source_url: optString('source_url', 500),
    model: MODEL,
    generated_at: new Date().toISOString(),
  };
}

async function callClaude(item: ItemInfoInput, opts: { temperature: number }): Promise<string> {
  const userPrompt = buildUserPrompt(item);
  const tools = item.amazon_eg_url
    ? [{ type: 'web_fetch_20250910' as const, name: 'web_fetch' as const, max_uses: 2 }]
    : undefined;

  // Anthropic SDK 0.90 — server-managed web_fetch is a beta tool, requires
  // the explicit anthropic-beta header.
  const headers = item.amazon_eg_url ? { 'anthropic-beta': 'web-fetch-2025-09-10' } : undefined;

  const res = await client().messages.create(
    {
      model: MODEL,
      max_tokens: 1500,
      temperature: opts.temperature,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      ...(tools ? { tools } : {}),
    },
    headers ? { headers } : undefined,
  );

  // Claude's response can include tool_use + tool_result blocks plus the
  // final text. We just want the last text block.
  const textBlocks: string[] = [];
  for (const block of res.content) {
    if (block.type === 'text') textBlocks.push(block.text);
  }
  if (textBlocks.length === 0) throw new Error('Claude returned no text content');
  return textBlocks.join('\n').trim();
}

/**
 * Generate a fresh AI info card for an item. Single Haiku call; one retry
 * with temp=0 if the first response fails JSON validation. Throws on
 * unrecoverable error — caller is responsible for setting status='error'
 * and persisting the error message.
 */
export async function generateItemInfo(item: ItemInfoInput): Promise<AiItemInfo> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callClaude(item, { temperature: attempt === 0 ? 0.2 : 0.0 });
      const parsed = extractJson(raw);
      return validate(parsed);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI info generation failed');
}

/**
 * Persist a fresh AI info card. Updates the live row + appends a history
 * entry + prunes history to the last 10 entries for that item.
 */
export async function persistItemInfo(
  itemId: string,
  info: AiItemInfo,
  generatedBy: string | null,
): Promise<void> {
  const sb = supabaseAdmin();

  await sb
    .from('beithady_inventory_items')
    .update({
      ai_info: info,
      ai_info_generated_at: info.generated_at,
      ai_info_source: info.source,
      ai_info_model: info.model,
      ai_info_status: 'idle',
      ai_info_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  await sb.from('beithady_inventory_items_ai_info_history').insert({
    item_id: itemId,
    ai_info: info,
    source: info.source,
    source_url: info.source_url,
    model: info.model,
    generated_by: generatedBy,
  });

  // Prune history > 10 rows. Two-step (fetch ids then delete) — cheaper than
  // a CTE-DELETE on Supabase REST and the table is per-item small.
  const { data: olderRows } = await sb
    .from('beithady_inventory_items_ai_info_history')
    .select('id')
    .eq('item_id', itemId)
    .order('generated_at', { ascending: false })
    .range(10, 999);
  const idsToDelete = (olderRows || []).map((r: { id: string }) => r.id);
  if (idsToDelete.length > 0) {
    await sb.from('beithady_inventory_items_ai_info_history').delete().in('id', idsToDelete);
  }
}

/**
 * Mark an item as queued / running / errored for the spinner UI. Best
 * effort — failures here are swallowed because the actual regen call is
 * what matters.
 */
export async function setAiInfoStatus(
  itemId: string,
  status: 'queued' | 'running' | 'error' | 'idle',
  error?: string | null,
): Promise<void> {
  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = {
    ai_info_status: status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'error') patch.ai_info_error = error || 'Unknown error';
  if (status === 'idle' || status === 'running' || status === 'queued') patch.ai_info_error = null;
  await sb.from('beithady_inventory_items').update(patch).eq('id', itemId);
}

/**
 * Convenience — fetch + generate + persist with status flips. Used by
 * the server actions both for foreground (manual single) and background
 * (waitUntil) calls. Doesn't throw — sets status='error' on the row
 * instead so the UI can surface it.
 */
export async function regenerateItemInfo(
  itemId: string,
  generatedBy: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_inventory_items')
    .select(`
      id, sku, name_en, name_ar, brand, uom, amazon_eg_url,
      category:beithady_inventory_categories!inner(name_en)
    `)
    .eq('id', itemId)
    .maybeSingle();
  if (error || !data) {
    await setAiInfoStatus(itemId, 'error', `Item lookup failed: ${error?.message || 'not found'}`);
    return { ok: false, error: error?.message || 'Item not found' };
  }
  const row = data as unknown as {
    id: string; sku: string; name_en: string; name_ar: string;
    brand: string | null; uom: string; amazon_eg_url: string | null;
    category: { name_en: string };
  };

  await setAiInfoStatus(itemId, 'running');
  try {
    const info = await generateItemInfo({
      id: row.id, sku: row.sku, name_en: row.name_en, name_ar: row.name_ar,
      brand: row.brand, uom: row.uom, amazon_eg_url: row.amazon_eg_url,
      category_name_en: row.category.name_en,
    });
    await persistItemInfo(itemId, info, generatedBy);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'AI generation failed';
    await setAiInfoStatus(itemId, 'error', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Cooldown check — true if the item's ai_info is fresh enough that an
 * automatic regen (URL-change trigger) should skip. Manual button bypasses
 * this. 24h matches §S3 of the workflow doc.
 */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
export function isWithinCooldown(generatedAt: string | null | undefined): boolean {
  if (!generatedAt) return false;
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < COOLDOWN_MS;
}
