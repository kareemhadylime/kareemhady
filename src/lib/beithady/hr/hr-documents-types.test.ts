import { describe, it, expect } from 'vitest';
import { daysUntilExpiry, getExpiryStatus } from './hr-documents-types';

describe('daysUntilExpiry', () => {
  it('returns null for null expiry', () => {
    expect(daysUntilExpiry(null)).toBeNull();
  });
  it('returns 0 for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(daysUntilExpiry(today)).toBe(0);
  });
  it('returns negative for past date', () => {
    expect(daysUntilExpiry('2020-01-01')).toBeLessThan(0);
  });
  it('returns positive for future date', () => {
    expect(daysUntilExpiry('2099-01-01')).toBeGreaterThan(0);
  });
});

describe('getExpiryStatus', () => {
  it('returns no_expiry for null', () => {
    expect(getExpiryStatus(null)).toBe('no_expiry');
  });
  it('returns expired for past date', () => {
    expect(getExpiryStatus('2020-01-01')).toBe('expired');
  });
  it('returns critical for 5 days from today', () => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    expect(getExpiryStatus(d.toISOString().slice(0, 10))).toBe('critical');
  });
  it('returns warning for 20 days from today', () => {
    const d = new Date();
    d.setDate(d.getDate() + 20);
    expect(getExpiryStatus(d.toISOString().slice(0, 10))).toBe('warning');
  });
  it('returns upcoming for 45 days from today', () => {
    const d = new Date();
    d.setDate(d.getDate() + 45);
    expect(getExpiryStatus(d.toISOString().slice(0, 10))).toBe('upcoming');
  });
  it('returns valid for 90 days from today', () => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    expect(getExpiryStatus(d.toISOString().slice(0, 10))).toBe('valid');
  });
});
