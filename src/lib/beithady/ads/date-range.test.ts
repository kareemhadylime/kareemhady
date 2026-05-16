import { describe, it, expect } from 'vitest';
import { parseDateRange, derivePriorPeriod, presetToRange, isValidISODate } from './date-range';

describe('parseDateRange', () => {
  it('parses explicit ?from=&to=', () => {
    const r = parseDateRange({ from: '2026-04-01', to: '2026-04-30' }, { today: '2026-05-16' });
    expect(r).toEqual({ from: '2026-04-01', to: '2026-04-30', preset: 'custom', compare: false });
  });
  it('parses preset=7d relative to today', () => {
    const r = parseDateRange({ preset: '7d' }, { today: '2026-05-16' });
    expect(r).toEqual({ from: '2026-05-10', to: '2026-05-16', preset: '7d', compare: false });
  });
  it('parses preset=30d', () => {
    const r = parseDateRange({ preset: '30d' }, { today: '2026-05-16' });
    expect(r.from).toBe('2026-04-17');
    expect(r.to).toBe('2026-05-16');
  });
  it('parses preset=90d', () => {
    const r = parseDateRange({ preset: '90d' }, { today: '2026-05-16' });
    expect(r.from).toBe('2026-02-16');
    expect(r.to).toBe('2026-05-16');
  });
  it('preset=lifetime returns from=1970-01-01', () => {
    const r = parseDateRange({ preset: 'lifetime' }, { today: '2026-05-16' });
    expect(r.from).toBe('1970-01-01');
    expect(r.to).toBe('2026-05-16');
  });
  it('falls back to 30d when params missing', () => {
    const r = parseDateRange({}, { today: '2026-05-16' });
    expect(r.preset).toBe('30d');
  });
  it('falls back to 30d when range invalid (from > to)', () => {
    const r = parseDateRange({ from: '2026-05-20', to: '2026-05-01' }, { today: '2026-05-16' });
    expect(r.preset).toBe('30d');
  });
  it('respects compare=1', () => {
    const r = parseDateRange({ preset: '7d', compare: '1' }, { today: '2026-05-16' });
    expect(r.compare).toBe(true);
  });
});

describe('derivePriorPeriod', () => {
  it('shifts a 7d window back 7 days', () => {
    const prior = derivePriorPeriod({ from: '2026-05-10', to: '2026-05-16' });
    expect(prior).toEqual({ from: '2026-05-03', to: '2026-05-09' });
  });
  it('handles single-day ranges', () => {
    const prior = derivePriorPeriod({ from: '2026-05-16', to: '2026-05-16' });
    expect(prior).toEqual({ from: '2026-05-15', to: '2026-05-15' });
  });
});

describe('presetToRange', () => {
  it('7d returns 7-day inclusive window ending today', () => {
    const r = presetToRange('7d', '2026-05-16');
    expect(r).toEqual({ from: '2026-05-10', to: '2026-05-16' });
  });
});

describe('isValidISODate', () => {
  it('accepts YYYY-MM-DD', () => expect(isValidISODate('2026-05-16')).toBe(true));
  it('rejects garbage', () => expect(isValidISODate('nope')).toBe(false));
  it('rejects empty', () => expect(isValidISODate('')).toBe(false));
});
