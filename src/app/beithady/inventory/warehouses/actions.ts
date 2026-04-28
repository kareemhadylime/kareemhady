'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import type { WarehouseRow } from '@/lib/beithady/inventory/warehouses';

export type WarehouseFormInput = {
  code: string;
  name_en: string;
  name_ar: string;
  building_code: string;
  parent_id: string | null;
  category_tag: WarehouseRow['category_tag'];
  manager_user_id: string | null;
  address_line: string | null;
  notes: string | null;
};

export type ActionResult =
  | { ok: true; warehouse: WarehouseRow }
  | { ok: false; error: string };

function validate(input: WarehouseFormInput): string | null {
  if (!input.code || input.code.length < 3) return 'Code must be at least 3 characters';
  if (!/^[A-Z0-9-_]+$/.test(input.code)) return 'Code must be uppercase letters, digits, hyphen, underscore only';
  if (!input.name_en) return 'English name is required';
  if (!input.name_ar) return 'Arabic name is required';
  if (!input.building_code) return 'Building is required';
  return null;
}

export async function createWarehouseAction(input: WarehouseFormInput): Promise<ActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_inventory_warehouses')
    .insert({
      code: input.code.trim().toUpperCase(),
      name_en: input.name_en.trim(),
      name_ar: input.name_ar.trim(),
      building_code: input.building_code,
      parent_id: input.parent_id,
      category_tag: input.category_tag,
      manager_user_id: input.manager_user_id,
      address_line: input.address_line,
      notes: input.notes,
      active: true,
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || 'Insert failed' };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'warehouse.create',
    target_type: 'warehouse',
    target_id: data.id,
    after: data,
  });

  revalidatePath('/beithady/inventory/warehouses');
  revalidatePath('/beithady/inventory');
  return { ok: true, warehouse: data as WarehouseRow };
}

export async function updateWarehouseAction(
  id: string,
  patch: Partial<WarehouseFormInput>,
): Promise<ActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_warehouses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Warehouse not found' };

  // Prevent assigning a parent that creates a cycle (V1 simple check —
  // parent must not be a descendant of this warehouse).
  if (patch.parent_id) {
    if (patch.parent_id === id) return { ok: false, error: 'Cannot set warehouse as its own parent' };
    const { data: descendants } = await sb
      .from('beithady_inventory_warehouses')
      .select('id, parent_id')
      .eq('parent_id', id);
    if ((descendants || []).some((d: { id: string }) => d.id === patch.parent_id)) {
      return { ok: false, error: 'Cannot set parent to a descendant warehouse' };
    }
  }

  const update: Partial<WarehouseRow> = {};
  if (patch.code !== undefined) update.code = patch.code.trim().toUpperCase();
  if (patch.name_en !== undefined) update.name_en = patch.name_en.trim();
  if (patch.name_ar !== undefined) update.name_ar = patch.name_ar.trim();
  if (patch.building_code !== undefined) update.building_code = patch.building_code;
  if (patch.parent_id !== undefined) update.parent_id = patch.parent_id;
  if (patch.category_tag !== undefined) update.category_tag = patch.category_tag;
  if (patch.manager_user_id !== undefined) update.manager_user_id = patch.manager_user_id;
  if (patch.address_line !== undefined) update.address_line = patch.address_line;
  if (patch.notes !== undefined) update.notes = patch.notes;
  update.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from('beithady_inventory_warehouses')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) return { ok: false, error: error?.message || 'Update failed' };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'warehouse.update',
    target_type: 'warehouse',
    target_id: id,
    before,
    after: data,
  });

  revalidatePath('/beithady/inventory/warehouses');
  revalidatePath('/beithady/inventory');
  return { ok: true, warehouse: data as WarehouseRow };
}

export async function toggleWarehouseActiveAction(id: string): Promise<ActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('beithady_inventory_warehouses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Warehouse not found' };

  // Block deactivation if there's any non-zero stock anywhere
  if (before.active) {
    const { data: stockRows } = await sb
      .from('beithady_inventory_stock')
      .select('qty_on_hand')
      .eq('warehouse_id', id)
      .gt('qty_on_hand', 0)
      .limit(1);
    if (stockRows && stockRows.length > 0) {
      return { ok: false, error: 'Cannot deactivate warehouse with non-zero stock. Transfer or adjust to zero first.' };
    }
  }

  const { data, error } = await sb
    .from('beithady_inventory_warehouses')
    .update({ active: !before.active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) return { ok: false, error: error?.message || 'Toggle failed' };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: before.active ? 'warehouse.deactivate' : 'warehouse.activate',
    target_type: 'warehouse',
    target_id: id,
    before,
    after: data,
  });

  revalidatePath('/beithady/inventory/warehouses');
  revalidatePath('/beithady/inventory');
  return { ok: true, warehouse: data as WarehouseRow };
}

export async function rotatePinAction(warehouseCode: string): Promise<{ ok: true; pin: string } | { ok: false; error: string }> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const newPin = String(Math.floor(Math.random() * 900000) + 100000); // 6-digit
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('beithady_settings')
    .upsert({ key: `inventory_pin_${warehouseCode}`, value: { pin: newPin } }, { onConflict: 'key' });

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'warehouse.rotate_pin',
    target_type: 'warehouse_pin',
    target_id: warehouseCode,
    metadata: { warehouse_code: warehouseCode },
  });

  revalidatePath('/beithady/inventory/warehouses');
  return { ok: true, pin: newPin };
}
