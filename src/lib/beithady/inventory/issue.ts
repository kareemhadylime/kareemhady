import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  IssueStatus, IssueType, IssueCreatedVia,
  IssueRow, IssueLine, IssueListRow, IssueDetail, IssueFilters,
} from './issue-shared';

// Re-export shared types/constants so existing server-side imports
// (`@/lib/beithady/inventory/issue`) continue to work unchanged.
// Client components MUST import from `./issue-shared` directly to
// avoid pulling `server-only` into the client bundle.
export type {
  IssueStatus, IssueType, IssueCreatedVia,
  IssueRow, IssueLine, IssueListRow, IssueDetail, IssueFilters,
} from './issue-shared';
export { ISSUE_TYPE_LABEL, ISSUE_STATUS_LABEL } from './issue-shared';

export async function listIssues(filters: IssueFilters = {}): Promise<IssueListRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_inventory_issues')
    .select(`
      *,
      warehouse:beithady_inventory_warehouses!inner(code, name_en),
      lines:beithady_inventory_issue_lines(id)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.type && filters.type !== 'all') q = q.eq('type', filters.type);
  if (filters.warehouseId) q = q.eq('warehouse_id', filters.warehouseId);
  if (filters.search) {
    const s = filters.search.replace(/[,%]/g, '');
    q = q.or(`issue_no.ilike.%${s}%,notes.ilike.%${s}%,cleaner_session_name.ilike.%${s}%`);
  }

  const { data } = await q;
  return ((data as Array<IssueRow & {
    warehouse: { code: string; name_en: string };
    lines: Array<{ id: string }> | null;
  }> | null) || []).map(r => ({
    ...r,
    warehouse_code: r.warehouse.code,
    warehouse_name: r.warehouse.name_en,
    line_count: (r.lines || []).length,
  }));
}

export async function getIssue(id: string): Promise<IssueDetail | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_inventory_issues')
    .select(`
      *,
      warehouse:beithady_inventory_warehouses!inner(code, name_en, building_code),
      lines:beithady_inventory_issue_lines(
        id, line_no, item_id, qty, batch_no_picked, unit_cost_egp, note,
        item:beithady_inventory_items!inner(sku, name_en, name_ar, uom)
      )
    `)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;

  type Joined = IssueRow & {
    warehouse: { code: string; name_en: string; building_code: string | null };
    lines: Array<IssueLine & { item: { sku: string; name_en: string; name_ar: string; uom: string } }>;
  };
  const d = data as Joined;
  const lines = (d.lines || []).sort((a, b) => a.line_no - b.line_no).map(l => ({
    ...l,
    issue_id: id,
    item_sku: l.item.sku,
    item_name_en: l.item.name_en,
    item_name_ar: l.item.name_ar,
    item_uom: l.item.uom,
  }));

  const computed_total = lines.reduce((s, l) => s + (Number(l.qty) * Number(l.unit_cost_egp || 0)), 0);

  const { data: approvers } = await sb.rpc('beithady_inv_required_approvers', {
    p_doc_type: 'issue',
    p_sub_total_egp: computed_total,
    p_type_value: d.type,
  });

  return {
    ...d,
    warehouse_code: d.warehouse.code,
    warehouse_name: d.warehouse.name_en,
    warehouse_building: d.warehouse.building_code,
    lines,
    required_approvers: (approvers as string[] | null) || [],
    computed_total_egp: computed_total,
  };
}

export async function nextIssueNo(): Promise<string> {
  const sb = supabaseAdmin();
  const year = new Date().getFullYear();
  const { data } = await sb
    .from('beithady_inventory_issues')
    .select('issue_no')
    .ilike('issue_no', `ISS-${year}-%`)
    .order('issue_no', { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return `ISS-${year}-0001`;
  const last = (data[0] as { issue_no: string }).issue_no;
  const seq = parseInt(last.split('-')[2] || '0', 10) + 1;
  return `ISS-${year}-${String(seq).padStart(4, '0')}`;
}

// Consumption rules engine — given a reservation context, compute the
// items + qtys that should be auto-issued.
export type AutoIssueComputation = {
  reservation_id: string;
  building_code: string;
  warehouse_id: string | null;
  lines: Array<{ item_id: string; qty: number; rule_id: string; formula_kind: string }>;
};

export async function computeAutoIssueLines(
  reservation: { id: string; building_code: string | null; listing_id: string; guests: number; nights: number },
): Promise<AutoIssueComputation> {
  const sb = supabaseAdmin();

  // Resolve target warehouse: main warehouse for the reservation's building
  let warehouseId: string | null = null;
  if (reservation.building_code) {
    const { data: wh } = await sb
      .from('beithady_inventory_warehouses')
      .select('id')
      .eq('building_code', reservation.building_code)
      .is('parent_id', null)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1);
    warehouseId = wh && wh.length > 0 ? (wh[0] as { id: string }).id : null;
  }

  // Find applicable rules (most-specific first: listing → building → category-of-item → global)
  const { data: rules } = await sb
    .from('beithady_inventory_consumption_rules')
    .select('id, scope, scope_value, item_id, formula_kind, qty, loss_factor_pct')
    .eq('active', true);

  const all = (rules as Array<{
    id: string; scope: string; scope_value: string | null;
    item_id: string; formula_kind: string; qty: number; loss_factor_pct: number;
  }> | null) || [];

  // Filter by scope match for this reservation
  const matching = all.filter(r => {
    if (r.scope === 'global') return true;
    if (r.scope === 'building' && r.scope_value === reservation.building_code) return true;
    if (r.scope === 'listing' && r.scope_value === reservation.listing_id) return true;
    // 'category' scope handled below (need item join)
    return false;
  });

  // De-dup: keep most-specific rule per item (listing > building > global)
  const specificity: Record<string, number> = { listing: 3, building: 2, category: 1, global: 0 };
  const byItem = new Map<string, typeof all[number]>();
  for (const r of matching) {
    const cur = byItem.get(r.item_id);
    if (!cur || specificity[r.scope] > specificity[cur.scope]) {
      byItem.set(r.item_id, r);
    }
  }

  const lines = Array.from(byItem.values()).map(r => {
    let baseQty = Number(r.qty);
    switch (r.formula_kind) {
      case 'per_guest_per_night': baseQty *= (reservation.guests * reservation.nights); break;
      case 'per_night': baseQty *= reservation.nights; break;
      case 'per_2_guests_per_night': baseQty *= (Math.ceil(reservation.guests / 2) * reservation.nights); break;
      case 'per_checkin': /* base qty as-is */ break;
      case 'fixed_per_stay': /* base qty as-is */ break;
      default: break;
    }
    // Apply loss factor — bump up by the wastage cushion
    const withLoss = baseQty * (1 + (Number(r.loss_factor_pct) / 100));
    return {
      item_id: r.item_id,
      qty: Math.ceil(withLoss * 100) / 100,  // round to 2 decimals up
      rule_id: r.id,
      formula_kind: r.formula_kind,
    };
  });

  return {
    reservation_id: reservation.id,
    building_code: reservation.building_code || 'OTHER',
    warehouse_id: warehouseId,
    lines,
  };
}
