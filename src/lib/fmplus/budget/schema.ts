import { z } from 'zod';

// ---------- Enums ----------
export const ServiceLineEnum  = z.enum(['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office']);
export const YearTrackingEnum = z.enum(['contract','fiscal']);
export const ScenarioEnum     = z.enum(['initial','revised','reforecast']);
export const StatusEnum       = z.enum(['draft','published']);
export const SeasonEnum       = z.enum(['high','low']);
export const CategoryEnum     = z.enum(['manning','ppe','tools','consumables','transport','it','governmental','other']);
export const CatalogUnitEnum  = z.enum(['each','monthly','annual','per_head','liter','kg','m2','pct_revenue']);
export const MobAmortEnum     = z.enum(['straight_line','flat']);

// ---------- Tables ----------
// Insert/update shape only. Server-generated columns (created_by, created_at,
// updated_at, computed duration_months) are NOT validated here. Fetch shapes
// pass through unvalidated; add a *RowSchema variant later if needed.
export const ProjectContractSchema = z.object({
  id: z.number().optional(),
  project_id: z.number(),
  name: z.string().min(1),
  customer: z.string().nullable().optional(),
  start_date: z.string(), // ISO date
  end_date: z.string(),
  contract_value: z.number().nonnegative().default(0),
  vat_pct: z.number().nonnegative().default(14),
  year_tracking: YearTrackingEnum.default('contract'),
  reimbursables: z.array(z.any()).default([]),
  zones: z.array(z.any()).default([]),
  notes: z.string().nullable().optional(),
});
export type ProjectContract = z.infer<typeof ProjectContractSchema>;

export const ProjectServiceSchema = z.object({
  id: z.number().optional(),
  contract_id: z.number(),
  service_line: ServiceLineEnum,
  template_version: z.number().int().nonnegative(),
});
export type ProjectService = z.infer<typeof ProjectServiceSchema>;

export const ProjectYearSchema = z.object({
  id: z.number().optional(),
  contract_id: z.number(),
  year_index: z.number().int().min(1),
  fiscal_year: z.number().int().nullable().optional(),
  start_month: z.number().int().min(1).max(12).default(1),
  scenario: ScenarioEnum.default('initial'),
  status: StatusEnum.default('draft'),
  notes: z.string().nullable().optional(),
});
export type ProjectYear = z.infer<typeof ProjectYearSchema>;

export const ProjectYearServiceSchema = z.object({
  id: z.number().optional(),
  year_id: z.number(),
  service_line: ServiceLineEnum,
  monthly_revenue: z.number().nonnegative().default(0),
  vat_pct: z.number().nonnegative().default(14),
  manpower_ramp: z.record(z.string(), z.number()).default({}),
});
export type ProjectYearService = z.infer<typeof ProjectYearServiceSchema>;

export const FmplusCatalogItemSchema = z.object({
  id: z.number().optional(),
  code: z.string().min(1),
  name_en: z.string().min(1),
  name_ar: z.string().nullable().optional(),
  unit: CatalogUnitEnum,
  default_price: z.number().nonnegative(),
  service_lines: z.array(ServiceLineEnum).default([]),
  category: CategoryEnum,
  tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
});
export type FmplusCatalogItem = z.infer<typeof FmplusCatalogItemSchema>;

export const ProjectCatalogOverrideSchema = z.object({
  id: z.number().optional(),
  contract_id: z.number(),
  catalog_item_id: z.number(),
  unit_cost: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type ProjectCatalogOverride = z.infer<typeof ProjectCatalogOverrideSchema>;

export const BudgetLineSchema = z.object({
  id: z.number().optional(),
  year_id: z.number(),
  service_line: ServiceLineEnum,
  category: CategoryEnum,
  line_code: z.string().min(1),
  catalog_item_id: z.number().nullable().optional(),
  label_en: z.string().min(1),
  label_ar: z.string().nullable().optional(),
  season: SeasonEnum.default('high'),
  qty: z.number().nonnegative().default(0),
  unit_cost: z.number().nonnegative().default(0),
  ctc_net: z.number().nullable().optional(),
  ctc_relievers: z.number().nullable().optional(),
  ctc_ot: z.number().nullable().optional(),
  ctc_training: z.number().nullable().optional(),
  ctc_insurance: z.number().nullable().optional(),
  ctc_medical: z.number().nullable().optional(),
  threshold_green: z.number().nullable().optional(),
  threshold_amber: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type BudgetLine = z.infer<typeof BudgetLineSchema>;

export const MobilizationLineSchema = z.object({
  id: z.number().optional(),
  contract_id: z.number(),
  category: z.enum(['capex','opex_one_time','training','recruitment']),
  label_en: z.string().min(1),
  label_ar: z.string().nullable().optional(),
  qty: z.number().nonnegative().default(1),
  unit_cost: z.number().nonnegative().default(0),
  amortization: MobAmortEnum.default('straight_line'),
  amortization_months: z.number().int().positive().default(24),
  notes: z.string().nullable().optional(),
});
export type MobilizationLine = z.infer<typeof MobilizationLineSchema>;

export const BudgetSettingsSchema = z.object({
  id: z.literal(1).default(1),
  green_pct: z.number().default(5),
  amber_pct: z.number().default(15),
  default_scenario: ScenarioEnum.default('initial'),
  default_inflation_revenue: z.number().default(7.0),
  default_inflation_manpower: z.number().default(10.0),
  default_inflation_other: z.number().default(5.0),
  default_mob_amortization_months: z.number().int().positive().default(24),
  bilingual_default: z.enum(['en','ar']).default('en'),
});
export type BudgetSettings = z.infer<typeof BudgetSettingsSchema>;

// Template JSON shape (code-defined, not in DB)
export const TemplateLineSchema = z.object({
  code: z.string(),
  label_en: z.string(),
  label_ar: z.string().optional(),
  default_qty: z.number().optional(),
  default_unit_cost: z.number().optional(),
});
export const TemplateCategorySchema = z.object({
  code: CategoryEnum,
  label_en: z.string(),
  label_ar: z.string().optional(),
  lines: z.array(TemplateLineSchema).default([]),
});
export const TemplateSchema = z.object({
  service_line: ServiceLineEnum,
  version: z.number().int().nonnegative(),
  vat_pct: z.number().default(14),
  default_seasons: z.object({
    high: z.array(z.number()),
    low: z.array(z.number()),
  }),
  categories: z.array(TemplateCategorySchema),
  account_map_json: z.array(z.object({
    category: CategoryEnum,
    code_patterns: z.array(z.string()),
  })),
});
export type Template = z.infer<typeof TemplateSchema>;

// Template component types
export type TemplateLine = z.infer<typeof TemplateLineSchema>;
export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;

// ---------- v1 backward-compat aliases (remove after Tasks 13-39 replace v1 consumers) ----------
/** @deprecated v1 name — use ServiceLineEnum */
export const ServiceLineSchema = ServiceLineEnum;
/** @deprecated v1 name — use ScenarioEnum */
export const ScenarioSchema = ScenarioEnum;
/** @deprecated v1 name — use StatusEnum */
export const StatusSchema = StatusEnum;
/** @deprecated v1 name — use SeasonEnum */
export const SeasonSchema = SeasonEnum;

// v1 type aliases that downstream files import from schema.ts
/** @deprecated v1 name */
export type Season = z.infer<typeof SeasonEnum>;
/** @deprecated v1 name */
export type Scenario = z.infer<typeof ScenarioEnum>;
/** @deprecated v1 name */
export type Status = z.infer<typeof StatusEnum>;
/** @deprecated v1 name */
export type ServiceLine = z.infer<typeof ServiceLineEnum>;

// v1 stub types so v1 orphans compile. Intentionally `any` — these v1 consumers
// will be deleted/rewritten in Tasks 13-39 and the stubs go with them. Using
// `any` (vs `unknown`) lets the orphan code limp along during the transition
// without TypeScript blocking the build with property-access errors.
/* eslint-disable @typescript-eslint/no-explicit-any */
/** @deprecated v1 stub — remove with v1 consumer cleanup */
export type AccountMapJsonT = any;
/** @deprecated v1 stub — also runtime-valued because v1 test treats it as Zod */
export const AccountMapJson = z.array(z.unknown());
/** @deprecated v1 stub — replaced by `Template` */
export type TemplateSchemaJsonT = any;
/** @deprecated v1 stub — replaced by `TemplateSchema` */
export const TemplateSchemaJson = TemplateSchema;
/** @deprecated v1 stub */
export type VarianceColor = 'green' | 'amber' | 'red';
/** @deprecated v1 stub — variance v2 returns a different shape via Task 35 */
export type BudgetVarianceReport = any;
/** @deprecated v1 stub */
export type SegmentVariance = any;
/** @deprecated v1 stub */
export type CategoryVariance = any;
/* eslint-enable @typescript-eslint/no-explicit-any */
