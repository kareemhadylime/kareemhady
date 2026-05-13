import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
