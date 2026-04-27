import 'server-only';

// Opening raw balances for Beithady Consolidated (companies 5 + 10) as of
// the 2025 year-end close, used to seed the 2026 balance sheet.
//
// Source: .claude/Beithady Domain/bh balance sheet.xlsx (amended 2026-04-27,
// supersedes the earlier "Beithady Consildated upto31-12-2025.xlsx").
//
// What changed vs the previous seed:
//   * 221001/221002 Notes Payable consolidated. Previously the xlsx split
//     this into 221001 'Notes Payable - Long Term' (-11,937,183, NCL) and
//     221002 'Notes Payable - Short Term' (-6,138,396, CL). The amended
//     sheet rolls both into a single 221001 'Notes Payable - Short Term'
//     entry of -18,075,579 sitting under Non-current Liabilities. The
//     ACCOUNT_TYPE_OVERRIDES['221001'] route below changed accordingly.
//   * 222008 Total Lime Loan: -42,311,641 → -42,311,642.82 (delta -1.82).
//   * 122001 Customers: -796,296.28 → -796,296.00 (delta +0.28).
//   * Two new cash custody balances appear: 121028 Omar Kamel (-0.59) and
//     121051 Ahmed Abdelsalam (+2.00).
//   * 227003 City Tax stays at -4,341.98 in total but is split across two
//     rows in the source; we keep it as one combined seed entry.
//   * 124004 Prepaid Expenses 134,231.90 + 96,704.92 are also combined into
//     one 230,936.82 seed entry (the previous file had them as two rows
//     with the same key, which silently dropped the first because the
//     consumer uses `byAccount.set(key, ...)`).
//
// Sign convention = Odoo raw (debit - credit):
//   Assets:       raw =  display_balance
//   Liabilities:  raw = -display_balance
//   Equity:       raw = -display_balance
//
// The 2025 Current Year Unallocated Earnings is rolled forward into
// Previous Years Unallocated Earnings (equity_unaffected) — the normal
// year-end-close behaviour. A synthetic row at the end carries that delta.
//
// Reconciliation against the source xlsx (all sums match to the cent):
//   Bank and Cash         707,352.62
//   Receivables          -796,296.00
//   Current Assets      4,806,642.42
//   Prepayments         4,713,167.41
//   Fixed Assets       67,527,108.92
//   ASSETS             76,957,975.37
//   Current Liab        1,854,719.73
//   Payables            9,081,444.65
//   Non-current Liab   70,387,221.82
//   LIABILITIES        81,323,386.20
//   EQUITY             -4,365,411.00
//   L + E              76,957,975.20
// The xlsx itself is off by 0.17 EGP (A vs L+E); we preserve user values
// exactly, so the seed sums to debits-credits = 0.17 (was 0.30 in the
// previous file).

export const OPENING_BALANCE_DATE = '2025-12-31';

// The Feb-2026 Beithady xlsx diverges from Odoo's account_type tagging in
// two places. These overrides route 2026 deltas to the correct xlsx group
// in the consolidated view only (per-company scopes keep Odoo's types):
//
//   222008 Total Lime Loan
//     Odoo type: liability_current
//     xlsx view: Non-current Liabilities (long-term partner advance).
//     Override → liability_non_current.
//
//   221001 Notes Payable - Short Term
//     Odoo has THREE separate account rows for this code in company 5:
//       2× asset_cash  ← journal entries for manual-payment cheques
//       1× liability_current
//     The amended xlsx now classifies ALL of 221001 (the consolidated
//     Notes Payable balance) under Non-current Liabilities, so 2026
//     movements on this code should land there too.
//     Override → liability_non_current.
//
// 222006 (concrete plus Loans) has no 2026 movement, so no override needed.
export const ACCOUNT_TYPE_OVERRIDES: Record<string, string> = {
  '221001': 'liability_non_current',
  '222008': 'liability_non_current',
};

export type OpeningAccount = {
  code: string;
  name: string;
  account_type: string;
  opening_raw: number;
};

export const BEITHADY_OPENING_BALANCES_2026: OpeningAccount[] = [
  // Bank and Cash Accounts (asset_cash) — xlsx subtotal 707,352.62
  { code: '121053', name: 'Bank Misr 8439 AED', account_type: 'asset_cash', opening_raw: 408.08 },
  { code: '121054', name: 'Stripe', account_type: 'asset_cash', opening_raw: 308430.61 },
  { code: '121001', name: 'Cash In EGP', account_type: 'asset_cash', opening_raw: 6622.15 },
  { code: '121002', name: 'Cash in US Dollars', account_type: 'asset_cash', opening_raw: 22743.36 },
  { code: '121012', name: 'Custody Of Ramadan Lawyer', account_type: 'asset_cash', opening_raw: 17813.0 },
  { code: '121013', name: 'Mohamed Tarek custody', account_type: 'asset_cash', opening_raw: 2150.0 },
  { code: '121015', name: 'Racha Omairi Custody', account_type: 'asset_cash', opening_raw: -129756.9 },
  { code: '121016', name: 'Eng Muhammed El Sayed Custody', account_type: 'asset_cash', opening_raw: 78462.0 },
  { code: '121017', name: 'Yassin Hady Custody', account_type: 'asset_cash', opening_raw: 1648.19 },
  { code: '121019', name: 'Mohamed Nabil  Custody', account_type: 'asset_cash', opening_raw: -30521.85 },
  { code: '121021', name: 'moez orri custody', account_type: 'asset_cash', opening_raw: 132765.04 },
  { code: '121022', name: 'Mariam sherief custody', account_type: 'asset_cash', opening_raw: 2578.31 },
  { code: '121025', name: 'Amr Ali Custody', account_type: 'asset_cash', opening_raw: 820.0 },
  { code: '121026', name: 'Karim ibrahem custody', account_type: 'asset_cash', opening_raw: 20339.76 },
  { code: '121027', name: 'Abdelrahman hossam custody', account_type: 'asset_cash', opening_raw: 7340.44 },
  { code: '121028', name: 'Omar Kamel Custody', account_type: 'asset_cash', opening_raw: -0.59 },
  { code: '121031', name: 'Ahmed Temraz Custody', account_type: 'asset_cash', opening_raw: -12149.13 },
  { code: '121034', name: 'Bank Misr 0176 in EGP', account_type: 'asset_cash', opening_raw: 67.88 },
  { code: '121035', name: 'Rania Said custody', account_type: 'asset_cash', opening_raw: 886.0 },
  { code: '121036', name: 'Mahmoud  (Gouna) Custody', account_type: 'asset_cash', opening_raw: 6978.0 },
  { code: '121037', name: 'Mariam Medhat Custody', account_type: 'asset_cash', opening_raw: 901.12 },
  { code: '121038', name: 'mustafa fady custody', account_type: 'asset_cash', opening_raw: 148.75 },
  { code: '121039', name: 'Shady Gouna Custody', account_type: 'asset_cash', opening_raw: -7200.0 },
  { code: '121040', name: 'Mahmoud hanafy Custody', account_type: 'asset_cash', opening_raw: -23638.48 },
  { code: '121041', name: 'Yassin Karim Custody', account_type: 'asset_cash', opening_raw: 13970.0 },
  { code: '121042', name: 'Ahmed Kamel Custody', account_type: 'asset_cash', opening_raw: 7.32 },
  { code: '121043', name: 'Gehad Ashraf custody', account_type: 'asset_cash', opening_raw: 210.0 },
  { code: '121048', name: 'Abdelrahman Purchase custody', account_type: 'asset_cash', opening_raw: -3907.5 },
  { code: '121049', name: 'Mohamed Ahmed Operation custody', account_type: 'asset_cash', opening_raw: 567.0 },
  { code: '121051', name: 'Ahmed Abdelsalam Custody', account_type: 'asset_cash', opening_raw: 2.0 },
  { code: '121055', name: 'Dopey Account', account_type: 'asset_cash', opening_raw: 254610.0 },
  { code: '121056', name: 'Custody Of Saeid  (الكهربائي )', account_type: 'asset_cash', opening_raw: -70.0 },
  { code: '121058', name: 'Mohamed Zedan Custody', account_type: 'asset_cash', opening_raw: 28075.0 },
  { code: '121059', name: 'Walid Ahmed Custody', account_type: 'asset_cash', opening_raw: 200.0 },
  { code: '121060', name: 'Eman Mohamed Custody', account_type: 'asset_cash', opening_raw: 462.0 },
  { code: '121062', name: 'Abdelaziz Mohamed DRI Custody', account_type: 'asset_cash', opening_raw: 998.0 },
  { code: '121063', name: 'Amr Saad custody', account_type: 'asset_cash', opening_raw: 1000.0 },
  { code: '121067', name: 'EG Bank in EGP', account_type: 'asset_cash', opening_raw: 3393.06 },

  // Receivables (asset_receivable) — xlsx subtotal -796,296.00
  { code: '122001', name: 'Customers', account_type: 'asset_receivable', opening_raw: -796296.0 },

  // Current Assets (asset_current) — xlsx subtotal 4,806,642.42
  { code: '121052', name: 'Cash In Transit', account_type: 'asset_current', opening_raw: -2249.96 },
  { code: '113002', name: 'Contract Insurance - Guarantee', account_type: 'asset_current', opening_raw: 2930825.0 },
  { code: '122003', name: 'other Debtors', account_type: 'asset_current', opening_raw: 251.95 },
  { code: '124001', name: 'Deferred Expense', account_type: 'asset_current', opening_raw: 481174.5 },
  { code: '124005', name: 'Loans for employees', account_type: 'asset_current', opening_raw: 27000.0 },
  { code: '124006', name: 'Salaries in advance', account_type: 'asset_current', opening_raw: 6100.0 },
  { code: '125001', name: 'V.A.T On Purchase', account_type: 'asset_current', opening_raw: 1363540.93 },

  // Prepayments (asset_prepayments) — xlsx subtotal 4,713,167.41
  // 124004 is shown as two rows in the xlsx (134,231.90 + 96,704.92);
  // combined here so the byAccount.set() consumer doesn't drop one half.
  { code: '124004', name: 'Prepaid Expenses', account_type: 'asset_prepayments', opening_raw: 230936.82 },
  { code: '124007', name: 'Prepaid Interest', account_type: 'asset_prepayments', opening_raw: 4482230.59 },

  // Fixed Assets (asset_fixed) — xlsx subtotal 67,527,108.92
  { code: '111001', name: 'Furniture', account_type: 'asset_fixed', opening_raw: 11752236.64 },
  { code: '111002', name: 'Accum. -Office Furniture', account_type: 'asset_fixed', opening_raw: -487640.03 },
  { code: '111003', name: 'Electrical Devices', account_type: 'asset_fixed', opening_raw: 12095346.57 },
  { code: '111004', name: 'Accum. -electrical dev.', account_type: 'asset_fixed', opening_raw: -489529.69 },
  { code: '111005', name: 'Furnishings', account_type: 'asset_fixed', opening_raw: 2938799.34 },
  { code: '111006', name: 'Accu  Dep - Furnishings', account_type: 'asset_fixed', opening_raw: -629098.6 },
  { code: '111007', name: 'Computers &Net Work', account_type: 'asset_fixed', opening_raw: 776641.2 },
  { code: '111008', name: 'Accum. - Computers', account_type: 'asset_fixed', opening_raw: -68132.34 },
  { code: '111009', name: 'Tools Equipment', account_type: 'asset_fixed', opening_raw: 267401.01 },
  { code: '111010', name: 'Accum. Tools Equipment', account_type: 'asset_fixed', opening_raw: -45865.97 },
  { code: '111011', name: 'Lease Holding Improvements assets', account_type: 'asset_fixed', opening_raw: 20540742.69 },
  { code: '111012', name: 'Accu  Dep - Lease holding improvment', account_type: 'asset_fixed', opening_raw: -925027.83 },
  { code: '111013', name: 'Safety& Environmental equipment', account_type: 'asset_fixed', opening_raw: 748355.0 },
  { code: '111014', name: 'Accum. -Safety & Environmental equipment', account_type: 'asset_fixed', opening_raw: -31105.61 },
  { code: '111015', name: 'Asset Accessories', account_type: 'asset_fixed', opening_raw: 646786.44 },
  { code: '111016', name: 'Accum. -Asset Accessories', account_type: 'asset_fixed', opening_raw: -158120.91 },
  { code: '111017', name: 'Lease Holding Improvements Under Implementation', account_type: 'asset_fixed', opening_raw: 11234501.34 },
  { code: '111018', name: 'GYM Equipment', account_type: 'asset_fixed', opening_raw: 338899.0 },
  { code: '111019', name: 'Accum. -GYM Equipment', account_type: 'asset_fixed', opening_raw: -46458.21 },
  { code: '111020', name: 'vehicles', account_type: 'asset_fixed', opening_raw: 54000.0 },
  { code: '111021', name: 'Accum. -vehicles', account_type: 'asset_fixed', opening_raw: -1350.0 },
  { code: '111022', name: 'Cars', account_type: 'asset_fixed', opening_raw: 7900000.0 },
  { code: '111023', name: 'Accum. -Cars', account_type: 'asset_fixed', opening_raw: -197500.0 },
  { code: '111024', name: 'Smart Devices', account_type: 'asset_fixed', opening_raw: 776202.21 },
  { code: '111025', name: 'Accum. -Smart Devices', account_type: 'asset_fixed', opening_raw: -12973.33 },
  { code: '111026', name: 'Machinery & Equipment', account_type: 'asset_fixed', opening_raw: 550000.0 },

  // Current Liabilities (liability_current) — xlsx subtotal display 1,854,719.73
  // Notes Payable - Short Term (formerly 221002 in the prior xlsx, -6,138,396)
  // is rolled into 221001 under Non-current Liabilities — see below.
  // 227003 City Tax appears as two rows in the xlsx (1,338.28 + 3,003.70);
  // combined here.
  { code: '224001', name: 'deferred Revenue', account_type: 'liability_current', opening_raw: -968017.3 },
  { code: '227003', name: 'City Tax', account_type: 'liability_current', opening_raw: -4341.98 },
  { code: '223001', name: 'Accrued Salaries', account_type: 'liability_current', opening_raw: -254728.11 },
  { code: '223004', name: 'Accrued Others', account_type: 'liability_current', opening_raw: -5659.32 },
  { code: '223005', name: 'Accrued Expenses', account_type: 'liability_current', opening_raw: -74999.99 },
  { code: '225001', name: 'V.A.T On Sales', account_type: 'liability_current', opening_raw: -543234.27 },
  { code: '226002', name: 'with holding Tax', account_type: 'liability_current', opening_raw: -3738.76 },

  // Payables (liability_payable) — xlsx subtotal display 9,081,444.65
  { code: '227002', name: 'Suppliers', account_type: 'liability_payable', opening_raw: -9081444.65 },

  // Non-current Liabilities (liability_non_current) — xlsx subtotal display 70,387,221.82
  // 221001 now carries the consolidated Notes Payable balance
  // (formerly 11,937,183 Long Term + 6,138,396 Short Term = 18,075,579).
  { code: '221001', name: 'Notes Payable - Short Term', account_type: 'liability_non_current', opening_raw: -18075579.0 },
  { code: '222006', name: 'concrete plus Loans (EGP)', account_type: 'liability_non_current', opening_raw: -10000000.0 },
  { code: '222008', name: 'Total Lime Loan', account_type: 'liability_non_current', opening_raw: -42311642.82 },

  // Equity — xlsx subtotal display -4,365,411
  { code: '300200', name: 'Capital', account_type: 'equity', opening_raw: -1062500.0 },
  // Synthetic: 2025 Current Year rolled into equity_unaffected.
  { code: '', name: 'Previous Years Unallocated Earnings (2025 close)', account_type: 'equity_unaffected', opening_raw: 5427911.0 },
];
