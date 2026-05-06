// src/lib/fmplus/performance/derive-unmapped.test.ts
import { describe, expect, test, vi } from 'vitest';

// Mock getTemplate to return predictable patterns. Patterns live on
// account_map_json (not categories[].code_patterns) — see budget/schema.ts.
vi.mock('@/lib/fmplus/budget/templates', () => ({
  getTemplate: vi.fn().mockReturnValue({
    account_map_json: [
      { category: 'manning', code_patterns: ['^5000[0-9]{2}$'] },
      { category: 'ppe', code_patterns: ['^500011$'] },
    ],
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              lte: () =>
                Promise.resolve({
                  data: [
                    // Matched (manning template) — should NOT appear in result
                    {
                      id: 1,
                      move_id: 100,
                      date: '2026-03-15',
                      name: 'INV-001',
                      debit: 100000,
                      credit: 0,
                      partner_id: 1,
                      account: { code: '500001', name: 'Salaries', account_type: 'expense_direct_cost' },
                      partner: { name: 'PartnerA' },
                    },
                    // Unmapped (no pattern match) — SHOULD appear
                    {
                      id: 2,
                      move_id: 101,
                      date: '2026-03-20',
                      name: 'INV-002',
                      debit: 50000,
                      credit: 0,
                      partner_id: 2,
                      account: { code: '600999', name: 'Misc Expense', account_type: 'expense' },
                      partner: { name: 'PartnerB' },
                    },
                    // Revenue line — should be skipped (account_type doesn't start with 'expense')
                    {
                      id: 3,
                      move_id: 102,
                      date: '2026-03-22',
                      name: 'INV-003',
                      debit: 0,
                      credit: 30000,
                      partner_id: 3,
                      account: { code: '400001', name: 'Service Revenue', account_type: 'income' },
                      partner: { name: 'PartnerC' },
                    },
                    // Zero amount — should be skipped
                    {
                      id: 4,
                      move_id: 103,
                      date: '2026-03-25',
                      name: 'INV-004',
                      debit: 0,
                      credit: 0,
                      partner_id: 4,
                      account: { code: '600999', name: 'Misc', account_type: 'expense' },
                      partner: null,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

const { unmappedLines } = await import('./derive-unmapped');

describe('unmappedLines', () => {
  test('returns only lines with no matching pattern, expense type, and non-zero amount', async () => {
    const r = await unmappedLines({
      contract_id: 5,
      project_id: 33,
      period_from: '2026-03-01',
      period_to: '2026-03-31',
      services: [{ service_line: 'hk' }],
    });
    expect(r).toHaveLength(1);
    expect(r[0].move_line_id).toBe(2);
    expect(r[0].account_code).toBe('600999');
    expect(r[0].amount).toBe(50000);
    expect(r[0].partner_name).toBe('PartnerB');
    expect(r[0].drill_url).toContain('contract=5');
    expect(r[0].drill_url).toContain('move_line=2');
  });

  test('returns empty when no services provided', async () => {
    const r = await unmappedLines({
      contract_id: 5,
      project_id: 33,
      period_from: '2026-03-01',
      period_to: '2026-03-31',
      services: [],
    });
    expect(r).toEqual([]);
  });
});
