/**
 * Type definitions for the FM+ Project Report tab.
 * See spec docs/superpowers/specs/2026-05-05-fmplus-project-report-design.md §7.
 */
import type { ServiceLine, Category } from '../types';
import type { CustomerContact, ProjectYearSignoff } from '../schema';

export type ReportMode = 'pre' | 'signoff' | 'customer' | 'snapshot';
export type ReportLang = 'en' | 'ar' | 'both';

export interface ContractInfo {
  id: number;
  name: string;
  customer: string | null;
  customer_logo_url: string | null;
  customer_contacts: CustomerContact[];
  start_date: string;
  end_date: string;
  duration_months: number;
  contract_value: number;
  vat_pct: number;
  zones: string[];
  scope_summary: string | null;
  payment_terms: string | null;
}

export interface YearInfo {
  id: number;
  contract_id: number;
  year_index: number;
  fiscal_year: number | null;
  scenario: 'initial' | 'revised' | 'reforecast';
  status: 'draft' | 'published';
  start_month: number;
}

export interface ServiceLineSummary {
  service_line: ServiceLine;
  hc_required: number;
  hc_budgeted: number | null;       // null in customer mode
  monthly_cost: number | null;       // null in customer mode
  monthly_fee: number;               // contract_value × cost-share / 12
  annual_ex_vat: number;
  annual_incl_vat: number;
  gp_pct: number | null;             // null in customer mode
  gp_egp: number | null;             // null in customer mode
}

export interface ManningRow {
  service_line: ServiceLine;
  sub_section: string | null;
  position_label_en: string;
  position_label_ar: string | null;
  hc_required: number;
  hc_budgeted: number | null;        // null in customer mode
  ctc_rate: number | null;           // null in customer mode
  monthly_cost: number | null;       // null in customer mode
}

export interface BudgetCellMatrix {
  category: Category;
  service_line: ServiceLine;
  monthly: number;
  annual: number;
  green_amber_red: 'green' | 'amber' | 'red' | null;
}

export interface MobilizationLineDetail {
  category: 'capex' | 'opex_one_time' | 'training' | 'recruitment';
  label_en: string;
  label_ar: string | null;
  qty: number;
  unit_cost: number;
  total: number;
  amortization_months: number;
}

export interface MobilizationSummary {
  /** customer mode: just the total + caption */
  summary_text: string;
  total_egp: number;
}

export interface DeltaCell {
  service_line: ServiceLine;
  category: Category;
  initial_monthly: number;
  current_monthly: number;
  delta_monthly: number;
  delta_pct: number;
  severity: 'normal' | 'warn' | 'high';   // >5% warn, >15% high
}

export interface RollupYearTotals {
  year_index: number;
  fiscal_year: number | null;
  scenario: string;
  total_cost: number;
  total_revenue: number;
  gp_egp: number;
  gp_pct: number;
}

export interface ReportData {
  meta: {
    contract: ContractInfo;
    year: YearInfo;
    mode: ReportMode;
    lang: ReportLang;
    generated_at: string;
    generated_by: string;
  };
  project_details: {
    customer_contacts: CustomerContact[];
    zones: string[];
    scope_summary: string | null;
    services: ServiceLine[];
  };
  service_lines: ServiceLineSummary[];
  manning: {
    rows: ManningRow[];
    totals_by_service: Partial<Record<ServiceLine, { hc_required: number; hc_budgeted: number | null }>>;
  };
  budget_breakdown: {
    cells: BudgetCellMatrix[] | null;       // null in customer mode (page hidden)
    category_totals: { category: Category; monthly: number }[] | null;
    service_totals: { service_line: ServiceLine; monthly: number }[];
  };
  mobilization: { detail: MobilizationLineDetail[] } | MobilizationSummary | null;
  payment_terms: string | null;
  change_vs_initial: { cells: DeltaCell[]; warning: string | null } | null;
  variance_snapshot: { ytd_budget: number; ytd_actual: number; variance_pct: number } | null;
  contract_rollup: { years: RollupYearTotals[]; total_cost: number; total_revenue: number } | null;
  signoff: {
    lines: { role: string; placeholder_en: string; placeholder_ar: string }[];
    history: ProjectYearSignoff[];
  };
}
