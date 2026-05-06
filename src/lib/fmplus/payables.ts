import { supabaseAdmin } from '../supabase';

// FMPLUS Payables / Receivables breakdown by counterparty.
//
// Mapping is hardcoded by account CODE (not name regex, not account_type) per
// the user's deep-analysis pass against the Feb-2026 CoA export
// `C:\kareemhady\.claude\FMPLUS\Account (account.account).xlsx`. Code-based
// mapping is deterministic — name regex over-matches (catches 221008 Accrued
// Accommodation when scanning for "salary"-adjacent words) and under-matches
// (misses 226004 Tax Authority if the keyword list is incomplete).
//
// 7 buckets — 4 payables + 3 receivables:
//
//   PAYABLES (we owe — raw balance is negative on liability accounts):
//     vendor              Suppliers, subcontractors, vendor accruals
//     employee            Salaries, employee allowances, settlement accruals
//     government_payable  Tax authority, social insurance, customs, levies
//     bank_financing      Loans, leases, factoring, notes payable
//
//   RECEIVABLES (owed to us — raw balance is positive on asset accounts):
//     customer_receivable      Operational AR + customer credit notes
//     customer_deposit         Deposits held with customers + LGs
//     government_receivable    WHT credit owed back to us by the tax authority
//
// Accounts NOT in the map are intentionally excluded (provisions, deferred
// revenue, suspense, intangibles, etc.) — they belong on the BS table, not
// in payables aging.

export type Bucket =
  | 'vendor'
  | 'employee'
  | 'government_payable'
  | 'bank_financing'
  | 'customer_receivable'
  | 'customer_deposit'
  | 'government_receivable';

const ACCOUNT_BUCKETS: Record<string, Bucket> = {
  // ---- Vendors Payables ----
  '221001': 'vendor', // Accounts payable
  '221007': 'vendor', // Accrued Expenses
  '221008': 'vendor', // Accrued Accommodation
  '221011': 'vendor', // Other Creditor
  '221012': 'vendor', // Purchase Transit
  '221013': 'vendor', // Purchase Uniform
  '221014': 'vendor', // Accrued Contracting Insurances
  '221015': 'vendor', // Accrued Car Rental
  '221016': 'vendor', // Accrued Specialized Contract

  // ---- Employee Payables ----
  '221004': 'employee', // Salaries Payable
  '227002': 'employee', // Accrued Salaries Under Settlement
  '227003': 'employee', // Accrued Oil and Gas and Allowance

  // ---- Government Payables ----
  '221005': 'government_payable', // Accrued Social Insurance
  '221006': 'government_payable', // Customs and Clearance Fees
  '221009': 'government_payable', // Administrative Penalties
  '226001': 'government_payable', // V.A.T On Sales
  '226002': 'government_payable', // V.A.T On Purchase
  '226003': 'government_payable', // Vat liability
  '226004': 'government_payable', // Tax Authority
  '226005': 'government_payable', // Tax Payroll Authority
  '226006': 'government_payable', // With Holding Tax - Vendor
  '213001': 'government_payable', // Deferred Tax Liabilities (Q6: B — included)

  // ---- Bank & Financing ----
  '211001': 'bank_financing', // Partners Loan - Concrete
  '211002': 'bank_financing', // Partners Loan - Lime
  '211003': 'bank_financing', // Bank Loans
  '211004': 'bank_financing', // Finance Cib Account
  '211005': 'bank_financing', // Finance Fab Account
  '211006': 'bank_financing', // Efg Factoring Supplier
  '211007': 'bank_financing', // Efg Factoring Customer
  '211008': 'bank_financing', // Finance QNB Account
  '211009': 'bank_financing', // Finance Fab Account 002
  '212001': 'bank_financing', // Lease Liabilities (long term)
  '215001': 'bank_financing', // Notes Payable (Long Term)
  '215002': 'bank_financing', // Deferred Interest Lease
  '215003': 'bank_financing', // Deferred Interest Loan
  '216001': 'bank_financing', // Trade and Other Payables - Non Current
  '221002': 'bank_financing', // Notes Payable (Short Term)
  '221003': 'bank_financing', // Notes Payable (Under Collection)
  '222001': 'bank_financing', // Short Term Loan
  '223001': 'bank_financing', // Lease Liabilities (Current Portion)

  // ---- Customer Receivables ----
  '122001': 'customer_receivable', // Accounts Receivable
  '122002': 'customer_receivable', // Accounts Receivable (contra asset)
  '221010': 'customer_receivable', // Credit Note (Q5: B — customer-side)

  // ---- Customer Deposits & LGs ----
  '117001': 'customer_deposit', // Deposit With Customer
  '117002': 'customer_deposit', // Deposit For Customer Until Deduction Confirmation
  '117006': 'customer_deposit', // Letters Of Guarantee With Customer

  // ---- Government Receivables ----
  '113001': 'government_receivable', // With Holding Tax -Client
};

const TRACKED_CODES = Object.keys(ACCOUNT_BUCKETS);

export type PartnerRow = {
  partner_id: number | null;          // null = unassigned (line has no partner_id)
  partner_name: string;
  amount: number;                      // signed amount_residual
  line_count: number;
};

export type PayablesBucket = {
  total: number;
  partners: PartnerRow[];
};

export type FmplusPayablesReport = {
  as_of: string;
  company_id: number;
  // Payables (we owe)
  vendors:             PayablesBucket;
  employees:           PayablesBucket;
  government_payables: PayablesBucket;
  bank_financing:      PayablesBucket;
  // Receivables (owed to us)
  customer_receivables:    PayablesBucket;
  customer_deposits:       PayablesBucket;
  government_receivables:  PayablesBucket;
};

export async function buildFmplusPayables(args: {
  asOf: string;
  companyId: number;
}): Promise<FmplusPayablesReport> {
  const sb = supabaseAdmin();

  // PostgREST + Supabase JS: paginate strictly with `.order(id).range(...)`
  // because range() = LIMIT/OFFSET; without ORDER BY, rows can drop or
  // duplicate across pages on large tables.
  type Row = {
    id: number;
    partner_id: number | null;
    amount_residual: number;
    odoo_accounts: { code: string | null } | null;
    odoo_partners: { id: number; name: string } | null;
  };
  const PAGE = 1000;
  const all: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('odoo_move_lines')
      .select('id, partner_id, amount_residual, odoo_accounts!inner(code), odoo_partners(id, name)')
      .eq('company_id', args.companyId)
      .in('parent_state', ['draft', 'posted'])
      .lte('date', args.asOf)
      .not('amount_residual', 'eq', 0)
      .in('odoo_accounts.code', TRACKED_CODES)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`buildFmplusPayables: ${error.message}`);
    const page = (data as unknown as Row[]) || [];
    all.push(...page);
    if (page.length < PAGE) break;
  }

  // Aggregate per (bucket, partner_id). Lines without a partner_id roll into a
  // synthetic "Unassigned" row (preserved with partner_id=null) so totals stay
  // honest — typical for general accruals booked against the AP account
  // without picking a specific vendor.
  type Key = `${Bucket}:${string}`;
  const buckets = new Map<Key, PartnerRow & { bucket: Bucket }>();

  for (const r of all) {
    const code = r.odoo_accounts?.code;
    if (!code) continue;
    const bucket = ACCOUNT_BUCKETS[code];
    if (!bucket) continue;

    const partnerId  = r.partner_id ?? null;
    const partnerKey = partnerId === null ? 'NA' : String(partnerId);
    const partnerNm  = r.odoo_partners?.name || (partnerId == null ? 'Unassigned' : `Partner ${partnerId}`);

    const amt = Number(r.amount_residual) || 0;
    const k: Key = `${bucket}:${partnerKey}`;
    const existing = buckets.get(k);
    if (existing) {
      existing.amount += amt;
      existing.line_count += 1;
    } else {
      buckets.set(k, {
        bucket,
        partner_id: partnerId,
        partner_name: partnerNm,
        amount: amt,
        line_count: 1,
      });
    }
  }

  const reduce = (bucket: Bucket): PayablesBucket => {
    const partners = Array.from(buckets.values())
      .filter(r => r.bucket === bucket && Math.abs(r.amount) >= 0.5)
      .map(({ bucket: _b, ...rest }) => rest)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const total = partners.reduce((s, p) => s + p.amount, 0);
    return { total, partners };
  };

  return {
    as_of: args.asOf,
    company_id: args.companyId,
    vendors:                reduce('vendor'),
    employees:              reduce('employee'),
    government_payables:    reduce('government_payable'),
    bank_financing:         reduce('bank_financing'),
    customer_receivables:   reduce('customer_receivable'),
    customer_deposits:      reduce('customer_deposit'),
    government_receivables: reduce('government_receivable'),
  };
}
