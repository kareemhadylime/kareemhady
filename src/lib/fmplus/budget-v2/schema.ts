import { z } from 'zod';

// ===== ENUMS =====

export const ServiceLineSchema = z.enum([
  'hk',
  'mep',
  'landscape',
  'security',
  'pest_ctrl',
  'waste_mgmt',
  'back_office',
] as const);
export type ServiceLine = z.infer<typeof ServiceLineSchema>;

export const YearTrackingSchema = z.enum(['contract', 'fiscal'] as const);
export type YearTracking = z.infer<typeof YearTrackingSchema>;

export const ScenarioSchema = z.enum(['initial', 'revised', 'reforecast'] as const);
export type Scenario = z.infer<typeof ScenarioSchema>;

export const StatusSchema = z.enum(['draft', 'published'] as const);
export type Status = z.infer<typeof StatusSchema>;

export const AmortizationSchema = z.enum(['straight_line', 'flat'] as const);
export type Amortization = z.infer<typeof AmortizationSchema>;

export const CatalogUnitSchema = z.enum([
  'each',
  'monthly',
  'annual',
  'per_head',
  'liter',
  'kg',
  'm2',
  'pct_revenue',
] as const);
export type CatalogUnit = z.infer<typeof CatalogUnitSchema>;

export const SeasonSchema = z.enum(['high', 'low'] as const);
export type Season = z.infer<typeof SeasonSchema>;

// ===== PROJECT_CONTRACTS =====

export const ProjectContractSchema = z.object({
  id: z.bigint().optional(),
  project_id: z.bigint(),
  name: z.string().min(1),
  customer: z.string().nullable(),
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  duration_months: z.number().int().optional(), // generated column
  contract_value: z.number().nonnegative().default(0),
  vat_pct: z.number().min(0).max(100).default(14),
  year_tracking: YearTrackingSchema.default('contract'),
  reimbursables: z.array(z.unknown()).default([]),
  zones: z.array(z.unknown()).default([]),
  notes: z.string().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});
export type ProjectContract = z.infer<typeof ProjectContractSchema>;

export const ProjectContractCreateSchema = ProjectContractSchema.omit({
  id: true,
  duration_months: true,
  created_at: true,
  updated_at: true,
});
export type ProjectContractCreate = z.infer<typeof ProjectContractCreateSchema>;

export const ProjectContractUpdateSchema = ProjectContractCreateSchema.partial();
export type ProjectContractUpdate = z.infer<typeof ProjectContractUpdateSchema>;

// ===== PROJECT_SERVICES =====

export const ProjectServiceSchema = z.object({
  id: z.bigint().optional(),
  contract_id: z.bigint(),
  service_line: ServiceLineSchema,
  template_version: z.number().int().nonnegative(),
});
export type ProjectService = z.infer<typeof ProjectServiceSchema>;

export const ProjectServiceCreateSchema = ProjectServiceSchema.omit({ id: true });
export type ProjectServiceCreate = z.infer<typeof ProjectServiceCreateSchema>;

// ===== PROJECT_YEARS =====

export const ProjectYearSchema = z.object({
  id: z.bigint().optional(),
  contract_id: z.bigint(),
  year_index: z.number().int().positive(),
  fiscal_year: z.number().int().nullable(),
  start_month: z.number().int().min(1).max(12),
  scenario: ScenarioSchema.default('initial'),
  status: StatusSchema.default('draft'),
  published_at: z.coerce.date().nullable(),
  published_by: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});
export type ProjectYear = z.infer<typeof ProjectYearSchema>;

export const ProjectYearCreateSchema = ProjectYearSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type ProjectYearCreate = z.infer<typeof ProjectYearCreateSchema>;

export const ProjectYearUpdateSchema = ProjectYearCreateSchema.partial();
export type ProjectYearUpdate = z.infer<typeof ProjectYearUpdateSchema>;

// ===== PROJECT_YEAR_SERVICES =====

export const ProjectYearServiceSchema = z.object({
  id: z.bigint().optional(),
  year_id: z.bigint(),
  service_line: ServiceLineSchema,
  monthly_revenue: z.number().default(0),
  vat_pct: z.number().min(0).max(100).default(14),
  manpower_ramp: z.record(z.string(), z.unknown()).default({}),
});
export type ProjectYearService = z.infer<typeof ProjectYearServiceSchema>;

export const ProjectYearServiceCreateSchema = ProjectYearServiceSchema.omit({ id: true });
export type ProjectYearServiceCreate = z.infer<typeof ProjectYearServiceCreateSchema>;

export const ProjectYearServiceUpdateSchema = ProjectYearServiceCreateSchema.partial();
export type ProjectYearServiceUpdate = z.infer<typeof ProjectYearServiceUpdateSchema>;

// ===== FMPLUS_CATALOG =====

export const FmplusCatalogSchema = z.object({
  id: z.bigint().optional(),
  code: z.string().min(1).max(50),
  name_en: z.string().min(1),
  name_ar: z.string().nullable(),
  unit: CatalogUnitSchema,
  default_price: z.number().nonnegative(),
  service_lines: z.array(ServiceLineSchema).default([]),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});
export type FmplusCatalog = z.infer<typeof FmplusCatalogSchema>;

export const FmplusCatalogCreateSchema = FmplusCatalogSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type FmplusCatalogCreate = z.infer<typeof FmplusCatalogCreateSchema>;

export const FmplusCatalogUpdateSchema = FmplusCatalogCreateSchema.partial();
export type FmplusCatalogUpdate = z.infer<typeof FmplusCatalogUpdateSchema>;

// ===== PROJECT_CATALOG_OVERRIDES =====

export const ProjectCatalogOverrideSchema = z.object({
  id: z.bigint().optional(),
  contract_id: z.bigint(),
  catalog_item_id: z.bigint(),
  unit_cost: z.number().nullable(),
  notes: z.string().nullable(),
});
export type ProjectCatalogOverride = z.infer<typeof ProjectCatalogOverrideSchema>;

export const ProjectCatalogOverrideCreateSchema = ProjectCatalogOverrideSchema.omit({
  id: true,
});
export type ProjectCatalogOverrideCreate = z.infer<typeof ProjectCatalogOverrideCreateSchema>;

export const ProjectCatalogOverrideUpdateSchema = ProjectCatalogOverrideCreateSchema.partial();
export type ProjectCatalogOverrideUpdate = z.infer<typeof ProjectCatalogOverrideUpdateSchema>;

// ===== BUDGET_LINES =====

export const BudgetLineSchema = z.object({
  id: z.bigint().optional(),
  year_id: z.bigint(),
  service_line: ServiceLineSchema,
  category: z.string().min(1),
  line_code: z.string().min(1),
  catalog_item_id: z.bigint().nullable(),
  label_en: z.string().min(1),
  label_ar: z.string().nullable(),
  season: SeasonSchema.default('high'),
  qty: z.number().nonnegative().default(0),
  unit_cost: z.number().nonnegative().default(0),
  monthly_cost: z.number().optional(), // generated column
  ctc_net: z.number().nullable(),
  ctc_relievers: z.number().nullable(),
  ctc_ot: z.number().nullable(),
  ctc_training: z.number().nullable(),
  ctc_insurance: z.number().nullable(),
  ctc_medical: z.number().nullable(),
  threshold_green: z.number().min(0).max(100).nullable(),
  threshold_amber: z.number().min(0).max(100).nullable(),
  notes: z.string().nullable(),
  created_at: z.coerce.date().optional(),
});
export type BudgetLine = z.infer<typeof BudgetLineSchema>;

export const BudgetLineCreateSchema = BudgetLineSchema.omit({
  id: true,
  monthly_cost: true,
  created_at: true,
});
export type BudgetLineCreate = z.infer<typeof BudgetLineCreateSchema>;

export const BudgetLineUpdateSchema = BudgetLineCreateSchema.partial();
export type BudgetLineUpdate = z.infer<typeof BudgetLineUpdateSchema>;

// ===== MOBILIZATION_LINES =====

export const MobilizationLineSchema = z.object({
  id: z.bigint().optional(),
  contract_id: z.bigint(),
  category: z.string().min(1),
  label_en: z.string().min(1),
  label_ar: z.string().nullable(),
  qty: z.number().nonnegative().default(1),
  unit_cost: z.number().nonnegative().default(0),
  total_cost: z.number().optional(), // generated column
  amortization: AmortizationSchema.default('straight_line'),
  amortization_months: z.number().int().positive().default(24),
  notes: z.string().nullable(),
});
export type MobilizationLine = z.infer<typeof MobilizationLineSchema>;

export const MobilizationLineCreateSchema = MobilizationLineSchema.omit({
  id: true,
  total_cost: true,
});
export type MobilizationLineCreate = z.infer<typeof MobilizationLineCreateSchema>;

export const MobilizationLineUpdateSchema = MobilizationLineCreateSchema.partial();
export type MobilizationLineUpdate = z.infer<typeof MobilizationLineUpdateSchema>;

// ===== BUDGET_AUDIT =====

export const BudgetAuditSchema = z.object({
  id: z.bigint().optional(),
  year_id: z.bigint(),
  changed_at: z.coerce.date().optional(),
  changed_by: z.string().uuid().nullable(),
  diff_json: z.record(z.string(), z.unknown()),
});
export type BudgetAudit = z.infer<typeof BudgetAuditSchema>;

export const BudgetAuditCreateSchema = BudgetAuditSchema.omit({
  id: true,
  changed_at: true,
});
export type BudgetAuditCreate = z.infer<typeof BudgetAuditCreateSchema>;

// ===== BUDGET_SETTINGS =====

export const BudgetSettingsSchema = z.object({
  id: z.literal(1),
  green_pct: z.number().min(0).max(100).default(5),
  amber_pct: z.number().min(0).max(100).default(15),
  default_scenario: ScenarioSchema.default('initial'),
  default_inflation_revenue: z.number().default(7.0),
  default_inflation_manpower: z.number().default(10.0),
  default_inflation_other: z.number().default(5.0),
  default_mob_amortization_months: z.number().int().positive().default(24),
  bilingual_default: z.enum(['en', 'ar']).default('en'),
  updated_at: z.coerce.date().optional(),
});
export type BudgetSettings = z.infer<typeof BudgetSettingsSchema>;

export const BudgetSettingsUpdateSchema = BudgetSettingsSchema.omit({
  id: true,
  updated_at: true,
}).partial();
export type BudgetSettingsUpdate = z.infer<typeof BudgetSettingsUpdateSchema>;

// ===== AGGREGATE / UI TYPES =====

/**
 * Full project graph: contract + years + services + budget lines + mobilization
 */
export const ProjectBudgetGraphSchema = z.object({
  contract: ProjectContractSchema,
  years: z.array(ProjectYearSchema),
  services: z.array(ProjectServiceSchema),
  yearServices: z.array(ProjectYearServiceSchema),
  budgetLines: z.array(BudgetLineSchema),
  mobilizationLines: z.array(MobilizationLineSchema),
});
export type ProjectBudgetGraph = z.infer<typeof ProjectBudgetGraphSchema>;

/**
 * Editor payload: single year''s service budget
 */
export const EditorBudgetSchema = z.object({
  contract: ProjectContractSchema,
  year: ProjectYearSchema,
  service: ServiceLineSchema,
  yearService: ProjectYearServiceSchema.nullable(),
  lines: z.array(BudgetLineSchema),
  catalog: z.array(FmplusCatalogSchema),
  overrides: z.array(ProjectCatalogOverrideSchema),
});
export type EditorBudget = z.infer<typeof EditorBudgetSchema>;

/**
 * "Copy year" / inflation dialog input
 */
export const InflationInputSchema = z.object({
  contract_id: z.bigint(),
  source_year_index: z.number().int().positive(),
  target_year_index: z.number().int().positive(),
  inflation_revenue_pct: z.number().default(7.0),
  inflation_manpower_pct: z.number().default(10.0),
  inflation_other_pct: z.number().default(5.0),
  line_tweaks: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});
export type InflationInput = z.infer<typeof InflationInputSchema>;

/**
 * Catalog search / filter input
 */
export const CatalogSearchInputSchema = z.object({
  query: z.string().optional(),
  service_lines: z.array(ServiceLineSchema).optional(),
  tags: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});
export type CatalogSearchInput = z.infer<typeof CatalogSearchInputSchema>;

/**
 * Portfolio KPI row (for Overview / Project Hub)
 */
export const PortfolioKpiSchema = z.object({
  contract_id: z.bigint(),
  contract_name: z.string(),
  customer: z.string().nullable(),
  year_index: z.number().int().positive(),
  total_revenue: z.number(),
  total_cost: z.number(),
  gross_margin_pct: z.number(),
  status: StatusSchema,
  mobilization_cost: z.number(),
  contract_duration_months: z.number().int(),
  health_status: z.enum(['green', 'amber', 'red']),
});
export type PortfolioKpi = z.infer<typeof PortfolioKpiSchema>;
