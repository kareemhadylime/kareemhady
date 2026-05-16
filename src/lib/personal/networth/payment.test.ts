import { describe, it, expect } from 'vitest';
import {
  recordPayment, recordPaymentForSchedule,
  recordPaymentForRecurringTemplate, recordCardPayment,
} from './payment';

describe('payment module', () => {
  it('exports all 4 recorders', () => {
    expect(typeof recordPayment).toBe('function');
    expect(typeof recordPaymentForSchedule).toBe('function');
    expect(typeof recordPaymentForRecurringTemplate).toBe('function');
    expect(typeof recordCardPayment).toBe('function');
  });
});
