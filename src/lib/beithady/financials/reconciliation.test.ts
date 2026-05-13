import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mockFrom }) }));

import { buildReconciliation } from './reconciliation';

beforeEach(() => mockFrom.mockReset());

describe('buildReconciliation', () => {
  it('returns one row per account with variance and status', async () => {
    mockFrom.mockImplementation((t: string) => {
      if (t === undefined) return undefined; // ignore vitest mock probe
      if (t === 'bh_balance_snapshot_accounts') return {
        select: () => ({
          eq: async () => ({
            data: [
              {
                account_code: '227002',
                account_name: 'Suppliers',
                opening_raw: -9081444.65,
                partner_total: -8567422.64,
                variance: -514022.01,
                variance_status: 'open',
                variance_notes: null,
              },
              {
                account_code: '122001',
                account_name: 'Customers',
                opening_raw: -796296,
                partner_total: null,
                variance: 0,
                variance_status: 'open',
                variance_notes: null,
              },
            ],
            error: null,
          }),
        }),
      };
      throw new Error(t);
    });
    const out = await buildReconciliation({ snapshot_id: 'snap-1' });
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].variance).toBe(-514022.01);
    expect(out.rows[1].partner_total).toBeNull();
    expect(out.summary.open_variance_count).toBe(1);
    expect(out.summary.total_variance).toBe(-514022.01);
  });
});
