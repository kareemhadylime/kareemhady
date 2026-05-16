import { describe, it, expect } from 'vitest';
import { createLiability, updateBalance, markScheduleRowPaid } from './liability';

describe('liability module', () => {
  it('exports createLiability / updateBalance / markScheduleRowPaid', () => {
    expect(typeof createLiability).toBe('function');
    expect(typeof updateBalance).toBe('function');
    expect(typeof markScheduleRowPaid).toBe('function');
  });
});
