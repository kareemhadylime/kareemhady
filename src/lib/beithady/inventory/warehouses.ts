import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type WarehouseRow = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  building_code: string | null;
  parent_id: string | null;
  category_tag: 'linen' | 'fnb' | 'maintenance' | 'chemicals' | 'general' | 'welcome_tray' | null;
  manager_user_id: string | null;
  address_line: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  pin_code: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WarehouseTreeNode = WarehouseRow & {
  children: WarehouseTreeNode[];
  item_count?: number;
  stock_value_egp?: number;
};

// Building codes Beit Hady tracks. Mirrors operations module / Q15.
export const BEITHADY_BUILDING_CODES = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34', 'OTHER'] as const;
export type BeithadyBuildingCode = (typeof BEITHADY_BUILDING_CODES)[number];

export const CATEGORY_TAG_LABEL: Record<NonNullable<WarehouseRow['category_tag']>, { en: string; ar: string }> = {
  general: { en: 'General', ar: 'عام' },
  linen: { en: 'Linen', ar: 'مفروشات' },
  fnb: { en: 'F&B', ar: 'مأكولات ومشروبات' },
  chemicals: { en: 'Chemicals', ar: 'مواد كيميائية' },
  maintenance: { en: 'Maintenance', ar: 'صيانة' },
  welcome_tray: { en: 'Welcome Tray', ar: 'صينية الترحيب' },
};

export async function listAllWarehouses(opts: { includeInactive?: boolean } = {}): Promise<WarehouseRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('beithady_inventory_warehouses').select('*').order('building_code', { ascending: true }).order('parent_id', { ascending: true, nullsFirst: true }).order('name_en', { ascending: true });
  if (!opts.includeInactive) q = q.eq('active', true);
  const { data } = await q;
  return (data as WarehouseRow[] | null) || [];
}

export async function getWarehouse(id: string): Promise<WarehouseRow | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_inventory_warehouses').select('*').eq('id', id).maybeSingle();
  return data as WarehouseRow | null;
}

export async function getWarehouseByCode(code: string): Promise<WarehouseRow | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_inventory_warehouses').select('*').eq('code', code).maybeSingle();
  return data as WarehouseRow | null;
}

// Builds a 2-level tree grouped by building_code → main warehouse → sub-warehouses.
// Sub-warehouses are children of mains; orphans (no parent + no building_code) sort last.
export async function buildWarehouseTree(opts: { includeInactive?: boolean } = {}): Promise<{
  byBuilding: Record<string, WarehouseTreeNode[]>;
  ungrouped: WarehouseTreeNode[];
}> {
  const rows = await listAllWarehouses(opts);
  const byId = new Map<string, WarehouseTreeNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });

  const mains: WarehouseTreeNode[] = [];
  const orphanedSubs: WarehouseTreeNode[] = [];

  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id) {
      const parent = byId.get(r.parent_id);
      if (parent) parent.children.push(node);
      else orphanedSubs.push(node);
    } else {
      mains.push(node);
    }
  }

  const byBuilding: Record<string, WarehouseTreeNode[]> = {};
  for (const m of mains) {
    const bc = m.building_code || 'UNGROUPED';
    if (!byBuilding[bc]) byBuilding[bc] = [];
    byBuilding[bc].push(m);
  }

  return { byBuilding, ungrouped: orphanedSubs };
}

// Live stats per warehouse — count of distinct items + total stock value in EGP.
// Done in a single query on the stock table.
export async function fetchWarehouseStats(): Promise<Record<string, { item_count: number; stock_value_egp: number }>> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_inventory_stock')
    .select('warehouse_id, item_id, qty_on_hand, avg_cost_egp');
  const map = new Map<string, { items: Set<string>; value: number }>();
  for (const r of (data as Array<{ warehouse_id: string; item_id: string; qty_on_hand: number; avg_cost_egp: number }> | null) || []) {
    if (!map.has(r.warehouse_id)) map.set(r.warehouse_id, { items: new Set(), value: 0 });
    const e = map.get(r.warehouse_id)!;
    if (Number(r.qty_on_hand) > 0) e.items.add(r.item_id);
    e.value += Number(r.qty_on_hand) * Number(r.avg_cost_egp || 0);
  }
  const out: Record<string, { item_count: number; stock_value_egp: number }> = {};
  for (const [wid, { items, value }] of map.entries()) {
    out[wid] = { item_count: items.size, stock_value_egp: value };
  }
  return out;
}

// PIN lookup from beithady_settings (canonical source — pin_code on the
// warehouse row is a denormalised mirror that may be stale).
export async function getWarehousePin(warehouseCode: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_settings')
    .select('value')
    .eq('key', `inventory_pin_${warehouseCode}`)
    .maybeSingle();
  if (!data) return null;
  const value = (data as { value: { pin?: string } }).value;
  return value?.pin || null;
}
