// @ts-nocheck — v1 orphan; superseded by flat-template.test.ts (Task 33)
import { describe, it, expect } from 'vitest';
import { writeFlatBudgetXlsx } from './flat-template-export';
import { parseFlatBudgetXlsx } from './flat-template';

describe('writeFlatBudgetXlsx', () => {
  it('round-trips: write → read produces same rows', async () => {
    const rows = [
      { project: 'AUC', service_line: 'hk', sub_location: 'NC Inner Campus',
        category: 'manning', line_code: 'hk_manager', season: 'high' as const,
        qty: 0.75, unit_cost: 32500, notes: 'shared with Outer' },
      { project: 'AUC', service_line: 'hk', sub_location: null,
        category: 'overhead', line_code: 'mob_overhead', season: 'low' as const,
        qty: 1, unit_cost: 50000, notes: null },
    ];
    const buf = await writeFlatBudgetXlsx(rows);
    expect(Buffer.byteLength(buf)).toBeGreaterThan(0);
    const parsed = await parseFlatBudgetXlsx(buf);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ qty: 0.75, unit_cost: 32500, notes: 'shared with Outer' });
    expect(parsed.rows[1]).toMatchObject({ sub_location: null, season: 'low' });
  });
});
