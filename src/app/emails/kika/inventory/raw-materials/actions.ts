'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser, canAccessDomain } from '@/lib/auth';
import type { RawMaterialCategory } from '@/lib/kika-raw-materials';

// Guard: require a user authorised on the Kika domain. Editors and admins
// may mutate; viewers cannot.
async function requireKikaEditor() {
  const me = await getCurrentUser();
  if (!me || !canAccessDomain(me, 'kika')) {
    throw new Error('forbidden');
  }
  if (me.role === 'viewer') throw new Error('forbidden: viewer role cannot mutate');
  return me;
}

function parseNum(v: FormDataEntryValue | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createRawMaterial(formData: FormData): Promise<void> {
  const me = await requireKikaEditor();
  const sb = supabaseAdmin();
  const name = String(formData.get('name') || '').trim();
  const category = String(formData.get('category') || 'misc') as RawMaterialCategory;
  if (!name) redirect('/emails/kika/inventory/raw-materials?err=name_required');

  const { error } = await sb.from('raw_materials').insert({
    domain: 'kika',
    name,
    category,
    code: String(formData.get('code') || '').trim() || null,
    subcategory: String(formData.get('subcategory') || '').trim() || null,
    color: String(formData.get('color') || '').trim() || null,
    unit: String(formData.get('unit') || 'pc'),
    unit_cost: parseNum(formData.get('unit_cost')),
    currency: String(formData.get('currency') || 'EGP'),
    qty_on_hand: parseNum(formData.get('qty_on_hand')) ?? 0,
    qty_min: parseNum(formData.get('qty_min')),
    supplier: String(formData.get('supplier') || '').trim() || null,
    supplier_sku: String(formData.get('supplier_sku') || '').trim() || null,
    image_url: String(formData.get('image_url') || '').trim() || null,
    description: String(formData.get('description') || '').trim() || null,
    created_by: me.id,
    updated_by: me.id,
  });
  if (error) redirect(`/emails/kika/inventory/raw-materials?err=${encodeURIComponent(error.message)}`);
  revalidatePath('/emails/kika/inventory/raw-materials');
  redirect('/emails/kika/inventory/raw-materials?ok=1');
}

export async function updateRawMaterial(formData: FormData): Promise<void> {
  const me = await requireKikaEditor();
  const id = String(formData.get('id') || '');
  if (!id) redirect('/emails/kika/inventory/raw-materials?err=id_required');
  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = { updated_by: me.id };
  // Only set fields that are present in the form — absent checkboxes stay
  // as-is. This lets the Edit form be partial.
  for (const key of [
    'name',
    'code',
    'category',
    'subcategory',
    'color',
    'unit',
    'currency',
    'supplier',
    'supplier_sku',
    'image_url',
    'description',
  ]) {
    if (formData.has(key)) {
      const v = String(formData.get(key) || '').trim();
      patch[key] = v.length > 0 ? v : null;
    }
  }
  for (const key of ['unit_cost', 'qty_on_hand', 'qty_min']) {
    if (formData.has(key)) patch[key] = parseNum(formData.get(key));
  }
  if (formData.has('active')) patch['active'] = formData.get('active') === 'on';

  const { error } = await sb.from('raw_materials').update(patch).eq('id', id);
  if (error) redirect(`/emails/kika/inventory/raw-materials?err=${encodeURIComponent(error.message)}`);
  revalidatePath('/emails/kika/inventory/raw-materials');
  redirect(`/emails/kika/inventory/raw-materials?material=${id}&ok=1`);
}

export async function deleteRawMaterial(formData: FormData): Promise<void> {
  await requireKikaEditor();
  const id = String(formData.get('id') || '');
  if (!id) redirect('/emails/kika/inventory/raw-materials?err=id_required');
  const sb = supabaseAdmin();
  await sb.from('raw_materials').delete().eq('id', id);
  revalidatePath('/emails/kika/inventory/raw-materials');
  redirect('/emails/kika/inventory/raw-materials?ok=deleted');
}

// Quick stock-adjust action — +/- against qty_on_hand, preserves all other
// fields. Used by the inline stock buttons in the list view.
export async function adjustStockAction(formData: FormData): Promise<void> {
  const me = await requireKikaEditor();
  const id = String(formData.get('id') || '');
  const delta = parseNum(formData.get('delta')) ?? 0;
  if (!id || delta === 0) return;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('raw_materials')
    .select('qty_on_hand')
    .eq('id', id)
    .maybeSingle();
  const current = Number((data as { qty_on_hand: number } | null)?.qty_on_hand || 0);
  await sb
    .from('raw_materials')
    .update({ qty_on_hand: current + delta, updated_by: me.id })
    .eq('id', id);
  revalidatePath('/emails/kika/inventory/raw-materials');
}
