import { describe, it, expect } from 'vitest';
import { buildBudgetVarianceV2 } from './variance';

const isIntegration = !!process.env.FMPLUS_BUDGET_INTEGRATION;

describe.skipIf(!isIntegration)('buildBudgetVarianceV2 (integration)', () => {
  it('throws on unknown contract', async () => {
    await expect(buildBudgetVarianceV2({ contractId: 999999, yearIndex: 1 })).rejects.toThrow();
  });
});

describe('buildBudgetVarianceV2 (unit gate)', () => {
  it('module loads', () => {
    expect(typeof buildBudgetVarianceV2).toBe('function');
  });
});
