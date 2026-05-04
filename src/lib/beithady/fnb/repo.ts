import 'server-only';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import {
  CategorySchema, ItemSchema, ModifierSchema, BuildingOverrideSchema,
  type Category, type Item, type Modifier, type BuildingOverride,
} from './types';

// Input types reflect Zod's *input* shape (before defaults are applied),
// making fields with .default() optional for callers.
type CategoryInput = Omit<z.input<typeof CategorySchema>, 'id'>;
type ItemInput = Omit<z.input<typeof ItemSchema>, 'id'>;
type ModifierInput = Omit<z.input<typeof ModifierSchema>, 'id'>;
type BuildingOverrideInput = Omit<z.input<typeof BuildingOverrideSchema>, 'id'>;

interface AuditCtx {
  actor_user_id: string | null;
  actor_kind?: 'user' | 'system' | 'guest';
}

async function audit(
  ctx: AuditCtx,
  action: string,
  target_type: string,
  target_id: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('beithady_audit_log').insert({
    actor_user_id: ctx.actor_user_id,
    module: 'fnb',
    action,
    target_type,
    target_id,
    before: before ?? null,
    after: after ?? null,
  });
}

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
  await audit(ctx, 'category.create', 'category', out.id!, null, out);
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
  await audit(ctx, 'category.update', 'category', id, before.data, out);
  return out;
}

export async function deleteCategory(id: string, ctx: AuditCtx): Promise<void> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_categories').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { error } = await sb.from('fnb_categories').delete().eq('id', id);
  if (error) throw error;
  await audit(ctx, 'category.delete', 'category', id, before.data, null);
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
  await audit(ctx, 'item.create', 'item', out.id!, null, out);
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
  await audit(ctx, 'item.update', 'item', id, before.data, out);
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
  await audit(ctx, 'item.delete', 'item', id, before.data, null);
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
  await audit(ctx, 'modifier.create', 'modifier', out.id!, null, out);
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
  await audit(ctx, 'modifier.update', 'modifier', id, before.data, out);
  return out;
}

export async function deleteModifier(id: string, ctx: AuditCtx): Promise<void> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_item_modifiers').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { error } = await sb.from('fnb_item_modifiers').delete().eq('id', id);
  if (error) throw error;
  await audit(ctx, 'modifier.delete', 'modifier', id, before.data, null);
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
  const { data, error } = await sb
    .from('fnb_building_overrides')
    .upsert(parsed as any, { onConflict: 'building_code,item_id' })
    .select()
    .single();
  if (error) throw error;
  const out = BuildingOverrideSchema.parse(data);
  await audit(ctx, 'override.upsert', 'building_override', out.id!, null, out);
  return out;
}
