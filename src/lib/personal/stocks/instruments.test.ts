import { describe, it, expect } from 'vitest';
import { slugifyInstrumentName, parseStockDescription, parseFundDescription } from './instruments';

describe('slugifyInstrumentName', () => {
  it('uppercases and replaces non-alphanumeric with underscore', () => {
    expect(slugifyInstrumentName('T M G Holding')).toBe('T_M_G_HOLDING');
    expect(slugifyInstrumentName('Ezz Steel')).toBe('EZZ_STEEL');
    expect(slugifyInstrumentName('Six of October Development & Investment (SODIC)')).toBe('SIX_OF_OCTOBER_DEVELOPMENT_INVESTMENT_SODIC');
  });
  it('collapses runs of underscores', () => {
    expect(slugifyInstrumentName('A   B  C')).toBe('A_B_C');
  });
  it('trims leading/trailing underscores', () => {
    expect(slugifyInstrumentName('  X  ')).toBe('X');
  });
});

describe('parseStockDescription', () => {
  it('extracts side, qty, name, price, invoice', () => {
    const r = parseStockDescription('Buy 100 T M G Holding/L.E./1/Egypt Stock Exchange (inv. 40079967) @44.000');
    expect(r).toEqual({
      side: 'buy',
      qty: 100,
      name: 'T M G Holding',
      invoiceId: '40079967',
      price: 44.000,
    });
  });
  it('handles Sell', () => {
    const r = parseStockDescription('Sell 75000 Emaar Egypt for Development/L.E./1/Egypt Stock Exchange (inv. 40270963) @6.535');
    expect(r?.side).toBe('sell');
    expect(r?.qty).toBe(75000);
    expect(r?.name).toBe('Emaar Egypt for Development');
  });
  it('returns null on unparseable', () => {
    expect(parseStockDescription('Bank Deposit')).toBeNull();
  });
  it('handles truncated /L. suffix (no /E./1/<venue>) with parens in name', () => {
    // Real failing row from AOLB Account 003 - 2024 statement: 59 rows came in
    // with the currency/venue suffix truncated to just "/L." instead of the
    // full "/L.E./1/Egypt Stock Exchange". Parens in the instrument name
    // ("(SODIC)") must not be swallowed by the venue group.
    const r = parseStockDescription(
      'Buy 7500 Six of October Development & Investment (SODIC)/L. (inv. 50017855) @62.350'
    );
    expect(r).toEqual({
      side: 'buy',
      qty: 7500,
      name: 'Six of October Development & Investment (SODIC)',
      invoiceId: '50017855',
      price: 62.350,
    });
  });
});

describe('parseFundDescription', () => {
  it('extracts ICS Makaseb buy/sell', () => {
    const r = parseFundDescription(' Sell 405000 ICS (Makaseb 2nd Edition Fund-NI Capital) @12.38180');
    expect(r).toEqual({
      side: 'sell',
      qty: 405000,
      name: 'Makaseb 2nd Edition Fund-NI Capital',
      price: 12.38180,
    });
  });
});
