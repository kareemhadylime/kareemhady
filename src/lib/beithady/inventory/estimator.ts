import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import {
  formulaMultiplier,
  categoryToGroup,
  type UnitConfiguration,
  type FormulaKind,
  type EstimatorOutput,
  type EstimatorLine,
  type EstimatorCategoryGroup,
  type RuleScope,
} from './estimator-shared';

// Server-side queries powering the Housekeeping Estimator (Phase M.15).
// Pure data fetch + cost computation — no UI here.

// ---------------------------------------------------------------
// Unit configurations
// ---------------------------------------------------------------

export async function listUnitConfigurations(opts: { activeOnly?: boolean } = {}): Promise<UnitConfiguration[]> {
  const sb = supabaseAdmin();
  let q = sb.from('beithady_inventory_unit_configurations')
    .select('*')
    .order('bedrooms', { ascending: true })
    .order('bathrooms', { ascending: true });
  if (opts.activeOnly !== false) q = q.eq('active', true);
  const { data } = await q;
  return (data as UnitConfiguration[] | null) || [];
}

export async function getUnitConfiguration(id: string): Promise<UnitConfiguration | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_inventory_unit_configurations')
    .select('*').eq('id', id).maybeSingle();
  return (data as UnitConfiguration | null) || null;
}

export async function getUnitConfigurationByCode(code: string): Promise<UnitConfiguration | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_inventory_unit_configurations')
    .select('*').eq('code', code).maybeSingle();
  return (data as UnitConfiguration | null) || null;
}

// Count of listings currently mapped to each unit_config — used by the
// matrix to show "12 listings using this config".
export async function countListingsPerConfig(): Promise<Record<string, number>> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_inventory_listing_unit_config')
    .select('unit_config_id');
  const counts: Record<string, number> = {};
  for (const r of (data as Array<{ unit_config_id: string | null }> | null) || []) {
    if (!r.unit_config_id) continue;
    counts[r.unit_config_id] = (counts[r.unit_config_id] || 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------
// Estimator output computation — the heart of M.15
// ---------------------------------------------------------------
// Resolves the most-specific applicable rule per item:
//   listing > unit_config > category > building > global
// then computes qty × unit_cost per line and groups by category.

type RawItem = {
  id: string;
  sku: string;
  name_en: string;
  name_ar: string;
  category_id: string;
  uom: string;
  default_cost_egp: number | string;
  amazon_eg_price_egp: number | string | null;
  amazon_eg_pack_size: number | null;
  amazon_eg_url: string | null;
  amazon_eg_image_url: string | null;
  amazon_eg_last_status: string | null;
  active: boolean;
};

type RawCategory = {
  id: string;
  code: string;
};

type RawRule = {
  id: string;
  scope: RuleScope;
  scope_value: string | null;
  item_id: string;
  formula_kind: FormulaKind;
  qty: number | string;
  loss_factor_pct: number | string;
  active: boolean;
};

type RawOverride = {
  id: string;
  listing_id: string;
  item_id: string;
  qty_override: number | string;
};

/**
 * Compute the estimator output for a unit_config (optionally scoped to a
 * specific listing if you want per-listing overrides applied).
 */
export async function computeEstimatorOutput(
  unitConfigId: string,
  listingId?: string,
): Promise<EstimatorOutput | null> {
  const sb = supabaseAdmin();

  // 1. Unit config
  const config = await getUnitConfiguration(unitConfigId);
  if (!config) return null;

  // 2. All active items + their categories
  const [itemsRes, catsRes, rulesRes] = await Promise.all([
    sb.from('beithady_inventory_items')
      .select('id, sku, name_en, name_ar, category_id, uom, default_cost_egp, amazon_eg_price_egp, amazon_eg_pack_size, amazon_eg_url, amazon_eg_image_url, amazon_eg_last_status, active')
      .eq('active', true),
    sb.from('beithady_inventory_categories')
      .select('id, code'),
    sb.from('beithady_inventory_consumption_rules')
      .select('id, scope, scope_value, item_id, formula_kind, qty, loss_factor_pct, active')
      .eq('active', true),
  ]);

  const items = (itemsRes.data as RawItem[] | null) || [];
  const cats = (catsRes.data as RawCategory[] | null) || [];
  const rules = (rulesRes.data as RawRule[] | null) || [];

  // 3. Per-listing overrides (if a listing is given)
  let overridesById = new Map<string, RawOverride>();
  let listingBuilding: string | null = null;
  if (listingId) {
    const [ovRes, listingRes] = await Promise.all([
      sb.from('beithady_inventory_listing_overrides')
        .select('id, listing_id, item_id, qty_override')
        .eq('listing_id', listingId)
        .eq('active', true),
      sb.from('guesty_listings').select('building_code').eq('id', listingId).maybeSingle(),
    ]);
    for (const o of (ovRes.data as RawOverride[] | null) || []) {
      overridesById.set(o.item_id, o);
    }
    listingBuilding = (listingRes.data as { building_code: string | null } | null)?.building_code || null;
  }

  const catById = new Map(cats.map(c => [c.id, c.code]));

  // 4. For each item, resolve the most-specific rule that applies.
  //    Specificity ladder: listing > unit_config > category > building > global
  const lines: EstimatorLine[] = [];
  for (const it of items) {
    const catCode = catById.get(it.category_id) || '';
    const group = categoryToGroup(catCode);

    // Filter rules applicable to this item
    const itemRules = rules.filter(r => r.item_id === it.id);
    if (itemRules.length === 0) continue;

    // Pick the most-specific one
    const rulePicked = pickMostSpecificRule(itemRules, {
      unitConfigId,
      categoryId: it.category_id,
      buildingCode: listingBuilding,
      listingId: listingId || null,
    });
    if (!rulePicked) continue;

    const baseQty = Number(rulePicked.qty);
    const lossFactor = Number(rulePicked.loss_factor_pct) / 100;
    const multiplier = formulaMultiplier(rulePicked.formula_kind, {
      bedrooms: config.bedrooms,
      bathrooms: config.bathrooms,
      guest_capacity: config.guest_capacity,
    });

    const computedQty = baseQty * multiplier;

    // Apply per-listing override if present (Q11)
    const override = overridesById.get(it.id);
    const finalQty = override ? Number(override.qty_override) : computedQty;
    const effectiveQty = finalQty * (1 + lossFactor);

    // Unit cost: prefer Amazon-sourced price-per-pack-unit, fall back to default_cost_egp
    let unitCost = Number(it.default_cost_egp || 0);
    if (it.amazon_eg_price_egp != null && it.amazon_eg_pack_size && it.amazon_eg_pack_size > 0) {
      unitCost = Number(it.amazon_eg_price_egp) / it.amazon_eg_pack_size;
    } else if (it.amazon_eg_price_egp != null) {
      unitCost = Number(it.amazon_eg_price_egp);
    }

    lines.push({
      item_id: it.id,
      item_sku: it.sku,
      item_name_en: it.name_en,
      item_name_ar: it.name_ar,
      category_code: catCode,
      group,
      uom: it.uom,
      formula_kind: rulePicked.formula_kind,
      base_qty: baseQty,
      computed_qty: computedQty,
      loss_factor_pct: Number(rulePicked.loss_factor_pct),
      effective_qty: effectiveQty,
      unit_cost_egp: unitCost,
      line_total_egp: effectiveQty * unitCost,
      amazon_eg_url: it.amazon_eg_url,
      amazon_eg_image_url: it.amazon_eg_image_url,
      amazon_eg_status: (it.amazon_eg_last_status as EstimatorLine['amazon_eg_status']) || null,
      rule_scope: rulePicked.scope,
      has_listing_override: !!override,
    });
  }

  // 5. Sort lines: by group, then by sku
  lines.sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return a.item_sku.localeCompare(b.item_sku);
  });

  // 6. Totals by group + grand total
  const totalsByGroup: Record<EstimatorCategoryGroup, number> = {
    cleaning: 0, sanitary: 0, tray: 0, linen: 0, branded: 0, misc: 0,
  };
  let total = 0;
  for (const l of lines) {
    totalsByGroup[l.group] += l.line_total_egp;
    total += l.line_total_egp;
  }

  return {
    unit_config: config,
    listing_id: listingId || null,
    lines,
    totals_by_group: totalsByGroup,
    total_per_checkin_egp: total,
    total_per_guest_egp: config.guest_capacity > 0 ? total / config.guest_capacity : 0,
    computed_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------
// Per-config quick total (for the matrix landing page) — same compute
// but lighter (no per-listing overrides, no Amazon image URL).
// ---------------------------------------------------------------

export type UnitConfigSummary = {
  config: UnitConfiguration;
  total_per_checkin_egp: number;
  line_count: number;
  listing_count: number;
};

export async function listUnitConfigSummaries(): Promise<UnitConfigSummary[]> {
  const configs = await listUnitConfigurations();
  const counts = await countListingsPerConfig();
  const out: UnitConfigSummary[] = [];
  for (const c of configs) {
    const o = await computeEstimatorOutput(c.id);
    out.push({
      config: c,
      total_per_checkin_egp: o?.total_per_checkin_egp || 0,
      line_count: o?.lines.length || 0,
      listing_count: counts[c.id] || 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------
// Rule picker — "most specific wins" per the resolver ladder
// ---------------------------------------------------------------

function pickMostSpecificRule(
  rules: RawRule[],
  ctx: {
    unitConfigId: string;
    categoryId: string;
    buildingCode: string | null;
    listingId: string | null;
  },
): RawRule | null {
  // Priority: listing(5) > unit_config(4) > category(3) > building(2) > global(1)
  let best: { rank: number; rule: RawRule } | null = null;
  for (const r of rules) {
    let rank = 0;
    if (r.scope === 'listing' && r.scope_value === ctx.listingId) rank = 5;
    else if (r.scope === 'unit_config' && r.scope_value === ctx.unitConfigId) rank = 4;
    else if (r.scope === 'category' && r.scope_value === ctx.categoryId) rank = 3;
    else if (r.scope === 'building' && r.scope_value === ctx.buildingCode) rank = 2;
    else if (r.scope === 'global' && r.scope_value === null) rank = 1;
    else continue;
    if (!best || rank > best.rank) best = { rank, rule: r };
  }
  return best?.rule || null;
}
