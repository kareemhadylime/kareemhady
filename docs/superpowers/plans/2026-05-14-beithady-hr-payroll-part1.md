# Beithady HR — Monthly Payroll (Part 1: Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Run Part 1 fully before starting Part 2** (`2026-05-14-beithady-hr-payroll-part2.md`).

**Goal:** Lay the DB schema, TypeScript types, payroll parser (TDD), server queries/actions, Sprint 1 retrofix, and PDF payslip templates — everything Part 2 UI components depend on.

**Architecture:** Two new Supabase tables (`hr_payroll_months` + `hr_payroll_entries`) → parser extends `hr-import.ts` pattern → `previewPayrollAction` (no DB write) + `confirmPayrollAction` (overwrite upsert) → two `@react-pdf/renderer` templates (EN LTR + AR RTL using NotoSansArabic font already expected by FMPLUS module).

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Supabase · exceljs · @react-pdf/renderer ^4.1.6 · NotoSansArabic font (TTF in public/fonts/)

---

## File Map

| Status | Path | Purpose |
|---|---|---|
| **Create** | `supabase/migrations/0125_hr_payslip_language.sql` | Add payslip_language to hr_employees |
| **Create** | `supabase/migrations/0126_hr_payroll_tables.sql` | hr_payroll_months + hr_payroll_entries |
| **Create** | `public/fonts/NotoSansArabic-Regular.ttf` | Arabic font for PDF templates |
| **Create** | `src/lib/beithady/hr/hr-payroll-types.ts` | All payroll TS types |
| **Create** | `src/lib/beithady/hr/hr-payroll-parser.ts` | Excel parse + name-matching logic |
| **Create** | `src/lib/beithady/hr/hr-payroll-parser.test.ts` | Vitest TDD tests |
| **Create** | `src/lib/beithady/hr/hr-payroll-queries.ts` | Server-only DB reads |
| **Create** | `src/lib/beithady/hr/hr-payroll-actions.ts` | Server actions: preview + confirm |
| **Create** | `src/app/beithady/hr/payroll/_components/payslip-en.tsx` | English A4 PDF template |
| **Create** | `src/app/beithady/hr/payroll/_components/payslip-ar.tsx` | Arabic RTL A4 PDF template |
| **Modify** | `src/lib/beithady/hr/hr-types.ts` | Add payslip_language to HrEmployee + PersonalInfoInput |
| **Modify** | `src/app/beithady/hr/team/_components/personal-info-tab.tsx` | Add payslip_language radio |

---

## Task 1: Migrations + Arabic Font

**Files:**
- Create: `supabase/migrations/0125_hr_payslip_language.sql`
- Create: `supabase/migrations/0126_hr_payroll_tables.sql`
- Create: `public/fonts/NotoSansArabic-Regular.ttf`

- [ ] **Step 1: Create migration 0125**

```sql
-- supabase/migrations/0125_hr_payslip_language.sql
-- Add payslip language preference to employee master

alter table public.hr_employees
  add column payslip_language text not null default 'arabic'
  check (payslip_language in ('arabic', 'english'));

comment on column public.hr_employees.payslip_language
  is 'Language for printed payslips: arabic (default) or english.';
```

- [ ] **Step 2: Create migration 0126**

```sql
-- supabase/migrations/0126_hr_payroll_tables.sql
-- Beithady HR — Monthly Payroll tables (Sprint 2)

create table hr_payroll_months (
  id          uuid primary key default gen_random_uuid(),
  month_key   text not null unique,    -- "2026-04" (YYYY-MM)
  label       text not null,           -- "April 2026"
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references accounts(id)
);

create table hr_payroll_entries (
  id                  uuid primary key default gen_random_uuid(),
  month_id            uuid not null references hr_payroll_months(id) on delete cascade,
  employee_id         uuid references hr_employees(id) on delete set null,
  sheet_name          text not null,
  job_title           text,
  working_days        numeric not null default 0,
  salary_package      numeric not null default 0,
  ot                  numeric not null default 0,
  transport_allowance numeric not null default 0,
  bonus               numeric not null default 0,
  travel_allowance    numeric not null default 0,
  salary_in_advance   numeric not null default 0,
  deduction           numeric not null default 0,
  net_salary          numeric not null default 0,
  building_code       text,
  analytic_raw        text,
  is_terminated       boolean not null default false,
  created_at          timestamptz not null default now(),
  created_by          uuid references accounts(id)
);

create index idx_hr_payroll_entries_month    on hr_payroll_entries(month_id);
create index idx_hr_payroll_entries_employee on hr_payroll_entries(employee_id);
```

- [ ] **Step 3: Apply both migrations**

Open https://supabase.com/dashboard → project `bpjproljatbrbmszwbov` → SQL Editor.
Run migration 0125 first, then 0126.
Expected: "Success. No rows returned." for each.

- [ ] **Step 4: Verify**

```sql
select column_name from information_schema.columns
where table_name = 'hr_employees' and column_name = 'payslip_language';
-- expect 1 row

select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'hr_payroll%'
order by table_name;
-- expect: hr_payroll_entries, hr_payroll_months
```

- [ ] **Step 5: Download NotoSansArabic font**

Download the static Regular TTF from Google Fonts:
```
https://fonts.gstatic.com/s/notosansarabic/v18/nwpxtLGrOAZMl5nJ_wfgRg3DrWFZWsnVBJ_sS6tlqHHFlhQ5l3sQWIHPqzCfyG2vu3CBFQLaig.woff2
```

That's a woff2. Instead, use the direct TTF download:
```bash
curl -L "https://github.com/google/fonts/raw/main/ofl/notosansarabic/NotoSansArabic-Regular.ttf" \
  -o "public/fonts/NotoSansArabic-Regular.ttf"
```

Or: Go to https://fonts.google.com/noto/specimen/Noto+Sans+Arabic → Download family → extract `NotoSansArabic-Regular.ttf` → place at `public/fonts/NotoSansArabic-Regular.ttf`.

Create the directory first:
```bash
mkdir -p C:/kareemhady/public/fonts
```

Verify the file exists and is non-zero:
```bash
ls -lh C:/kareemhady/public/fonts/NotoSansArabic-Regular.ttf
```
Expected: file ~300–400 KB.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0125_hr_payslip_language.sql \
        supabase/migrations/0126_hr_payroll_tables.sql \
        public/fonts/NotoSansArabic-Regular.ttf
git commit -m "feat(hr): migrations 0125+0126 — payslip_language column + payroll tables; NotoSansArabic font"
```

---

## Task 2: Payroll Types

**Files:**
- Create: `src/lib/beithady/hr/hr-payroll-types.ts`

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep hr-payroll-types
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-payroll-types.ts
git commit -m "feat(hr): payroll TypeScript types"
```

---

## Task 3: Payroll Parser (TDD)

**Files:**
- Create: `src/lib/beithady/hr/hr-payroll-parser.test.ts`
- Create: `src/lib/beithady/hr/hr-payroll-parser.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/beithady/hr/hr-payroll-parser.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeForMatch, matchEmployeeName } from './hr-payroll-parser';

describe('normalizeForMatch', () => {
  it('lowercases input', () => {
    expect(normalizeForMatch('Mohamed ALI')).toBe('mohamed ali');
  });
  it('collapses multiple spaces', () => {
    expect(normalizeForMatch('Ahmed  Fathy')).toBe('ahmed fathy');
  });
  it('replaces hyphens with spaces', () => {
    expect(normalizeForMatch('Ahmed-Fathy')).toBe('ahmed fathy');
  });
  it('trims leading/trailing whitespace', () => {
    expect(normalizeForMatch('  Kareem  ')).toBe('kareem');
  });
});

describe('matchEmployeeName', () => {
  const employees = [
    { id: 'a1', first_name: 'Mohamed', last_name: 'Ali',    company_id: 'BH-001' },
    { id: 'a2', first_name: 'Ahmed',   last_name: 'Fathy',  company_id: 'BH-002' },
    { id: 'a3', first_name: 'Mohamed', last_name: 'Hassan', company_id: 'BH-003' },
  ];

  it('exact full-name match', () => {
    const r = matchEmployeeName('Mohamed Ali', employees);
    expect(r.status).toBe('matched');
    expect(r.matchedId).toBe('a1');
  });

  it('case-insensitive full-name match', () => {
    const r = matchEmployeeName('AHMED FATHY', employees);
    expect(r.status).toBe('matched');
    expect(r.matchedId).toBe('a2');
  });

  it('fuzzy: first_name contained in longer sheet name', () => {
    // "Ahmed Mohamed Fathy" contains "ahmed" and "fathy" → matches Ahmed Fathy
    const r = matchEmployeeName('Ahmed Mohamed Fathy', employees);
    expect(r.status).toBe('matched');
    expect(r.matchedId).toBe('a2');
  });

  it('ambiguous: multiple employees first_name matches', () => {
    // Both Mohamed Ali and Mohamed Hassan start with "Mohamed"
    const r = matchEmployeeName('Mohamed Kamal', employees);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('unmatched: no employee found', () => {
    const r = matchEmployeeName('Completely Unknown Person', employees);
    expect(r.status).toBe('unmatched');
    expect(r.matchedId).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- hr-payroll-parser
```
Expected: `Cannot find module './hr-payroll-parser'`.

- [ ] **Step 3: Implement the parser**

```typescript
// src/lib/beithady/hr/hr-payroll-parser.ts
// NOT server-only — imported by both client (preview) and server (actions).

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
 * Strategy: normalize both sides, then:
 *   1. Exact full-name match (first + last)
 *   2. All words of first+last appear in sheet name
 *   3. If multiple employees pass step 2 → ambiguous
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
    // All words of the employee's name appear in the sheet name words
    const empWords = fullName.split(' ').filter(Boolean);
    if (empWords.every(w => normWords.includes(w))) {
      fuzzy.push(emp);
    }
  }

  const allMatches = exact.length > 0 ? exact : fuzzy;

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
  // "2026-04" → "April 2026"
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
        if (v === 'name')                              col.name = i;
        if (v === 'jobtitle' || v === 'job title')     col.jobTitle = i;
        if (v.includes('working'))                     col.workingDays = i;
        if (v.includes('s.pack') || v === 'salary package') col.sPackage = i;
        if (v === 'ot' || v === 'overtime')            col.ot = i;
        if (v.includes('transport'))                   col.transport = i;
        if (v === 'bonus')                             col.bonus = i;
        if (v.includes('travel'))                      col.travel = i;
        if (v.includes('advance'))                     col.advance = i;
        if (v === 'deduction' || v === 'deductions')   col.deduction = i;
        if (v.includes('net'))                         col.net = i;
        if (v === 'analytic')                          col.analytic = i;
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
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- hr-payroll-parser
```
Expected: `9 passed`.

- [ ] **Step 5: Full suite check**

```bash
npm test -- --run 2>&1 | tail -5
```
Expected: all 471+ tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady/hr/hr-payroll-parser.ts src/lib/beithady/hr/hr-payroll-parser.test.ts
git commit -m "feat(hr): payroll Excel parser — all columns + name-matching (TDD, 9 tests)"
```

---

## Task 4: Payroll Queries (Server-Only)

**Files:**
- Create: `src/lib/beithady/hr/hr-payroll-queries.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/beithady/hr/hr-payroll-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { BUILDING_LABELS } from './hr-types';
import type { PayrollMonth, PayrollEntryRow, PayslipBatchFilter } from './hr-payroll-types';
import type { BuildingCode } from './hr-types';

export async function listPayrollMonths(): Promise<PayrollMonth[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_payroll_months')
    .select('*')
    .order('month_key', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PayrollMonth[];
}

export async function getPayrollMonth(monthId: string): Promise<PayrollMonth | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_payroll_months')
    .select('*')
    .eq('id', monthId)
    .single();
  if (error || !data) return null;
  return data as PayrollMonth;
}

export async function getMonthEntries(
  monthId: string,
  filters: PayslipBatchFilter = {}
): Promise<PayrollEntryRow[]> {
  const sb = supabaseAdmin();

  type RawEntry = PayrollEntryRow & {
    hr_employees: {
      first_name: string;
      last_name: string | null;
      arabic_name: string | null;
      company_id: string;
      payslip_language: string;
      portrait_url: string | null;
      department: string | null;
    } | null;
  };

  const { data, error } = await sb
    .from('hr_payroll_entries')
    .select('*, hr_employees(first_name, last_name, arabic_name, company_id, payslip_language, portrait_url, department)')
    .eq('month_id', monthId)
    .order('sheet_name');

  if (error) throw new Error(error.message);

  let rows: (PayrollEntryRow & { _department: string | null })[] = (data ?? []).map((e: RawEntry) => {
    const emp = e.hr_employees;
    const { hr_employees: _, ...entry } = e;
    return {
      ...entry,
      employee_name: emp ? `${emp.first_name} ${emp.last_name ?? ''}`.trim() : null,
      arabic_name:   emp?.arabic_name ?? null,
      bh_id:         emp?.company_id ?? null,
      payslip_language: (emp?.payslip_language ?? 'arabic') as 'arabic' | 'english',
      portrait_url:  emp?.portrait_url ?? null,
      department:    emp?.department ?? null,
      _department:   emp?.department ?? null,
    };
  });

  if (filters.building_codes?.length) {
    rows = rows.filter(r => filters.building_codes!.includes(r.building_code ?? ''));
  }
  if (filters.departments?.length) {
    rows = rows.filter(r => filters.departments!.includes(r._department ?? ''));
  }
  if (filters.exclude_terminated ?? true) {
    rows = rows.filter(r => !r.is_terminated);
  }

  return rows;
}

/** Build PayslipData for a single entry (used by payslip PDF templates). */
export function entryToPayslipData(entry: PayrollEntryRow, monthLabel: string) {
  const buildingLabel = entry.building_code
    ? (BUILDING_LABELS[entry.building_code as BuildingCode] ?? entry.building_code)
    : '—';

  return {
    month_label:        monthLabel,
    employee_name:      entry.employee_name ?? entry.sheet_name,
    arabic_name:        entry.arabic_name,
    bh_id:              entry.bh_id,
    job_title:          entry.job_title ?? '—',
    building_label:     buildingLabel,
    working_days:       entry.working_days,
    salary_package:     entry.salary_package,
    ot:                 entry.ot,
    transport_allowance:entry.transport_allowance,
    travel_allowance:   entry.travel_allowance,
    bonus:              entry.bonus,
    salary_in_advance:  entry.salary_in_advance,
    deduction:          entry.deduction,
    net_salary:         entry.net_salary,
  };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep hr-payroll-queries
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-payroll-queries.ts
git commit -m "feat(hr): payroll server-only queries — listMonths, getMonthEntries, entryToPayslipData"
```

---

## Task 5: Payroll Server Actions

**Files:**
- Create: `src/lib/beithady/hr/hr-payroll-actions.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/beithady/hr/hr-payroll-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { parsePayrollFile } from './hr-payroll-parser';
import type { PayrollPreviewResult, PayrollPreviewRow } from './hr-payroll-types';

type EmployeeStub = { id: string; first_name: string; last_name: string | null; company_id: string };

async function requireHrAccess() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return user;
}

// ── previewPayrollAction ──────────────────────────────────────────────────
// Parses Excel, runs name-matching. NO database writes.

export async function previewPayrollAction(
  formData: FormData
): Promise<{ result?: PayrollPreviewResult; error?: string }> {
  try {
    await requireHrAccess();
    const file = formData.get('file') as File | null;
    if (!file) return { error: 'No file provided' };

    const buffer = await file.arrayBuffer();

    // Fetch all employees for name-matching
    const sb = supabaseAdmin();
    const { data: empData, error: empErr } = await sb
      .from('hr_employees')
      .select('id, first_name, last_name, company_id');
    if (empErr) return { error: empErr.message };

    const result = await parsePayrollFile(buffer, (empData ?? []) as EmployeeStub[]);
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Parse error' };
  }
}

// ── confirmPayrollAction ──────────────────────────────────────────────────
// Upserts hr_payroll_months + overwrites hr_payroll_entries for the month.

export async function confirmPayrollAction(
  monthKey: string,
  label: string,
  rows: PayrollPreviewRow[]
): Promise<{ monthId?: string; error?: string }> {
  try {
    const user = await requireHrAccess();
    const sb = supabaseAdmin();

    // Upsert the month row
    const { data: month, error: monthErr } = await sb
      .from('hr_payroll_months')
      .upsert(
        { month_key: monthKey, label, uploaded_at: new Date().toISOString(), uploaded_by: user.id },
        { onConflict: 'month_key' }
      )
      .select('id')
      .single();

    if (monthErr || !month) return { error: monthErr?.message ?? 'Failed to create month' };

    const monthId = month.id as string;

    // Delete existing entries for this month (overwrite model)
    const { error: delErr } = await sb
      .from('hr_payroll_entries')
      .delete()
      .eq('month_id', monthId);
    if (delErr) return { error: delErr.message };

    // Insert new entries (skip rows with status 'error')
    const validRows = rows.filter(r => r.matchStatus !== 'error');
    if (validRows.length > 0) {
      const inserts = validRows.map(r => ({
        month_id:            monthId,
        employee_id:         r.matchedEmployeeId,
        sheet_name:          r.sheet_name,
        job_title:           r.job_title || null,
        working_days:        r.working_days,
        salary_package:      r.salary_package,
        ot:                  r.ot,
        transport_allowance: r.transport_allowance,
        bonus:               r.bonus,
        travel_allowance:    r.travel_allowance,
        salary_in_advance:   r.salary_in_advance,
        deduction:           r.deduction,
        net_salary:          r.net_salary,
        building_code:       r.building_code,
        analytic_raw:        r.analytic_raw,
        is_terminated:       r.is_terminated,
        created_by:          user.id,
      }));

      const { error: insErr } = await sb.from('hr_payroll_entries').insert(inserts);
      if (insErr) return { error: insErr.message };
    }

    revalidatePath('/beithady/hr/payroll');
    return { monthId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep hr-payroll-actions
```
Expected: no output.

- [ ] **Step 3: Run full suite**

```bash
npm test -- --run 2>&1 | tail -5
```
Expected: 471+ passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady/hr/hr-payroll-actions.ts
git commit -m "feat(hr): payroll server actions — previewPayroll (no DB) + confirmPayroll (upsert+overwrite)"
```

---

## Task 6: Sprint 1 Retrofix — payslip_language

**Files:**
- Modify: `src/lib/beithady/hr/hr-types.ts`
- Modify: `src/app/beithady/hr/team/_components/personal-info-tab.tsx`

- [ ] **Step 1: Add payslip_language to HrEmployee in hr-types.ts**

Read `src/lib/beithady/hr/hr-types.ts`. Find the `HrEmployee` type. Add `payslip_language: 'arabic' | 'english';` after `incomplete_fields`:

```typescript
export type HrEmployee = {
  // ...existing fields...
  incomplete_fields: string[];
  payslip_language: 'arabic' | 'english';  // ← ADD
  created_at: string;
  updated_at: string;
  created_by: string | null;
};
```

- [ ] **Step 2: Add payslip_language to PersonalInfoInput**

In the same file, find `PersonalInfoInput`. Add after `portrait_url`:

```typescript
export type PersonalInfoInput = {
  // ...existing fields...
  portrait_url: string;
  payslip_language: 'arabic' | 'english';  // ← ADD
};
```

- [ ] **Step 3: Add payslip_language radio to PersonalInfoTab**

Read `src/app/beithady/hr/team/_components/personal-info-tab.tsx`. After the Email field and before the Company ID field, add:

```tsx
{/* Payslip Language */}
<div className="space-y-1">
  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
    Payslip Language
  </label>
  <div className="flex gap-4">
    {(['arabic', 'english'] as const).map(lang => (
      <label key={lang} className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="payslip_language"
          value={lang}
          checked={data.payslip_language === lang}
          onChange={() => onChange({ payslip_language: lang })}
          className="accent-violet-600"
        />
        <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">{lang}</span>
      </label>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Update emptyPersonal() in add-edit-member-dialog.tsx**

Read `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx`. Find `emptyPersonal()` function. Add `payslip_language: 'arabic' as const` to the returned object:

```typescript
function emptyPersonal(): PersonalInfoInput {
  return {
    // ...existing fields...
    portrait_url: '',
    payslip_language: 'arabic',  // ← ADD
  };
}
```

Also update `employeeToPersonal()` to map the field:

```typescript
function employeeToPersonal(emp: HrEmployeeRow): PersonalInfoInput {
  return {
    // ...existing fields...
    portrait_url:      emp.portrait_url ?? '',
    payslip_language:  emp.payslip_language,  // ← ADD
  };
}
```

- [ ] **Step 5: Update hr-actions.ts addEmployeeAction and editEmployeeAction**

In `src/lib/beithady/hr/hr-actions.ts`, add `payslip_language: personal.payslip_language` to the insert/update objects in both `addEmployeeAction` and `editEmployeeAction`.

For `addEmployeeAction`, add to the `.insert({...})` call:
```typescript
payslip_language: personal.payslip_language,
```

For `editEmployeeAction`, add to the `.update({...})` call:
```typescript
payslip_language: personal.payslip_language,
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 7: Run full suite**

```bash
npm test -- --run 2>&1 | tail -5
```
Expected: all tests still passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/beithady/hr/hr-types.ts \
        src/app/beithady/hr/team/_components/personal-info-tab.tsx \
        src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx \
        src/lib/beithady/hr/hr-actions.ts
git commit -m "feat(hr): Sprint 1 retrofix — payslip_language field on employee profile + Personal Info tab radio"
```

---

## Task 7: PDF Payslip Templates

**Files:**
- Create: `src/app/beithady/hr/payroll/_components/payslip-en.tsx`
- Create: `src/app/beithady/hr/payroll/_components/payslip-ar.tsx`

These are `server-only` React components using `@react-pdf/renderer`. They follow the exact pattern from `src/lib/beithady/fees-audit/render-pdf.tsx`.

- [ ] **Step 1: Create the English template**

```tsx
// src/app/beithady/hr/payroll/_components/payslip-en.tsx
import 'server-only';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document, Page, Text, View, Image, StyleSheet,
} from '@react-pdf/renderer';
import type { PayslipData } from '@/lib/beithady/hr/hr-payroll-types';

const C = {
  brand:   '#003462',
  ink:     '#1a2c47',
  muted:   '#7a8aa3',
  line:    '#e2e8f0',
  bg:      '#f8fafc',
  green:   '#15803d',
  red:     '#b91c1c',
};

let _logo: Buffer | null = null;
function getLogo(): Buffer | null {
  if (_logo) return _logo;
  try {
    _logo = readFileSync(join(process.cwd(), 'public', 'brand', 'beithady', 'logo-stacked.jpg'));
    return _logo;
  } catch { return null; }
}

const s = StyleSheet.create({
  page:       { padding: 32, fontSize: 9, fontFamily: 'Helvetica', color: C.ink, backgroundColor: '#ffffff' },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: C.brand },
  logo:       { width: 70, height: 35, objectFit: 'contain' },
  titleBlock: { alignItems: 'flex-end' },
  title:      { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.brand },
  month:      { fontSize: 9, color: C.muted, marginTop: 2 },
  empBox:     { backgroundColor: C.bg, borderRadius: 4, padding: 10, marginBottom: 14 },
  empName:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.brand, marginBottom: 3 },
  empMeta:    { fontSize: 8, color: C.muted },
  section:    { marginBottom: 12 },
  sHead:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.brand, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: C.line },
  row:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowAlt:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, backgroundColor: C.bg },
  label:      { fontSize: 8.5, color: C.ink },
  amount:     { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1, borderTopColor: C.line, marginTop: 2 },
  totalLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.brand },
  totalAmt:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.brand },
  netBox:     { backgroundColor: C.brand, borderRadius: 4, padding: 10, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel:   { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  netAmt:     { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  footer:     { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' },
  sigBlock:   { width: '45%' },
  sigLabel:   { fontSize: 7.5, color: C.muted, marginBottom: 16 },
  sigLine:    { borderBottomWidth: 1, borderBottomColor: C.line },
});

function fmt(n: number): string {
  return `EGP ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function PayslipEn({ data }: { data: PayslipData }) {
  const logo = getLogo();
  const totalEarnings = data.salary_package + data.ot + data.transport_allowance + data.travel_allowance + data.bonus;
  const totalDeductions = data.salary_in_advance + data.deduction;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          {logo ? <Image style={s.logo} src={logo} /> : <View />}
          <View style={s.titleBlock}>
            <Text style={s.title}>Salary Slip</Text>
            <Text style={s.month}>{data.month_label}</Text>
          </View>
        </View>

        {/* Employee */}
        <View style={s.empBox}>
          <Text style={s.empName}>{data.employee_name}</Text>
          <Text style={s.empMeta}>
            {data.bh_id ? `${data.bh_id}  ·  ` : ''}{data.job_title}  ·  {data.building_label}
          </Text>
          <Text style={[s.empMeta, { marginTop: 2 }]}>Working Days: {data.working_days}</Text>
        </View>

        {/* Earnings */}
        <View style={s.section}>
          <Text style={s.sHead}>Earnings</Text>
          {[
            ['Basic Salary', data.salary_package],
            ['Overtime', data.ot],
            ['Transport Allowance', data.transport_allowance],
            ['Travel Allowance', data.travel_allowance],
            ['Bonus', data.bonus],
          ].map(([label, amount], i) => (
            <View key={String(label)} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.amount}>{fmt(Number(amount))}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total Earnings</Text>
            <Text style={s.totalAmt}>{fmt(totalEarnings)}</Text>
          </View>
        </View>

        {/* Deductions */}
        <View style={s.section}>
          <Text style={s.sHead}>Deductions</Text>
          {[
            ['Salary in Advance', data.salary_in_advance],
            ['Other Deductions', data.deduction],
          ].map(([label, amount], i) => (
            <View key={String(label)} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.amount}>{fmt(Number(amount))}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total Deductions</Text>
            <Text style={s.totalAmt}>{fmt(totalDeductions)}</Text>
          </View>
        </View>

        {/* Net */}
        <View style={s.netBox}>
          <Text style={s.netLabel}>NET SALARY</Text>
          <Text style={s.netAmt}>{fmt(data.net_salary)}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.sigBlock}>
            <Text style={s.sigLabel}>HR Signature</Text>
            <View style={s.sigLine} />
          </View>
          <View style={s.sigBlock}>
            <Text style={s.sigLabel}>Employee Signature</Text>
            <View style={s.sigLine} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Create the Arabic template**

```tsx
// src/app/beithady/hr/payroll/_components/payslip-ar.tsx
import 'server-only';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document, Page, Text, View, Image, StyleSheet, Font,
} from '@react-pdf/renderer';
import type { PayslipData } from '@/lib/beithady/hr/hr-payroll-types';

// Register Arabic font — same TTF used by FMPLUS budget reports
try {
  Font.register({
    family: 'NotoSansArabic',
    src: '/fonts/NotoSansArabic-Regular.ttf',
  });
} catch { /* degrade silently in test env */ }

const C = {
  brand: '#003462',
  ink:   '#1a2c47',
  muted: '#7a8aa3',
  line:  '#e2e8f0',
  bg:    '#f8fafc',
};

let _logo: Buffer | null = null;
function getLogo(): Buffer | null {
  if (_logo) return _logo;
  try {
    _logo = readFileSync(join(process.cwd(), 'public', 'brand', 'beithady', 'logo-stacked.jpg'));
    return _logo;
  } catch { return null; }
}

const AR = StyleSheet.create({
  page:     { padding: 32, fontSize: 9, fontFamily: 'NotoSansArabic', color: C.ink, backgroundColor: '#ffffff', direction: 'rtl' },
  header:   { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: C.brand },
  logo:     { width: 70, height: 35, objectFit: 'contain' },
  titleBlk: { alignItems: 'flex-start' },
  title:    { fontSize: 16, color: C.brand },
  month:    { fontSize: 9, color: C.muted, marginTop: 2 },
  empBox:   { backgroundColor: C.bg, borderRadius: 4, padding: 10, marginBottom: 14, alignItems: 'flex-end' },
  empName:  { fontSize: 12, color: C.brand, marginBottom: 3 },
  empMeta:  { fontSize: 8, color: C.muted },
  section:  { marginBottom: 12 },
  sHead:    { fontSize: 8, color: C.brand, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: C.line, textAlign: 'right' },
  row:      { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 3 },
  rowAlt:   { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 3, backgroundColor: C.bg },
  label:    { fontSize: 8.5, color: C.ink, textAlign: 'right' },
  amount:   { fontSize: 8.5, color: C.ink },
  totalRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1, borderTopColor: C.line, marginTop: 2 },
  totLbl:   { fontSize: 9, color: C.brand, textAlign: 'right' },
  totAmt:   { fontSize: 9, color: C.brand },
  netBox:   { backgroundColor: C.brand, borderRadius: 4, padding: 10, marginTop: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 12, color: '#ffffff' },
  netAmt:   { fontSize: 14, color: '#ffffff' },
  footer:   { marginTop: 20, flexDirection: 'row-reverse', justifyContent: 'space-between' },
  sigBlk:   { width: '45%', alignItems: 'flex-end' },
  sigLbl:   { fontSize: 7.5, color: C.muted, marginBottom: 16 },
  sigLine:  { borderBottomWidth: 1, borderBottomColor: C.line, width: '100%' },
});

function fmt(n: number): string {
  return `${n.toLocaleString('ar-EG', { minimumFractionDigits: 0 })} جنيه`;
}

export function PayslipAr({ data }: { data: PayslipData }) {
  const logo = getLogo();
  const totalEarnings = data.salary_package + data.ot + data.transport_allowance + data.travel_allowance + data.bonus;
  const totalDeductions = data.salary_in_advance + data.deduction;
  const displayName = data.arabic_name ?? data.employee_name;

  return (
    <Document>
      <Page size="A4" style={AR.page}>
        {/* Header */}
        <View style={AR.header}>
          {logo ? <Image style={AR.logo} src={logo} /> : <View />}
          <View style={AR.titleBlk}>
            <Text style={AR.title}>كشف مرتب</Text>
            <Text style={AR.month}>{data.month_label}</Text>
          </View>
        </View>

        {/* Employee */}
        <View style={AR.empBox}>
          <Text style={AR.empName}>{displayName}</Text>
          <Text style={AR.empMeta}>
            {data.bh_id ? `${data.bh_id}  ·  ` : ''}{data.job_title}  ·  {data.building_label}
          </Text>
          <Text style={[AR.empMeta, { marginTop: 2 }]}>أيام العمل: {data.working_days}</Text>
        </View>

        {/* Earnings */}
        <View style={AR.section}>
          <Text style={AR.sHead}>المكافآت</Text>
          {([
            ['الراتب الأساسي',  data.salary_package],
            ['العمل الإضافي',   data.ot],
            ['بدل مواصلات',     data.transport_allowance],
            ['بدل سفر',         data.travel_allowance],
            ['مكافأة',          data.bonus],
          ] as [string, number][]).map(([label, amount], i) => (
            <View key={label} style={i % 2 === 0 ? AR.row : AR.rowAlt}>
              <Text style={AR.label}>{label}</Text>
              <Text style={AR.amount}>{fmt(amount)}</Text>
            </View>
          ))}
          <View style={AR.totalRow}>
            <Text style={AR.totLbl}>إجمالي المكافآت</Text>
            <Text style={AR.totAmt}>{fmt(totalEarnings)}</Text>
          </View>
        </View>

        {/* Deductions */}
        <View style={AR.section}>
          <Text style={AR.sHead}>الخصومات</Text>
          {([
            ['سلفة',          data.salary_in_advance],
            ['خصومات أخرى',   data.deduction],
          ] as [string, number][]).map(([label, amount], i) => (
            <View key={label} style={i % 2 === 0 ? AR.row : AR.rowAlt}>
              <Text style={AR.label}>{label}</Text>
              <Text style={AR.amount}>{fmt(amount)}</Text>
            </View>
          ))}
          <View style={AR.totalRow}>
            <Text style={AR.totLbl}>إجمالي الخصومات</Text>
            <Text style={AR.totAmt}>{fmt(totalDeductions)}</Text>
          </View>
        </View>

        {/* Net */}
        <View style={AR.netBox}>
          <Text style={AR.netLabel}>صافي الراتب</Text>
          <Text style={AR.netAmt}>{fmt(data.net_salary)}</Text>
        </View>

        {/* Footer */}
        <View style={AR.footer}>
          <View style={AR.sigBlk}>
            <Text style={AR.sigLbl}>توقيع قسم الموارد البشرية</Text>
            <View style={AR.sigLine} />
          </View>
          <View style={AR.sigBlk}>
            <Text style={AR.sigLbl}>توقيع الموظف</Text>
            <View style={AR.sigLine} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/hr/payroll/_components/payslip-en.tsx \
        src/app/beithady/hr/payroll/_components/payslip-ar.tsx
git commit -m "feat(hr): bilingual payslip PDF templates — EN (LTR) + AR (RTL, NotoSansArabic)"
```

---

## Part 1 Complete

| ✅ | What's done |
|---|---|
| Migrations | 0125 (payslip_language) + 0126 (payroll tables) applied to production |
| Font | NotoSansArabic-Regular.ttf at public/fonts/ |
| Types | hr-payroll-types.ts — all payroll + payslip shapes |
| Parser | hr-payroll-parser.ts — all 12 salary columns + name-matching (9 TDD tests) |
| Queries | hr-payroll-queries.ts — listMonths, getMonthEntries, entryToPayslipData |
| Actions | hr-payroll-actions.ts — previewPayroll + confirmPayroll (overwrite) |
| Retrofix | payslip_language on HrEmployee + PersonalInfoInput + tab radio + actions |
| Templates | payslip-en.tsx (LTR) + payslip-ar.tsx (RTL Arabic) |

**Next:** Run `2026-05-14-beithady-hr-payroll-part2.md` for API routes + UI components.
