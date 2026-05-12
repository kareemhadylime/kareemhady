import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({ from: mockFrom }),
}));

import { loadOpeningBalanceSnapshot } from './load-opening';

beforeEach(() => {
  mockFrom.mockReset();
});

describe('loadOpeningBalanceSnapshot', () => {
  it('returns the latest frozen snapshot accounts for (period_end, scope)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bh_balance_snapshots') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: { id: 'snap-1', period_end: '2025-12-31' },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'bh_balance_snapshot_accounts') {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  account_code: '227002',
                  account_name: 'Suppliers',
                  account_type: 'liability_payable',
                  account_type_override: null,
                  opening_raw: -9081444.65,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await loadOpeningBalanceSnapshot({
      period_end: '2025-12-31',
      scope: 'consolidated',
    });

    expect(result.snapshot_id).toBe('snap-1');
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].opening_raw).toBe(-9081444.65);
  });

  it('returns null snapshot_id when no frozen snapshot exists', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));

    const result = await loadOpeningBalanceSnapshot({
      period_end: '2030-01-01',
      scope: 'consolidated',
    });

    expect(result.snapshot_id).toBeNull();
    expect(result.accounts).toEqual([]);
  });
});
