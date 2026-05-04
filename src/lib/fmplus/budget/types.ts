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

export interface VarianceCell {
  budget: number;
  actual: number;
  mob_amortized: number;
  variance: number;
  variance_pct: number | null;
  color: 'green' | 'amber' | 'red';
}
