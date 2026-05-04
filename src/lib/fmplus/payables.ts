import { supabaseAdmin } from '../supabase';

// FMPLUS Payables / Receivables breakdown by counterparty.
//
// Mirrors the Beithady payables pattern (src/lib/financials-pnl.ts
// buildPayablesReport) but with three FMPLUS-relevant categories:
//
//   1. Vendors           — partners with open AP balances on
//                          liability_payable + non-government liability_current
//                          accounts (general suppliers, subcontractors, etc.)
//   2. Government        — partners with open AP balances on accounts whose
//                          NAME matches tax / social-insurance / ministry /
//                          authority keywords (Egypt: 226xxx WHT, 221005
//                          Accrued Social Insurance, etc.)
//   3. Receivables       — partners with open AR balances on asset_receivable
//                          (typical: 122001 Accounts Receivable)
//
// Government detection is account-name-based, NOT partner-based. Vendor
// payment instructions come from the AP account context, not the
// counterparty's own classification — a tax payment to "ABC Vendor" goes
// through the WHT account regardless of ABC's partner record.

export type PartnerRow = {
  partner_id: number;
  partner_name: string;
  amount: number;          // negative for liabilities (display as paid-out), positive for AR
  line_count: number;
};

export type PayablesBucket = {
  total: number;
  partners: PartnerRow[];
};

export type FmplusPayablesReport = {
  as_of: string;
  company_id: number;
  vendors:     PayablesBucket;
  government:  PayablesBucket;
  receivables: PayablesBucket;
};

// Account-name keywords that mark an account as government-related.
// Tested against `LOWER(odoo_accounts.name)`. Egyptian Odoo CoAs in this
// tenant use English-language account names, so the English keywords
// dominate. Arabic kept for defense-in-depth in case a sub-account is
// renamed in Arabic later.
const GOVT_KEYWORD_RE =
  /\b(tax|vat|withhold|wht|social\s*insur|insurance|customs|stamp|salary|payroll)\b|ضريبة|ضرائب|تأمين|تأمينات|جمارك|دمغة/i;

function isGovtAccount(accountName: string): boolean {
  if (!accountName) return false;
  return GOVT_KEYWORD_RE.test(accountName);
}

export async function buildFmplusPayables(args: {
  asOf: string;
  companyId: number;
}): Promise<FmplusPayablesReport> {
  const sb = supabaseAdmin();

  // Pull every open-residual line within FMPLUS scope on AP/AR account types.
  // Strict pagination ordered by id (PostgREST .range is LIMIT/OFFSET — needs
  // ORDER BY for stable paging on large result sets).
  type Row = {
    id: number;
    partner_id: number | null;
    amount_residual: number;
    odoo_accounts: {
      code: string | null;
      name: string | null;
      account_type: string | null;
    } | null;
    odoo_partners: { id: number; name: string } | null;
  };
  const PAGE = 1000;
  const all: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('odoo_move_lines')
      .select('id, partner_id, amount_residual, odoo_accounts!inner(code, name, account_type), odoo_partners!inner(id, name)')
      .eq('company_id', args.companyId)
      .in('parent_state', ['draft', 'posted'])
      .lte('date', args.asOf)
      .not('amount_residual', 'eq', 0)
      .in('odoo_accounts.account_type', ['liability_payable', 'liability_current', 'asset_receivable'])
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`buildFmplusPayables: ${error.message}`);
    const page = (data as unknown as Row[]) || [];
    all.push(...page);
    if (page.length < PAGE) break;
  }

  // Aggregate per (kind, partner_id).
  type Key = `${'vendor' | 'government' | 'receivable'}:${number}`;
  const buckets = new Map<Key, PartnerRow & { kind: 'vendor' | 'government' | 'receivable' }>();

  for (const r of all) {
    if (!r.odoo_partners || r.partner_id == null) continue;
    const acctType = r.odoo_accounts?.account_type || '';
    const acctName = r.odoo_accounts?.name || '';

    let kind: 'vendor' | 'government' | 'receivable';
    if (acctType === 'asset_receivable') {
      kind = 'receivable';
    } else if (isGovtAccount(acctName)) {
      kind = 'government';
    } else {
      kind = 'vendor';
    }

    const amt = Number(r.amount_residual) || 0;
    const key: Key = `${kind}:${r.partner_id}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.amount += amt;
      existing.line_count += 1;
    } else {
      buckets.set(key, {
        kind,
        partner_id: r.partner_id,
        partner_name: r.odoo_partners.name || `Partner ${r.partner_id}`,
        amount: amt,
        line_count: 1,
      });
    }
  }

  const reduce = (kind: 'vendor' | 'government' | 'receivable'): PayablesBucket => {
    const partners = Array.from(buckets.values())
      .filter(r => r.kind === kind && Math.abs(r.amount) >= 0.5)
      .map(({ kind: _k, ...rest }) => rest)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const total = partners.reduce((s, p) => s + p.amount, 0);
    return { total, partners };
  };

  return {
    as_of: args.asOf,
    company_id: args.companyId,
    vendors:     reduce('vendor'),
    government:  reduce('government'),
    receivables: reduce('receivable'),
  };
}
