import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { getCredential } from '@/lib/credentials';
import { parseVolumeFromText } from './volumetric';

// Phase M.16 / M.15.4 — Amazon EG product sourcer.
//
// Walks every active item with a canonical amazon_eg_url and extracts
// price + pack size + stock + name + brand from the live page. Result
// populates the amazon_eg_* columns the estimator already reads from
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
  product_name_en: string | null;   // M.16 — Amazon product title (English)
  product_name_ar: string | null;   // M.16 — Arabic title if present in listing
  brand: string | null;             // M.16 — extracted brand name
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
  "image_url": string | null,         // direct URL of the primary product image; null if not extractable
  "product_name_en": string | null,   // the page's H1 / product title in ENGLISH, cleaned (≤120 chars). Strip noise like "(Pack of 1)" / brand prefix duplicates / channel-specific suffixes.
  "product_name_ar": string | null,   // Arabic title if visible on the page (Egyptian listings often have both); null if only English
  "brand": string | null              // the manufacturer/brand (the "Brand: X" value or the first word of the title — e.g. "Raid", "Dettol", "Finish")
}

Rules:
- Always include every key. Use null for fields you genuinely cannot determine; don't fabricate.
- price_egp: extract the buyable price (the one near the "Add to Cart" button). Ignore strikethrough/MSRP unless that's the only price.
- pack_size: read the title and bullets for "Pack of N", "N-pack", or "set of N". If the title says "1L bottle" and UoM is "bottle", pack_size=1.
- product_name_en: the natural product title someone would type — e.g. "Raid Flying Insect Killer Odorless 300 ML", not "Raid Brand 300 mL Aerosol Insecticide Spray (Pack of 1) – Free Shipping".
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

  // Trim Amazon noise: drop "(Pack of N)" suffixes and dangling parens
  const cleanName = (s: string | null, maxLen = 200): string | null => {
    if (!s) return null;
    let t = s.trim();
    t = t.replace(/\s*\((?:pack|set|box|case|bundle)\s+of\s+\d+\)\s*$/i, '');
    t = t.replace(/\s*\(\s*\d+\s*[a-z]*\s*\)\s*$/i, ''); // "(1pc)" / "(500ml)" — Amazon redundant size suffix
    t = t.replace(/\s+/g, ' ').trim();
    return t.length === 0 ? null : t.length > maxLen ? t.slice(0, maxLen) : t;
  };

  const priceEgp = num('price_egp');
  const inStock = bool('in_stock');

  // Sanity-check Claude's classification:
  //   • status='ok' MUST have a non-null price. Without a price the row is
  //     effectively useless to the estimator and we'd otherwise wipe a
  //     known-good cached price. Downgrade to parse_error so the caller's
  //     "preserve previous values" branch fires.
  //   • status='ok' BUT in_stock=false is contradictory — Amazon's product
  //     page is showing the buy-box but Claude flagged it OOS. This usually
  //     means Claude was confused by a sponsored ad or recommendation
  //     widget. Treat as parse_error to avoid corrupting the row.
  if (status === 'ok' && priceEgp == null) {
    return {
      ok: false,
      status: 'parse_error',
      error: 'Claude returned status="ok" but price_egp was null — refusing to overwrite cached price',
    };
  }
  if (status === 'ok' && !inStock) {
    return {
      ok: false,
      status: 'parse_error',
      error: 'Claude returned status="ok" but in_stock=false — contradictory, refusing to apply',
    };
  }

  return {
    ok: true,
    price_egp: priceEgp,
    pack_size: packSize,
    in_stock: inStock,
    rating: num('rating'),
    review_count: num('review_count'),
    image_url: str('image_url'),
    product_name_en: cleanName(str('product_name_en'), 200),
    product_name_ar: cleanName(str('product_name_ar'), 200),
    brand: cleanName(str('brand'), 80),
    status,
  };
}

/**
 * Fetch raw HTML for an Amazon EG product page via ScrapingBee's residential
 * proxy. Returns null when no API key is configured or the fetch fails so
 * the caller can transparently fall through to the Anthropic web_fetch path.
 */
async function fetchViaScrapingBee(url: string): Promise<string | null> {
  const apiKey = await getCredential('scrapingbee', 'api_key');
  if (!apiKey) return null;

  const renderJsRaw = (await getCredential('scrapingbee', 'render_js')).toLowerCase();
  const renderJs = renderJsRaw === 'true' || renderJsRaw === '1';
  const country = (await getCredential('scrapingbee', 'country_code')).toLowerCase().trim();

  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    render_js: renderJs ? 'true' : 'false',
  });
  if (country) params.set('country_code', country);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strip the noisiest parts of an Amazon HTML page so the buy-box stays
 * within Claude's context window. Observed on a real product page
 * (Clorel multi-purpose cleaner): raw page is 1.58 MB, the price first
 * appears at offset 224k — past the 150k truncation. After stripping
 * <script>/<style>/<noscript>/comments and collapsing whitespace, the
 * page shrinks to ~600 KB and the price moves to offset 72k.
 */
function stripHtmlBloat(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Builds a prompt that gives Claude pre-fetched HTML to parse directly. */
function buildHtmlExtractionPrompt(itemName: string, itemUom: string, url: string, html: string): string {
  // Strip script/style/noscript/comments first — Amazon pages are 1-2 MB raw
  // and the buy-box price is often past 200k chars under sponsored-ad bloat.
  // After stripping, even the largest pages stay well under the truncation
  // limit and the price/title/availability are near the top.
  const cleaned = stripHtmlBloat(html);
  const trimmed = cleaned.length > 200_000 ? cleaned.slice(0, 200_000) : cleaned;
  return `Extract structured product data from the Amazon EG HTML below.

URL: ${url}
Item name from our catalog (sanity check, NOT a hard match — Amazon listing may differ): ${itemName}
Item UoM (for pack-size disambiguation): ${itemUom}

Output a single JSON object with exactly these keys:
{
  "status": "ok" | "oos" | "404",
  "price_egp": number | null,
  "pack_size": number,
  "in_stock": boolean,
  "rating": number | null,
  "review_count": number | null,
  "image_url": string | null,
  "product_name_en": string | null,
  "product_name_ar": string | null,
  "brand": string | null
}

Rules:
- price_egp: the BUYABLE price next to the Add-to-Cart button (the canonical product). Skip:
    • Sponsored/promoted product injections at the top of the page (those have their own price + "Sponsored" label)
    • Strikethrough/MSRP "was" prices
    • "Frequently bought together" bundle prices
    • Recommendation widgets ("Customers also viewed", etc.)
  Only the main product's buy-box price counts. If the page has multiple sponsored ads but no main product, THEN return null.
- pack_size: 1 for single units; >=2 for multi-packs ("Pack of N", "N-pack"). Default 1 if unclear.
- product_name_en: the canonical product H1 in English (NOT a sponsored item title at the top).
- in_stock: true if "In Stock" / "Add to Cart" is shown for the canonical product.
- status:
    • "ok"  → product page with a buyable price (in_stock=true AND price_egp set)
    • "oos" → product page where the canonical item is explicitly Out of Stock / Currently unavailable / Sold out
    • "404" → ONLY if the HTML is a captcha challenge, login wall, raw error page, or search-results listing (multiple unrelated products with no single canonical title). DO NOT use 404 just because there is a sponsored ad at the top — Amazon product pages routinely have those above the canonical product.

Pages that show a single canonical product with a price MUST return "ok" or "oos", never "404", regardless of sponsored injections, banners, recommendation carousels, or layout quirks.

Return JSON only. No markdown fences. No prose.

HTML:
${trimmed}`;
}

/**
 * Probe one Amazon EG product page for current price + stock + pack size + name.
 * Strategy:
 *   1. Try ScrapingBee residential proxy (preferred — Amazon doesn't block it).
 *   2. Fall back to Anthropic web_fetch (kept for graceful degradation, but
 *      Amazon EG returns rate_limited consistently for that path today).
 * Either way, the same Claude Haiku validator turns markup into structured JSON.
 */
export async function probeAmazonProduct(input: {
  itemName: string;
  itemUom: string;
  url: string;
}): Promise<AmazonProbeResult> {
  // Path 1 — ScrapingBee
  const html = await fetchViaScrapingBee(input.url);
  if (html && html.length > 1000) {
    try {
      const res = await client().messages.create({
        model: MODEL,
        max_tokens: 800,
        temperature: 0.0,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: buildHtmlExtractionPrompt(input.itemName, input.itemUom, input.url, html) },
        ],
      });
      const textBlocks: string[] = [];
      for (const block of res.content) if (block.type === 'text') textBlocks.push(block.text);
      if (textBlocks.length > 0) {
        const parsed = extractJson(textBlocks.join('\n').trim());
        return validate(parsed);
      }
    } catch {
      /* fall through to web_fetch */
    }
  }

  // Path 2 — Anthropic web_fetch fallback
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

  // M.16 (revised) — store the fetched Amazon name/brand in DEDICATED
  // shadow columns instead of overwriting the operator's curated SKU
  // name. The items page UI compares amazon_eg_product_name_en vs name_en
  // and surfaces a "review & update SKU details" banner when they differ.
  // This way:
  //   • An operator who pasted a slightly-wrong URL (e.g. 4L floor cleaner
  //     under a 1L APC SKU) sees the mismatch and can fix the URL or
  //     accept the new product details — no silent data corruption.
  //   • The estimator + cost cells keep using amazon_eg_price_egp /
  //     pack_size unchanged.
  // Parse pack volume from the Amazon product name (e.g. "4 kg" → 4 kg,
  // "300 ML" → 300 ml, "1 L" → 1 L). Stored in shadow columns —
  // mismatch banner compares to SKU's pack_volume_value/uom and offers
  // the "Create new SKU" workflow (Q3=C) when they differ.
  const parsedVolume = parseVolumeFromText(result.product_name_en);

  await sb
    .from('beithady_inventory_items')
    .update({
      amazon_eg_product_name_en: result.product_name_en,
      amazon_eg_product_name_ar: result.product_name_ar,
      amazon_eg_brand: result.brand,
      amazon_eg_pack_volume_value: parsedVolume?.value ?? null,
      amazon_eg_pack_volume_uom: parsedVolume?.uom ?? null,
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
