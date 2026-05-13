import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({ from: mockFrom }),
}));

import { parsePartnerLedgerXlsx } from './xlsx-import';

const SUPPLIERS = resolve(__dirname, '__fixtures__/suppliers-2025-12-31.xlsx');
const OWNERS = resolve(__dirname, '__fixtures__/owners-2025-12-31.xlsx');

describe('parsePartnerLedgerXlsx — suppliers fixture', () => {
  it('returns 85 rows with the correct total', async () => {
    const buf = readFileSync(SUPPLIERS);
    const out = await parsePartnerLedgerXlsx(buf);
    expect(out.rows).toHaveLength(85);
    const total = out.rows.reduce((s, r) => s + r.balance, 0);
    expect(Math.round(total * 100) / 100).toBe(-8567422.64);
    expect(out.errors).toHaveLength(0);
  });
  it('strips the header rows (date + Balance label)', async () => {
    const buf = readFileSync(SUPPLIERS);
    const out = await parsePartnerLedgerXlsx(buf);
    expect(out.rows[0].partner_name_raw).toBe('003. AMAN P V C');
    expect(out.rows[0].balance).toBe(-3888);
  });
});

describe('parsePartnerLedgerXlsx — owners fixture', () => {
  it('returns 6 owner rows totaling -2,518,213.03', async () => {
    const buf = readFileSync(OWNERS);
    const out = await parsePartnerLedgerXlsx(buf);
    expect(out.rows).toHaveLength(6);
    const total = out.rows.reduce((s, r) => s + r.balance, 0);
    expect(Math.round(total * 100) / 100).toBe(-2518213.03);
  });
});

import { classifyParsedRows } from './xlsx-import';

describe('classifyParsedRows', () => {
  const directory = [
    { id: 11, name: 'B.Tech' },
    { id: 12, name: 'Amazon' },
    { id: 13, name: 'Adel Fathy IT Industrial' },
  ];
  it('assigns exact matches', () => {
    const out = classifyParsedRows(
      { rows: [{ source_row: 4, partner_name_raw: '020. B.Tech', balance: -1911052.06 }], errors: [], total: -1911052.06 },
      { account_code: '227002', partner_kind: 'supplier', odoo_partners: directory }
    );
    expect(out.rows[0].partner_id).toBe(11);
    expect(out.rows[0].confidence).toBe('exact');
  });
  it('computes variance against an account-level total', () => {
    const out = classifyParsedRows(
      { rows: [{ source_row: 4, partner_name_raw: '020. B.Tech', balance: -100 }], errors: [], total: -100 },
      { account_code: '227002', partner_kind: 'supplier', odoo_partners: directory, account_opening_raw: -200 }
    );
    expect(out.variance).toBe(-100);
  });
});

import { commitClassifiedRows } from './xlsx-import';

describe('commitClassifiedRows', () => {
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();

  beforeEach(() => {
    mockInsert.mockReset().mockResolvedValue({ error: null });
    mockUpdate.mockReset().mockResolvedValue({ error: null });
    mockDelete.mockReset().mockResolvedValue({ error: null });
    mockFrom.mockReset().mockImplementation((t: string) => {
      if (t === 'bh_balance_snapshot_partners') {
        return {
          insert: mockInsert,
          delete: () => ({ eq: () => ({ eq: mockDelete }) }),
        };
      }
      if (t === 'bh_balance_snapshot_accounts')
        return { update: () => ({ eq: () => ({ eq: mockUpdate }) }) };
      throw new Error(`unexpected table: ${t}`);
    });
  });

  it('inserts a synthetic __UNALLOCATED row when variance != 0', async () => {
    await commitClassifiedRows({
      snapshot_id: 'snap-1',
      classified: {
        rows: [
          {
            source_row: 4,
            account_code: '227002',
            partner_kind: 'supplier',
            raw: 'X',
            normalized: 'x',
            balance: -100,
            partner_id: 11,
            matched_name: 'X',
            confidence: 'exact',
            score: 1,
          },
        ],
        errors: [],
        ledger_total: -100,
        account_total: -200,
        variance: -100,
        partner_kind: 'supplier',
        account_code: '227002',
      },
    });
    // 1 real row + 1 synthetic = 2 inserts.
    expect(mockInsert).toHaveBeenCalledTimes(2);

    // Verify the synthetic insert payload's shape (I5 follow-up assertions).
    const syntheticCall = mockInsert.mock.calls[1];
    const syntheticRow = syntheticCall[0][0];
    expect(syntheticRow.partner_kind).toBe('unallocated');
    expect(syntheticRow.is_synthetic).toBe(true);
    expect(syntheticRow.partner_id).toBeNull();
    expect(syntheticRow.partner_name_raw).toBe('__UNALLOCATED_227002');
    expect(syntheticRow.opening_balance).toBe(-100);
    expect(syntheticRow.match_confidence).toBe('synthetic');
    expect(syntheticRow.match_warnings).toEqual([
      'auto-generated to reconcile partner_total vs account_total',
    ]);
  });

  it('does NOT insert a synthetic row when variance is exactly 0', async () => {
    await commitClassifiedRows({
      snapshot_id: 'snap-1',
      classified: {
        rows: [
          {
            source_row: 4,
            account_code: '227002',
            partner_kind: 'supplier',
            raw: 'X',
            normalized: 'x',
            balance: -200,
            partner_id: 11,
            matched_name: 'X',
            confidence: 'exact',
            score: 1,
          },
        ],
        errors: [],
        ledger_total: -200,
        account_total: -200,
        variance: 0,
        partner_kind: 'supplier',
        account_code: '227002',
      },
    });
    // 1 real row, no synthetic = exactly 1 insert.
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('updates the cached partner_total on the account row', async () => {
    await commitClassifiedRows({
      snapshot_id: 'snap-1',
      classified: {
        rows: [
          {
            source_row: 4,
            account_code: '227002',
            partner_kind: 'supplier',
            raw: 'X',
            normalized: 'x',
            balance: -100,
            partner_id: 11,
            matched_name: 'X',
            confidence: 'exact',
            score: 1,
          },
        ],
        errors: [],
        ledger_total: -100,
        account_total: -100,
        variance: 0,
        partner_kind: 'supplier',
        account_code: '227002',
      },
    });
    expect(mockUpdate).toHaveBeenCalled();
  });
});
