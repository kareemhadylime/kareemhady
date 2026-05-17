// Classifier tests — focused on the account-code overrides requested by the
// BH P&L Reconciliation team (2026-05-17 review).
//
// Pure-function tests, no Supabase mock needed.

import { describe, it, expect } from 'vitest';
import { classifyAccount } from './financials-pnl';

describe('classifyAccount — team-requested code overrides (2026-05-17)', () => {
  it('routes 401002 "other income" to Cost of Revenue / Direct cost for reservations', () => {
    const result = classifyAccount('401002', 'other income', 'income', false);
    expect(result).not.toBeNull();
    expect(result!.section).toBe('cost_of_revenue');
    expect(result!.subgroupKey).toBe('direct');
    expect(result!.subgroupLabel).toBe('Direct cost for reservations');
  });

  it('routes 502105 "water, and gas" (typed as plain expense in 5+10) to Cost of Revenue / Operating Cost', () => {
    const result = classifyAccount('502105', 'water, and gas ', 'expense', false);
    expect(result).not.toBeNull();
    expect(result!.section).toBe('cost_of_revenue');
    expect(result!.subgroupKey).toBe('operating');
    expect(result!.subgroupLabel).toBe('Operating Cost');
  });

  it('routes 600111 "Hospitality expenses G/A" to General Expenses / Back Office Salaries, Benefits', () => {
    const result = classifyAccount('600111', 'Hospitality  expenses G/A', 'expense', false);
    expect(result).not.toBeNull();
    expect(result!.section).toBe('general_expenses');
    expect(result!.subgroupKey).toBe('back_office');
    expect(result!.subgroupLabel).toBe('Back Office Salaries, Benefits');
  });

  it('routes 604101 "Plat Form subscriptions G&A" to General Expenses / Marketing & Tender expenses', () => {
    const result = classifyAccount('604101', 'Plat Form subscriptions G&A', 'expense', false);
    expect(result).not.toBeNull();
    expect(result!.section).toBe('general_expenses');
    expect(result!.subgroupKey).toBe('marketing');
    expect(result!.subgroupLabel).toBe('Marketing & Tender expenses');
  });
});

describe('classifyAccount — regression: existing behavior preserved', () => {
  it('still classifies generic income accounts into Activity revenues', () => {
    const result = classifyAccount('401009', 'Revenue from hospitality', 'income', false);
    expect(result).not.toBeNull();
    expect(result!.section).toBe('revenue');
    expect(result!.subgroupKey).toBe('activity');
    expect(result!.flip).toBe(true);
  });

  it('still classifies home-owner accounts into Home Owner Cut bucket', () => {
    const result = classifyAccount('500103', 'Home Owner Cut', 'expense_direct_cost', false);
    expect(result).not.toBeNull();
    expect(result!.section).toBe('home_owner_cut');
  });

  it('still classifies generic G&A salary expense into Back Office', () => {
    const result = classifyAccount('601001', 'Basic Salaries G&A', 'expense', false);
    expect(result).not.toBeNull();
    expect(result!.section).toBe('general_expenses');
    expect(result!.subgroupKey).toBe('back_office');
  });
});
