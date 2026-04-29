'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { listCategories, type ItemRow } from '@/lib/beithady/inventory/catalog';
import { parseItemTemplate } from '@/lib/beithady/inventory/excel';
import { AMAZON_EG_URL_PATTERN } from '@/lib/beithady/inventory/estimator-shared';

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
  currency: 'EGP' | 'USD';
  batch_tracked: boolean;
  expiry_tracked: boolean;
  owner_billable: boolean;
  is_asset: boolean;
  amazon_eg_url: string | null;
  photo_url: string | null;
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

  let cleanUrl: string | null = null;
  if (url && url.trim()) {
    const trimmed = url.trim();
    if (!AMAZON_EG_URL_PATTERN.test(trimmed)) {
      return {
        ok: false,
        error:
          'URL must be a canonical Amazon EG product link, e.g. https://www.amazon.eg/dp/B0XXXXXXXX or /gp/product/B0XXXXXXXX.',
      };
    }
    cleanUrl = trimmed;
  }

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_items')
    .select('id, sku, amazon_eg_url, amazon_eg_price_egp, amazon_eg_pack_size')
    .eq('id', itemId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Item not found' };

  const { error } = await sb
    .from('beithady_inventory_items')
    .update({
      amazon_eg_url: cleanUrl,
      amazon_eg_last_status: cleanUrl ? 'unchecked' : null,
      amazon_eg_price_egp: null,
      amazon_eg_pack_size: null,
      amazon_eg_image_url: null,
      amazon_eg_url_reviewed_at: null,
      amazon_eg_url_reviewed_by: null,
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

  revalidatePath('/beithady/inventory/items');
  revalidatePath('/beithady/inventory/rules/estimator', 'layout');
  revalidatePath('/beithady/inventory');
  return { ok: true };
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

  const nextStatus =
    before.amazon_eg_last_status === 'unchecked' || !before.amazon_eg_last_status
      ? 'ok'
      : before.amazon_eg_last_status;

  const { error } = await sb
    .from('beithady_inventory_items')
    .update({
      amazon_eg_url_reviewed_at: new Date().toISOString(),
      amazon_eg_url_reviewed_by: user.id,
      amazon_eg_last_status: nextStatus,
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
  // Filter to ids that actually have a URL — protects the audit log + status flip.
  const { data: eligible, error: lookupErr } = await sb
    .from('beithady_inventory_items')
    .select('id, amazon_eg_last_status')
    .in('id', itemIds)
    .not('amazon_eg_url', 'is', null);
  if (lookupErr) {
    if (isMissingReviewColumn(lookupErr)) {
      return { ok: false, error: MISSING_REVIEW_COLUMN_HINT };
    }
    return { ok: false, error: lookupErr.message };
  }
  const eligibleRows = (eligible as Array<{ id: string; amazon_eg_last_status: string | null }> | null) || [];
  const eligibleIds = eligibleRows.map(r => r.id);
  const skipped = itemIds.length - eligibleIds.length;

  if (eligibleIds.length === 0) {
    return { ok: true, accepted: 0, skipped };
  }

  const nowIso = new Date().toISOString();
  const { error } = await sb
    .from('beithady_inventory_items')
    .update({
      amazon_eg_url_reviewed_at: nowIso,
      amazon_eg_url_reviewed_by: user.id,
      // Bump unchecked → ok in one shot; preserve other states (price_changed, oos…)
      // via a follow-up per-row update only where status was unchecked/null.
      updated_at: nowIso,
    })
    .in('id', eligibleIds);
  if (error) {
    if (isMissingReviewColumn(error)) {
      return { ok: false, error: MISSING_REVIEW_COLUMN_HINT };
    }
    return { ok: false, error: error.message };
  }

  // Status flip for the unchecked/null subset only.
  const promotable = eligibleRows
    .filter(r => r.amazon_eg_last_status === 'unchecked' || r.amazon_eg_last_status == null)
    .map(r => r.id);
  if (promotable.length > 0) {
    await sb
      .from('beithady_inventory_items')
      .update({ amazon_eg_last_status: 'ok' })
      .in('id', promotable);
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
