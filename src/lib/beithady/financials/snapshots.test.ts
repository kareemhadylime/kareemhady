// src/lib/beithady/financials/snapshots.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import {
  listSnapshots,
  getSnapshot,
  freezeSnapshot,
  cloneForRefreeze,
} from './snapshots';

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('listSnapshots', () => {
  it('returns rows for a given company_scope', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            then: (cb: (v: { data: unknown[]; error: null }) => void) =>
              cb({ data: [{ id: 's1', period_end: '2025-12-31', status: 'frozen' }], error: null }),
          }),
        }),
      }),
    }));
    const out = await listSnapshots({ scope: 'consolidated' });
    expect(out).toHaveLength(1);
  });
});

describe('freezeSnapshot', () => {
  it('throws when the draft has no account rows', async () => {
    mockFrom.mockImplementation((t: string) => {
      if (t === 'bh_balance_snapshots') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'd1', period_end: '2026-03-31', company_scope: 'consolidated', version: 1, status: 'draft' }, error: null }) }) }) };
      }
      if (t === 'bh_balance_snapshot_accounts') {
        return { select: () => ({ eq: async () => ({ data: [], error: null, count: 0 }) }) };
      }
      throw new Error('unexpected ' + t);
    });
    await expect(freezeSnapshot({ snapshot_id: 'd1', user_id: 'u1' })).rejects.toThrow(
      /no account-level rows/i
    );
  });
});

describe('cloneForRefreeze', () => {
  it('returns the new draft snapshot id with version+1', async () => {
    mockRpc.mockResolvedValueOnce({ data: { new_snapshot_id: 'd2', new_version: 2 }, error: null });
    const out = await cloneForRefreeze({ source_snapshot_id: 's1', user_id: 'u1' });
    expect(out).toEqual({ new_snapshot_id: 'd2', new_version: 2 });
  });
});

describe('getSnapshot', () => {
  it('returns null when not found', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }));
    const out = await getSnapshot('missing');
    expect(out).toBeNull();
  });
});
