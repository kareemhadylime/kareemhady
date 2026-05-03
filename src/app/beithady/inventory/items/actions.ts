'use server';

import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { listCategories, type ItemRow } from '@/lib/beithady/inventory/catalog';
import { parseItemTemplate } from '@/lib/beithady/inventory/excel';
import { canonicalizeAmazonEgUrl } from '@/lib/beithady/inventory/estimator-shared';
import {
  regenerateItemInfo,
  setAiInfoStatus,
} from '@/lib/beithady/inventory/ai-item-info';
import {
  syncOneItemPrice,
  syncAllItemPrices,
} from '@/lib/beithady/inventory/amazon-eg-sourcer';

export type ItemFormInput = {
  sku: string;
  name_en: string;
  name_ar: string;
  category_id: string;
  uom: string;
  brand: string | null;
  barcode: string | null;
  primary_vendor_id: string | null;
  description: string | null;
  min_qty: number;
  max_qty: number | null;
  reorder_qty: number | null;
  default_cost_egp: number;
  // Audit fix C5: previously 'EGP' | 'USD' but no read site converted —
  // a USD-flagged value silently lived in default_cost_egp and would be
  // treated as EGP everywhere. Inventory items are EGP-only; the form's
  // dropdown was removed and the type narrowed.
  currency: 'EGP';
  batch_tracked: boolean;
  expiry_tracked: boolean;
  owner_billable: boolean;
  is_asset: boolean;
  amazon_eg_url: string | null;
  photo_url: string | null;
  pack_volume_value: number | null;
  pack_volume_uom: string | null;
};

function validate(input: ItemFormInput): string | null {
  if (!input.sku || input.sku.length < 2) return 'SKU is required';
  if (!input.name_en) return 'English name is required';
  if (!input.name_ar) return 'Arabic name is required';
  if (!input.category_id) return 'Category is required';
  if (!input.uom) return 'UoM is required';
  if (input.default_cost_egp < 0) return 'Cost cannot be negative';
  if (input.min_qty < 0) return 'Min qty cannot be negative';
  if (input.max_qty != null && input.max_qty < input.min_qty) return 'Max qty must be ≥ Min qty';
  return null;
}

export type ItemActionResult =
  | { ok: true; item: ItemRow }
  | { ok: false; error: string };

export async function createItemAction(input: ItemFormInput): Promise<ItemActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_inventory_items')
    .insert({
      sku: input.sku.trim(),
      name_en: input.name_en.trim(),
      name_ar: input.name_ar.trim(),
      category_id: input.category_id,
      uom: input.uom,
      brand: input.brand,
      barcode: input.barcode,
      primary_vendor_id: input.primary_vendor_id,
      description: input.description,
      min_qty: input.min_qty,
      max_qty: input.max_qty,
      reorder_qty: input.reorder_qty,
      default_cost_egp: input.default_cost_egp,
      currency: input.currency,
      batch_tracked: input.batch_tracked,
      expiry_tracked: input.expiry_tracked,
      owner_billable: input.owner_billable,
      is_asset: input.is_asset,
      amazon_eg_url: input.amazon_eg_url,
      photo_url: input.photo_url,
      pack_volume_value: input.pack_volume_value,
      pack_volume_uom: input.pack_volume_uom,
      created_by_user: user.id,
      active: true,
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message?.includes('duplicate') ? `SKU "${input.sku}" already exists` : (error?.message || 'Insert failed') };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.create',
    target_type: 'item',
    target_id: data.id,
    after: data,
  });

  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory');
  return { ok: true, item: data as ItemRow };
}

export async function updateItemAction(
  id: string,
  patch: Partial<ItemFormInput>,
): Promise<ItemActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Item not found' };

  const update: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as Array<keyof ItemFormInput>) {
    update[k] = patch[k];
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from('beithady_inventory_items')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Update failed' };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.update',
    target_type: 'item',
    target_id: id,
    before,
    after: data,
  });
  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory');
  return { ok: true, item: data as ItemRow };
}

export async function toggleItemActiveAction(id: string): Promise<ItemActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Item not found' };

  // Block deactivation if non-zero stock
  if (before.active) {
    const { data: stockRows } = await sb
      .from('beithady_inventory_stock')
      .select('qty_on_hand')
      .eq('item_id', id)
      .gt('qty_on_hand', 0)
      .limit(1);
    if (stockRows && stockRows.length > 0) {
      return { ok: false, error: 'Cannot deactivate item with non-zero stock anywhere' };
    }
  }

  const { data, error } = await sb
    .from('beithady_inventory_items')
    .update({ active: !before.active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Toggle failed' };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: before.active ? 'item.deactivate' : 'item.activate',
    target_type: 'item',
    target_id: id,
    before,
    after: data,
  });
  revalidatePath('/beithady/inventory/items');
  return { ok: true, item: data as ItemRow };
}

// ---------------------------------------------------------------------------
// Excel import
// ---------------------------------------------------------------------------

export type ImportPreview = {
  ok: true;
  total: number;
  valid: number;
  invalid: number;
  willCreate: number;
  willUpdate: number;
  rows: Array<{
    rowNum: number;
    sku: string;
    status: 'create' | 'update' | 'error';
    errors: string[];
    name_en?: string;
    name_ar?: string;
    category_code?: string;
  }>;
  // Opaque token the commit step uses to re-parse — we don't store
  // server-side state because Next.js server actions are stateless.
  _payload: string;
};

export type ImportPreviewResult =
  | ImportPreview
  | { ok: false; error: string };

export async function previewImportAction(
  fileBase64: string,
): Promise<ImportPreviewResult> {
  await requireBeithadyPermission('inventory', 'full');
  try {
    const buf = Buffer.from(fileBase64, 'base64');
    const parsed = await parseItemTemplate(buf);
    const sb = supabaseAdmin();

    // Look up which SKUs already exist
    const skus = parsed.rows
      .filter(r => r.parsed)
      .map(r => r.parsed!.sku);
    let existing = new Set<string>();
    if (skus.length > 0) {
      const { data } = await sb
        .from('beithady_inventory_items')
        .select('sku')
        .in('sku', skus);
      existing = new Set((data || []).map((d: { sku: string }) => d.sku));
    }

    const rows = parsed.rows.map(r => {
      const status: 'create' | 'update' | 'error' =
        r.errors.length > 0 ? 'error' : existing.has(r.parsed!.sku) ? 'update' : 'create';
      return {
        rowNum: r.rowNum,
        sku: r.parsed?.sku || String(r.raw.sku || '(missing)'),
        status,
        errors: r.errors,
        name_en: r.parsed?.name_en,
        name_ar: r.parsed?.name_ar,
        category_code: r.parsed?.category_code,
      };
    });

    const willCreate = rows.filter(r => r.status === 'create').length;
    const willUpdate = rows.filter(r => r.status === 'update').length;

    return {
      ok: true,
      total: parsed.rows.length,
      valid: parsed.valid,
      invalid: parsed.invalid,
      willCreate,
      willUpdate,
      rows,
      _payload: fileBase64,
    };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : 'Failed to parse file') };
  }
}

export type CommitResult =
  | { ok: true; created: number; updated: number; skipped: number }
  | { ok: false; error: string };

export async function commitImportAction(
  fileBase64: string,
): Promise<CommitResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  try {
    const buf = Buffer.from(fileBase64, 'base64');
    const parsed = await parseItemTemplate(buf);
    const sb = supabaseAdmin();
    const cats = await listCategories();
    const catByCode = new Map(cats.map(c => [c.code, c]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const r of parsed.rows) {
      if (!r.parsed || r.errors.length > 0) {
        skipped++;
        continue;
      }
      const cat = catByCode.get(r.parsed.category_code);
      if (!cat) { skipped++; continue; }

      // Upsert by SKU
      const { data: existing } = await sb
        .from('beithady_inventory_items')
        .select('id')
        .eq('sku', r.parsed.sku)
        .maybeSingle();

      const payload = {
        sku: r.parsed.sku,
        name_en: r.parsed.name_en,
        name_ar: r.parsed.name_ar,
        category_id: cat.id,
        uom: r.parsed.uom,
        brand: r.parsed.brand,
        barcode: r.parsed.barcode,
        min_qty: r.parsed.min_qty,
        max_qty: r.parsed.max_qty,
        reorder_qty: r.parsed.reorder_qty,
        default_cost_egp: r.parsed.default_cost_egp,
        currency: r.parsed.currency,
        batch_tracked: r.parsed.batch_tracked || cat.default_batch_tracked,
        expiry_tracked: r.parsed.expiry_tracked || cat.default_expiry_tracked,
        owner_billable: r.parsed.owner_billable,
        is_asset: r.parsed.is_asset,
        amazon_eg_url: r.parsed.amazon_eg_url,
        description: r.parsed.description,
        active: true,
      };

      if (existing) {
        const { error } = await sb
          .from('beithady_inventory_items')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (!error) updated++;
        else skipped++;
      } else {
        const { error } = await sb
          .from('beithady_inventory_items')
          .insert({ ...payload, created_by_user: user.id });
        if (!error) created++;
        else skipped++;
      }
    }

    await recordAudit({
      actor_user_id: user.id,
      module: 'inventory',
      action: 'item.bulk_import',
      target_type: 'item',
      metadata: { created, updated, skipped, total: parsed.rows.length },
    });

    revalidatePath('/beithady/inventory/items');
    revalidatePath('/beithady/inventory');

    // Suppress lint hint about unused fileBase64 param (it IS used above)
    void fileBase64;

    return { ok: true, created, updated, skipped };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : 'Import failed') };
  }
}

// ---------------------------------------------------------------------------
// Amazon EG source URL — set / accept / bulk accept (Phase M.15.4)
// ---------------------------------------------------------------------------
//
// Operators land on the items page, scan each item per category, and either
// accept the canonical Amazon EG URL we have on file or paste a corrected
// one. Any URL change cascades through the estimator's unit-cost rollup
// (price / pack_size drives every unit-config check-in budget).

export type SourceActionResult = { ok: true } | { ok: false; error: string };

const MISSING_REVIEW_COLUMN_HINT =
  'Run migration 0053_amazon_eg_review_state.sql in Supabase SQL Editor before reviewing sources.';

function isMissingReviewColumn(err: { message?: string } | null | undefined): boolean {
  const msg = err?.message || '';
  return /amazon_eg_url_reviewed_(at|by)/i.test(msg) && /column|does not exist|undefined/i.test(msg);
}

/**
 * Set or clear the canonical Amazon EG product URL for an item.
 *
 * Pass `null` (or empty string) to clear. Validates against
 * {@link AMAZON_EG_URL_PATTERN} so junk URLs (search results, affiliate
 * variants) can't pollute the table.
 *
 * Whenever the URL changes we reset all Amazon-derived metadata —
 * `amazon_eg_price_egp`, `amazon_eg_pack_size`, `amazon_eg_image_url`,
 * `amazon_eg_last_status` — plus the review state. The new ASIN is by
 * definition unverified.
 */
export async function setAmazonSourceAction(
  itemId: string,
  url: string | null,
): Promise<SourceActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');

  // Accept any Amazon EG product URL shape: bare /dp/<ASIN>, /gp/product/<ASIN>,
  // or the SEO-slug form `/Some-Product-Name/dp/<ASIN>/ref=...?query`. The
  // helper extracts the ASIN and returns the bare canonical form so storage
  // is always normalised — two pastes of the same product never differ.
  let cleanUrl: string | null = null;
  if (url && url.trim()) {
    const canonical = canonicalizeAmazonEgUrl(url);
    if (!canonical) {
      return {
        ok: false,
        error:
          'URL must be an Amazon EG product link with a 10-char ASIN. Examples: https://www.amazon.eg/dp/B0XXXXXXXX, https://www.amazon.eg/gp/product/B0XXXXXXXX, or the SEO-slug form https://www.amazon.eg/Product-Name/dp/B0XXXXXXXX/ref=… are all OK.',
      };
    }
    cleanUrl = canonical;
  }

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_items')
    .select('id, sku, amazon_eg_url, amazon_eg_price_egp, amazon_eg_pack_size')
    .eq('id', itemId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Item not found' };

  // Audit fix C6: when the URL actually changes, ai_info also describes
  // a stale product (the OLD listing's summary, ingredients, warnings,
  // source_url). Without clearing it, the cooldown gate prevents regen
  // and the AI card silently misrepresents the new product. We only
  // wipe ai_info on a true URL change to avoid losing useful info when
  // the operator re-saves the same URL.
  const urlChanged = (before.amazon_eg_url || null) !== cleanUrl;

  const updatePatch: Record<string, unknown> = {
    amazon_eg_url: cleanUrl,
    amazon_eg_last_status: cleanUrl ? 'unchecked' : null,
    amazon_eg_price_egp: null,
    amazon_eg_pack_size: null,
    amazon_eg_image_url: null,
    amazon_eg_url_reviewed_at: null,
    amazon_eg_url_reviewed_by: null,
    // M.16 — also clear the product-name + brand + pack_volume shadow
    // columns so stale data from the PREVIOUS URL's sync doesn't
    // persist between when the operator pastes a new URL and when the
    // background sync writes fresh values. Otherwise the mismatch banner
    // and Rename SKU AI suggestion read the old name/brand and produce
    // wrong recommendations (e.g. suggesting CLN-FRIDA-4L when the new
    // URL is actually a Clorel product).
    amazon_eg_product_name_en: null,
    amazon_eg_product_name_ar: null,
    amazon_eg_brand: null,
    amazon_eg_pack_volume_value: null,
    amazon_eg_pack_volume_uom: null,
    updated_at: new Date().toISOString(),
  };
  if (urlChanged) {
    updatePatch.ai_info = null;
    updatePatch.ai_info_source = null;
    updatePatch.ai_info_generated_at = null;
    updatePatch.ai_info_model = null;
    updatePatch.ai_info_error = null;
    updatePatch.ai_info_status = cleanUrl ? 'queued' : 'idle';
  }

  const { error } = await sb
    .from('beithady_inventory_items')
    .update(updatePatch)
    .eq('id', itemId);

  if (error) {
    if (isMissingReviewColumn(error)) {
      return { ok: false, error: MISSING_REVIEW_COLUMN_HINT };
    }
    return { ok: false, error: error.message };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.amazon_source.update',
    target_type: 'item',
    target_id: itemId,
    before: {
      amazon_eg_url: before.amazon_eg_url,
      amazon_eg_price_egp: before.amazon_eg_price_egp,
      amazon_eg_pack_size: before.amazon_eg_pack_size,
    },
    after: { amazon_eg_url: cleanUrl },
  });

  // On URL change with a non-null URL: kick off TWO background tasks via
  // waitUntil so the operator's save returns instantly while the heavy
  // work runs after the response is flushed:
  //   1) Amazon EG price sourcer — fetches price + pack_size + product name
  //      + brand from the live Amazon page and overwrites the items row.
  //   2) AI info regen — ai_info was already wiped above (audit fix C6),
  //      so the cooldown gate is moot and regen runs unconditionally.
  // Both calls hit Claude with web_fetch on the same URL but they extract
  // different fields, so we run them in parallel.
  if (urlChanged && cleanUrl) {
    const userIdForAudit = user.id;
    const tasks: Promise<unknown>[] = [];

    // Task 1: price sourcer
    tasks.push(
      syncOneItemPrice(itemId).then(() => {
        revalidatePath('/beithady/inventory/items');
        revalidatePath('/beithady/inventory/rules/estimator', 'layout');
      }),
    );

    // Task 2: AI info regen (status was set to 'queued' above)
    tasks.push(
      regenerateItemInfo(itemId, userIdForAudit).then(() => {
        revalidatePath('/beithady/inventory/items');
        revalidatePath('/beithady/inventory/rules/estimator', 'layout');
      }),
    );

    waitUntil(Promise.allSettled(tasks));
  }

  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  revalidatePath('/beithady/inventory');
  return { ok: true };
}

/**
 * Manually trigger an AI info regen for a single item. Bypasses the 24h
 * cooldown — operator clicked the "Refresh AI info" button and explicitly
 * wants a fresh card. Runs in the foreground (request waits ~5-10s) so
 * the UI can show the result on the next render.
 */
export async function generateAiInfoAction(
  itemId: string,
): Promise<SourceActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  await setAiInfoStatus(itemId, 'running');
  const res = await regenerateItemInfo(itemId, user.id);
  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: res.ok ? 'item.ai_info.generate' : 'item.ai_info.generate_failed',
    target_type: 'item',
    target_id: itemId,
    metadata: res.ok ? undefined : { error: res.error },
  });
  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * Bulk-regen for every active item with `ai_info IS NULL`. Operators
 * click the header button to fill the catalog in one shot. Runs the
 * regens concurrently with a small pool to avoid hammering Anthropic
 * rate limits, returns the queued count once items have been flagged
 * as `queued` (the actual generation continues via waitUntil so the
 * page can refresh with spinners).
 */
export async function generateAllMissingAiInfoAction(): Promise<
  { ok: true; queued: number } | { ok: false; error: string }
> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();

  const { data: pending, error } = await sb
    .from('beithady_inventory_items')
    .select('id')
    .is('ai_info', null)
    .eq('active', true)
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const ids = (pending as Array<{ id: string }> | null || []).map(r => r.id);
  if (ids.length === 0) return { ok: true, queued: 0 };

  // Flag every targeted row as queued so the UI shows spinners on next render.
  await sb
    .from('beithady_inventory_items')
    .update({ ai_info_status: 'queued', ai_info_error: null, updated_at: new Date().toISOString() })
    .in('id', ids);

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.ai_info.bulk_generate',
    target_type: 'item',
    metadata: { queued: ids.length },
  });

  // Run concurrently in pools of 5 — keeps total wall-clock under ~2 minutes
  // for 50 items while staying inside Anthropic concurrent-request limits.
  const userIdForAudit = user.id;
  waitUntil(
    (async () => {
      const POOL = 5;
      for (let i = 0; i < ids.length; i += POOL) {
        const slice = ids.slice(i, i + POOL);
        await Promise.allSettled(slice.map(id => regenerateItemInfo(id, userIdForAudit)));
      }
      revalidatePath('/beithady/inventory/items');
      revalidatePath('/beithady/inventory/rules/estimator', 'layout');
    })(),
  );

  revalidatePath('/beithady/inventory/items');
  return { ok: true, queued: ids.length };
}

/**
 * Stamp an item's Amazon EG URL as reviewed by the current operator.
 * Refuses if the item has no URL — there is nothing to accept yet.
 * Also flips `amazon_eg_last_status` from 'unchecked' to 'ok' since
 * "I reviewed it and it's correct" implies the URL is live.
 */
export async function acceptAmazonSourceAction(
  itemId: string,
): Promise<SourceActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_items')
    .select('id, sku, amazon_eg_url, amazon_eg_last_status')
    .eq('id', itemId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Item not found' };
  if (!before.amazon_eg_url) {
    return { ok: false, error: 'Set an Amazon EG URL before accepting it.' };
  }

  // Audit fix C8: previously flipped amazon_eg_last_status from
  // 'unchecked' → 'ok' here. That conflated "human reviewed the URL"
  // (reviewed_at/by) with "Amazon probe returned 200 + price"
  // (last_status). The source-cell pill turned green and the items
  // list showed live-data styling on rows where amazon_eg_price_egp
  // was still null — operator confidence misplaced. Now we only stamp
  // the review fields; last_status only changes via an actual probe
  // in persistProbeResult.
  const { error } = await sb
    .from('beithady_inventory_items')
    .update({
      amazon_eg_url_reviewed_at: new Date().toISOString(),
      amazon_eg_url_reviewed_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    if (isMissingReviewColumn(error)) {
      return { ok: false, error: MISSING_REVIEW_COLUMN_HINT };
    }
    return { ok: false, error: error.message };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.amazon_source.accept',
    target_type: 'item',
    target_id: itemId,
    after: { amazon_eg_url: before.amazon_eg_url },
  });

  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  revalidatePath('/beithady/inventory');
  return { ok: true };
}

/**
 * Bulk-accept variant — operator selects N rows, clicks Accept Selected.
 * Server-side guard: silently skips items without an amazon_eg_url so a
 * malicious / stale client can't accept rows that have nothing to accept.
 */
export async function acceptManySourcesAction(
  itemIds: string[],
): Promise<{ ok: true; accepted: number; skipped: number } | { ok: false; error: string }> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { ok: false, error: 'Pick at least one item.' };
  }

  const sb = supabaseAdmin();
  // Filter to ids that actually have a URL — protects the audit log + review stamp.
  const { data: eligible, error: lookupErr } = await sb
    .from('beithady_inventory_items')
    .select('id')
    .in('id', itemIds)
    .not('amazon_eg_url', 'is', null);
  if (lookupErr) {
    if (isMissingReviewColumn(lookupErr)) {
      return { ok: false, error: MISSING_REVIEW_COLUMN_HINT };
    }
    return { ok: false, error: lookupErr.message };
  }
  const eligibleRows = (eligible as Array<{ id: string }> | null) || [];
  const eligibleIds = eligibleRows.map(r => r.id);
  const skipped = itemIds.length - eligibleIds.length;

  if (eligibleIds.length === 0) {
    return { ok: true, accepted: 0, skipped };
  }

  // Audit fix C8/H13: was also flipping amazon_eg_last_status from
  // 'unchecked' → 'ok' for the unchecked subset, conflating "human
  // confirmed the URL" with "Amazon probe succeeded". Removed — review
  // and probe state are now independent. last_status only changes via
  // a real probe in persistProbeResult.
  const nowIso = new Date().toISOString();
  const { error } = await sb
    .from('beithady_inventory_items')
    .update({
      amazon_eg_url_reviewed_at: nowIso,
      amazon_eg_url_reviewed_by: user.id,
      updated_at: nowIso,
    })
    .in('id', eligibleIds);
  if (error) {
    if (isMissingReviewColumn(error)) {
      return { ok: false, error: MISSING_REVIEW_COLUMN_HINT };
    }
    return { ok: false, error: error.message };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.amazon_source.accept_bulk',
    target_type: 'item',
    metadata: { item_ids: eligibleIds, accepted: eligibleIds.length, skipped },
  });

  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  revalidatePath('/beithady/inventory');
  return { ok: true, accepted: eligibleIds.length, skipped };
}

// ---------------------------------------------------------------------------
// Amazon EG sourcer — manual triggers (Phase M.16 / M.15.4)
// ---------------------------------------------------------------------------
//
// The daily cron at /api/cron/beithady-amazon-eg-sourcer walks every active
// item with a URL and refreshes price + pack_size + stock. These two
// actions let operators force-refresh:
//   • single item    → "Sync price now" button on the source cell
//   • whole catalog  → "Sync all prices" header button
// Manual single runs in the foreground (~10-15s) so the operator sees the
// result immediately. Bulk runs in the background via waitUntil so the
// header click returns instantly and the items page auto-polls for updates.

export type SyncPriceResult =
  | { ok: true; status: string; price_egp: number | null; price_changed: boolean }
  | { ok: false; error: string };

export async function syncAmazonPriceNowAction(itemId: string): Promise<SyncPriceResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const res = await syncOneItemPrice(itemId);
  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: res.ok ? 'amazon_eg.sync_one' : 'amazon_eg.sync_one_failed',
    target_type: 'item',
    target_id: itemId,
    metadata: res.ok
      ? { status: res.status, price_egp: res.price_egp, price_changed: res.price_changed }
      : { error: res.error },
  });
  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  return res;
}

export async function syncAllAmazonPricesAction(): Promise<
  { ok: true; queued: number } | { ok: false; error: string }
> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: candidates, error } = await sb
    .from('beithady_inventory_items')
    .select('id')
    .eq('active', true)
    .not('amazon_eg_url', 'is', null)
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const queued = (candidates as Array<{ id: string }> | null || []).length;
  if (queued === 0) {
    return { ok: false, error: 'No active items have an Amazon EG URL set yet — set URLs first.' };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'amazon_eg.sync_all',
    target_type: 'item',
    metadata: { queued },
  });

  // Fire-and-forget. Worst case ~2 min for 50 items @ 4 concurrent.
  waitUntil(
    syncAllItemPrices().then(() => {
      revalidatePath('/beithady/inventory/items');
      revalidatePath('/beithady/inventory/rules/estimator', 'layout');
    }),
  );

  revalidatePath('/beithady/inventory/items');
  return { ok: true, queued };
}

// ---------------------------------------------------------------------------
// Manual price entry (Phase M.16) — fallback for items where Amazon EG
// blocks Claude's web_fetch and the auto-sourcer can't pull live data.
// Operator opens the product page themselves, reads price + pack_size +
// (optionally) the canonical product name, types them in. Marks the row
// as `amazon_eg_last_status='ok'` so the UI flips from amber estimate
// to plain live cost.
// ---------------------------------------------------------------------------

export type ManualPriceInput = {
  price_egp: number;
  pack_size: number;          // ≥1
  name_en?: string | null;    // optional — overwrites name when provided
  brand?: string | null;
};

export async function setManualAmazonPriceAction(
  itemId: string,
  input: ManualPriceInput,
): Promise<SourceActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');

  // Validate
  if (!Number.isFinite(input.price_egp) || input.price_egp <= 0) {
    return { ok: false, error: 'Price must be a positive number' };
  }
  const packSize = Math.max(1, Math.round(input.pack_size || 1));
  if (input.price_egp > 100_000) {
    return { ok: false, error: 'Price looks too high — typo? Max 100,000 EGP per unit.' };
  }

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_items')
    .select('id, sku, name_en, brand, amazon_eg_price_egp, amazon_eg_pack_size, amazon_eg_url')
    .eq('id', itemId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Item not found' };
  if (!before.amazon_eg_url) {
    return { ok: false, error: 'Set an Amazon EG URL first — the manual price still needs a source link.' };
  }

  const namePatch: Record<string, unknown> = {};
  if (input.name_en && input.name_en.trim()) namePatch.name_en = input.name_en.trim().slice(0, 200);
  if (input.brand && input.brand.trim()) namePatch.brand = input.brand.trim().slice(0, 80);

  // Audit fix H12: also clear product-name + brand + pack_volume + image
  // + rating/review_count shadow columns from the prior failed/stale fetch.
  // Without this, the mismatch banner reads stale amazon_eg_product_name_en
  // and falsely surfaces "Amazon listing differs" against the name the
  // operator just typed in.
  const { error } = await sb
    .from('beithady_inventory_items')
    .update({
      ...namePatch,
      amazon_eg_price_egp: input.price_egp,
      amazon_eg_pack_size: packSize,
      amazon_eg_in_stock: true,
      amazon_eg_last_status: 'ok',
      amazon_eg_last_checked_at: new Date().toISOString(),
      amazon_eg_product_name_en: null,
      amazon_eg_product_name_ar: null,
      amazon_eg_brand: null,
      amazon_eg_pack_volume_value: null,
      amazon_eg_pack_volume_uom: null,
      amazon_eg_image_url: null,
      amazon_eg_rating: null,
      amazon_eg_review_count: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.amazon_price.manual_set',
    target_type: 'item',
    target_id: itemId,
    before: {
      amazon_eg_price_egp: before.amazon_eg_price_egp,
      amazon_eg_pack_size: before.amazon_eg_pack_size,
      name_en: before.name_en,
      brand: before.brand,
    },
    after: {
      amazon_eg_price_egp: input.price_egp,
      amazon_eg_pack_size: packSize,
      ...namePatch,
    },
  });

  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  revalidatePath('/beithady/inventory');
  return { ok: true };
}


// ---------------------------------------------------------------------------
// Apply Amazon-fetched product details to the SKU (Phase M.16)
// ---------------------------------------------------------------------------
// When the sourcer pulls a product name/brand that differs from the SKU's
// curated name, the items page surfaces a "Use Amazon details" button.
// This action copies amazon_eg_product_name_en/_ar/_brand into the
// canonical name_en/name_ar/brand fields. Operator-driven — never fires
// automatically. Audit-logged with before/after snapshot for rollback.

export async function applyAmazonDetailsAction(
  itemId: string,
): Promise<SourceActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_items')
    .select(
      'id, sku, name_en, name_ar, brand, pack_volume_value, pack_volume_uom, default_cost_egp, description, ' +
      'amazon_eg_product_name_en, amazon_eg_product_name_ar, amazon_eg_brand, ' +
      'amazon_eg_pack_volume_value, amazon_eg_pack_volume_uom, ' +
      'amazon_eg_price_egp, amazon_eg_pack_size, ai_info'
    )
    .eq('id', itemId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Item not found' };
  const row = before as unknown as {
    id: string; sku: string; name_en: string; name_ar: string; brand: string | null;
    pack_volume_value: number | string | null;
    pack_volume_uom: string | null;
    default_cost_egp: number | string;
    description: string | null;
    amazon_eg_product_name_en: string | null;
    amazon_eg_product_name_ar: string | null;
    amazon_eg_brand: string | null;
    amazon_eg_pack_volume_value: number | string | null;
    amazon_eg_pack_volume_uom: string | null;
    amazon_eg_price_egp: number | string | null;
    amazon_eg_pack_size: number | null;
    ai_info: { summary_en?: string | null; summary_ar?: string | null } | null;
  };

  const patch: Record<string, unknown> = {};
  if (row.amazon_eg_product_name_en && row.amazon_eg_product_name_en.trim()) {
    patch.name_en = row.amazon_eg_product_name_en.trim().slice(0, 200);
  }
  if (row.amazon_eg_product_name_ar && row.amazon_eg_product_name_ar.trim()) {
    patch.name_ar = row.amazon_eg_product_name_ar.trim().slice(0, 200);
  }
  if (row.amazon_eg_brand && row.amazon_eg_brand.trim()) {
    patch.brand = row.amazon_eg_brand.trim().slice(0, 80);
  }
  // M.16 — also propagate the Amazon pack_volume to the canonical column
  // so the estimator's volumetric math + the size mismatch detector both
  // see the new pack size, not the old SKU's stale 1L assumption.
  //
  // Liquid heuristic: Amazon EG often labels liquid products by net-weight
  // ("4 Kg" for a 4-litre bottle of cleaner) because that's the shipping
  // weight. Operators track liquids in volume — when the product name
  // contains liquid/cleaner/detergent/shampoo/etc AND Amazon labelled it
  // in kg or g, convert to L or ml assuming density ≈ 1 (water-based,
  // close enough for cost estimation; concentrated cleaners off by ≤20%).
  if (row.amazon_eg_pack_volume_value != null && row.amazon_eg_pack_volume_uom) {
    let v = Number(row.amazon_eg_pack_volume_value);
    let u = row.amazon_eg_pack_volume_uom;
    const nameForCheck = (row.amazon_eg_product_name_en || row.name_en || '').toLowerCase();
    const isLiquid = /\b(liquid|detergent|shampoo|conditioner|softener|cleaner|spray|bleach|oil|sauce|lotion|gel|syrup|vinegar|polish|disinfectant|deodoriz|deodoris|sanitiz|sanitis)/i.test(nameForCheck);
    if (isLiquid) {
      if (u === 'kg') { u = 'L'; }
      else if (u === 'g') { u = 'ml'; }
    }
    patch.pack_volume_value = v;
    patch.pack_volume_uom = u;
    void v; // satisfy linter — v intentionally not converted (1:1 mapping)
  }
  // M.16 — sync default_cost_egp to the live Amazon per-pack price so the
  // operator's cost field reflects what they actually pay (was a seed
  // placeholder until now). For multi-packs use price ÷ pack_size to get
  // the per-unit cost; otherwise the raw price.
  if (row.amazon_eg_price_egp != null) {
    const price = Number(row.amazon_eg_price_egp);
    const packCount = row.amazon_eg_pack_size && row.amazon_eg_pack_size > 0
      ? row.amazon_eg_pack_size : 1;
    if (Number.isFinite(price) && price > 0) {
      patch.default_cost_egp = price / packCount;
    }
  }
  // M.16 — fill description from the AI info card's summary if the operator
  // hasn't set their own description yet. Doesn't overwrite — leaves manual
  // descriptions intact.
  if (!row.description && row.ai_info?.summary_en) {
    patch.description = String(row.ai_info.summary_en).slice(0, 500);
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error: 'No Amazon product details to apply — run a price sync first.',
    };
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await sb
    .from('beithady_inventory_items')
    .update(patch)
    .eq('id', itemId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.amazon_details.apply',
    target_type: 'item',
    target_id: itemId,
    before: {
      name_en: row.name_en, name_ar: row.name_ar, brand: row.brand,
      pack_volume_value: row.pack_volume_value, pack_volume_uom: row.pack_volume_uom,
    },
    after: patch,
  });

  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  revalidatePath('/beithady/inventory');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// AI-suggested SKU rename (Phase M.16)
// ---------------------------------------------------------------------------
// Operator's flow when an Amazon URL points to a different size/brand than
// the SKU code suggests (e.g., CLN-ANTIFLY-400ML pointing at a 300ML can):
//   1) Click "Suggest SKU rename" in the mismatch banner
//      → calls suggestSkuRenameAction → returns AI-proposed new SKU + rationale
//   2) UI shows confirmation modal with old/new comparison
//   3) Operator clicks Apply → calls applySkuRenameAction → updates items.sku
//
// items.id is the FK target across stock/transactions/rules/etc, NOT the SKU
// text — so renaming items.sku is a label-only change, no cascade needed.

export type SkuSuggestionResult =
  | { ok: true; old_sku: string; suggested_sku: string; rationale: string }
  | { ok: false; error: string };

export async function suggestSkuRenameAction(itemId: string): Promise<SkuSuggestionResult> {
  await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('beithady_inventory_items')
    .select(`
      sku, name_en, uom,
      amazon_eg_product_name_en, amazon_eg_brand, amazon_eg_pack_size,
      amazon_eg_pack_volume_value, amazon_eg_pack_volume_uom,
      category:beithady_inventory_categories!inner(code)
    `)
    .eq('id', itemId)
    .maybeSingle();
  if (!row) return { ok: false, error: 'Item not found' };
  const item = row as unknown as {
    sku: string;
    name_en: string;
    uom: string;
    amazon_eg_product_name_en: string | null;
    amazon_eg_brand: string | null;
    amazon_eg_pack_size: number | null;
    amazon_eg_pack_volume_value: number | string | null;
    amazon_eg_pack_volume_uom: string | null;
    category: { code: string };
  };

  if (!item.amazon_eg_product_name_en) {
    return {
      ok: false,
      error: 'No Amazon product details on this row yet — set a URL and run sync first.',
    };
  }

  const { suggestSkuRename } = await import('@/lib/beithady/inventory/ai-sku-rename');
  const res = await suggestSkuRename({
    oldSku: item.sku,
    categoryCode: item.category.code,
    oldNameEn: item.name_en,
    newNameEn: item.amazon_eg_product_name_en,
    newBrand: item.amazon_eg_brand,
    uom: item.uom,
    packSize: item.amazon_eg_pack_size,
    // M.16 — pass the Amazon-fetched pack volume so the AI uses the
    // ACTUAL size (4 kg) instead of inheriting the OLD SKU's stale
    // size suffix (1L). Without this, "CLN-APC-1L" got renamed to
    // "CLN-CLOREL-1L" even though the new product is 4 kg.
    amazonPackVolumeValue: item.amazon_eg_pack_volume_value != null
      ? Number(item.amazon_eg_pack_volume_value) : null,
    amazonPackVolumeUom: item.amazon_eg_pack_volume_uom,
  });
  if (!res.ok) return { ok: false, error: res.error };
  if (res.sku === item.sku) {
    return { ok: false, error: 'AI suggested the same SKU — no change needed.' };
  }
  return { ok: true, old_sku: item.sku, suggested_sku: res.sku, rationale: res.rationale };
}

export type SkuApplyResult = { ok: true; old_sku: string; new_sku: string } | { ok: false; error: string };

export async function applySkuRenameAction(
  itemId: string,
  newSku: string,
): Promise<SkuApplyResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');

  const cleanSku = (newSku || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,29}$/.test(cleanSku)) {
    return { ok: false, error: 'SKU must be 2–30 chars, A-Z / 0-9 / hyphen, starting with a letter.' };
  }

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_items')
    .select('id, sku')
    .eq('id', itemId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Item not found' };
  const beforeRow = before as { id: string; sku: string };
  if (beforeRow.sku === cleanSku) {
    return { ok: false, error: 'New SKU is identical to the current one — no change.' };
  }

  // Uniqueness check
  const { data: clash } = await sb
    .from('beithady_inventory_items')
    .select('id, sku')
    .eq('sku', cleanSku)
    .neq('id', itemId)
    .maybeSingle();
  if (clash) {
    return { ok: false, error: `SKU "${cleanSku}" is already used by another item.` };
  }

  const { error } = await sb
    .from('beithady_inventory_items')
    .update({ sku: cleanSku, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.sku.rename',
    target_type: 'item',
    target_id: itemId,
    before: { sku: beforeRow.sku },
    after: { sku: cleanSku },
  });

  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  revalidatePath('/beithady/inventory');
  return { ok: true, old_sku: beforeRow.sku, new_sku: cleanSku };
}

// ---------------------------------------------------------------------------
// Fork SKU from Amazon listing (Q3=C — create NEW SKU, preserve old)
// ---------------------------------------------------------------------------
// When the operator pastes a URL whose Amazon product is genuinely a
// different size/variant (e.g. SKU was 1L cleaner, Amazon listing is 4kg),
// "Use Amazon details" would corrupt the old SKU's history. "Create new
// SKU" forks: the old SKU keeps its name/rules/GRNs/issues; a new SKU is
// inserted populated with the Amazon-fetched name, brand, URL, pack volume,
// price, and image. Generated SKU code = old prefix + "-FORK<N>".

export async function forkSkuFromAmazonAction(
  itemId: string,
): Promise<SourceActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();

  const { data: src } = await sb
    .from('beithady_inventory_items')
    .select(
      'id, sku, name_en, name_ar, brand, category_id, uom, currency, batch_tracked, expiry_tracked, owner_billable, is_asset, ' +
      'amazon_eg_url, amazon_eg_price_egp, amazon_eg_pack_size, amazon_eg_image_url, ' +
      'amazon_eg_product_name_en, amazon_eg_product_name_ar, amazon_eg_brand, ' +
      'amazon_eg_pack_volume_value, amazon_eg_pack_volume_uom, default_cost_egp, min_qty'
    )
    .eq('id', itemId)
    .maybeSingle();
  if (!src) return { ok: false, error: 'Source item not found' };
  const s = src as unknown as {
    id: string; sku: string; name_en: string; name_ar: string;
    brand: string | null; category_id: string; uom: string;
    currency: 'EGP'; batch_tracked: boolean; expiry_tracked: boolean;
    owner_billable: boolean; is_asset: boolean;
    amazon_eg_url: string | null;
    amazon_eg_price_egp: number | string | null;
    amazon_eg_pack_size: number | null;
    amazon_eg_image_url: string | null;
    amazon_eg_product_name_en: string | null;
    amazon_eg_product_name_ar: string | null;
    amazon_eg_brand: string | null;
    amazon_eg_pack_volume_value: number | string | null;
    amazon_eg_pack_volume_uom: string | null;
    default_cost_egp: number | string;
    min_qty: number | string;
  };

  if (!s.amazon_eg_product_name_en) {
    return { ok: false, error: 'No Amazon product details on the source — run a sync first.' };
  }

  // Generate a unique fork SKU code. Strip any existing -FORK suffix and try
  // -FORK, -FORK2, -FORK3, etc. until vacant.
  const baseSku = s.sku.replace(/-FORK\d*$/i, '');
  let newSku = `${baseSku}-FORK`;
  for (let n = 2; n < 50; n++) {
    const { data: dup } = await sb
      .from('beithady_inventory_items')
      .select('id')
      .eq('sku', newSku)
      .maybeSingle();
    if (!dup) break;
    newSku = `${baseSku}-FORK${n}`;
  }

  const newName = s.amazon_eg_product_name_en.slice(0, 200);
  const newNameAr = (s.amazon_eg_product_name_ar || s.name_ar).slice(0, 200);
  const newBrand = s.amazon_eg_brand || s.brand;
  const newCost = s.amazon_eg_price_egp != null
    ? Number(s.amazon_eg_price_egp)
    : Number(s.default_cost_egp);

  const { data: inserted, error } = await sb
    .from('beithady_inventory_items')
    .insert({
      sku: newSku,
      name_en: newName,
      name_ar: newNameAr,
      category_id: s.category_id,
      uom: s.uom,
      brand: newBrand,
      currency: s.currency,
      batch_tracked: s.batch_tracked,
      expiry_tracked: s.expiry_tracked,
      owner_billable: s.owner_billable,
      is_asset: s.is_asset,
      default_cost_egp: newCost,
      min_qty: Number(s.min_qty),
      amazon_eg_url: s.amazon_eg_url,
      amazon_eg_price_egp: s.amazon_eg_price_egp,
      amazon_eg_pack_size: s.amazon_eg_pack_size,
      amazon_eg_image_url: s.amazon_eg_image_url,
      amazon_eg_product_name_en: s.amazon_eg_product_name_en,
      amazon_eg_product_name_ar: s.amazon_eg_product_name_ar,
      amazon_eg_brand: s.amazon_eg_brand,
      amazon_eg_pack_volume_value: s.amazon_eg_pack_volume_value,
      amazon_eg_pack_volume_uom: s.amazon_eg_pack_volume_uom,
      pack_volume_value: s.amazon_eg_pack_volume_value,
      pack_volume_uom: s.amazon_eg_pack_volume_uom,
      amazon_eg_last_status: 'ok',
      amazon_eg_in_stock: true,
      created_by_user: user.id,
      active: true,
    })
    .select('id')
    .single();
  if (error || !inserted) return { ok: false, error: error?.message || 'Insert failed' };

  // Clear the source SKU's URL — the Amazon listing now belongs to the
  // forked SKU; the original keeps its other curated details.
  // Audit fix H11: also clear ai_info so the source SKU's AI card
  // doesn't keep describing the product that just left the row (same
  // root cause as C6 in setAmazonSourceAction).
  await sb
    .from('beithady_inventory_items')
    .update({
      amazon_eg_url: null,
      amazon_eg_price_egp: null,
      amazon_eg_pack_size: null,
      amazon_eg_image_url: null,
      amazon_eg_in_stock: null,
      amazon_eg_last_status: null,
      amazon_eg_url_reviewed_at: null,
      amazon_eg_url_reviewed_by: null,
      amazon_eg_product_name_en: null,
      amazon_eg_product_name_ar: null,
      amazon_eg_brand: null,
      amazon_eg_pack_volume_value: null,
      amazon_eg_pack_volume_uom: null,
      ai_info: null,
      ai_info_source: null,
      ai_info_generated_at: null,
      ai_info_model: null,
      ai_info_error: null,
      ai_info_status: 'idle',
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'item.fork_from_amazon',
    target_type: 'item',
    target_id: itemId,
    metadata: { source_sku: s.sku, new_sku: newSku, new_item_id: (inserted as { id: string }).id },
  });

  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  revalidatePath('/beithady/inventory');
  return { ok: true };
}
