import { describe, it, expect } from 'vitest';
import { classifyRow, ClassifiedRow } from './classify';
import type { AolbRawRow } from './parse-aolb';

function row(over: Partial<AolbRawRow>): AolbRawRow {
  return {
    rowIndex: 0, details: null, occurredAt: '2024-02-12', opType: null,
    description: null, debit: 0, credit: 0, balanceAfter: null, dcFlag: null,
    ...over,
  };
}

describe('classifyRow', () => {
  it('routes Buy Invoice to trade', () => {
    const r = classifyRow(row({
      opType: 'Buy Invoice',
      description: 'Buy 100 T M G Holding/L.E./1/Egypt Stock Exchange (inv. 40079967) @44.000',
      debit: 4405.10,
    }));
    expect(r.kind).toBe('trade');
    if (r.kind !== 'trade') throw new Error();
    expect(r.data.side).toBe('buy');
    expect(r.data.qty).toBe(100);
    expect(r.data.price).toBe(44);
    expect(r.data.instrumentKind).toBe('stock');
    expect(r.data.instrumentName).toBe('T M G Holding');
    expect(r.data.netAmount).toBe(4405.10);
    expect(r.data.grossAmount).toBe(4400);
    expect(r.data.feesAmount).toBeCloseTo(5.10, 2);
  });

  it('routes Sell Invoice with negative fees when net < gross', () => {
    const r = classifyRow(row({
      opType: 'Sell Invoice',
      description: 'Sell 75000 Emaar Egypt for Development/L.E./1/Egypt Stock Exchange (inv. 40270963) @6.535',
      credit: 490107.34,
    }));
    expect(r.kind).toBe('trade');
    if (r.kind !== 'trade') throw new Error();
    expect(r.data.side).toBe('sell');
    expect(r.data.netAmount).toBe(490107.34);
    expect(r.data.grossAmount).toBe(6.535 * 75000);
  });

  it('routes ICS to trade with fund kind', () => {
    const r = classifyRow(row({
      opType: 'ICS',
      description: ' Sell 405000 ICS (Makaseb 2nd Edition Fund-NI Capital) @12.38180',
      credit: 5014629,
    }));
    expect(r.kind).toBe('trade');
    if (r.kind !== 'trade') throw new Error();
    expect(r.data.instrumentKind).toBe('fund');
  });

  it('routes Bank Deposit', () => {
    const r = classifyRow(row({ opType: 'Bank Deposit', credit: 14000000 }));
    expect(r.kind).toBe('cash');
    if (r.kind !== 'cash') throw new Error();
    expect(r.data.kind).toBe('deposit');
    expect(r.data.amount).toBe(14000000);
  });

  it('routes With Drawal', () => {
    const r = classifyRow(row({ opType: 'With Drawal', debit: 100000 }));
    expect(r.kind).toBe('cash');
    if (r.kind !== 'cash') throw new Error();
    expect(r.data.kind).toBe('withdrawal');
    expect(r.data.amount).toBe(100000);
  });

  it('routes Cash Transfer with counterparty', () => {
    const r = classifyRow(row({
      opType: 'Cash Transfer',
      description: 'Internet Cash Transfer From Account(18880001)',
      credit: 22600,
    }));
    expect(r.kind).toBe('cash');
    if (r.kind !== 'cash') throw new Error();
    expect(r.data.kind).toBe('transfer_in');
    expect(r.data.counterpartyAccountCode).toBe('001');
    expect(r.data.amount).toBe(22600);
  });

  it('routes CASHDIVIDEND', () => {
    const r = classifyRow(row({ opType: 'CASHDIVIDEND', credit: 63086.31 }));
    expect(r.kind).toBe('dividend');
    if (r.kind !== 'dividend') throw new Error();
    expect(r.data.amount).toBe(63086.31);
  });

  it('routes Daily as platform_daily', () => {
    const r = classifyRow(row({ opType: 'Daily', debit: 350, description: '0' }));
    expect(r.kind).toBe('fee');
    if (r.kind !== 'fee') throw new Error();
    expect(r.data.kind).toBe('platform_daily');
    expect(r.data.amount).toBe(350);
  });

  it('routes Daily with Arabic اكتتاب as ipo_subscription', () => {
    const r = classifyRow(row({
      opType: 'Daily',
      description: 'قيمة خصم قيمة اكتتاب شركة اكت فاينانشال للاستشارات (الطرح الخاص)',
      debit: 5000,
    }));
    expect(r.kind).toBe('fee');
    if (r.kind !== 'fee') throw new Error();
    expect(r.data.kind).toBe('ipo_subscription');
    expect(r.data.amount).toBe(5000);
  });

  it('routes INTEREST on debit balance as charge', () => {
    const r = classifyRow(row({ opType: 'INTEREST', debit: 10161.92 }));
    expect(r.kind).toBe('interest');
    if (r.kind !== 'interest') throw new Error();
    expect(r.data.direction).toBe('charge');
    expect(r.data.amount).toBe(10161.92);
  });

  it('routes BANK PROFIT as credit', () => {
    const r = classifyRow(row({ opType: 'BANK PROFIT', credit: 44798.06 }));
    expect(r.kind).toBe('interest');
    if (r.kind !== 'interest') throw new Error();
    expect(r.data.direction).toBe('credit');
  });

  it('routes Correction', () => {
    const r = classifyRow(row({
      opType: 'Correction', debit: 14000000, description: 'Cancel',
    }));
    expect(r.kind).toBe('correction');
  });

  it('returns skipped for unknown / header rows', () => {
    const r = classifyRow(row({ opType: 'Operation Type', description: 'Description' }));
    expect(r.kind).toBe('skipped');
  });
});
