// Shared types + label constants for the Housekeeping Estimator (Phase M.15).
// Lives in its own file (no `server-only` import) so client components can
// pull types/constants without dragging in the supabase admin client.
// Server-side queries live in ./estimator.ts (M.15.3).
//
// Mirrors the warehouses-shared / rules-shared split pattern enforced
// during M.3 + M.11 build hotfixes.

// ---------------------------------------------------------------
// Unit configurations (Q1/Q2/Q3 — bedrooms × bathrooms × tier)
// ---------------------------------------------------------------

export type UnitConfigTier = 'standard' | 'premium' | 'vip';

export const TIER_LABEL: Record<UnitConfigTier, { en: string; ar: string }> = {
  standard: { en: 'Standard', ar: 'قياسي' },
  premium:  { en: 'Premium',  ar: 'مميز' },
  vip:      { en: 'VIP',      ar: 'كبار النزلاء' },
};

export type UnitConfiguration = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  bedrooms: number;
  bathrooms: number;       // 0.5 step granularity
  guest_capacity: number;
  tier: UnitConfigTier;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ListingUnitConfigAssignment = {
  listing_id: string;
  unit_config_id: string | null;
  source: 'auto' | 'manual';
  detected_bedrooms: number | null;
  detected_bathrooms: number | null;
  needs_review: boolean;
  updated_at: string;
};

// ---------------------------------------------------------------
// Consumption rules (extended in 0052b with new scope + formulas)
// ---------------------------------------------------------------

export type RuleScope = 'global' | 'building' | 'listing' | 'category' | 'unit_config';

export type FormulaKind =
  | 'per_guest_per_night'
  | 'per_night'
  | 'per_checkin'
  | 'per_2_guests_per_night'
  | 'fixed_per_stay'
  // M.15.1 new
  | 'per_bedroom_per_checkin'
  | 'per_bathroom_per_checkin'
  | 'per_guest_per_checkin'
  | 'fractional_per_checkin';

export const FORMULA_KIND_LABEL: Record<FormulaKind, string> = {
  per_guest_per_night: 'Per guest per night',
  per_night: 'Per night',
  per_checkin: 'Per check-in',
  per_2_guests_per_night: 'Per 2 guests per night',
  fixed_per_stay: 'Fixed per stay',
  per_bedroom_per_checkin: 'Per bedroom per check-in',
  per_bathroom_per_checkin: 'Per bathroom per check-in',
  per_guest_per_checkin: 'Per guest per check-in',
  fractional_per_checkin: 'Fractional per check-in (shared chemicals)',
};

export const SCOPE_LABEL: Record<RuleScope, string> = {
  global: 'Global (all reservations)',
  building: 'Building',
  listing: 'Listing',
  category: 'Item category',
  unit_config: 'Unit configuration',
};

export type ConsumptionRule = {
  id: string;
  scope: RuleScope;
  scope_value: string | null;     // building_code / listing_id / category_id / unit_config_id
  item_id: string;
  formula_kind: FormulaKind;
  qty: number;
  loss_factor_pct: number;
  active: boolean;
  notes: string | null;
  created_by_user: string | null;
  created_at: string;
};

// ---------------------------------------------------------------
// Per-listing override layer (Q11)
// ---------------------------------------------------------------

export type ListingOverride = {
  id: string;
  listing_id: string;
  item_id: string;
  qty_override: number;
  reason: string | null;
  active: boolean;
  created_by_user: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------
// Amazon EG sourcing (Q4)
// ---------------------------------------------------------------

export type AmazonEgStatus = 'ok' | 'oos' | '404' | 'price_changed' | 'unchecked' | 'rate_limited';

export const AMAZON_STATUS_LABEL: Record<AmazonEgStatus, { en: string; tone: 'ok' | 'warn' | 'err' | 'neutral' }> = {
  ok:             { en: 'In stock',        tone: 'ok' },
  oos:            { en: 'Out of stock',    tone: 'warn' },
  '404':          { en: 'URL dead (404)',  tone: 'err' },
  price_changed:  { en: 'Price changed',   tone: 'warn' },
  unchecked:      { en: 'Not yet checked', tone: 'neutral' },
  rate_limited:   { en: 'Rate-limited',    tone: 'warn' },
};

export type AmazonEgCandidate = {
  title: string;
  url: string;             // Must match /^https:\/\/www\.amazon\.eg\/(dp|gp\/product)\/[A-Z0-9]{10}/
  price_egp: number;
  rating: number;          // 0..5
  review_count: number;
  pack_size: number;       // 1 = single, ≥2 = bulk pack
  image_url: string | null;
  in_stock: boolean;
  score?: number;          // populated by scoring step
};

export const AMAZON_EG_URL_PATTERN = /^https:\/\/www\.amazon\.eg\/(dp|gp\/product)\/[A-Z0-9]{10}/;

/** Score formula per workflow §5: prefer high rating + many reviews + bulk pack + in-stock, penalise high per-unit price. */
export function scoreAmazonCandidate(c: AmazonEgCandidate): number {
  const ppu = c.pack_size > 0 ? c.price_egp / c.pack_size : c.price_egp;
  return (c.rating * 20)
    + (Math.log10(Math.max(1, c.review_count)) * 5)
    - (ppu * 0.1)
    + (c.pack_size > 1 ? 10 : 0)
    + (c.in_stock ? 5 : -50);
}

// ---------------------------------------------------------------
// Estimator output (the per-checkin shopping list)
// ---------------------------------------------------------------

export type EstimatorCategoryGroup = 'cleaning' | 'sanitary' | 'tray' | 'linen' | 'branded' | 'misc';

export const ESTIMATOR_GROUP_LABEL: Record<EstimatorCategoryGroup, { en: string; ar: string; emoji: string }> = {
  cleaning: { en: 'Cleaning & Sanitization', ar: 'تنظيف وتعقيم',          emoji: '🧹' },
  sanitary: { en: 'Sanitary Amenities',      ar: 'مستلزمات صحية',         emoji: '🧴' },
  tray:     { en: 'Tray Amenities',          ar: 'صينية الترحيب',         emoji: '🍵' },
  linen:    { en: 'Linen & Disposables',     ar: 'مفروشات ومستلزمات',    emoji: '🛏️' },
  branded:  { en: 'Beit Hady Branded',       ar: 'مطبوعات بيت هادي',      emoji: '🎨' },
  misc:     { en: 'Misc',                    ar: 'متفرقات',               emoji: '🧺' },
};

/** Map the existing _categories.code → which estimator group it belongs to. */
export function categoryToGroup(categoryCode: string): EstimatorCategoryGroup {
  switch (categoryCode) {
    case 'chemicals':    return 'cleaning';
    case 'sanitary':     return 'sanitary';
    case 'fnb':          return 'tray';
    case 'welcome_tray': return 'tray';
    case 'linen':        return 'linen';
    case 'consumables':  return 'linen';   // trash bags, slippers
    case 'branded':      return 'branded';
    default:             return 'misc';
  }
}

export type EstimatorLine = {
  item_id: string;
  item_sku: string;
  item_name_en: string;
  item_name_ar: string;
  category_code: string;
  group: EstimatorCategoryGroup;
  uom: string;
  formula_kind: FormulaKind;
  base_qty: number;            // qty from the rule (per-bathroom, per-guest, etc.)
  computed_qty: number;        // base_qty × multiplier (bathrooms / bedrooms / guests / 1)
  loss_factor_pct: number;
  effective_qty: number;       // computed_qty × (1 + loss_factor)
  unit_cost_egp: number;       // amazon_eg_price / pack_size, OR default_cost_egp
  line_total_egp: number;      // effective_qty × unit_cost_egp
  amazon_eg_url: string | null;
  amazon_eg_image_url: string | null;
  amazon_eg_status: AmazonEgStatus | null;
  rule_scope: RuleScope;       // global / unit_config / listing — for "where did this rule come from" hint
  has_listing_override: boolean;
  ai_info_summary_en: string | null;  // M.16 — short LLM-generated summary for hover tooltip
  unit_cost_is_estimate: boolean;     // M.16 — true when unit_cost_egp came from default_cost_egp seed (no live Amazon price)
};

export type EstimatorOutput = {
  unit_config: UnitConfiguration;
  listing_id: string | null;       // when scoped to a specific listing (override layer applied)
  lines: EstimatorLine[];
  totals_by_group: Record<EstimatorCategoryGroup, number>;
  total_per_checkin_egp: number;
  total_per_guest_egp: number;     // total / guest_capacity
  computed_at: string;
};

// ---------------------------------------------------------------
// Cost-impact alert threshold (Q10)
// ---------------------------------------------------------------

export const COST_IMPACT_ALERT_THRESHOLD = 0.20;  // 20pct shift requires confirmation

/** True if the new total deviates from old by >COST_IMPACT_ALERT_THRESHOLD. */
export function shouldAlertOnCostImpact(oldTotal: number, newTotal: number): boolean {
  if (oldTotal <= 0) return newTotal > 0;
  return Math.abs((newTotal - oldTotal) / oldTotal) > COST_IMPACT_ALERT_THRESHOLD;
}

// ---------------------------------------------------------------
// Multiplier resolver — given a formula and a unit_config, returns
// how many "units" of base_qty apply per check-in. Pure function so
// it lives client-side too (used by the cost preview widget).
// ---------------------------------------------------------------

export function formulaMultiplier(
  formula: FormulaKind,
  config: { bedrooms: number; bathrooms: number; guest_capacity: number },
  // Optional reservation-shape inputs (for actual checkin computation)
  reservation?: { guests?: number; nights?: number },
): number {
  const guests  = reservation?.guests  ?? config.guest_capacity;
  const nights  = reservation?.nights  ?? 1;
  switch (formula) {
    case 'per_guest_per_night':       return guests * nights;
    case 'per_night':                 return nights;
    case 'per_checkin':               return 1;
    case 'per_2_guests_per_night':    return Math.ceil(guests / 2) * nights;
    case 'fixed_per_stay':            return 1;
    case 'per_bedroom_per_checkin':   return Math.max(1, config.bedrooms);  // studio counts as 1
    case 'per_bathroom_per_checkin':  return config.bathrooms;
    case 'per_guest_per_checkin':     return guests;
    case 'fractional_per_checkin':    return 1;
    default:                          return 1;
  }
}
