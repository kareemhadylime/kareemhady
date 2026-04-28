// Shared types + label constants for consumption rules. Lives in its
// own file (no `server-only` import) so client components can pull
// types/constants without dragging in supabaseAdmin. Server-side
// queries live in ./rules.ts.

export type RuleScope = 'global' | 'building' | 'listing' | 'category';

export type FormulaKind =
  | 'per_guest_per_night'
  | 'per_night'
  | 'per_checkin'
  | 'per_2_guests_per_night'
  | 'fixed_per_stay';

export const FORMULA_KIND_LABEL: Record<FormulaKind, string> = {
  per_guest_per_night: 'Per guest per night',
  per_night: 'Per night',
  per_checkin: 'Per check-in (one-time)',
  per_2_guests_per_night: 'Per 2 guests per night',
  fixed_per_stay: 'Fixed per stay',
};

export const SCOPE_LABEL: Record<RuleScope, string> = {
  global: 'Global (all reservations)',
  building: 'Building',
  listing: 'Listing',
  category: 'Item category',
};

export type ConsumptionRule = {
  id: string;
  scope: RuleScope;
  scope_value: string | null;
  item_id: string;
  formula_kind: FormulaKind;
  qty: number;
  loss_factor_pct: number;
  active: boolean;
  notes: string | null;
  created_by_user: string | null;
  created_at: string;
};

export type ConsumptionRuleListRow = ConsumptionRule & {
  item_sku: string;
  item_name_en: string;
  item_uom: string;
};

export type CostSample = {
  reservation: { guests: number; nights: number; building_code: string | null; listing_id: string | null };
  lines: Array<{
    item_id: string;
    item_sku: string;
    item_name_en: string;
    qty: number;
    unit_cost_egp: number;
    line_cost_egp: number;
    rule_scope: RuleScope;
    formula_kind: FormulaKind;
  }>;
  total_egp: number;
};

