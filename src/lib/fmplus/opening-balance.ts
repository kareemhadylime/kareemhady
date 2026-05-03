import type { AccountType } from './classifier';

// FMPLUS Property & Facility Management — Balance Sheet seed at 2026-02-28.
//
// PURPOSE
// -------
// Odoo move-lines only sync ~365 days of history, so a balance sheet for any
// asof >= 2026-02-28 must be seeded with cumulative-to-snapshot balances and
// then live-summed with deltas after the snapshot. Without a seed, the BS
// renders only the trailing-year activity, not the cumulative position.
//
// CURRENT STATE (stub)
// --------------------
// The user-provided Feb-2026 Excel (financial_statements__fm (7).xlsx,
// "Balance Sheet" sheet) cannot reliably be used as a leaf-level seed
// source for v1:
//   * Mixed sign conventions across rows (some raw debit-credit, some
//     display-flipped).
//   * Same Odoo codes appear under multiple group contexts with different
//     totals (typical Odoo BS report behavior).
//   * Per-section sums of Excel leaves don't reconcile against Excel section
//     subtotals (~43.9M EGP gap).
//
// We're shipping the wiring (correct types, correct file structure) with an
// empty array so downstream tasks (especially Task 10 buildFmplusBalanceSheet)
// can import this module and operate. When the array is empty, the renderer
// will fall back to summing whatever move-lines are synced — pre-snapshot
// historical balances will be incomplete; this is documented in the spec.
//
// FOLLOW-UP TASK (after Tasks 5-7 land)
// -------------------------------------
// Once the migration (Task 5), MCP-applied RPCs (Task 6), and sync extension
// (Task 7) are done, run a one-time Odoo aggregation query to extract clean
// per-account cumulative balances at 2026-02-28 for the FMPLUS company:
//
//   select
//     a.code,
//     a.name,
//     a.account_type,
//     sum(ml.balance) as opening_raw
//   from odoo_move_lines ml
//   join odoo_accounts a on a.id = ml.account_id
//   where ml.company_id = <FMPLUS_COMPANY_ID>
//     and ml.parent_state = 'posted'
//     and ml.date <= '2026-02-28'
//   group by a.code, a.name, a.account_type
//   having sum(ml.balance) <> 0;
//
// Then add a synthetic equity_unaffected entry to capture pre-snapshot
// retained earnings, ensuring the array sums to ~0 (raw debit-credit identity).
// Update opening-balance.test.ts's balanced-check tolerance to <1 EGP once
// populated.
//
// SIGN CONVENTION (when populated)
// ---------------------------------
//   Assets       (asset_*):           raw =  display
//   Liabilities  (liability_*):       raw = -display
//   Equity       (equity, unaffected):raw = -display
// All values stored here are in RAW debit-credit form. Display flipping
// happens at render time in buildFmplusBalanceSheet.
//
// NOTE: this file does NOT include `import 'server-only';` because the
// `server-only` package isn't installed in this repo. The constants here
// are pure data — harmless to bundle client-side if a careless import
// happens. The Beithady analogue (src/lib/beithady-opening-balance-2026.ts)
// has `import 'server-only';` for defensive purposes but isn't covered
// by tests, so the missing package never trips through vitest there.

export const OPENING_BALANCE_DATE = '2026-02-28';

export type FmplusOpeningEntry = {
  code: string;
  name: string;
  account_type: AccountType | 'derived';
  opening_raw: number;
};

// STUB: empty until populated from live Odoo data in a follow-up task.
// See header comment for rationale.
export const FMPLUS_OPENING_BALANCES_2026_02: readonly FmplusOpeningEntry[] = [];
