import { describe, it, expect } from 'vitest';
import { cellToMoveLines } from './variance-drill';

const isIntegration = !!process.env.FMPLUS_BUDGET_INTEGRATION;

describe.skipIf(!isIntegration)('cellToMoveLines (integration)', () => {
  it('returns empty for missing contract', async () => {
    const rows = await cellToMoveLines({
      contractId: 999999, yearIndex: 1, serviceLine: 'hk', category: 'manning', month: 1,
    });
    expect(rows).toEqual([]);
  });
});

describe('cellToMoveLines (unit gate)', () => {
  it('module loads', () => {
    expect(typeof cellToMoveLines).toBe('function');
  });
});
