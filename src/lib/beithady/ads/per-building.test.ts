import { describe, it, expect } from 'vitest';
import { attributeLeadToBuilding } from './per-building';

describe('attributeLeadToBuilding', () => {
  it('uses matched_reservation_building when present (booked wins)', () => {
    expect(attributeLeadToBuilding({
      matched_reservation_building: 'BH-26',
      building_interest: 'BH-73',
    })).toBe('BH-26');
  });
  it('falls back to building_interest when not booked', () => {
    expect(attributeLeadToBuilding({
      matched_reservation_building: null,
      building_interest: 'BH-73',
    })).toBe('BH-73');
  });
  it('returns Unattributed when both missing', () => {
    expect(attributeLeadToBuilding({
      matched_reservation_building: null,
      building_interest: null,
    })).toBe('Unattributed');
  });
  it('handles undefined fields', () => {
    expect(attributeLeadToBuilding({})).toBe('Unattributed');
  });
  it('treats empty string as missing', () => {
    expect(attributeLeadToBuilding({
      matched_reservation_building: '',
      building_interest: '',
    })).toBe('Unattributed');
  });
});
