// src/lib/beithady/hr/hr-payroll-parser.ts
// NOT server-only — imported by client preview and server actions.

import { mapAnalyticToBuilding, isRedFill } from './hr-import';
import type {
  PayrollPreviewRow, PayrollPreviewResult, MatchStatus, MatchCandidate,
} from './hr-payroll-types';

// ── Name matching ─────────────────────────────────────────────────────────

/** Lowercase, collapse spaces, replace hyphens with spaces, trim. */
export function normalizeForMatch(name: string): string {
  return name.toLowerCase().replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
}

type EmployeeStub = { id: string; first_name: string; last_name: string | null; company_id: string };

export type MatchResult = {
  status: MatchStatus;
  matchedId: string | null;
  candidates: MatchCandidate[];
};

/**
 * Match a sheet name against the employee list.
 * Strategy (in order):
 *   1. Exact full-name match (normalized first + last)
 *   2. All words of employee name appear in sheet name words
 *   3. Multiple matches → ambiguous
 *   4. No match → unmatched
 */
export function matchEmployeeName(sheetName: string, employees: EmployeeStub[]): MatchResult {
  const norm = normalizeForMatch(sheetName);
  const normWords = norm.split(' ').filter(Boolean);

  const exact: EmployeeStub[] = [];
  const fuzzy: EmployeeStub[] = [];

  for (const emp of employees) {
    const fullName = normalizeForMatch(
      `${emp.first_name} ${emp.last_name ?? ''}`.trim()
    );
    if (fullName === norm) {
      exact.push(emp);
      continue;
    }
    // All words of the employee's normalized name appear in the sheet name words
    const empWords = fullName.split(' ').filter(Boolean);
    if (empWords.every(w => normWords.includes(w))) {
      fuzzy.push(emp);
    }
  }

  // Fallback: match on first name only (any employee whose first name word
  // appears in the sheet name words) — used to surface ambiguous cases like
  // "Mohamed Kamal" matching both "Mohamed Ali" and "Mohamed Hassan".
  const firstNameOnly: EmployeeStub[] = [];
  if (exact.length === 0 && fuzzy.length === 0) {
    for (const emp of employees) {
      const firstName = normalizeForMatch(emp.first_name);
      if (normWords.includes(firstName)) {
        firstNameOnly.push(emp);
      }
    }
  }

  const allMatches = exact.length > 0 ? exact : fuzzy.length > 0 ? fuzzy : firstNameOnly;

  if (allMatches.length === 1) {
    return { status: 'matched', matchedId: allMatches[0].id, candidates: [] };
  }
  if (allMatches.length > 1) {
    return {
      status: 'ambiguous',
      matchedId: null,
      candidates: allMatches.map(e => ({
        id: e.id,
        name: `${e.first_name} ${e.last_name ?? ''}`.trim(),
        company_id: e.company_id,
      })),
    };
  }
  return { status: 'unmatched', matchedId: null, candidates: [] };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0).replace(/,/g, ''));
  return isNaN(n) || n < 0 ? 0 : n;
}

function safeStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text);
  return String(v).trim();
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// ── XLSX parsing ──────────────────────────────────────────────────────────

/**
 * Parse a full monthly salary Excel sheet.
 * Captures ALL columns: Name, JobTitle, Working days, S.Package, OT,
 * Transportation Allowance, Bonus, Travel Allowance, salary in advance,
 * Deduction, Net Salary, Analytic.
 *
 * employees: list from hr_employees used for name-matching.
 */
export async function parsePayrollFile(
  buffer: ArrayBuffer,
  employees: EmployeeStub[]
): Promise<PayrollPreviewResult> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in file');

  // Find header row by locating a cell containing "Name"
  let headerRow = -1;
  const col: Record<string, number> = {};

  sheet.eachRow((row, rowNum) => {
    if (headerRow !== -1) return;
    const vals = row.values as unknown[];
    const lower = vals.map(v => safeStr(v).toLowerCase());
    if (lower.some(v => v === 'name')) {
      headerRow = rowNum;
      lower.forEach((v, i) => {
        if (v === 'name')                                   col.name = i;
        if (v === 'jobtitle' || v === 'job title')          col.jobTitle = i;
        if (v.includes('working'))                          col.workingDays = i;
        if (v.includes('s.pack') || v === 'salary package') col.sPackage = i;
        if (v === 'ot' || v === 'overtime')                 col.ot = i;
        if (v.includes('transport'))                        col.transport = i;
        if (v === 'bonus')                                  col.bonus = i;
        if (v.includes('travel'))                           col.travel = i;
        if (v.includes('advance'))                          col.advance = i;
        if (v === 'deduction' || v === 'deductions')        col.deduction = i;
        if (v.includes('net'))                              col.net = i;
        if (v === 'analytic')                               col.analytic = i;
      });
    }
  });

  if (headerRow === -1) throw new Error('Could not find header row — expected a row with "Name" column');

  const rows: PayrollPreviewRow[] = [];

  sheet.eachRow((row, rowNum) => {
    if (rowNum <= headerRow) return;
    const vals = row.values as unknown[];
    const name = safeStr(vals[col.name ?? 1]);
    if (!name) return;

    // Red-fill detection
    let redRow = false;
    for (let c = 1; c <= Math.min(row.cellCount, 3); c++) {
      const fill = row.getCell(c).fill;
      if (fill?.type === 'pattern' && 'fgColor' in fill) {
        const argb = (fill as { fgColor?: { argb?: string } }).fgColor?.argb ?? '';
        if (argb && isRedFill(argb)) { redRow = true; break; }
      }
    }

    const analytic = safeStr(vals[col.analytic ?? 0]);
    const match = matchEmployeeName(name, employees);

    rows.push({
      rowIndex: rowNum,
      sheet_name: name,
      job_title: safeStr(vals[col.jobTitle ?? 0]),
      working_days: safeNum(vals[col.workingDays ?? 0]),
      salary_package: safeNum(vals[col.sPackage ?? 0]),
      ot: safeNum(vals[col.ot ?? 0]),
      transport_allowance: safeNum(vals[col.transport ?? 0]),
      bonus: safeNum(vals[col.bonus ?? 0]),
      travel_allowance: safeNum(vals[col.travel ?? 0]),
      salary_in_advance: safeNum(vals[col.advance ?? 0]),
      deduction: safeNum(vals[col.deduction ?? 0]),
      net_salary: safeNum(vals[col.net ?? 0]),
      building_code: mapAnalyticToBuilding(analytic),
      analytic_raw: analytic,
      is_terminated: redRow,
      matchStatus: match.status,
      matchedEmployeeId: match.matchedId,
      matchCandidates: match.candidates,
      errorMessage: '',
    });
  });

  const now = new Date();
  const suggestedMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const suggestedLabel = monthLabel(suggestedMonthKey);

  return {
    rows,
    suggestedMonthKey,
    suggestedLabel,
    matchedCount:   rows.filter(r => r.matchStatus === 'matched').length,
    unmatchedCount: rows.filter(r => r.matchStatus === 'unmatched').length,
    ambiguousCount: rows.filter(r => r.matchStatus === 'ambiguous').length,
    errorCount:     rows.filter(r => r.matchStatus === 'error').length,
  };
}
