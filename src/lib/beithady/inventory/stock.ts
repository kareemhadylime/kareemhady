import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type StockBalance = {
  item_id: string;
  warehouse_id: string;
  batch_no: string;
  qty_on_hand: number;
  qty_reserved: number;
  avg_cost_egp: number;
  expiry_date: string | null;
  last_movement_at: string | null;

  // Joined enrichment
  item_sku: string;
  item_name_en: string;
  item_name_ar: string;
  item_uom: string;
  item_min_qty: number;
  item_category_code: string;
  item_category_name_en: string;
  warehouse_code: string;
  warehouse_name_en: string;
  warehouse_building_code: string | null;
};

export type StockFilters = {
  warehouseId?: string;
  buildingCode?: string;
  categoryCode?: string;
  search?: string;
  status?: 'all' | 'in_stock' | 'low' | 'stockout' | 'expiring';
};

export async function listStockBalances(filters: StockFilters = {}): Promise<StockBalance[]> {
  const sb = supabaseAdmin();

  // Use the items table as the driver so we still see "0 on hand" rows
  // for items that have never been received yet (gives operators a
  // complete picture, not just current balances).
  let q = sb
    .from('beithady_inventory_items')
    .select(`
      id, sku, name_en, name_ar, uom, min_qty,
      category:beithady_inventory_categories!inner(code, name_en),
      stock:beithady_inventory_stock(
        warehouse_id, batch_no, qty_on_hand, qty_reserved, avg_cost_egp,
        expiry_date, last_movement_at,
        warehouse:beithady_inventory_warehouses!inner(code, name_en, building_code)
      )
    `)
    .eq('active', true)
    .order('name_en', { ascending: true })
    .limit(800);

  if (filters.search) {
    const s = filters.search.replace(/[,%]/g, '');
    q = q.or(`sku.ilike.%${s}%,name_en.ilike.%${s}%,name_ar.ilike.%${s}%,brand.ilike.%${s}%,barcode.ilike.%${s}%`);
  }
  if (filters.categoryCode) q = q.eq('category.code', filters.categoryCode);

  const { data } = await q;
  const items = (data as Array<{
    id: string;
    sku: string;
    name_en: string;
    name_ar: string;
    uom: string;
    min_qty: number;
    category: { code: string; name_en: string };
    stock: Array<{
      warehouse_id: string;
      batch_no: string;
      qty_on_hand: number;
      qty_reserved: number;
      avg_cost_egp: number;
      expiry_date: string | null;
      last_movement_at: string | null;
      warehouse: { code: string; name_en: string; building_code: string | null };
    }> | null;
  }> | null) || [];

  // Flatten item→stock(s) into balance rows. Items with NO stock anywhere
  // surface as a single zero-row so they're discoverable.
  const out: StockBalance[] = [];
  for (const it of items) {
    const stockRows = it.stock || [];

    if (stockRows.length === 0) {
      // Synthesise a zero row for visibility
      out.push({
        item_id: it.id,
        warehouse_id: '',
        batch_no: '__bulk__',
        qty_on_hand: 0,
        qty_reserved: 0,
        avg_cost_egp: 0,
        expiry_date: null,
        last_movement_at: null,
        item_sku: it.sku,
        item_name_en: it.name_en,
        item_name_ar: it.name_ar,
        item_uom: it.uom,
        item_min_qty: Number(it.min_qty),
        item_category_code: it.category.code,
        item_category_name_en: it.category.name_en,
        warehouse_code: '—',
        warehouse_name_en: 'No stock anywhere',
        warehouse_building_code: null,
      });
      continue;
    }

    for (const s of stockRows) {
      out.push({
        item_id: it.id,
        warehouse_id: s.warehouse_id,
        batch_no: s.batch_no,
        qty_on_hand: Number(s.qty_on_hand || 0),
        qty_reserved: Number(s.qty_reserved || 0),
        avg_cost_egp: Number(s.avg_cost_egp || 0),
        expiry_date: s.expiry_date,
        last_movement_at: s.last_movement_at,
        item_sku: it.sku,
        item_name_en: it.name_en,
        item_name_ar: it.name_ar,
        item_uom: it.uom,
        item_min_qty: Number(it.min_qty),
        item_category_code: it.category.code,
        item_category_name_en: it.category.name_en,
        warehouse_code: s.warehouse.code,
        warehouse_name_en: s.warehouse.name_en,
        warehouse_building_code: s.warehouse.building_code,
      });
    }
  }

  // Apply filters that needed the joined data
  let filtered = out;
  if (filters.warehouseId) filtered = filtered.filter(r => r.warehouse_id === filters.warehouseId);
  if (filters.buildingCode) filtered = filtered.filter(r => r.warehouse_building_code === filters.buildingCode);
  if (filters.status === 'in_stock') filtered = filtered.filter(r => r.qty_on_hand > 0);
  else if (filters.status === 'low') {
    // Aggregate per item across warehouses for low-stock detection
    const totals = new Map<string, number>();
    for (const r of out) totals.set(r.item_id, (totals.get(r.item_id) || 0) + r.qty_on_hand);
    filtered = filtered.filter(r => (totals.get(r.item_id) || 0) < r.item_min_qty && (totals.get(r.item_id) || 0) > 0);
  } else if (filters.status === 'stockout') {
    const totals = new Map<string, number>();
    for (const r of out) totals.set(r.item_id, (totals.get(r.item_id) || 0) + r.qty_on_hand);
    filtered = filtered.filter(r => (totals.get(r.item_id) || 0) === 0);
  } else if (filters.status === 'expiring') {
    const ninetyDays = new Date();
    ninetyDays.setDate(ninetyDays.getDate() + 90);
    filtered = filtered.filter(r => r.expiry_date && r.expiry_date < ninetyDays.toISOString().slice(0, 10));
  }

  return filtered;
}

export type LedgerRow = {
  id: string;
  ts: string;
  type: string;
  qty_delta: number;
  unit_cost_egp: number;
  batch_no: string;
  warehouse_code: string;
  warehouse_name_en: string;
  doc_type: string | null;
  doc_id: string | null;
  ref_reservation_id: string | null;
  ref_task_id: string | null;
  created_by_user: string | null;
  note: string | null;
};

export async function getItemLedger(itemId: string, opts: { limit?: number; warehouseId?: string } = {}): Promise<LedgerRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_inventory_transactions')
    .select(`
      id, ts, type, qty_delta, unit_cost_egp, batch_no,
      doc_type, doc_id, ref_reservation_id, ref_task_id, created_by_user, note,
      warehouse:beithady_inventory_warehouses!inner(code, name_en)
    `)
    .eq('item_id', itemId)
    .order('ts', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.warehouseId) q = q.eq('warehouse_id', opts.warehouseId);

  const { data } = await q;
  return ((data as Array<Omit<LedgerRow, 'warehouse_code' | 'warehouse_name_en'> & {
    warehouse: { code: string; name_en: string };
  }> | null) || []).map(r => ({
    id: r.id,
    ts: r.ts,
    type: r.type,
    qty_delta: Number(r.qty_delta),
    unit_cost_egp: Number(r.unit_cost_egp),
    batch_no: r.batch_no,
    warehouse_code: r.warehouse.code,
    warehouse_name_en: r.warehouse.name_en,
    doc_type: r.doc_type,
    doc_id: r.doc_id,
    ref_reservation_id: r.ref_reservation_id,
    ref_task_id: r.ref_task_id,
    created_by_user: r.created_by_user,
    note: r.note,
  }));
}

export const TX_TYPE_LABEL: Record<string, { en: string; tone: string; sign: '+' | '−' | '±' }> = {
  receipt:           { en: 'Receipt',          tone: 'bg-emerald-50 text-emerald-700', sign: '+' },
  issue:             { en: 'Issue',            tone: 'bg-rose-50 text-rose-700',       sign: '−' },
  transfer_in:       { en: 'Transfer in',      tone: 'bg-emerald-50 text-emerald-700', sign: '+' },
  transfer_out:      { en: 'Transfer out',     tone: 'bg-amber-50 text-amber-700',     sign: '−' },
  adjustment:        { en: 'Adjustment',       tone: 'bg-violet-50 text-violet-700',   sign: '±' },
  reservation_hold:  { en: 'Auto-issue',       tone: 'bg-cyan-50 text-cyan-700',       sign: '−' },
  count_adjust:      { en: 'Count variance',   tone: 'bg-violet-50 text-violet-700',   sign: '±' },
};
