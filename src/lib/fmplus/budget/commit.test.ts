import { describe, it, expect } from 'vitest';
import { groupRowsBySegment } from './commit';

describe('groupRowsBySegment', () => {
  it('groups flat rows by service_line and computes summary counts', () => {
    const rows = [
      { project: 'AUC', service_line: 'hk', sub_location: 'A',
        category: 'manning', line_code: 'hk_manager', season: 'high' as const,
        qty: 1, unit_cost: 1000, notes: null },
      { project: 'AUC', service_line: 'hk', sub_location: 'A',
        category: 'manning', line_code: 'hk_manager', season: 'low' as const,
        qty: 1, unit_cost: 1000, notes: null },
      { project: 'AUC', service_line: 'mep', sub_location: null,
        category: 'overhead', line_code: 'oh', season: 'high' as const,
        qty: 1, unit_cost: 500, notes: null },
    ];
    const grouped = groupRowsBySegment(rows);
    expect(grouped.size).toBe(2);
    expect(grouped.get('hk')!.length).toBe(2);
    expect(grouped.get('mep')!.length).toBe(1);
  });
});
