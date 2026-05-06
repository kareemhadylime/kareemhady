import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parsePricelist, classifyItem } from './seed-from-pricelist';
import { FmplusCatalogItemSchema } from '../schema';

const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'emaar-pricelist-seed.xlsx');

describe('parsePricelist', () => {
  it('extracts >= 70 catalog rows', async () => {
    const rows = await parsePricelist(FIXTURE);
    expect(rows.length).toBeGreaterThanOrEqual(70);
  });

  it('every row passes Zod', async () => {
    const rows = await parsePricelist(FIXTURE);
    for (const r of rows) {
      const result = FmplusCatalogItemSchema.safeParse(r);
      if (!result.success) {
        throw new Error('Bad row: ' + JSON.stringify(r) + ' -> ' + JSON.stringify(result.error.issues));
      }
    }
  });

  it('uses HK as default service line', async () => {
    const rows = await parsePricelist(FIXTURE);
    expect(rows.every(r => r.service_lines.includes('hk'))).toBe(true);
  });

  it('classifies categories correctly', async () => {
    const rows = await parsePricelist(FIXTURE);
    const cats = new Set(rows.map(r => r.category));
    // Must surface at least these 3
    expect(cats.has('consumables')).toBe(true);
    expect(cats.has('tools')).toBe(true);
    expect(cats.has('ppe')).toBe(true);
  });
});

describe('classifyItem', () => {
  it('garbage bag → consumables', () => {
    expect(classifyItem('Garbage Bags/ small 35*50 Biodegrable').category).toBe('consumables');
  });
  it('bin → tools', () => {
    expect(classifyItem('Garbage Bins 1100 LTR').category).toBe('tools');
  });
  it('gloves → ppe', () => {
    expect(classifyItem('Gloves (S - X - XL)').category).toBe('ppe');
  });
  it('toilet paper → consumables', () => {
    expect(classifyItem('Toilet Paper Roll-150').category).toBe('consumables');
  });
});
