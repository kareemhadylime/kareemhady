import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type CountSessionStatus = 'open' | 'in_progress' | 'pending_approval' | 'posted' | 'cancelled';
export type CountSessionType = 'cycle' | 'physical';

export const COUNT_STATUS_LABEL: Record<CountSessionStatus, { en: string; tone: string }> = {
  open: { en: 'Open (assigned)', tone: 'bg-slate-100 text-slate-700' },
  in_progress: { en: 'In progress', tone: 'bg-cyan-50 text-cyan-700' },
  pending_approval: { en: 'Pending approval', tone: 'bg-amber-50 text-amber-700' },
  posted: { en: 'Posted', tone: 'bg-emerald-50 text-emerald-700' },
  cancelled: { en: 'Cancelled', tone: 'bg-rose-50 text-rose-700' },
};

export type CountSession = {
  id: string;
  session_no: string;
  type: CountSessionType;
  warehouse_id: string;
  scheduled_for: string | null;
  status: CountSessionStatus;
  variance_total_egp: number;
  approver_user: string | null;
  approved_at: string | null;
  posted_at: string | null;
  notes: string | null;
  created_by_user: string | null;
  cleaner_session_name: string | null;
  created_at: string;
};

export type CountLine = {
  id: string;
  session_id: string;
  item_id: string;
  batch_no: string;
  expected_qty: number;
  counted_qty: number | null;
  variance_qty: number | null;       // generated column
  variance_value_egp: number | null;
  photo_url: string | null;
  note: string | null;
};

export type CountSessionListRow = CountSession & {
  warehouse_code: string;
  warehouse_name: string;
  line_count: number;
  counted_count: number;
};

export type CountSessionDetail = CountSession & {
  warehouse_code: string;
  warehouse_name: string;
  warehouse_building: string | null;
  lines: Array<CountLine & { item_sku: string; item_name_en: string; item_name_ar: string; item_uom: string }>;
};

export async function listCountSessions(opts: { status?: CountSessionStatus | 'all' } = {}): Promise<CountSessionListRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_inventory_count_sessions')
    .select(`
      *,
      warehouse:beithady_inventory_warehouses!inner(code, name_en),
      lines:beithady_inventory_count_lines(id, counted_qty)
    `)
    .order('created_at', { ascending: false })
    .limit(100);
  if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status);

  const { data } = await q;
  return ((data as Array<CountSession & {
    warehouse: { code: string; name_en: string };
    lines: Array<{ id: string; counted_qty: number | null }> | null;
  }> | null) || []).map(s => ({
    ...s,
    warehouse_code: s.warehouse.code,
    warehouse_name: s.warehouse.name_en,
    line_count: (s.lines || []).length,
    counted_count: (s.lines || []).filter(l => l.counted_qty != null).length,
  }));
}

export async function getCountSession(id: string): Promise<CountSessionDetail | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_inventory_count_sessions')
    .select(`
      *,
      warehouse:beithady_inventory_warehouses!inner(code, name_en, building_code),
      lines:beithady_inventory_count_lines(
        id, item_id, batch_no, expected_qty, counted_qty, variance_qty, variance_value_egp, photo_url, note,
        item:beithady_inventory_items!inner(sku, name_en, name_ar, uom)
      )
    `)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;

  type Joined = CountSession & {
    warehouse: { code: string; name_en: string; building_code: string | null };
    lines: Array<CountLine & { item: { sku: string; name_en: string; name_ar: string; uom: string } }>;
  };
  const d = data as Joined;
  const lines = (d.lines || [])
    .sort((a, b) => a.item.sku.localeCompare(b.item.sku))
    .map(l => ({
      ...l,
      session_id: id,
      item_sku: l.item.sku,
      item_name_en: l.item.name_en,
      item_name_ar: l.item.name_ar,
      item_uom: l.item.uom,
    }));

  return {
    ...d,
    warehouse_code: d.warehouse.code,
    warehouse_name: d.warehouse.name_en,
    warehouse_building: d.warehouse.building_code,
    lines,
  };
}

export async function nextCountSessionNo(): Promise<string> {
  const sb = supabaseAdmin();
  const year = new Date().getFullYear();
  const { data } = await sb
    .from('beithady_inventory_count_sessions')
    .select('session_no')
    .ilike('session_no', `CNT-${year}-%`)
    .order('session_no', { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return `CNT-${year}-0001`;
  const last = (data[0] as { session_no: string }).session_no;
  const seq = parseInt(last.split('-')[2] || '0', 10) + 1;
  return `CNT-${year}-${String(seq).padStart(4, '0')}`;
}
