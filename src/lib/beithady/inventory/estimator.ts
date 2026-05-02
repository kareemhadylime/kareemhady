import 'server-only';
import { unstable_cache } from 'next/cache';
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
import { unitsConsumedPerTrigger } from './volumetric';
import { resolveUnitCostEgp } from './unit-cost';

async function resolveMonthlyBookings(
  config: UnitConfiguration,
): Promise<{ value: number; source: 'manual_override' | 'guesty_90d_avg' | 'default_constant' }> {
  if (config.est_monthly_bookings != null && config.est_monthly_bookings >= 0) {
    return { value: Number(config.est_monthly_bookings), source: 'manual_override' };
  }
  const guesty = await guestyAvgFor(config.id);
  if (guesty != null) return { value: guesty, source: 'guesty_90d_avg' };
  return { value: 4, source: 'default_constant' };
}

const guestyAvgFor = unstable_cache(
  async (unitConfigId: string): Promise<number | null> => {
    const sb = supabaseAdmin();
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data } = await sb
      .from('beithady_inventory_listing_unit_config')
      .select('listing_id')
      .eq('unit_config_id', unitConfigId);
    const listingIds = (data || []).map(r => (r as { listing_id: string }).listing_id);
    if (listingIds.length === 0) return null;
    const { count } = await sb
      .from('guesty_reservations')
      .select('id', { count: 'exact', head: true })
      .in('listing_id', listingIds)
      .in('status', ['confirmed', 'checked_out'])
      .gte('check_in_date', cutoff);
    if (count == null) return null;
    return count / 3;
  },
  ['inventory-estimator-monthly-bookings'],
  { revalidate: 3600, tags: ['inventory-estimator-monthly-bookings'] },
);

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
  ai_info: { summary_en?: string | null } | null;
  pack_volume_value: number | string | null;
  pack_volume_uom: string | null;
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
  consumes_volume_value: number | string | null;
  consumes_volume_uom: string | null;
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

  // 2. All active items + their categories + monthly-bookings resolution (parallel)
  const [itemsRes, catsRes, rulesRes, monthlyBookings] = await Promise.all([
    sb.from('beithady_inventory_items')
      .select('id, sku, name_en, name_ar, category_id, uom, default_cost_egp, avg_cost_egp, last_cost_egp, amazon_eg_price_egp, amazon_eg_pack_size, amazon_eg_url, amazon_eg_image_url, amazon_eg_last_status, ai_info, pack_volume_value, pack_volume_uom, active')
      .eq('active', true),
    sb.from('beithady_inventory_categories')
      .select('id, code'),
    sb.from('beithady_inventory_consumption_rules')
      .select('id, scope, scope_value, item_id, formula_kind, qty, loss_factor_pct, active, consumes_volume_value, consumes_volume_uom')
      .eq('active', true),
    resolveMonthlyBookings(config),
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

    const lossFactor = Number(rulePicked.loss_factor_pct) / 100;
    const multiplier = formulaMultiplier(rulePicked.formula_kind, {
      bedrooms: config.bedrooms,
      bathrooms: config.bathrooms,
      guest_capacity: config.guest_capacity,
    });

    // M.16 — volumetric path: when the rule specifies consumes_volume_value
    // (e.g. "100 ml per check-in per bathroom") AND the item has a stored
    // pack_volume_value (e.g. "4 kg pack"), compute units consumed per
    // trigger via UoM conversion. Falls back to legacy raw-qty math when
    // either side is missing or UoMs are incompatible. baseQty becomes the
    // units-per-trigger derived from volumetric math.
    let baseQty = Number(rulePicked.qty);
    const ruleConsumesValue = rulePicked.consumes_volume_value != null
      ? Number(rulePicked.consumes_volume_value) : null;
    const ruleConsumesUom = rulePicked.consumes_volume_uom;
    const itemPackValue = it.pack_volume_value != null ? Number(it.pack_volume_value) : null;
    const itemPackUom = it.pack_volume_uom;
    if (ruleConsumesValue != null && ruleConsumesUom && itemPackValue != null && itemPackUom) {
      const unitsPer = unitsConsumedPerTrigger({
        consumesValue: ruleConsumesValue,
        consumesUom: ruleConsumesUom,
        packVolumeValue: itemPackValue,
        packVolumeUom: itemPackUom,
      });
      if (unitsPer != null) baseQty = unitsPer;
      // If incompatible UoMs (e.g. rule says ml but pack is kg), keep the
      // legacy raw qty — operator should fix the mismatch via the items
      // page banner.
    }

    const computedQty = baseQty * multiplier;

    // Apply per-listing override if present (Q11)
    const override = overridesById.get(it.id);
    const finalQty = override ? Number(override.qty_override) : computedQty;
    const effectiveQty = finalQty * (1 + lossFactor);

    // Unit cost: centralised in resolveUnitCostEgp — preference order is
    // amazon (price/pack_size) → avg → last → default. See unit-cost.ts.
    const { unitCostEgp: unitCost, isEstimate: unitCostIsEstimate } = resolveUnitCostEgp(it);

    // M.17 — Procurement Need: whole packs to buy monthly. Round up.
    const monthlyNeedPacks = Math.ceil(effectiveQty * monthlyBookings.value);

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
      ai_info_summary_en: it.ai_info?.summary_en ?? null,
      unit_cost_is_estimate: unitCostIsEstimate,
      monthly_need_packs: monthlyNeedPacks,
      consumes_volume_value: rulePicked.consumes_volume_value != null ? Number(rulePicked.consumes_volume_value) : null,
      consumes_volume_uom: rulePicked.consumes_volume_uom,
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

  const monthlyNeedTotalPacks = lines.reduce((acc, l) => acc + l.monthly_need_packs, 0);

  return {
    unit_config: config,
    listing_id: listingId || null,
    lines,
    totals_by_group: totalsByGroup,
    total_per_checkin_egp: total,
    total_per_guest_egp: config.guest_capacity > 0 ? total / config.guest_capacity : 0,
    computed_at: new Date().toISOString(),
    monthly_need_total_packs: monthlyNeedTotalPacks,
    est_monthly_bookings_used: monthlyBookings.value,
    est_monthly_bookings_source: monthlyBookings.source,
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
  monthly_need_total_packs: number;
  est_monthly_bookings_source: 'manual_override' | 'guesty_90d_avg' | 'default_constant';
};

export async function listUnitConfigSummaries(): Promise<UnitConfigSummary[]> {
  const [configs, counts] = await Promise.all([
    listUnitConfigurations(),
    countListingsPerConfig(),
  ]);
  // Compute per-config outputs in parallel — each call hits Supabase + the
  // monthly-bookings cache; running them serially in a for-of loop made the
  // matrix landing page do N × (5+ queries) round-trips on cold cache.
  const outputs = await Promise.all(configs.map(c => computeEstimatorOutput(c.id)));
  return configs.map((c, i) => {
    const o = outputs[i];
    return {
      config: c,
      total_per_checkin_egp: o?.total_per_checkin_egp || 0,
      line_count: o?.lines.length || 0,
      listing_count: counts[c.id] || 0,
      monthly_need_total_packs: o?.monthly_need_total_packs || 0,
      est_monthly_bookings_source: o?.est_monthly_bookings_source || 'default_constant',
    };
  });
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
