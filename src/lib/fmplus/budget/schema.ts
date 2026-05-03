import { z } from 'zod';

export const ServiceLineSchema = z.enum(['hk','mep','landscape','security','pest_ctrl','waste_mgmt']);
export type ServiceLine = z.infer<typeof ServiceLineSchema>;

export const ScenarioSchema = z.enum(['initial','revised','reforecast']);
export type Scenario = z.infer<typeof ScenarioSchema>;

export const StatusSchema = z.enum(['draft','published']);
export type BudgetStatus = z.infer<typeof StatusSchema>;

export const SeasonSchema = z.enum(['high','low']);
export type Season = z.infer<typeof SeasonSchema>;

export const CalcRuleSchema = z.enum([
  'qty_x_unitcost',
  'total_headcount_x_unitcost',
  'qty_x_unitcost_div_depreciation',
  'flat',
]);
export type CalcRule = z.infer<typeof CalcRuleSchema>;

export const TemplateLineSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
});

export const TemplateCategorySchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  calc: CalcRuleSchema,
  lines: z.array(TemplateLineSchema),
});

export const SeasonMonths = z.object({
  high: z.array(z.number().int().min(1).max(12)),
  low: z.array(z.number().int().min(1).max(12)),
});

export const TemplateSchemaJson = z.object({
  sub_locations_enabled: z.boolean(),
  default_sub_locations: z.array(z.string()),
  season_months: SeasonMonths,
  vat_pct: z.number().min(0).max(100),
  categories: z.array(TemplateCategorySchema),
});
export type TemplateSchemaJsonT = z.infer<typeof TemplateSchemaJson>;

export const AccountMapEntry = z.object({
  category: z.string().min(1),
  code_patterns: z.array(z.string().min(1)),
});
export const AccountMapJson = z.array(AccountMapEntry);
export type AccountMapJsonT = z.infer<typeof AccountMapJson>;

export const BudgetLineRow = z.object({
  id: z.number(),
  segment_id: z.number(),
  sub_location: z.string().nullable(),
  category: z.string(),
  line_code: z.string(),
  season: SeasonSchema,
  qty: z.number(),
  unit_cost: z.number(),
  monthly_cost: z.number(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

export const ProjectBudgetRow = z.object({
  id: z.number(),
  project_id: z.number(),
  fiscal_year: z.number().int(),
  scenario: ScenarioSchema,
  status: StatusSchema,
  start_month: z.number().int().min(1).max(12),
  notes: z.string().nullable(),
  created_by: z.string().nullable(),
  published_at: z.string().nullable(),
  published_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SegmentRow = z.object({
  id: z.number(),
  budget_id: z.number(),
  service_line: ServiceLineSchema,
  template_version: z.number().int(),
});

export const BudgetSettingsRow = z.object({
  id: z.literal(1),
  green_pct: z.number(),
  amber_pct: z.number(),
  default_scenario: ScenarioSchema,
  updated_at: z.string(),
});
