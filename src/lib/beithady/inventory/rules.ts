import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  RuleScope,
  FormulaKind,
  ConsumptionRule,
  ConsumptionRuleListRow,
  CostSample,
} from './rules-shared';

// Re-export shared types/constants so existing server-side imports
// (`@/lib/beithady/inventory/rules`) continue to work unchanged.
// Client components must import from `./rules-shared` directly.
export type {
  RuleScope,
  FormulaKind,
  ConsumptionRule,
  ConsumptionRuleListRow,
  CostSample,
} from './rules-shared';
export { FORMULA_KIND_LABEL, SCOPE_LABEL } from './rules-shared';

export async function listConsumptionRules(opts: { activeOnly?: boolean } = {}): Promise<ConsumptionRuleListRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_inventory_consumption_rules')
    .select(`
      *,
      item:beithady_inventory_items!inner(sku, name_en, uom)
    `)
    .order('scope', { ascending: true })
    .order('scope_value', { ascending: true, nullsFirst: true });
  if (opts.activeOnly) q = q.eq('active', true);

  const { data } = await q;
  type Joined = ConsumptionRule & { item: Array<{ sku: string; name_en: string; uom: string }> | { sku: string; name_en: string; uom: string } };
  return (((data as unknown) as Joined[]) || []).map(r => {
    const item = Array.isArray(r.item) ? r.item[0] : r.item;
    return {
      ...r,
      qty: Number(r.qty),
      loss_factor_pct: Number(r.loss_factor_pct),
      item_sku: item?.sku || '—',
      item_name_en: item?.name_en || '—',
      item_uom: item?.uom || '',
    };
  });
}

// Compute the sample per-checkin cost given current rules + a hypothetical
// reservation profile. Used by the Per-Checkin Cost calculator widget.
// CostSample type is exported via `./rules-shared` (client-safe).
export async function computeCostSample(
  reservation: { guests: number; nights: number; building_code: string | null; listing_id?: string | null },
): Promise<CostSample> {
  const sb = supabaseAdmin();

  // Fetch all active rules + the items they reference
  const { data: rules } = await sb
    .from('beithady_inventory_consumption_rules')
    .select(`
      *,
      item:beithady_inventory_items!inner(sku, name_en, avg_cost_egp, default_cost_egp)
    `)
    .eq('active', true);

  type Row = ConsumptionRule & {
    item: Array<{ sku: string; name_en: string; avg_cost_egp: number; default_cost_egp: number }>
        | { sku: string; name_en: string; avg_cost_egp: number; default_cost_egp: number };
  };
  const all = ((rules as unknown) as Row[] | null) || [];

  // Filter by scope
  const matching = all.filter(r => {
    if (r.scope === 'global') return true;
    if (r.scope === 'building' && r.scope_value === reservation.building_code) return true;
    if (r.scope === 'listing' && r.scope_value === reservation.listing_id) return true;
    return false;
  });

  // Specificity dedup
  const specificity: Record<string, number> = { listing: 3, building: 2, category: 1, global: 0 };
  const byItem = new Map<string, Row>();
  for (const r of matching) {
    const cur = byItem.get(r.item_id);
    if (!cur || specificity[r.scope] > specificity[cur.scope]) byItem.set(r.item_id, r);
  }

  const lines = Array.from(byItem.values()).map(r => {
    const item = Array.isArray(r.item) ? r.item[0] : r.item;
    let qty = Number(r.qty);
    switch (r.formula_kind) {
      case 'per_guest_per_night': qty *= reservation.guests * reservation.nights; break;
      case 'per_night': qty *= reservation.nights; break;
      case 'per_2_guests_per_night': qty *= Math.ceil(reservation.guests / 2) * reservation.nights; break;
      case 'per_checkin':
      case 'fixed_per_stay':
        break;
    }
    qty *= 1 + Number(r.loss_factor_pct) / 100;
    qty = Math.ceil(qty * 100) / 100;
    const unit_cost = Number(item?.avg_cost_egp || 0) || Number(item?.default_cost_egp || 0);
    return {
      item_id: r.item_id,
      item_sku: item?.sku || '—',
      item_name_en: item?.name_en || '—',
      qty,
      unit_cost_egp: unit_cost,
      line_cost_egp: qty * unit_cost,
      rule_scope: r.scope,
      formula_kind: r.formula_kind,
    };
  });

  return {
    reservation: {
      guests: reservation.guests,
      nights: reservation.nights,
      building_code: reservation.building_code || null,
      listing_id: reservation.listing_id || null,
    },
    lines,
    total_egp: lines.reduce((s, l) => s + l.line_cost_egp, 0),
  };
}
