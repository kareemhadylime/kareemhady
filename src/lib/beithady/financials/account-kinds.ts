// Per-account rules for auto-splitting partner-ledger xlsx imports.
//
// Some Odoo accounts hold balances for more than one PartnerKind (notably
// 227002, which is shared between Suppliers and Owner Payables). Rather
// than asking the operator to run the Partner Ledger report twice with a
// Vendor / Owner filter, we accept ONE xlsx per account and derive each
// row's kind from the matched Odoo partner's flags.
//
// Tiebreak: for 227002, `is_owner=true` wins over `supplier_rank>0`.
// `is_owner` is a deliberate, hand-set flag in Odoo; `supplier_rank` auto-
// increments on the first vendor bill, so EVERY owner in the directory is
// also flagged `supplier_rank>0`. Without the tiebreak, every owner row
// would land in the supplier bucket.

import 'server-only';
import type { PartnerKind } from './types';

export type OdooPartnerWithFlags = {
  id: number;
  name: string;
  supplier_rank: number | null;
  customer_rank: number | null;
  is_owner: boolean | null;
  is_employee: boolean | null;
};

type AccountRule =
  | {
      mode: 'single';
      kind: PartnerKind;
      flagFilter?: (p: OdooPartnerWithFlags) => boolean;
    }
  | {
      mode: 'multi';
      // Resolve the kind for a MATCHED partner.
      resolveMatched: (p: OdooPartnerWithFlags) => PartnerKind;
      // Default kind for UNMATCHED rows (where we have a balance in the
      // xlsx but no Odoo partner record — keeps the row visible instead of
      // dropping it).
      fallback: PartnerKind;
      // Which directory partners are eligible to match for this account.
      poolFilter: (p: OdooPartnerWithFlags) => boolean;
    };

export const ACCOUNT_RULES: Record<string, AccountRule> = {
  // Shared: Suppliers + Owner Payables. Owner wins over supplier.
  '227002': {
    mode: 'multi',
    resolveMatched: (p) => (p.is_owner === true ? 'owner' : 'supplier'),
    fallback: 'supplier',
    poolFilter: (p) =>
      p.is_owner === true || (p.supplier_rank ?? 0) > 0,
  },
  '122001': {
    mode: 'single',
    kind: 'customer',
    flagFilter: (p) => (p.customer_rank ?? 0) > 0,
  },
  '113002': { mode: 'single', kind: 'landlord' },
  '124005': {
    mode: 'single',
    kind: 'employee',
    flagFilter: (p) => p.is_employee === true,
  },
  '124006': {
    mode: 'single',
    kind: 'employee',
    flagFilter: (p) => p.is_employee === true,
  },
  '223001': {
    mode: 'single',
    kind: 'employee',
    flagFilter: (p) => p.is_employee === true,
  },
  '221001': { mode: 'single', kind: 'noteholder' },
};

/** Partners eligible to match against the xlsx for the given account. */
export function partnerPoolFilter(
  account_code: string,
): (p: OdooPartnerWithFlags) => boolean {
  const rule = ACCOUNT_RULES[account_code];
  if (!rule) return () => true;
  if (rule.mode === 'single') return rule.flagFilter ?? (() => true);
  return rule.poolFilter;
}

/**
 * Resolve a partner's kind for the given account. Pass `null` for
 * unmatched xlsx rows — gets the account's fallback kind (or
 * 'unallocated' if the account isn't recognized at all).
 */
export function resolveKindForPartner(
  account_code: string,
  partner: OdooPartnerWithFlags | null,
): PartnerKind {
  const rule = ACCOUNT_RULES[account_code];
  if (!rule) return 'unallocated';
  if (rule.mode === 'single') return rule.kind;
  if (partner == null) return rule.fallback;
  return rule.resolveMatched(partner);
}
