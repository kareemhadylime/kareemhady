// src/lib/beithady/hr/hr-payroll-types.ts
// Pure types — no imports from other modules. Safe for any context.

export type PayrollMonth = {
  id: string;
  month_key: string;   // "2026-04"
  label: string;       // "April 2026"
  uploaded_at: string;
  uploaded_by: string | null;
};

export type PayrollEntry = {
  id: string;
  month_id: string;
  employee_id: string | null;
  sheet_name: string;
  job_title: string | null;
  working_days: number;
  salary_package: number;
  ot: number;
  transport_allowance: number;
  bonus: number;
  travel_allowance: number;
  salary_in_advance: number;
  deduction: number;
  net_salary: number;
  building_code: string | null;
  analytic_raw: string | null;
  is_terminated: boolean;
  created_at: string;
};

// Joined view: entry + matched employee fields (used by roster + payslip generator)
export type PayrollEntryRow = PayrollEntry & {
  employee_name: string | null;
  arabic_name: string | null;
  bh_id: string | null;
  payslip_language: 'arabic' | 'english';
  portrait_url: string | null;
  department: string | null;
};

// ── Parser / preview types ─────────────────────────────────────────────────

export type MatchStatus = 'matched' | 'unmatched' | 'ambiguous' | 'error';

export type MatchCandidate = {
  id: string;
  name: string;       // display: "first_name last_name"
  company_id: string; // "BH-001"
};

export type PayrollPreviewRow = {
  rowIndex: number;
  sheet_name: string;
  job_title: string;
  working_days: number;
  salary_package: number;
  ot: number;
  transport_allowance: number;
  bonus: number;
  travel_allowance: number;
  salary_in_advance: number;
  deduction: number;
  net_salary: number;
  building_code: string | null;   // mapped from Analytic column
  analytic_raw: string;
  is_terminated: boolean;
  matchStatus: MatchStatus;
  matchedEmployeeId: string | null;   // set when matchStatus === 'matched'
  matchCandidates: MatchCandidate[];  // set when matchStatus === 'ambiguous'
  errorMessage: string;               // set when matchStatus === 'error'
};

export type PayrollPreviewResult = {
  rows: PayrollPreviewRow[];
  suggestedMonthKey: string;  // "2026-04" — current calendar month
  suggestedLabel: string;     // "April 2026"
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  errorCount: number;
};

// ── Payslip data shape (passed to both PDF templates) ─────────────────────

export type PayslipData = {
  month_label: string;          // "April 2026"
  employee_name: string;        // EN name from sheet or employee master
  arabic_name: string | null;   // from hr_employees (used in AR template)
  bh_id: string | null;         // null if unmatched
  job_title: string;
  building_label: string;       // "BH-26 (Lotus 26)"
  working_days: number;
  salary_package: number;
  ot: number;
  transport_allowance: number;
  travel_allowance: number;
  bonus: number;
  salary_in_advance: number;
  deduction: number;
  net_salary: number;
};

// ── Batch filter ──────────────────────────────────────────────────────────

export type PayslipBatchFilter = {
  building_codes?: string[];    // empty array = all buildings
  departments?: string[];       // empty array = all departments
  exclude_terminated?: boolean; // default true
};
