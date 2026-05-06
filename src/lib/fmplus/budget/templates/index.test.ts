import { describe, it, expect } from 'vitest';
import { getTemplate, ALL_SERVICE_LINES } from './index';
import { TemplateSchema } from '../schema';

describe('getTemplate', () => {
  it('returns HK with governmental section appended', () => {
    const t = getTemplate('hk', 1);
    expect(t.service_line).toBe('hk');
    const govCat = t.categories.find(c => c.code === 'governmental');
    expect(govCat).toBeDefined();
    expect(govCat!.lines.length).toBe(3);
    expect(govCat!.lines[0].code).toBe('gov_taminat');
  });

  it('every service line resolves and validates against TemplateSchema', () => {
    for (const sl of ALL_SERVICE_LINES) {
      const t = getTemplate(sl, 1);
      expect(() => TemplateSchema.parse(t)).not.toThrow();
      const govCat = t.categories.find(c => c.code === 'governmental');
      expect(govCat).toBeDefined();
    }
  });

  it('rejects unknown version', () => {
    expect(() => getTemplate('hk', 99)).toThrow(/version/);
  });

  it('Governmental section has bilingual labels', () => {
    const t = getTemplate('back_office', 1);
    const gov = t.categories.find(c => c.code === 'governmental')!;
    expect(gov.label_ar).toBe('المصروفات الحكومية');
    expect(gov.lines.every(l => l.label_ar !== undefined)).toBe(true);
  });
});
