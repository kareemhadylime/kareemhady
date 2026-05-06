import { describe, it, expect } from 'vitest';
import { buildPortfolio } from './portfolio';

const isIntegration = !!process.env.FMPLUS_BUDGET_INTEGRATION;

describe.skipIf(!isIntegration)('buildPortfolio (integration)', () => {
  it('returns array', async () => {
    const cards = await buildPortfolio();
    expect(Array.isArray(cards)).toBe(true);
  });

  it('cards have required fields', async () => {
    const cards = await buildPortfolio();
    for (const c of cards) {
      expect(typeof c.contract_id).toBe('number');
      expect(typeof c.project_name).toBe('string');
      expect(['green','amber','red']).toContain(c.health);
      expect(['draft','published']).toContain(c.current_year_status);
    }
  });
});

describe('buildPortfolio (unit gate)', () => {
  it('test file loads', () => {
    expect(true).toBe(true);
  });
});
