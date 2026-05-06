// src/lib/fmplus/performance/types.ts
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';

export type PeriodChip = 'prev-month' | 'last-3' | 'last-quarter' | 'ytd' | 'last-year' | 'custom';

export interface PeriodRange {
  chip: PeriodChip;
  from: string;          // YYYY-MM-DD inclusive
  to: string;            // YYYY-MM-DD inclusive
  label: string;         // human "Apr 2026" / "Q2 2026" / "Custom range"
  offset?: number;       // for chip='prev-month' — months back from now (1 = last month, 2 = month before, …)
  monthsElapsedInYear?: number;
  monthsTotalInYear?: number;
}

export interface KpiTile {
  id: 'revenue' | 'expense' | 'gp' | 'gp_pct' | 'variance_pct';
  label: string;
  value: number;
  unit: 'EGP' | '%' | 'EGP-M';
  variance_pct: number;            // vs budget
  variance_abs: number;
  status: 'good' | 'warn' | 'bad';
  spark: { date: string; value: number }[];     // last 6 months
  prior_value?: number;
  prior_variance_pct?: number;
}

export interface ServiceLineRow {
  service_line: ServiceLine;
  service_label: string;
  budget: number;
  actual: number;
  variance_abs: number;
  variance_pct: number;
  gp_pct: number;
  gp_pct_budget: number;             // budget GP% per service (revenue − budgeted cost) / revenue
  mix_budget_pct: number;            // service.budget / total_budget across services
  mix_actual_pct: number;            // service.actual / total_actual across services
  prior_month_actual: number | null; // null when no prior month exists in current year
  status: 'good' | 'warn' | 'bad';
  drill_url: string;
}

export interface ManningRow {
  service_line: ServiceLine;
  service_label: string;
  hc_required: number;
  hc_budgeted: number;
  hc_implied: number;          // Expense / weighted avg CTC
  hc_implied_low?: number;     // when CTC spread is large
  hc_implied_high?: number;
  spend_budget: number;
  spend_actual: number;
  spend_variance_pct: number;
  drill_url: string;
}

export interface CategoryRow {
  category: Category;
  category_label: string;
  budget: number;
  actual: number;
  variance_abs: number;
  variance_pct: number;
  pct_of_revenue_budget: number;     // category.budget / period_revenue
  pct_of_revenue_actual: number;     // category.actual / period_revenue
  delta_bps: number;                 // (pct_actual − pct_budget) × 10000
  prior_month_actual: number | null; // null when no prior month exists in current year
  drill_url: string;
}

export interface UnmappedLine {
  move_line_id: number;
  date: string;
  account_code: string;
  account_name: string;
  partner_name: string | null;
  journal: string | null;
  ref: string | null;
  amount: number;
  drill_url: string;
}

export interface VendorRow {
  partner_id: number;
  partner_name: string;
  spend: number;
  pct_of_period: number;
  invoice_count: number;
  drill_url: string;
}

export interface ForecastBlock {
  period_actual: number;
  months_elapsed: number;
  months_total: number;
  projected_year_actual: number;
  budget_year: number;
  variance_pct: number;
  status: 'good' | 'warn' | 'bad';
  caveat: string;              // "Linear projection — does not account for ramp"
}

export interface OvertimeBlock {
  ot_actual: number;
  manning_actual: number;
  ot_pct_actual: number;
  ot_pct_budget: number;
  variance_pct: number;
  status: 'good' | 'warn' | 'bad';
  spark: { date: string; value: number }[];
  drill_url: string;
}

export interface MobilizationRow {
  mob_line_id: number;
  label: string;
  total_cost: number;
  amortized: number;
  remaining: number;
  months_elapsed: number;
  months_total: number;
}

export interface SignoffBlock {
  current_year_status: 'draft' | 'published';
  last_published_at: string | null;
  last_published_by: string | null;
  days_stale: number | null;
}

export interface YoyRow {
  year_id: number;
  year_index: number;
  fiscal_year: number | null;
  scenario: string;
  status: 'draft' | 'published';
  revenue: number;
  expense: number;
  gp: number;
  gp_pct: number;
  variance_pct: number;
  health: 'good' | 'warn' | 'bad';
  drill_url: string;
}

export type ArBucket = 'within_terms' | 'overdue_1_30' | 'overdue_31_60' | 'overdue_61_90' | 'overdue_90_plus';

export interface ArAgingLine {
  move_id: number;
  line_id: number;
  partner_id: number | null;
  partner_name: string;
  invoice_ref: string | null;
  invoice_date: string;
  amount_residual: number;
  currency: string | null;
  days_outstanding: number;
  days_overdue: number;
  bucket: ArBucket;
}

export interface ArBucketTotal {
  bucket: ArBucket;
  count: number;
  amount: number;
}

export interface ArAgingBlock {
  payment_terms_days: number | null;     // mirrored from contract for the panel header
  total_outstanding: number;
  within_terms_amount: number;
  overdue_amount: number;
  overdue_count: number;
  buckets: ArBucketTotal[];              // ordered: within → 90+
  lines: ArAgingLine[];                  // sorted desc by days_outstanding
}

export type PenaltyService = 'hk' | 'mep' | 'landscape' | 'security' | 'pest_ctrl' | 'waste_mgmt' | 'other';
export type PenaltyType = 'shortage' | 'kpi' | 'other';

export interface PenaltyRow {
  service_code: PenaltyService;
  service_label: string;
  penalty_type: PenaltyType;
  amount: number;
  lines: number;
}

export interface PenaltiesBlock {
  total_amount: number;
  total_lines: number;
  rows: PenaltyRow[];
}

export type VoCategory = 'manning' | 'consumables' | 'transport' | 'other';

export interface VoRow {
  category: VoCategory;
  category_label: string;
  amount: number;
  lines: number;
}

export interface VariationOrdersBlock {
  total_amount: number;
  total_lines: number;
  rows: VoRow[];
}

// ─── Cost matrix (Service × Category, like Odoo Income Statement) ──────────────

export interface CostMatrixCell {
  budget: number;
  actual: number;
  variance_pct: number;     // (actual - budget) / budget; 0 when budget = 0
}

export interface CostMatrixServiceRow {
  service_line: ServiceLine;
  service_label: string;
  cells: Partial<Record<Category, CostMatrixCell>>;
  total_budget: number;
  total_actual: number;
}

export interface CostMatrixBlock {
  services: CostMatrixServiceRow[];
  categories: Category[];                          // ordered, only categories with any data
  total_by_category: Partial<Record<Category, { budget: number; actual: number }>>;
  grand_total: { budget: number; actual: number };
}

// ─── 12-month trend (rows = service lines, cols = 12 months of actuals) ───────

export interface MonthlyTrendRow {
  service_line: ServiceLine;
  service_label: string;
  monthly_budget: number;             // uniform monthly budget for this service
  months: { month: number; actual: number; variance_pct: number }[];   // 12 entries
  ytd_actual: number;
  ytd_budget: number;
}

export interface MonthlyTrendBlock {
  rows: MonthlyTrendRow[];
  fiscal_year: number | null;
  year_index: number;
}

export interface VarianceBridgeStep {
  id: 'budget_gp' | 'revenue_delta' | 'manning_delta' | 'materials_delta' | 'transport_delta' | 'other_delta' | 'penalties' | 'variation_orders' | 'reconciliation' | 'actual_gp';
  label: string;
  amount: number;             // signed EGP impact on GP (positive = improves GP)
  is_terminal: boolean;       // true for budget_gp (start) and actual_gp (end) — they're cumulative totals, not deltas
}

export interface VarianceBridgeBlock {
  budget_gp: number;
  actual_gp: number;
  steps: VarianceBridgeStep[];     // includes start, deltas, end
}

export interface Anomaly {
  rule_id: 'manning_over' | 'unmapped_pct' | 'forecast_breach' | 'signoff_stale' | 'vendor_concentration' | 'ar_overdue';
  severity: 'amber' | 'red';
  message: string;
  action_url: string;
}

export interface ContractDashboardPayload {
  meta: {
    contract_id: number;
    contract_name: string;
    customer: string | null;
    period: PeriodRange;
    current_year_index: number;
    current_year_id: number;
    revenue_source: 'odoo_actual' | 'service_revenue' | 'contract_value_fallback' | 'none';
    analytic_account_code: number;          // = project_contracts.project_id (= odoo analytic id)
    contract_start_date: string | null;
    contract_end_date: string | null;
    service_scope: { code: string; label: string }[];   // service lines present in current year
  };
  kpis: KpiTile[];
  service_lines: ServiceLineRow[];
  variance_ranked: ServiceLineRow[];           // same shape, sorted by |variance_pct| desc
  manning: ManningRow[];
  categories: CategoryRow[];
  unmapped: UnmappedLine[];                    // empty array → panel auto-hides
  forecast: ForecastBlock | null;
  vendors: VendorRow[];                        // empty → panel auto-hides
  ar_aging: ArAgingBlock | null;               // null when contract has no AR data at all
  penalties: PenaltiesBlock | null;
  variation_orders: VariationOrdersBlock | null;
  cost_matrix: CostMatrixBlock | null;
  monthly_trend: MonthlyTrendBlock | null;
  variance_bridge: VarianceBridgeBlock | null;
  overtime: OvertimeBlock | null;
  mobilization: MobilizationRow[];             // empty → panel auto-hides
  signoff: SignoffBlock;
  yoy: YoyRow[];
  anomalies: Anomaly[];                        // empty → panel auto-hides
  prior?: Omit<ContractDashboardPayload, 'meta' | 'prior'>;
}

export interface PortfolioContractRow {
  contract_id: number;
  contract_name: string;
  customer: string | null;
  current_year_index: number;
  revenue: number;
  expense: number;
  gp: number;
  gp_pct: number;
  variance_pct: number;
  health: 'good' | 'warn' | 'bad';
  last_actuals_sync: string | null;
  drill_url: string;
}

export interface PortfolioPerformancePayload {
  period: PeriodRange;
  totals: {
    revenue: number;
    expense: number;
    blended_gp_pct: number;
    portfolio_variance_pct: number;
  };
  contracts: PortfolioContractRow[];                // ranked desc by |variance_pct|
  needs_attention: PortfolioContractRow[];          // |variance_pct| > amber threshold
}
