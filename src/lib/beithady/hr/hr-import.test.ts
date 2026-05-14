// src/lib/beithady/hr/hr-import.test.ts
import { describe, it, expect } from 'vitest';
import { mapAnalyticToBuilding, inferStatus, validateRow } from './hr-import';
import type { ImportRow } from './hr-types';

describe('mapAnalyticToBuilding', () => {
  it('maps Lotus 26 → BH-26', () => {
    expect(mapAnalyticToBuilding('Lotus 26')).toBe('BH-26');
  });
  it('maps LOTUS 73 → BH-73 (case insensitive)', () => {
    expect(mapAnalyticToBuilding('LOTUS 73')).toBe('BH-73');
  });
  it('maps A1 Hospitality → BH-435', () => {
    expect(mapAnalyticToBuilding('A1 Hospitality')).toBe('BH-435');
  });
  it('maps a1 hospitality → BH-435 (lowercase)', () => {
    expect(mapAnalyticToBuilding('a1 hospitality')).toBe('BH-435');
  });
  it('maps One kattameya → BH-OK', () => {
    expect(mapAnalyticToBuilding('One kattameya')).toBe('BH-OK');
  });
  it('maps Head Office → HEAD_OFFICE', () => {
    expect(mapAnalyticToBuilding('Head Office')).toBe('HEAD_OFFICE');
  });
  it('maps El-Gona → OTHER', () => {
    expect(mapAnalyticToBuilding('El-Gona')).toBe('OTHER');
  });
  it('returns null for unknown value', () => {
    expect(mapAnalyticToBuilding('Dubai Branch')).toBeNull();
  });
});

describe('inferStatus', () => {
  it('returns terminated when isRedRow=true', () => {
    expect(inferStatus(true)).toBe('terminated');
  });
  it('returns on_job when isRedRow=false', () => {
    expect(inferStatus(false)).toBe('on_job');
  });
});

describe('validateRow', () => {
  const base: ImportRow = {
    rowIndex: 1,
    first_name: 'Mohamed Ali',
    position: 'Engineer',
    salary_package: 11500,
    building_code: 'BH-26',
    transport_allowance: 0,
    fixed_bonus: 0,
    status: 'on_job',
    validationState: 'ready',
    errors: [],
    incompleteFields: [],
    isRedRow: false,
  };

  it('marks ready row as ready', () => {
    const result = validateRow(base);
    expect(result.validationState).toBe('ready');
    expect(result.errors).toHaveLength(0);
  });

  it('marks missing first_name as error', () => {
    const result = validateRow({ ...base, first_name: '' });
    expect(result.validationState).toBe('error');
    expect(result.errors).toContain('Name is required');
  });

  it('marks null building_code as incomplete', () => {
    const result = validateRow({ ...base, building_code: null });
    expect(result.validationState).toBe('incomplete');
    expect(result.incompleteFields).toContain('building_code');
  });
});
