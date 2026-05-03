import { describe, it, expect } from 'vitest';
import {
  ServiceLineSchema,
  ScenarioSchema,
  StatusSchema,
  SeasonSchema,
  TemplateSchemaJson,
  AccountMapEntry,
  BudgetLineRow,
} from './schema';

describe('budget schemas', () => {
  it('accepts the 6 service lines', () => {
    for (const sl of ['hk','mep','landscape','security','pest_ctrl','waste_mgmt'] as const) {
      expect(ServiceLineSchema.parse(sl)).toBe(sl);
    }
    expect(() => ServiceLineSchema.parse('hr')).toThrow();
  });

  it('parses HK template schema_json shape', () => {
    const raw = {
      sub_locations_enabled: true,
      default_sub_locations: ['NC Inner Campus'],
      season_months: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
      vat_pct: 14,
      categories: [
        { code: 'manning', label: 'Manning', calc: 'qty_x_unitcost',
          lines: [{ code: 'hk_manager', label: 'HK Manager' }] },
      ],
    };
    expect(TemplateSchemaJson.parse(raw)).toEqual(raw);
  });

  it('rejects an unknown calc rule', () => {
    expect(() => TemplateSchemaJson.parse({
      sub_locations_enabled: false, default_sub_locations: [],
      season_months: { high: [], low: [] }, vat_pct: 14,
      categories: [{ code: 'x', label: 'X', calc: 'magic', lines: [] }],
    })).toThrow();
  });

  it('parses an account-map entry with regex patterns', () => {
    expect(AccountMapEntry.parse({
      category: 'manning', code_patterns: ['^5000(0[1-9]|1[0-4])$'],
    })).toEqual({ category: 'manning', code_patterns: ['^5000(0[1-9]|1[0-4])$'] });
  });

  it('parses a budget_lines row', () => {
    expect(BudgetLineRow.parse({
      id: 1, segment_id: 1, sub_location: 'NC Inner Campus',
      category: 'manning', line_code: 'hk_manager', season: 'high',
      qty: 0.75, unit_cost: 32500, monthly_cost: 24375, notes: null,
      created_at: '2026-05-03T00:00:00Z',
    })).toMatchObject({ qty: 0.75, monthly_cost: 24375 });
  });
});
