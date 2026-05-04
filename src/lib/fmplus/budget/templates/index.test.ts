// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import { describe, it, expect } from 'vitest';
import { getTemplate, SERVICE_LINE_CATALOG } from './index';
import { TemplateSchemaJson, AccountMapJson } from '../schema';

describe('templates', () => {
  it('returns HK v1 fully baked', () => {
    const t = getTemplate('hk', 1);
    expect(t.is_stub).toBe(false);
    expect(t.schema_json.categories).toHaveLength(6);
    TemplateSchemaJson.parse(t.schema_json);
    AccountMapJson.parse(t.account_map_json);
    const manning = t.schema_json.categories.find(c => c.code === 'manning')!;
    expect(manning.lines).toHaveLength(15);
  });

  it('returns MEP v1 as a stub', () => {
    const t = getTemplate('mep', 1);
    expect(t.is_stub).toBe(true);
    expect(t.schema_json.categories).toHaveLength(0);
  });

  it('lists all 6 service lines in catalog', () => {
    expect(SERVICE_LINE_CATALOG.map(s => s.code).sort()).toEqual(
      ['hk','landscape','mep','pest_ctrl','security','waste_mgmt'],
    );
  });

  it('catalog marks HK as ready and others as stub', () => {
    const hk = SERVICE_LINE_CATALOG.find(s => s.code === 'hk')!;
    expect(hk.template_status).toBe('ready');
    for (const c of SERVICE_LINE_CATALOG.filter(s => s.code !== 'hk')) {
      expect(c.template_status).toBe('stub');
    }
  });

  it('throws on unknown service line / version', () => {
    // @ts-expect-error invalid service line
    expect(() => getTemplate('finance', 1)).toThrow();
    expect(() => getTemplate('hk', 99)).toThrow();
  });
});
