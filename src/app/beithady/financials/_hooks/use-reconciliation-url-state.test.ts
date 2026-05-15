import { describe, it, expect } from 'vitest';
import { buildFinReconciliationUrl, parseFinReconciliationState, type FinReconciliationUrlState } from './use-reconciliation-url-state';

describe('buildFinReconciliationUrl', () => {
  const defaults: FinReconciliationUrlState = { snapshot_id: undefined };

  it('omits ?snapshot= when snapshot_id is undefined', () => {
    const url = buildFinReconciliationUrl(defaults, {});
    expect(url).toBe('/beithady/financials/reconciliation');
  });

  it('writes ?snapshot=<id> when defined', () => {
    const url = buildFinReconciliationUrl(defaults, { snapshot_id: 'abc-123' });
    expect(url).toBe('/beithady/financials/reconciliation?snapshot=abc-123');
  });
});

describe('parseFinReconciliationState', () => {
  it('returns undefined when ?snapshot= is missing', () => {
    const state = parseFinReconciliationState(new URLSearchParams());
    expect(state.snapshot_id).toBeUndefined();
  });
});
