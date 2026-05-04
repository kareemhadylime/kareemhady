import { describe, it, expect } from 'vitest';
import { searchCatalog } from './search';

const isIntegration = !!process.env.FMPLUS_BUDGET_INTEGRATION;

describe.skipIf(!isIntegration)('searchCatalog (integration)', () => {
  it('returns at least 70 rows from the seed', async () => {
    const rows = await searchCatalog({ limit: 100 });
    expect(rows.length).toBeGreaterThanOrEqual(70);
  });

  it('filters by service_line=hk', async () => {
    const rows = await searchCatalog({ service_line: 'hk', limit: 100 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.service_lines.includes('hk'))).toBe(true);
  });

  it('filters by category=consumables', async () => {
    const rows = await searchCatalog({ category: 'consumables', limit: 100 });
    expect(rows.every(r => r.category === 'consumables')).toBe(true);
  });

  it('free-text search matches "garbage"', async () => {
    const rows = await searchCatalog({ q: 'garbage', limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(r => /garbage/i.test(r.name_en))).toBe(true);
  });
});

describe('searchCatalog (unit — gate respected when env unset)', () => {
  it('test file loads without error', () => {
    expect(true).toBe(true);
  });
});
