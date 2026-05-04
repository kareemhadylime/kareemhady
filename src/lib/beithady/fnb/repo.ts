import 'server-only';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit, type AuditEntry } from '@/lib/beithady/audit';
import {
  CategorySchema, ItemSchema, ModifierSchema, BuildingOverrideSchema,
  RecipeLineSchema, type RecipeLine,
  type Category, type Item, type Modifier, type BuildingOverride,
} from './types';

// Input types reflect Zod's *input* shape (before defaults are applied),
// making fields with .default() optional for callers.
type CategoryInput = Omit<z.input<typeof CategorySchema>, 'id'>;
type ItemInput = Omit<z.input<typeof ItemSchema>, 'id'>;
type ModifierInput = Omit<z.input<typeof ModifierSchema>, 'id'>;
type BuildingOverrideInput = Omit<z.input<typeof BuildingOverrideSchema>, 'id'>;

// Re-export the shared AuditEntry shape as AuditCtx for callers that only need
// actor identity. The shared helper (src/lib/beithady/audit.ts) owns the
// canonical definition; we just narrow to the fields repo functions require.
export type AuditCtx = Pick<AuditEntry, 'actor_user_id'>;

// TODO: drop `as any` once `supabase gen types` is wired — the generated DB
// types will let us remove these casts on insert/update/upsert calls below.

// ---- Categories ----

export async function listCategories(): Promise<Category[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fnb_categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => CategorySchema.parse(r));
}

export async function getCategory(id: string): Promise<Category | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('fnb_categories').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? CategorySchema.parse(data) : null;
}

export async function createCategory(
  input: CategoryInput, ctx: AuditCtx,
): Promise<Category> {
  const sb = supabaseAdmin();
  const parsed = CategorySchema.parse(input);
  const { data, error } = await sb
    .from('fnb_categories')
    .insert(parsed as any)
    .select()
    .single();
  if (error) throw error;
  const out = CategorySchema.parse(data);
  await recordAudit({ module: 'fnb', actor_user_id: ctx.actor_user_id, action: 'category.create', target_type: 'category', target_id: out.id!, before: null, after: out });
  return out;
}

export async function updateCategory(
  id: string, patch: Partial<Category>, ctx: AuditCtx,
): Promise<Category> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_categories').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { data, error } = await sb
    .from('fnb_categories')
    .update(patch as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const out = CategorySchema.parse(data);
  await recordAudit({ module: 'fnb', actor_user_id: ctx.actor_user_id, action: 'category.update', target_type: 'category', target_id: id, before: before.data, after: out });
  return out;
}

export async function deleteCategory(id: string, ctx: AuditCtx): Promise<void> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_categories').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { error } = await sb.from('fnb_categories').delete().eq('id', id);
  if (error) throw error;
  await recordAudit({ module: 'fnb', actor_user_id: ctx.actor_user_id, action: 'category.delete', target_type: 'category', target_id: id, before: before.data, after: null });
}

// ---- Items ----

export async function listItems(
  opts: { includeDeleted?: boolean; categoryId?: string } = {},
): Promise<Item[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('fnb_items')
    .select('*')
    .order('sort_order', { ascending: true });
  if (!opts.includeDeleted) q = q.is('deleted_at', null);
  if (opts.categoryId) q = q.eq('category_id', opts.categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(r => ItemSchema.parse(r));
}

export async function getItem(id: string): Promise<Item | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fnb_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? ItemSchema.parse(data) : null;
}

export async function createItem(
  input: ItemInput, ctx: AuditCtx,
): Promise<Item> {
  const sb = supabaseAdmin();
  const parsed = ItemSchema.parse(input);
  const { data, error } = await sb
    .from('fnb_items')
    .insert(parsed as any)
    .select()
    .single();
  if (error) throw error;
  const out = ItemSchema.parse(data);
  await recordAudit({ module: 'fnb', actor_user_id: ctx.actor_user_id, action: 'item.create', target_type: 'item', target_id: out.id!, before: null, after: out });
  return out;
}

export async function updateItem(
  id: string, patch: Partial<Item>, ctx: AuditCtx,
): Promise<Item> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_items').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { data, error } = await sb
    .from('fnb_items')
    .update(patch as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const out = ItemSchema.parse(data);
  await recordAudit({ module: 'fnb', actor_user_id: ctx.actor_user_id, action: 'item.update', target_type: 'item', target_id: id, before: before.data, after: out });
  return out;
}

export async function softDeleteItem(id: string, ctx: AuditCtx): Promise<void> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_items').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { error } = await sb
    .from('fnb_items')
    .update({ deleted_at: new Date().toISOString() } as any)
    .eq('id', id);
  if (error) throw error;
  await recordAudit({ module: 'fnb', actor_user_id: ctx.actor_user_id, action: 'item.delete', target_type: 'item', target_id: id, before: before.data, after: null });
}

// ---- Modifiers ----

export async function listModifiers(itemId: string): Promise<Modifier[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fnb_item_modifiers')
    .select('*')
    .eq('item_id', itemId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ModifierSchema.parse(r));
}

export async function createModifier(
  input: ModifierInput, ctx: AuditCtx,
): Promise<Modifier> {
  const sb = supabaseAdmin();
  const parsed = ModifierSchema.parse(input);
  const { data, error } = await sb
    .from('fnb_item_modifiers')
    .insert(parsed as any)
    .select()
    .single();
  if (error) throw error;
  const out = ModifierSchema.parse(data);
  await recordAudit({ module: 'fnb', actor_user_id: ctx.actor_user_id, action: 'modifier.create', target_type: 'modifier', target_id: out.id!, before: null, after: out });
  return out;
}

export async function updateModifier(
  id: string, patch: Partial<Modifier>, ctx: AuditCtx,
): Promise<Modifier> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_item_modifiers').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { data, error } = await sb
    .from('fnb_item_modifiers')
    .update(patch as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const out = ModifierSchema.parse(data);
  await recordAudit({ module: 'fnb', actor_user_id: ctx.actor_user_id, action: 'modifier.update', target_type: 'modifier', target_id: id, before: before.data, after: out });
  return out;
}

export async function deleteModifier(id: string, ctx: AuditCtx): Promise<void> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_item_modifiers').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { error } = await sb.from('fnb_item_modifiers').delete().eq('id', id);
  if (error) throw error;
  await recordAudit({ module: 'fnb', actor_user_id: ctx.actor_user_id, action: 'modifier.delete', target_type: 'modifier', target_id: id, before: before.data, after: null });
}

// ---- Building overrides ----

export async function listBuildingOverridesForItem(
  itemId: string,
): Promise<BuildingOverride[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fnb_building_overrides')
    .select('*')
    .eq('item_id', itemId);
  if (error) throw error;
  return (data ?? []).map(r => BuildingOverrideSchema.parse(r));
}

export async function upsertBuildingOverride(
  input: BuildingOverrideInput, ctx: AuditCtx,
): Promise<BuildingOverride> {
  const sb = supabaseAdmin();
  const parsed = BuildingOverrideSchema.parse(input);
  const existing = await sb
    .from('fnb_building_overrides')
    .select('*')
    .eq('building_code', parsed.building_code)
    .eq('item_id', parsed.item_id)
    .maybeSingle();
  const beforeRow = existing.data ?? null;
  const { data, error } = await sb
    .from('fnb_building_overrides')
    .upsert(parsed as any, { onConflict: 'building_code,item_id' })
    .select()
    .single();
  if (error) throw error;
  const out = BuildingOverrideSchema.parse(data);
  await recordAudit({
    module: 'fnb',
    actor_user_id: ctx.actor_user_id,
    action: beforeRow ? 'override.update' : 'override.create',
    target_type: 'building_override',
    target_id: out.id!,
    before: beforeRow,
    after: out,
  });
  return out;
}

// ---- Recipe lines ----

export async function listRecipeLines(itemId: string): Promise<RecipeLine[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fnb_item_recipe_lines')
    .select('*')
    .eq('item_id', itemId);
  if (error) throw error;
  return (data ?? []).map(r => RecipeLineSchema.parse(r));
}

export async function upsertRecipeLine(
  input: Omit<z.input<typeof RecipeLineSchema>, 'id'>, ctx: AuditCtx,
): Promise<RecipeLine> {
  const sb = supabaseAdmin();
  const parsed = RecipeLineSchema.parse(input);
  // TODO: drop `as never` once supabase gen types are wired
  const { data, error } = await sb
    .from('fnb_item_recipe_lines')
    .upsert(parsed as never, { onConflict: 'item_id,inventory_item_id' })
    .select()
    .single();
  if (error) throw error;
  const out = RecipeLineSchema.parse(data);
  await recordAudit({
    module: 'fnb',
    actor_user_id: ctx.actor_user_id,
    action: 'recipe.upsert',
    target_type: 'recipe_line',
    target_id: out.id!,
    after: out,
  });
  return out;
}

export async function deleteRecipeLine(id: string, ctx: AuditCtx): Promise<void> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_item_recipe_lines').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { error } = await sb.from('fnb_item_recipe_lines').delete().eq('id', id);
  if (error) throw error;
  await recordAudit({
    module: 'fnb',
    actor_user_id: ctx.actor_user_id,
    action: 'recipe.delete',
    target_type: 'recipe_line',
    target_id: id,
    before: before.data,
  });
}

/**
 * Computes cost_usd from the recipe lines × inventory unit costs.
 * Uses default_cost_usd; if null, fallback to converting avg_cost_egp (or
 * default_cost_egp) via the latest fx_rates row (base=USD, quote=EGP).
 * Returns null cost if any line ingredient lacks a usable cost — caller
 * decides how to surface. NEVER throws on missing FX data.
 *
 * Note: fx_rates schema is (rate_date, base, quote, rate, source, fetched_at).
 * We query WHERE base='USD' AND quote='EGP' ORDER BY rate_date DESC LIMIT 1.
 */
export async function computeRecipeCost(itemId: string): Promise<{
  cost_usd: number | null;
  lines: Array<{
    inventory_item_id: string;
    sku: string;
    name_en: string;
    quantity: number;
    unit_cost_usd: number | null;
    line_cost_usd: number | null;
  }>;
}> {
  const sb = supabaseAdmin();
  const { data: lines, error: linesErr } = await sb
    .from('fnb_item_recipe_lines')
    .select(`
      id, inventory_item_id, quantity,
      beithady_inventory_items (
        id, sku, name_en, default_cost_usd, default_cost_egp, avg_cost_egp
      )
    `)
    .eq('item_id', itemId);
  if (linesErr) throw linesErr;

  // Best-effort FX fallback for items without default_cost_usd
  // fx_rates has columns: base, quote, rate (egp per usd when base=USD, quote=EGP)
  let fxEgpPerUsd: number | null = null;
  const needsFx = (lines ?? []).some(l => {
    const inv = (l as any).beithady_inventory_items;
    return inv && inv.default_cost_usd == null;
  });
  if (needsFx) {
    try {
      const { data: fx } = await sb
        .from('fx_rates')
        .select('rate')
        .eq('base', 'USD')
        .eq('quote', 'EGP')
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      fxEgpPerUsd = (fx as { rate?: number } | null)?.rate ?? null;
    } catch {
      // Gracefully ignore FX fetch failures — cost will be null for affected items
    }
  }

  const out: Awaited<ReturnType<typeof computeRecipeCost>>['lines'] = [];
  let any_missing = false;
  let total = 0;
  type LineRow = {
    inventory_item_id: string; quantity: number;
    beithady_inventory_items: {
      id: string; sku: string; name_en: string;
      default_cost_usd: number | null;
      default_cost_egp: number | null;
      avg_cost_egp: number | null;
    } | null;
  };
  for (const l of (lines ?? []) as unknown as LineRow[]) {
    const inv = l.beithady_inventory_items;
    if (!inv) {
      out.push({
        inventory_item_id: l.inventory_item_id, sku: '?', name_en: '?',
        quantity: l.quantity,
        unit_cost_usd: null, line_cost_usd: null,
      });
      any_missing = true;
      continue;
    }
    let unit_cost_usd: number | null = inv.default_cost_usd ?? null;
    if (unit_cost_usd == null && fxEgpPerUsd && fxEgpPerUsd > 0) {
      const egp = inv.avg_cost_egp ?? inv.default_cost_egp;
      if (egp != null) {
        unit_cost_usd = egp / fxEgpPerUsd;
      }
    }
    const line_cost_usd = unit_cost_usd != null
      ? Math.round(unit_cost_usd * l.quantity * 100) / 100
      : null;
    if (line_cost_usd == null) any_missing = true;
    else total += line_cost_usd;
    out.push({
      inventory_item_id: inv.id,
      sku: inv.sku,
      name_en: inv.name_en,
      quantity: l.quantity,
      unit_cost_usd,
      line_cost_usd,
    });
  }
  return {
    cost_usd: any_missing ? null : Math.round(total * 100) / 100,
    lines: out,
  };
}
