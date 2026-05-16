import { describe, it, expect } from 'vitest';
import { BH_BUILDINGS, UNATTRIBUTED, isBhBuilding } from './buildings';

describe('BH_BUILDINGS', () => {
  it('lists the 5 BH operating codes', () => {
    expect(BH_BUILDINGS.map(b => b.code)).toEqual(['BH-26','BH-73','BH-435','BH-OK','BH-34']);
  });
  it('every entry has code + name', () => {
    for (const b of BH_BUILDINGS) {
      expect(b.code).toMatch(/^BH-/);
      expect(b.name.length).toBeGreaterThan(0);
    }
  });
});

describe('UNATTRIBUTED', () => {
  it('is the literal "Unattributed"', () => expect(UNATTRIBUTED).toBe('Unattributed'));
});

describe('isBhBuilding', () => {
  it('accepts valid BH codes', () => {
    expect(isBhBuilding('BH-26')).toBe(true);
    expect(isBhBuilding('BH-OK')).toBe(true);
  });
  it('rejects garbage + Unattributed + empty', () => {
    expect(isBhBuilding('Unattributed')).toBe(false);
    expect(isBhBuilding('')).toBe(false);
    expect(isBhBuilding('XX-99')).toBe(false);
  });
});
