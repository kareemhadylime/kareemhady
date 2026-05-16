import { describe, it, expect } from 'vitest';
import {
  parsePeriod,
  shiftPriorYear,
  enumerateDays,
  daysBetween,
} from './date-ranges';

describe('parsePeriod', () => {
  it('parses "this-month" relative to a reference date', () => {
    const r = parsePeriod('this-month', '2026-05-16');
    expect(r.from).toBe('2026-05-01');
    expect(r.to).toBe('2026-05-31');
    expect(r.label).toBe('May 2026');
  });

  it('parses "last-month" wrapping year boundary', () => {
    const r = parsePeriod('last-month', '2026-01-10');
    expect(r.from).toBe('2025-12-01');
    expect(r.to).toBe('2025-12-31');
    expect(r.label).toBe('December 2025');
  });

  it('parses "last-30-days" inclusive', () => {
    const r = parsePeriod('last-30-days', '2026-05-16');
    expect(r.from).toBe('2026-04-17');
    expect(r.to).toBe('2026-05-16');
    expect(r.label).toBe('Last 30 days');
  });

  it('parses "custom:from:to"', () => {
    const r = parsePeriod('custom:2026-05-01:2026-05-10', '2026-05-16');
    expect(r.from).toBe('2026-05-01');
    expect(r.to).toBe('2026-05-10');
    expect(r.label).toBe('May 1 — May 10, 2026');
  });

  it('falls back to this-month for invalid input', () => {
    const r = parsePeriod('garbage', '2026-05-16');
    expect(r.from).toBe('2026-05-01');
  });
});

describe('shiftPriorYear', () => {
  it('shifts both ends back exactly one year', () => {
    const r = shiftPriorYear({ from: '2026-05-01', to: '2026-05-31', label: 'May 2026' });
    expect(r.from).toBe('2025-05-01');
    expect(r.to).toBe('2025-05-31');
    expect(r.label).toBe('May 2025');
  });

  it('handles leap-day collapse 2024-02-29 → 2023-02-28', () => {
    const r = shiftPriorYear({ from: '2024-02-29', to: '2024-02-29', label: 'Feb 29 2024' });
    expect(r.from).toBe('2023-02-28');
    expect(r.to).toBe('2023-02-28');
  });
});

describe('enumerateDays', () => {
  it('returns every date in the inclusive range', () => {
    expect(enumerateDays('2026-05-01', '2026-05-03')).toEqual([
      '2026-05-01', '2026-05-02', '2026-05-03',
    ]);
  });
  it('returns one entry when from === to', () => {
    expect(enumerateDays('2026-05-05', '2026-05-05')).toEqual(['2026-05-05']);
  });
});

describe('daysBetween', () => {
  it('counts inclusive day count', () => {
    expect(daysBetween('2026-05-01', '2026-05-16')).toBe(16);
  });
});
