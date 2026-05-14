// src/lib/beithady/hr/hr-attendance-parser.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeAttendanceStatus, matchByBhId } from './hr-attendance-parser';

describe('normalizeAttendanceStatus', () => {
  it('accepts "present"', () => expect(normalizeAttendanceStatus('present')).toBe('present'));
  it('accepts "Present" (case)', () => expect(normalizeAttendanceStatus('Present')).toBe('present'));
  it('accepts "p"', () => expect(normalizeAttendanceStatus('p')).toBe('present'));
  it('accepts "1"', () => expect(normalizeAttendanceStatus('1')).toBe('present'));
  it('accepts "yes"', () => expect(normalizeAttendanceStatus('yes')).toBe('present'));
  it('accepts "absent"', () => expect(normalizeAttendanceStatus('absent')).toBe('absent'));
  it('accepts "Absent" (case)', () => expect(normalizeAttendanceStatus('Absent')).toBe('absent'));
  it('accepts "a"', () => expect(normalizeAttendanceStatus('a')).toBe('absent'));
  it('accepts "0"', () => expect(normalizeAttendanceStatus('0')).toBe('absent'));
  it('accepts "no"', () => expect(normalizeAttendanceStatus('no')).toBe('absent'));
  it('rejects unknown "xyz"', () => expect(normalizeAttendanceStatus('xyz')).toBeNull());
  it('rejects empty string', () => expect(normalizeAttendanceStatus('')).toBeNull());
});

describe('matchByBhId', () => {
  const employees = [
    { id: 'a1', company_id: 'BH-001', first_name: 'Mohamed', last_name: 'Ali',   building_code: 'BH-26' },
    { id: 'a2', company_id: 'BH-002', first_name: 'Ahmed',   last_name: 'Fathy', building_code: 'BH-73' },
  ];
  it('matches exact BH-ID', () => expect(matchByBhId('BH-001', employees)?.id).toBe('a1'));
  it('case-insensitive match', () => expect(matchByBhId('bh-001', employees)?.id).toBe('a1'));
  it('trims whitespace', () => expect(matchByBhId(' BH-002 ', employees)?.id).toBe('a2'));
  it('returns null for unknown BH-ID', () => expect(matchByBhId('BH-999', employees)).toBeNull());
  it('returns null for empty string', () => expect(matchByBhId('', employees)).toBeNull());
});
