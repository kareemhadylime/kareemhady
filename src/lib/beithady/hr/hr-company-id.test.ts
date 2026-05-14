import { describe, it, expect } from 'vitest';
import { formatCompanyId } from './hr-company-id';

describe('formatCompanyId', () => {
  it('formats 1 as BH-001', () => {
    expect(formatCompanyId(1)).toBe('BH-001');
  });
  it('formats 42 as BH-042', () => {
    expect(formatCompanyId(42)).toBe('BH-042');
  });
  it('formats 999 as BH-999', () => {
    expect(formatCompanyId(999)).toBe('BH-999');
  });
  it('throws for 0', () => {
    expect(() => formatCompanyId(0)).toThrow('out of range');
  });
  it('throws for 1000', () => {
    expect(() => formatCompanyId(1000)).toThrow('out of range');
  });
});
