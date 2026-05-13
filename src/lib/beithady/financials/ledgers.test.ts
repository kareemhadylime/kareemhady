// src/lib/beithady/financials/ledgers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mockFrom }) }));

import { buildLedgerReport } from './ledgers';

beforeEach(() => mockFrom.mockReset());

describe('buildLedgerReport', () => {
  it('returns rows with opening + delta + current = opening (when no Odoo movement)', async () => {
    mockFrom.mockImplementation((t: string) => {
      if (t === 'bh_balance_snapshots') return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { id: 'snap-1', period_end: '2025-12-31' }, error: null })
                  })
                })
              })
            })
          })
        })
      };
      if (t === 'bh_balance_snapshot_partners') return {
        select: () => ({ eq: () => ({ eq: async () => ({ data: [
          { partner_id: 11, partner_name_raw: '020. B.Tech', opening_balance: -1911052.06, partner_kind: 'supplier', is_synthetic: false, account_code: '227002' },
        ], error: null }) }) }),
      };
      if (t === 'odoo_move_lines') return {
        select: () => ({
          in: () => ({
            in: () => ({
              gt: () => ({
                lte: () => ({
                  eq: () => ({
                    order: () => ({
                      range: async () => ({ data: [], error: null })
                    })
                  })
                })
              })
            })
          })
        }),
      };
      // vitest may probe the mock during initialization with undefined — ignore
      if (t === undefined) return undefined;
      throw new Error(`UNEXPECTED TABLE: ${t}`);
    });
    const out = await buildLedgerReport({
      kind: 'supplier',
      scope: 'consolidated',
      as_of: '2026-05-12',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].opening_balance).toBe(-1911052.06);
    expect(out.rows[0].delta).toBe(0);
    expect(out.rows[0].current_balance).toBe(-1911052.06);
  });
});
