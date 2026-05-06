import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type GrnStatus = 'draft' | 'submitted' | 'pending_approval' | 'approved' | 'posted' | 'rejected';

export type GrnRow = {
  id: string;
  grn_no: string;
  status: GrnStatus;
  vendor_id: string;
  po_id: string | null;
  warehouse_id: string;
  received_at: string;
  sub_total_egp: number;
  notes: string | null;
  approver_user: string | null;
  approved_at: string | null;
  posted_at: string | null;
  rejected_reason: string | null;
  created_by_user: string | null;
  created_at: string;
};

export type GrnLine = {
  id: string;
  grn_id: string;
  line_no: number;
  item_id: string;
  qty_received: number;
  qty_rejected: number;
  unit_cost_egp: number;
  batch_no: string;
  expiry_date: string | null;
  qc_photo_url: string | null;
  note: string | null;
  // M.16 (Q6=a) — operator-restated actual delivered pack volume.
  // Null = SKU's stored pack_volume is correct as-is. Set when the
  // vendor sent differently-packaged goods than the catalog expected.
  received_pack_volume_value: number | null;
  received_pack_volume_uom: string | null;
};

export type GrnListRow = GrnRow & {
  vendor_name: string;
  warehouse_code: string;
  warehouse_name: string;
  line_count: number;
};

export type GrnDetail = GrnRow & {
  vendor_name: string;
  vendor_code: string;
  warehouse_code: string;
  warehouse_name: string;
  warehouse_building: string | null;
  lines: Array<GrnLine & { item_sku: string; item_name_en: string; item_name_ar: string; item_uom: string; item_batch_tracked: boolean; item_expiry_tracked: boolean }>;
  required_approvers: string[];
  computed_total_egp: number;
};

export const GRN_STATUS_LABEL: Record<GrnStatus, { en: string; tone: string }> = {
  draft: { en: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  submitted: { en: 'Submitted', tone: 'bg-cyan-50 text-cyan-700' },
  pending_approval: { en: 'Pending approval', tone: 'bg-amber-50 text-amber-700' },
  approved: { en: 'Approved', tone: 'bg-violet-50 text-violet-700' },
  posted: { en: 'Posted', tone: 'bg-emerald-50 text-emerald-700' },
  rejected: { en: 'Rejected', tone: 'bg-rose-50 text-rose-700' },
};

export type GrnFilters = {
  status?: GrnStatus | 'all';
  vendorId?: string;
  warehouseId?: string;
  search?: string;
};

export async function listGrns(filters: GrnFilters = {}): Promise<GrnListRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_inventory_grns')
    .select(`
      *,
      vendor:beithady_inventory_vendors!inner(legal_name, trade_name),
      warehouse:beithady_inventory_warehouses!inner(code, name_en),
      lines:beithady_inventory_grn_lines(id)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.vendorId) q = q.eq('vendor_id', filters.vendorId);
  if (filters.warehouseId) q = q.eq('warehouse_id', filters.warehouseId);
  if (filters.search) {
    const s = filters.search.replace(/[,%]/g, '');
    q = q.or(`grn_no.ilike.%${s}%,notes.ilike.%${s}%`);
  }

  const { data } = await q;
  return ((data as Array<GrnRow & {
    vendor: { legal_name: string; trade_name: string | null };
    warehouse: { code: string; name_en: string };
    lines: Array<{ id: string }> | null;
  }> | null) || []).map(r => ({
    ...r,
    vendor_name: r.vendor.trade_name || r.vendor.legal_name,
    warehouse_code: r.warehouse.code,
    warehouse_name: r.warehouse.name_en,
    line_count: (r.lines || []).length,
  }));
}

export async function getGrn(id: string): Promise<GrnDetail | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_inventory_grns')
    .select(`
      *,
      vendor:beithady_inventory_vendors!inner(code, legal_name, trade_name),
      warehouse:beithady_inventory_warehouses!inner(code, name_en, building_code),
      lines:beithady_inventory_grn_lines(
        id, line_no, item_id, qty_received, qty_rejected, unit_cost_egp,
        batch_no, expiry_date, qc_photo_url, note,
        received_pack_volume_value, received_pack_volume_uom,
        item:beithady_inventory_items!inner(sku, name_en, name_ar, uom, batch_tracked, expiry_tracked)
      )
    `)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;

  type Joined = GrnRow & {
    vendor: { code: string; legal_name: string; trade_name: string | null };
    warehouse: { code: string; name_en: string; building_code: string | null };
    lines: Array<GrnLine & {
      item: { sku: string; name_en: string; name_ar: string; uom: string; batch_tracked: boolean; expiry_tracked: boolean };
    }>;
  };
  const d = data as Joined;
  const lines = (d.lines || []).sort((a, b) => a.line_no - b.line_no).map(l => ({
    ...l,
    grn_id: id,
    item_sku: l.item.sku,
    item_name_en: l.item.name_en,
    item_name_ar: l.item.name_ar,
    item_uom: l.item.uom,
    item_batch_tracked: l.item.batch_tracked,
    item_expiry_tracked: l.item.expiry_tracked,
  }));

  const computed_total = lines.reduce((s, l) => s + (Number(l.qty_received) * Number(l.unit_cost_egp)), 0);

  // Compute required approver roles via RPC
  const { data: approvers } = await sb.rpc('beithady_inv_required_approvers', {
    p_doc_type: 'grn',
    p_sub_total_egp: computed_total,
  });

  return {
    ...d,
    vendor_name: d.vendor.trade_name || d.vendor.legal_name,
    vendor_code: d.vendor.code,
    warehouse_code: d.warehouse.code,
    warehouse_name: d.warehouse.name_en,
    warehouse_building: d.warehouse.building_code,
    lines,
    required_approvers: (approvers as string[] | null) || [],
    computed_total_egp: computed_total,
  };
}

// Generate next GRN number (GRN-YYYY-NNNN). Concurrency-safe via UNIQUE
// constraint on grn_no — caller retries on conflict.
export async function nextGrnNo(): Promise<string> {
  const sb = supabaseAdmin();
  const year = new Date().getFullYear();
  const { data } = await sb
    .from('beithady_inventory_grns')
    .select('grn_no')
    .ilike('grn_no', `GRN-${year}-%`)
    .order('grn_no', { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return `GRN-${year}-0001`;
  const last = (data[0] as { grn_no: string }).grn_no;
  const seq = parseInt(last.split('-')[2] || '0', 10) + 1;
  return `GRN-${year}-${String(seq).padStart(4, '0')}`;
}
