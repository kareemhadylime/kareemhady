import type { ServiceLine, Scenario, BudgetStatus } from './schema';

export type {
  ServiceLine,
  Scenario,
  BudgetStatus,
  Season,
  CalcRule,
  TemplateSchemaJsonT,
  AccountMapJsonT,
} from './schema';

export type VarianceColor = 'green' | 'amber' | 'red';

export type VarianceCell = {
  month: number;          // 1-12
  budget: number;
  actual: number;
  variance: number;
  variance_pct: number | null;
  color: VarianceColor;
};

export type CategoryVariance = {
  category: string;
  cells: VarianceCell[];
  ytd: VarianceCell;
};

export type SegmentVariance = {
  segment_id: number;
  service_line: ServiceLine;
  template_version: number;
  is_stub: boolean;
  categories: CategoryVariance[];
  ytd: VarianceCell;
};

export type BudgetVarianceReport = {
  project_id: number;
  project_name: string;
  fiscal_year: number;
  scenario: Scenario;
  status: BudgetStatus;
  start_month: number;
  segments: SegmentVariance[];
  ytd: VarianceCell;
  health_score_pct: number;       // weighted-avg |variance_pct|
  unmapped_actuals_total: number; // sum of actuals that didn't match any category
};
