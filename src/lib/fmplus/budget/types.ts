export type {
  ProjectContract, ProjectService, ProjectYear, ProjectYearService,
  FmplusCatalogItem, ProjectCatalogOverride, BudgetLine, MobilizationLine,
  BudgetSettings, Template,
} from './schema';

export type ServiceLine =
  'hk' | 'mep' | 'landscape' | 'security' | 'pest_ctrl' | 'waste_mgmt' | 'back_office';
export type Category =
  'manning' | 'ppe' | 'tools' | 'consumables' | 'transport' | 'it' | 'governmental' | 'other';
export type Bilingual = 'en' | 'ar';

export type Scenario = 'initial' | 'revised' | 'reforecast';
export type Status = 'draft' | 'published';
export type Season = 'high' | 'low';
export type CatalogUnit = 'each' | 'monthly' | 'annual' | 'per_head' | 'liter' | 'kg' | 'm2' | 'pct_revenue';
export type MobAmort = 'straight_line' | 'flat';

export interface VarianceCell {
  month: number;
  budget: number;
  actual: number;
  mob_amortized: number;
  variance: number;
  variance_pct: number | null;
  color: 'green' | 'amber' | 'red';
}

// v1 backward-compat stubs (remove after Tasks 13-39 replace v1 consumers)
/** @deprecated v1 stub */
export type VarianceColor = 'green' | 'amber' | 'red';
/** @deprecated v1 stub — variance v2 returns a different shape via Task 35 */
export type BudgetVarianceReport = unknown;
/** @deprecated v1 stub */
export type SegmentVariance = unknown;
/** @deprecated v1 stub */
export type CategoryVariance = unknown;
