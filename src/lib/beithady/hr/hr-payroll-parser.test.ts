import { describe, it, expect } from 'vitest';
import { normalizeForMatch, matchEmployeeName } from './hr-payroll-parser';

describe('normalizeForMatch', () => {
  it('lowercases input', () => {
    expect(normalizeForMatch('Mohamed ALI')).toBe('mohamed ali');
  });
  it('collapses multiple spaces', () => {
    expect(normalizeForMatch('Ahmed  Fathy')).toBe('ahmed fathy');
  });
  it('replaces hyphens with spaces', () => {
    expect(normalizeForMatch('Ahmed-Fathy')).toBe('ahmed fathy');
  });
  it('trims leading/trailing whitespace', () => {
    expect(normalizeForMatch('  Kareem  ')).toBe('kareem');
  });
});

describe('matchEmployeeName', () => {
  const employees = [
    { id: 'a1', first_name: 'Mohamed', last_name: 'Ali',    company_id: 'BH-001' },
    { id: 'a2', first_name: 'Ahmed',   last_name: 'Fathy',  company_id: 'BH-002' },
    { id: 'a3', first_name: 'Mohamed', last_name: 'Hassan', company_id: 'BH-003' },
  ];

  it('exact full-name match', () => {
    const r = matchEmployeeName('Mohamed Ali', employees);
    expect(r.status).toBe('matched');
    expect(r.matchedId).toBe('a1');
  });

  it('case-insensitive full-name match', () => {
    const r = matchEmployeeName('AHMED FATHY', employees);
    expect(r.status).toBe('matched');
    expect(r.matchedId).toBe('a2');
  });

  it('fuzzy: all employee name words appear in sheet name', () => {
    const r = matchEmployeeName('Ahmed Mohamed Fathy', employees);
    expect(r.status).toBe('matched');
    expect(r.matchedId).toBe('a2');
  });

  it('ambiguous: multiple employees match', () => {
    const r = matchEmployeeName('Mohamed Kamal', employees);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('unmatched: no employee found', () => {
    const r = matchEmployeeName('Completely Unknown Person', employees);
    expect(r.status).toBe('unmatched');
    expect(r.matchedId).toBeNull();
  });
});
