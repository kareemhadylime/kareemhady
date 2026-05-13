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
