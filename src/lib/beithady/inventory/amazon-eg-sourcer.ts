import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

// Phase M.16 / M.15.4 — Amazon EG product sourcer.
//
// Walks every active item with a canonical amazon_eg_url and asks Claude
// Haiku 4.5 (with web_fetch_20250910) to pull live price + pack size +
// stock status off the actual product page. Result populates the
// amazon_eg_* columns the estimator already reads from
// (estimator.ts:191 → unitCost = amazon_eg_price_egp / amazon_eg_pack_size).
//
// Falls back gracefully:
//   • Amazon blocks fetch         → status='rate_limited', leave price
//                                    untouched (caller keeps last known)
//   • Page parses but no price    → status='oos' if explicitly out of stock,
//                                    'unchecked' otherwise (don't overwrite)
//   • 404 / dead URL              → status='404'; the price stays at last
//                                    snapshot but we flag for operator review
//
// Snapshots: every successful fetch appends a row to
// beithady_inventory_amazon_eg_price_snapshots so the price-trend chart
// has data to plot and >10pct movements can fire price_changed alerts.

const MODEL = 'claude-haiku-4-5-20251001';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export type AmazonProbeResult = {
  ok: true;
  price_egp: number | null;
  pack_size: number;
  in_stock: boolean;
  rating: number | null;
  review_count: number | null;
  image_url: string | null;
  status: 'ok' | 'oos' | 'price_changed' | 'rate_limited' | '404';
} | {
  ok: false;
  status: 'rate_limited' | '404' | 'parse_error';
  error: string;
};

const SYSTEM_PROMPT =
  'You extract structured product data from Amazon EG (amazon.eg) product pages for Beit Hady\'s housekeeping procurement system. Output strict JSON only — no preamble, no code fence.';

function buildUserPrompt(itemName: string, itemUom: string, url: string): string {
  return `Fetch the Amazon EG product page below and extract the structured data shown.

URL: ${url}
Item name (for sanity check): ${itemName}
Item UoM (for pack-size disambiguation): ${itemUom}

Use the web_fetch tool to retrieve the page. If the page returns 404, redirects to amazon.eg search results, or is otherwise not a single-product page, return status="404". If the fetch is blocked / rate-limited / returns no content, return status="rate_limited".

Output a single JSON object with exactly these keys:
{
  "status": "ok" | "oos" | "404" | "rate_limited",
  "price_egp": number | null,         // current price in EGP, after discount; null if not visible
  "pack_size": number,                // 1 for single units, ≥2 for multi-packs (e.g. "Pack of 6" → 6). Default 1 if unclear.
  "in_stock": boolean,                // true if the product page shows "In stock" or buyable; false if "Currently unavailable" / "Out of stock"
  "rating": number | null,            // 0..5 stars, null if no ratings yet
  "review_count": number | null,      // integer number of ratings, null if none
  "image_url": string | null          // direct URL of the primary product image; null if not extractable
}

Rules:
- Always include every key. Use null for fields you genuinely cannot determine; don't fabricate.
- price_egp: extract the buyable price (the one near the "Add to Cart" button). Ignore strikethrough/MSRP unless that's the only price.
- pack_size: read the title and bullets for "Pack of N", "N-pack", or "set of N". If the title says "1L bottle" and UoM is "bottle", pack_size=1.
- status="ok" when in_stock=true AND price_egp is set; "oos" when explicitly out-of-stock; "404"/"rate_limited" per fetch outcome above.

Return JSON only. No markdown fences. No prose before or after.`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* nothing else to try */ }
  }
  throw new Error('No valid JSON object in Claude response');
}

function validate(o: unknown): AmazonProbeResult {
  if (!o || typeof o !== 'object') {
    return { ok: false, status: 'parse_error', error: 'Response is not a JSON object' };
  }
  const r = o as Record<string, unknown>;
  const status = r.status;
  if (status !== 'ok' && status !== 'oos' && status !== '404' && status !== 'rate_limited') {
    return { ok: false, status: 'parse_error', error: `Invalid status: ${String(status)}` };
  }
  if (status === '404' || status === 'rate_limited') {
    return { ok: false, status, error: `Probe returned ${status}` };
  }

  const num = (k: string): number | null => {
    const v = r[k];
    if (v == null) return null;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^\d.]/g, ''));
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return null;
  };
  const str = (k: string): string | null => {
    const v = r[k];
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
  };
  const bool = (k: string): boolean => {
    const v = r[k];
    return v === true;
  };

  const packSize = (() => {
    const n = num('pack_size');
    if (n == null || n < 1) return 1;
    return Math.round(n);
  })();

  return {
    ok: true,
    price_egp: num('price_egp'),
    pack_size: packSize,
    in_stock: bool('in_stock'),
    rating: num('rating'),
    review_count: num('review_count'),
    image_url: str('image_url'),
    status,
  };
}

/**
 * Probe one Amazon EG product page for current price + stock + pack size.
 * Pure function — caller decides what to do with the result.
 */
export async function probeAmazonProduct(input: {
  itemName: string;
  itemUom: string;
  url: string;
}): Promise<AmazonProbeResult> {
  try {
    const res = await client().messages.create(
      {
        model: MODEL,
        max_tokens: 600,
        temperature: 0.0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(input.itemName, input.itemUom, input.url) }],
        tools: [{ type: 'web_fetch_20250910' as const, name: 'web_fetch' as const, max_uses: 2 }],
      },
      { headers: { 'anthropic-beta': 'web-fetch-2025-09-10' } },
    );

    const textBlocks: string[] = [];
    for (const block of res.content) {
      if (block.type === 'text') textBlocks.push(block.text);
    }
    if (textBlocks.length === 0) {
      return { ok: false, status: 'parse_error', error: 'Claude returned no text content' };
    }
    const parsed = extractJson(textBlocks.join('\n').trim());
    return validate(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Probe call failed';
    return { ok: false, status: 'parse_error', error: msg };
  }
}

/**
 * Persist a probe result to the items row + price snapshot history.
 * Compares against last snapshot to detect >10pct moves and flag
 * status='price_changed' so the operator's items page surfaces a warning.
 */
export async function persistProbeResult(
  itemId: string,
  result: AmazonProbeResult,
): Promise<{ priceChanged: boolean }> {
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();

  if (!result.ok) {
    // Failed probe — record the status, don't overwrite price.
    await sb
      .from('beithady_inventory_items')
      .update({
        amazon_eg_last_status: result.status === 'parse_error' ? 'unchecked' : result.status,
        amazon_eg_last_checked_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', itemId);
    return { priceChanged: false };
  }

  // Successful probe — fetch previous price for delta detection.
  const { data: prev } = await sb
    .from('beithady_inventory_items')
    .select('amazon_eg_price_egp, amazon_eg_pack_size')
    .eq('id', itemId)
    .maybeSingle();

  const oldPrice = prev?.amazon_eg_price_egp != null ? Number(prev.amazon_eg_price_egp) : null;
  const newPrice = result.price_egp;
  let priceChanged = false;
  let finalStatus: 'ok' | 'oos' | 'price_changed' = result.status === 'oos' ? 'oos' : 'ok';
  if (oldPrice != null && newPrice != null && oldPrice > 0) {
    const delta = Math.abs((newPrice - oldPrice) / oldPrice);
    if (delta > 0.10) {
      priceChanged = true;
      finalStatus = 'price_changed';
    }
  }

  await sb
    .from('beithady_inventory_items')
    .update({
      amazon_eg_price_egp: newPrice,
      amazon_eg_pack_size: result.pack_size,
      amazon_eg_image_url: result.image_url,
      amazon_eg_in_stock: result.in_stock,
      amazon_eg_rating: result.rating,
      amazon_eg_review_count: result.review_count,
      amazon_eg_last_status: finalStatus,
      amazon_eg_last_checked_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', itemId);

  // Append snapshot — UNIQUE (item_id, snapshot_date) so re-runs same day
  // overwrite with the latest probe.
  const today = nowIso.slice(0, 10);
  await sb
    .from('beithady_inventory_amazon_eg_price_snapshots')
    .upsert(
      {
        item_id: itemId,
        snapshot_date: today,
        price_egp: newPrice,
        rating: result.rating,
        review_count: result.review_count,
        in_stock: result.in_stock,
        pack_size: result.pack_size,
        raw_json: result as unknown as Record<string, unknown>,
        fetched_at: nowIso,
      },
      { onConflict: 'item_id,snapshot_date' },
    );

  return { priceChanged };
}

/**
 * Run the sourcer for one item. Used by both the manual "Sync price now"
 * button and the bulk cron loop.
 */
export async function syncOneItemPrice(
  itemId: string,
): Promise<{ ok: true; status: string; price_egp: number | null; price_changed: boolean } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_inventory_items')
    .select('id, name_en, uom, amazon_eg_url')
    .eq('id', itemId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message || 'Item not found' };
  const row = data as { id: string; name_en: string; uom: string; amazon_eg_url: string | null };
  if (!row.amazon_eg_url) return { ok: false, error: 'Item has no Amazon EG URL — set one before sourcing.' };

  const probe = await probeAmazonProduct({
    itemName: row.name_en,
    itemUom: row.uom,
    url: row.amazon_eg_url,
  });
  const persist = await persistProbeResult(itemId, probe);
  if (!probe.ok) return { ok: true, status: probe.status, price_egp: null, price_changed: false };
  return { ok: true, status: probe.status, price_egp: probe.price_egp, price_changed: persist.priceChanged };
}

/**
 * Walk every active item with a URL and probe it. Used by the daily cron
 * and the bulk "Sync all prices" button on the items page header.
 * Concurrency capped at 4 so we stay inside Anthropic + Amazon rate limits.
 */
export async function syncAllItemPrices(opts: {
  /** Optional cap to stop runaway runs in dev */
  limit?: number;
} = {}): Promise<{
  attempted: number;
  ok: number;
  rate_limited: number;
  not_found: number;
  parse_errors: number;
  price_changed: number;
}> {
  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_inventory_items')
    .select('id')
    .eq('active', true)
    .not('amazon_eg_url', 'is', null)
    .limit(opts.limit || 500);
  const ids = (rows as Array<{ id: string }> | null || []).map(r => r.id);

  let ok = 0, rate_limited = 0, not_found = 0, parse_errors = 0, price_changed = 0;

  const POOL = 4;
  for (let i = 0; i < ids.length; i += POOL) {
    const slice = ids.slice(i, i + POOL);
    const results = await Promise.allSettled(slice.map(id => syncOneItemPrice(id)));
    for (const r of results) {
      if (r.status === 'rejected' || !r.value.ok) {
        parse_errors++;
        continue;
      }
      const v = r.value;
      if (v.status === 'ok' || v.status === 'oos' || v.status === 'price_changed') ok++;
      else if (v.status === 'rate_limited') rate_limited++;
      else if (v.status === '404') not_found++;
      else parse_errors++;
      if (v.price_changed) price_changed++;
    }
  }

  return { attempted: ids.length, ok, rate_limited, not_found, parse_errors, price_changed };
}
