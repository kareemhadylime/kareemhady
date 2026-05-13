// I6 — smoke test that buildBalanceSheet's TS-const → DB swap (Task 4)
// still loads opening balances from the snapshot tables and aggregates
// them correctly. Mocks the Supabase client to avoid hitting prod.
//
// This intentionally only smoke-tests the seed path; the full reconciliation
// against BeithadyBalanceSheet 28-2.xlsx happens at T28 / production.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({ from: mockFrom }),
}));

// Mock the new opening-balance loader so we don't need a real snapshot row
// or DB connection. We feed it a tiny fixed set of accounts.
vi.mock('@/lib/beithady/financials/load-opening', () => ({
  loadOpeningBalanceSnapshot: vi.fn(async () => ({
    snapshot_id: 'snap-test-1',
    period_end: '2025-12-31',
    accounts: [
      // Suppliers (liability_payable)
      {
        account_code: '227002',
        account_name: 'Suppliers',
        account_type: 'liability_payable',
        account_type_override: null,
        opening_raw: -9081444.65,
      },
      // Total Lime Loan — has override liability_current → liability_non_current
      {
        account_code: '222008',
        account_name: 'Total Lime Loan',
        account_type: 'liability_current',
        account_type_override: 'liability_non_current',
        opening_raw: -42311642.82,
      },
      // Cash account
      {
        account_code: '121001',
        account_name: 'Cash In EGP',
        account_type: 'asset_cash',
        account_type_override: null,
        opening_raw: 6622.15,
      },
    ],
  })),
}));

import { buildBalanceSheet } from './financials-pnl';

// Recursive chainable mock — any .foo(...) returns another instance of itself,
// and awaiting it resolves to { data: [], error: null }. Lets us avoid
// modelling the full PostgREST query chain of buildBalanceSheet.
function makeChain(): unknown {
  const handler: ProxyHandler<{ then?: unknown }> = {
    get(target, prop) {
      if (prop === 'then') {
        // Make the proxy itself thenable: `await chain` resolves to empty.
        return (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data: [], error: null });
      }
      // Any other property access returns a function that returns the chain.
      return () => makeChain();
    },
  };
  return new Proxy({}, handler);
}

beforeEach(() => {
  mockFrom.mockReset();
  // odoo_move_lines: chainable mock returning zero deltas.
  mockFrom.mockImplementation(() => makeChain());
});

describe('buildBalanceSheet — seed via DB snapshot (I6 smoke)', () => {
  it('loads opening balances from the snapshot loader (not from TS const)', async () => {
    const { loadOpeningBalanceSnapshot } = await import('@/lib/beithady/financials/load-opening');
    await buildBalanceSheet({
      asOf: '2026-05-13',
      companyIds: [5, 10], // consolidated triggers seed-mode
    });
    expect(loadOpeningBalanceSnapshot).toHaveBeenCalledWith({
      period_end: '2025-12-31',
      scope: 'consolidated',
    });
  });

  it('aggregates the 3 mocked seed accounts into the right BS sections', async () => {
    const bs = await buildBalanceSheet({
      asOf: '2026-05-13',
      companyIds: [5, 10],
    });

    // Find the Suppliers row inside the Payables group.
    const suppliers = bs.liabilities.groups
      .flatMap((g) => g.accounts)
      .find((l) => l.code === '227002');
    expect(suppliers).toBeDefined();
    // Liabilities are sign-flipped for display (raw=-9081444.65 → 9081444.65).
    expect(suppliers!.balance).toBeCloseTo(9081444.65, 2);

    // The Lime Loan override should land under Non-current Liabilities,
    // NOT Current Liabilities (the override path).
    const allLiabRows = bs.liabilities.groups.flatMap((g) =>
      g.accounts.map((l) => ({ ...l, group: g.label }))
    );
    const lime = allLiabRows.find((l) => l.code === '222008');
    expect(lime).toBeDefined();
    expect(lime!.group.toLowerCase()).toMatch(/non.?current/);

    // Cash row should be present in assets.
    const cash = bs.assets.groups
      .flatMap((g) => g.accounts)
      .find((l) => l.code === '121001');
    expect(cash).toBeDefined();
    expect(cash!.balance).toBeCloseTo(6622.15, 2);
  });

  it('does NOT call loadOpeningBalanceSnapshot for per-company (non-consolidated) scopes', async () => {
    const { loadOpeningBalanceSnapshot } = await import('@/lib/beithady/financials/load-opening');
    vi.mocked(loadOpeningBalanceSnapshot).mockClear();
    await buildBalanceSheet({
      asOf: '2026-05-13',
      companyIds: [5], // Egypt only — should NOT trigger seed mode
    });
    expect(loadOpeningBalanceSnapshot).not.toHaveBeenCalled();
  });
});
