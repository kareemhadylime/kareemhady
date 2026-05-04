import { describe, it, expect } from 'vitest';
import { canTransition, nextValidStates, isCancellable } from './order-status';

describe('order status transitions', () => {
  it('submitted → preparing allowed', () => {
    expect(canTransition('submitted', 'preparing')).toBe(true);
  });
  it('preparing → submitted not allowed', () => {
    expect(canTransition('preparing', 'submitted')).toBe(false);
  });
  it('delivered → cancelled requires admin', () => {
    expect(canTransition('delivered', 'cancelled', { actor: 'manager' })).toBe(true);
    expect(canTransition('delivered', 'cancelled', { actor: 'ops' })).toBe(false);
  });
  it('closed is terminal', () => {
    expect(nextValidStates('closed')).toEqual([]);
  });
  it('cancellable within grace + status submitted', () => {
    const submittedAt = new Date(Date.now() - 30_000).toISOString(); // 30s ago
    expect(isCancellable({
      status: 'submitted', submitted_at: submittedAt,
      grace_seconds: 120,
    })).toBe(true);
  });
  it('not cancellable after grace expires', () => {
    const submittedAt = new Date(Date.now() - 200_000).toISOString();
    expect(isCancellable({
      status: 'submitted', submitted_at: submittedAt,
      grace_seconds: 120,
    })).toBe(false);
  });
});
