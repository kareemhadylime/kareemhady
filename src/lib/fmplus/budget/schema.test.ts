import { describe, it, expect } from 'vitest';
import {
  ProjectContractSchema, ProjectYearSchema, ProjectServiceSchema,
  BudgetLineSchema, MobilizationLineSchema, FmplusCatalogItemSchema,
  BudgetSettingsSchema,
  ServiceLineEnum, YearTrackingEnum, ScenarioEnum, StatusEnum, CatalogUnitEnum,
} from './schema';

describe('schema', () => {
  it('parses valid contract', () => {
    const c = ProjectContractSchema.parse({
      id: 1, project_id: 100, name: 'AUC',
      customer: 'AUC', start_date: '2026-01-01', end_date: '2026-12-31',
      contract_value: 42_600_000, vat_pct: 14,
      year_tracking: 'contract', reimbursables: [], zones: [],
    });
    expect(c.name).toBe('AUC');
  });

  it('rejects bad service_line', () => {
    expect(() => ProjectServiceSchema.parse({
      contract_id: 1, service_line: 'bogus', template_version: 1,
    })).toThrow();
  });

  it('parses budget line with CTC breakdown', () => {
    const l = BudgetLineSchema.parse({
      year_id: 1, service_line: 'hk', category: 'manning',
      line_code: 'hk_mf_8h', label_en: 'HK M/F 8H',
      season: 'high', qty: 120, unit_cost: 12840,
      ctc_net: 7500, ctc_relievers: 1250, ctc_ot: 1800,
      ctc_training: 240, ctc_insurance: 1250, ctc_medical: 800,
    });
    expect(l.ctc_net).toBe(7500);
  });

  it('parses pct_revenue catalog unit', () => {
    const c = FmplusCatalogItemSchema.parse({
      code: 'gov_taminat', name_en: 'Contractor Insurance',
      unit: 'pct_revenue', default_price: 1.4,
      service_lines: ['hk'], category: 'governmental', tags: [],
    });
    expect(c.unit).toBe('pct_revenue');
  });

  it('enforces enums', () => {
    expect(ServiceLineEnum.options).toContain('back_office');
    expect(YearTrackingEnum.options).toEqual(['contract', 'fiscal']);
    expect(CatalogUnitEnum.options).toContain('pct_revenue');
  });

  it('rejects BudgetSettings with id != 1', () => {
    expect(() => BudgetSettingsSchema.parse({
      id: 2, green_pct: 5, amber_pct: 15,
      default_scenario: 'initial',
      default_inflation_revenue: 7, default_inflation_manpower: 10,
      default_inflation_other: 5, default_mob_amortization_months: 24,
      bilingual_default: 'en',
    })).toThrow();
  });
});
