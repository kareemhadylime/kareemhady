# Beithady HR Sprint 4: Daily Attendance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/beithady/hr/attendance` — download a pre-filled attendance template, upload it back via a 3-step wizard, and let admins approve records; attendance is a standalone report with no payroll integration.

**Architecture:** One new DB table (`hr_attendance_records`). A server-only query layer fetches employees + attendance records and merges them in app code (same pattern as salary-access). A `'use server'` actions file handles preview, confirm, and approve. A GET route streams the Excel template and a second GET route serves the day-view JSON for the client. A `'use client'` board re-fetches when filters change; a `'use client'` import dialog wraps the 3-step wizard.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind v4 · Supabase (supabaseAdmin) · ExcelJS · Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0128_hr_attendance.sql` | Create | hr_attendance_records table + indexes |
| `src/lib/beithady/hr/hr-attendance-types.ts` | Create | Pure types: AttendanceRecord, AttendanceRow, AttendancePreviewRow, etc. |
| `src/lib/beithady/hr/hr-attendance-parser.ts` | Create | normalizeAttendanceStatus, matchByBhId, parseAttendanceFile |
| `src/lib/beithady/hr/hr-attendance-parser.test.ts` | Create | Unit tests for pure functions |
| `src/lib/beithady/hr/hr-attendance-queries.ts` | Create | getAttendanceDayView, getActiveEmployeesForFilter, getProtectedEmployeeIds |
| `src/lib/beithady/hr/hr-attendance-actions.ts` | Create | previewAttendanceAction, confirmAttendanceAction, approveAttendanceAction, approveAttendanceRowAction |
| `src/app/api/hr/attendance/template/route.ts` | Create | GET — stream pre-filled Excel template |
| `src/app/api/hr/attendance/day-view/route.ts` | Create | GET — return AttendanceRow[] for board re-fetch |
| `src/app/beithady/hr/attendance/_components/import-attendance-dialog.tsx` | Create | 3-step upload → preview → saved wizard |
| `src/app/beithady/hr/attendance/_components/attendance-board.tsx` | Create | Client table + filters + approve + download + import |
| `src/app/beithady/hr/attendance/page.tsx` | Create | Server component, auth-gated |
| `src/app/beithady/hr/page.tsx` | Modify | Remove disabled + comingSoonLabel from Sprint 4 tile |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/0128_hr_attendance.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0128_hr_attendance.sql
-- Beithady HR — Daily Attendance (Sprint 4)

create table public.hr_attendance_records (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.hr_employees(id) on delete cascade,
  date           date not null,
  status         text not null check (status in ('present', 'absent')),
  building_code  text,
  approval_state text not null default 'pending'
                 check (approval_state in ('pending', 'approved')),
  submitted_by   uuid references public.app_users(id),
  submitted_at   timestamptz not null default now(),
  approved_by    uuid references public.app_users(id),
  approved_at    timestamptz,
  constraint uq_hr_attendance_emp_date unique (employee_id, date)
);

create index idx_hr_attendance_date     on public.hr_attendance_records(date);
create index idx_hr_attendance_employee on public.hr_attendance_records(employee_id);
create index idx_hr_attendance_building on public.hr_attendance_records(building_code);
create index idx_hr_attendance_pending  on public.hr_attendance_records(date, approval_state)
  where approval_state = 'pending';
```

- [ ] **Step 2: Apply the migration**

Paste the SQL into the Supabase dashboard SQL Editor for project `bpjproljatbrbmszwbov` and run it. Verify success.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0128_hr_attendance.sql
git commit -m "feat(hr): migration 0128 — hr_attendance_records table"
```

---

## Task 2: Types + Parser (TDD)

**Files:**
- Create: `src/lib/beithady/hr/hr-attendance-types.ts`
- Create: `src/lib/beithady/hr/hr-attendance-parser.test.ts`
- Create: `src/lib/beithady/hr/hr-attendance-parser.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/lib/beithady/hr/hr-attendance-types.ts
// Pure types — no imports. Safe for any context.

export type AttendanceStatus = 'present' | 'absent';
export type AttendanceApprovalState = 'pending' | 'approved';
export type AttendanceMatchStatus = 'matched' | 'unmatched' | 'protected' | 'error';

/** DB row shape for hr_attendance_records */
export type AttendanceRecord = {
  id: string;
  employee_id: string;
  date: string;                       // YYYY-MM-DD
  status: AttendanceStatus;
  building_code: string | null;
  approval_state: AttendanceApprovalState;
  submitted_by: string | null;
  submitted_at: string;
  approved_by: string | null;
  approved_at: string | null;
};

/** Row shown in the attendance board — employee + optional attendance record for the day */
export type AttendanceRow = {
  employee_id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  arabic_name: string | null;
  department: string;
  building_code: string | null;       // from active contract
  record_id: string | null;           // null if no attendance record for this day
  status: AttendanceStatus | null;
  approval_state: AttendanceApprovalState | null;
};

/** One row produced by the Excel parser */
export type AttendancePreviewRow = {
  rowIndex: number;
  sheet_name: string;                 // Name from sheet (or BH-ID if name blank)
  bh_id_raw: string;                  // raw BH-ID from sheet
  status_raw: string;                 // raw status string from sheet
  status: AttendanceStatus | null;    // null if status was unparseable
  matchStatus: AttendanceMatchStatus;
  matchedEmployeeId: string | null;
  building_code: string | null;       // from matched employee's active contract
  errorMessage: string;
};

export type AttendancePreviewResult = {
  rows: AttendancePreviewRow[];
  suggestedDate: string;   // YYYY-MM-DD inferred from sheet or today
  matchedCount: number;
  unmatchedCount: number;
  protectedCount: number;
  errorCount: number;
};

export type AttendanceFilter = {
  date: string;             // YYYY-MM-DD
  building?: string;
  department?: string;
};
```

- [ ] **Step 2: Write the failing tests**

```typescript
// src/lib/beithady/hr/hr-attendance-parser.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeAttendanceStatus, matchByBhId } from './hr-attendance-parser';

describe('normalizeAttendanceStatus', () => {
  it('accepts "present"', () => expect(normalizeAttendanceStatus('present')).toBe('present'));
  it('accepts "Present" (case)', () => expect(normalizeAttendanceStatus('Present')).toBe('present'));
  it('accepts "p"', () => expect(normalizeAttendanceStatus('p')).toBe('present'));
  it('accepts "1"', () => expect(normalizeAttendanceStatus('1')).toBe('present'));
  it('accepts "yes"', () => expect(normalizeAttendanceStatus('yes')).toBe('present'));
  it('accepts "absent"', () => expect(normalizeAttendanceStatus('absent')).toBe('absent'));
  it('accepts "Absent" (case)', () => expect(normalizeAttendanceStatus('Absent')).toBe('absent'));
  it('accepts "a"', () => expect(normalizeAttendanceStatus('a')).toBe('absent'));
  it('accepts "0"', () => expect(normalizeAttendanceStatus('0')).toBe('absent'));
  it('accepts "no"', () => expect(normalizeAttendanceStatus('no')).toBe('absent'));
  it('rejects unknown "xyz"', () => expect(normalizeAttendanceStatus('xyz')).toBeNull());
  it('rejects empty string', () => expect(normalizeAttendanceStatus('')).toBeNull());
});

describe('matchByBhId', () => {
  const employees = [
    { id: 'a1', company_id: 'BH-001', first_name: 'Mohamed', last_name: 'Ali',   building_code: 'BH-26' },
    { id: 'a2', company_id: 'BH-002', first_name: 'Ahmed',   last_name: 'Fathy', building_code: 'BH-73' },
  ];

  it('matches exact BH-ID', () => {
    expect(matchByBhId('BH-001', employees)?.id).toBe('a1');
  });
  it('case-insensitive match', () => {
    expect(matchByBhId('bh-001', employees)?.id).toBe('a1');
  });
  it('trims whitespace', () => {
    expect(matchByBhId(' BH-002 ', employees)?.id).toBe('a2');
  });
  it('returns null for unknown BH-ID', () => {
    expect(matchByBhId('BH-999', employees)).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(matchByBhId('', employees)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```
npm test -- --run hr-attendance-parser
```

Expected: FAIL — `normalizeAttendanceStatus` and `matchByBhId` not found.

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/beithady/hr/hr-attendance-parser.ts
// NOT server-only — imported by client preview and server actions.

import { matchEmployeeName, normalizeForMatch } from './hr-payroll-parser';
import type { AttendancePreviewRow, AttendancePreviewResult, AttendanceStatus } from './hr-attendance-types';

// ── Pure functions ────────────────────────────────────────────────────────────

export type AttendanceEmployeeStub = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  building_code: string | null;
};

/**
 * Normalise a raw status cell value from the attendance Excel.
 * Accepts English and common shorthand. Returns null for unrecognised values.
 */
export function normalizeAttendanceStatus(raw: string): AttendanceStatus | null {
  const s = raw.toLowerCase().trim();
  if (['present', 'p', '1', 'yes', 'y', 'حاضر'].includes(s)) return 'present';
  if (['absent', 'a', '0', 'no', 'n', 'غائب'].includes(s)) return 'absent';
  return null;
}

/**
 * Match a raw BH-ID string against the employee list.
 * Case-insensitive, trims whitespace. Returns null if not found.
 */
export function matchByBhId(
  bhId: string,
  employees: AttendanceEmployeeStub[]
): AttendanceEmployeeStub | null {
  const norm = bhId.trim().toUpperCase();
  if (!norm) return null;
  return employees.find(e => e.company_id.toUpperCase() === norm) ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text);
  return String(v).trim();
}

// ── XLSX parsing ──────────────────────────────────────────────────────────────

/**
 * Parse an attendance Excel file.
 * Expected columns (case-insensitive, order flexible): Name · BH-ID · Status · Date (optional)
 *
 * employees: list from hr_employees + active contract (provides company_id + building_code)
 * protectedEmployeeIds: employee_ids that have an approved record for the target date (skipped on import)
 */
export async function parseAttendanceFile(
  buffer: ArrayBuffer,
  employees: AttendanceEmployeeStub[],
  protectedEmployeeIds: Set<string>
): Promise<AttendancePreviewResult> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in file');

  // Find header row
  let headerRowNum = -1;
  const col: Record<string, number> = {};

  sheet.eachRow((row, rowNum) => {
    if (headerRowNum !== -1) return;
    const vals = row.values as unknown[];
    const lower = vals.map(v => safeStr(v).toLowerCase().replace(/[\s-]/g, ''));
    if (lower.some(v => ['name', 'bhid', 'status'].includes(v))) {
      headerRowNum = rowNum;
      lower.forEach((v, i) => {
        if (v === 'name')                   col.name   = i;
        if (v === 'bhid' || v === 'bh-id')  col.bhid   = i;
        if (v === 'status')                 col.status = i;
        if (v === 'date')                   col.date   = i;
      });
    }
  });

  if (headerRowNum === -1) {
    throw new Error('Could not find header row — expected columns: Name, BH-ID, Status');
  }

  // BH-ID fast lookup
  const byBhId = new Map<string, AttendanceEmployeeStub>();
  for (const emp of employees) byBhId.set(emp.company_id.toUpperCase(), emp);

  const rows: AttendancePreviewRow[] = [];
  let suggestedDate = new Date().toISOString().slice(0, 10);

  sheet.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;
    const vals = row.values as unknown[];

    const nameRaw   = safeStr(vals[col.name   ?? 1]);
    const bhIdRaw   = safeStr(vals[col.bhid   ?? 2]);
    const statusRaw = safeStr(vals[col.status ?? 3]);
    const dateRaw   = safeStr(vals[col.date   ?? 0]);

    if (!nameRaw && !bhIdRaw) return; // skip blank rows

    // Infer date from sheet if valid YYYY-MM-DD
    if (dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) suggestedDate = dateRaw;

    const status = normalizeAttendanceStatus(statusRaw);

    // Match: BH-ID first, then name fuzzy fallback
    let matched: AttendanceEmployeeStub | null = matchByBhId(bhIdRaw, employees);
    if (!matched && nameRaw) {
      const result = matchEmployeeName(nameRaw, employees);
      if (result.status === 'matched') {
        matched = employees.find(e => e.id === result.matchedId) ?? null;
      }
    }

    if (!matched) {
      rows.push({
        rowIndex: rowNum, sheet_name: nameRaw || bhIdRaw, bh_id_raw: bhIdRaw,
        status_raw: statusRaw, status, matchStatus: 'unmatched',
        matchedEmployeeId: null, building_code: null,
        errorMessage: 'Employee not found',
      });
      return;
    }

    if (!status) {
      rows.push({
        rowIndex: rowNum, sheet_name: nameRaw || bhIdRaw, bh_id_raw: bhIdRaw,
        status_raw: statusRaw, status: null, matchStatus: 'error',
        matchedEmployeeId: matched.id, building_code: matched.building_code,
        errorMessage: `Invalid status: "${statusRaw}" — use Present or Absent`,
      });
      return;
    }

    if (protectedEmployeeIds.has(matched.id)) {
      rows.push({
        rowIndex: rowNum, sheet_name: nameRaw || bhIdRaw, bh_id_raw: bhIdRaw,
        status_raw: statusRaw, status, matchStatus: 'protected',
        matchedEmployeeId: matched.id, building_code: matched.building_code,
        errorMessage: 'Record approved — cannot overwrite',
      });
      return;
    }

    rows.push({
      rowIndex: rowNum, sheet_name: nameRaw || bhIdRaw, bh_id_raw: bhIdRaw,
      status_raw: statusRaw, status, matchStatus: 'matched',
      matchedEmployeeId: matched.id, building_code: matched.building_code,
      errorMessage: '',
    });
  });

  return {
    rows,
    suggestedDate,
    matchedCount:   rows.filter(r => r.matchStatus === 'matched').length,
    unmatchedCount: rows.filter(r => r.matchStatus === 'unmatched').length,
    protectedCount: rows.filter(r => r.matchStatus === 'protected').length,
    errorCount:     rows.filter(r => r.matchStatus === 'error').length,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```
npm test -- --run hr-attendance-parser
```

Expected: all 17 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady/hr/hr-attendance-types.ts \
        src/lib/beithady/hr/hr-attendance-parser.ts \
        src/lib/beithady/hr/hr-attendance-parser.test.ts
git commit -m "feat(hr): attendance types + parser (normalizeStatus, matchByBhId, parseAttendanceFile) — TDD"
```

---

## Task 3: Server-Only Queries

**Files:**
- Create: `src/lib/beithady/hr/hr-attendance-queries.ts`

- [ ] **Step 1: Write the queries file**

```typescript
// src/lib/beithady/hr/hr-attendance-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { AttendanceRow, AttendanceApprovalState, AttendanceStatus } from './hr-attendance-types';
import type { AttendanceEmployeeStub } from './hr-attendance-parser';

// ── Types used internally ─────────────────────────────────────────────────────

type ContractRow = { employee_id: string; building_code: string };
type EmpRow = { id: string; company_id: string; first_name: string; last_name: string | null; arabic_name: string | null; department: string };
type RecordRow = { id: string; employee_id: string; status: string; approval_state: string };

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * All active (non-terminated) employees matching filter, merged with their
 * attendance record for `date` (if any). Sorted by first_name.
 */
export async function getAttendanceDayView(
  date: string,
  filters: { building?: string; department?: string }
): Promise<AttendanceRow[]> {
  const sb = supabaseAdmin();

  // 1. Active contracts (building filter applied here)
  const { data: contracts, error: cErr } = await sb
    .from('hr_employee_contracts')
    .select('employee_id, building_code')
    .is('effective_to', null);
  if (cErr) throw new Error(cErr.message);

  const filteredContracts = filters.building
    ? (contracts ?? []).filter((c: ContractRow) => c.building_code === filters.building)
    : (contracts ?? []) as ContractRow[];

  if (!filteredContracts.length) return [];
  const empIds = filteredContracts.map((c: ContractRow) => c.employee_id);

  // 2. Employees (department filter + non-terminated)
  let empQuery = sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name, arabic_name, department')
    .in('id', empIds)
    .neq('status', 'terminated')
    .order('first_name');
  if (filters.department) empQuery = empQuery.eq('department', filters.department);

  const { data: employees, error: eErr } = await empQuery;
  if (eErr) throw new Error(eErr.message);
  if (!employees?.length) return [];

  // 3. Attendance records for this date
  const activeIds = (employees as EmpRow[]).map(e => e.id);
  const { data: records, error: rErr } = await sb
    .from('hr_attendance_records')
    .select('id, employee_id, status, approval_state')
    .eq('date', date)
    .in('employee_id', activeIds);
  if (rErr) throw new Error(rErr.message);

  // 4. Merge
  const contractByEmp = new Map<string, string>();
  for (const c of filteredContracts) contractByEmp.set(c.employee_id, c.building_code);

  const recordByEmp = new Map<string, RecordRow>();
  for (const r of (records ?? []) as RecordRow[]) recordByEmp.set(r.employee_id, r);

  return (employees as EmpRow[]).map(e => {
    const rec = recordByEmp.get(e.id);
    return {
      employee_id:    e.id,
      company_id:     e.company_id,
      first_name:     e.first_name,
      last_name:      e.last_name,
      arabic_name:    e.arabic_name,
      department:     e.department,
      building_code:  contractByEmp.get(e.id) ?? null,
      record_id:      rec?.id ?? null,
      status:         (rec?.status as AttendanceStatus) ?? null,
      approval_state: (rec?.approval_state as AttendanceApprovalState) ?? null,
    };
  });
}

/**
 * Active employees for the template download — same employee+contract merge.
 */
export async function getActiveEmployeesForFilter(
  filters: { building?: string; department?: string }
): Promise<AttendanceEmployeeStub[]> {
  const sb = supabaseAdmin();

  const { data: contracts, error: cErr } = await sb
    .from('hr_employee_contracts')
    .select('employee_id, building_code')
    .is('effective_to', null);
  if (cErr) throw new Error(cErr.message);

  const filtered = filters.building
    ? (contracts ?? []).filter((c: ContractRow) => c.building_code === filters.building)
    : (contracts ?? []) as ContractRow[];

  if (!filtered.length) return [];
  const empIds = filtered.map((c: ContractRow) => c.employee_id);

  let empQuery = sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name')
    .in('id', empIds)
    .neq('status', 'terminated')
    .order('first_name');
  if (filters.department) empQuery = empQuery.eq('department', filters.department);

  const { data: employees, error: eErr } = await empQuery;
  if (eErr) throw new Error(eErr.message);

  const contractByEmp = new Map<string, string>();
  for (const c of filtered) contractByEmp.set(c.employee_id, c.building_code);

  return ((employees ?? []) as EmpRow[]).map(e => ({
    id:           e.id,
    company_id:   e.company_id,
    first_name:   e.first_name,
    last_name:    e.last_name,
    building_code: contractByEmp.get(e.id) ?? null,
  }));
}

/**
 * Set of employee_ids that have an APPROVED attendance record on `date`.
 * Used by the parser to mark protected rows.
 */
export async function getProtectedEmployeeIds(date: string): Promise<Set<string>> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_attendance_records')
    .select('employee_id')
    .eq('date', date)
    .eq('approval_state', 'approved');
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { employee_id: string }[]).map(r => r.employee_id));
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-attendance-queries.ts
git commit -m "feat(hr): attendance server-only queries — getAttendanceDayView, getActiveEmployeesForFilter, getProtectedEmployeeIds"
```

---

## Task 4: Server Actions

**Files:**
- Create: `src/lib/beithady/hr/hr-attendance-actions.ts`

- [ ] **Step 1: Write the actions file**

```typescript
// src/lib/beithady/hr/hr-attendance-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { parseAttendanceFile } from './hr-attendance-parser';
import { getProtectedEmployeeIds } from './hr-attendance-queries';
import type { AttendancePreviewResult, AttendancePreviewRow, AttendanceFilter } from './hr-attendance-types';

type EmployeeStubForAction = {
  id: string; company_id: string; first_name: string; last_name: string | null; building_code: string | null;
};

// ── previewAttendanceAction ───────────────────────────────────────────────────
// Parse Excel + run BH-ID matching. NO database writes.

export async function previewAttendanceAction(
  formData: FormData
): Promise<{ result?: AttendancePreviewResult; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const file = formData.get('file') as File | null;
    const dateParam = (formData.get('date') as string | null) ?? new Date().toISOString().slice(0, 10);
    if (!file) return { error: 'No file provided' };

    const buffer = await file.arrayBuffer();

    // Fetch employees + active contracts for matching
    const sb = supabaseAdmin();

    const { data: contracts } = await sb
      .from('hr_employee_contracts')
      .select('employee_id, building_code')
      .is('effective_to', null);

    const contractByEmp = new Map<string, string>();
    for (const c of (contracts ?? []) as { employee_id: string; building_code: string }[]) {
      contractByEmp.set(c.employee_id, c.building_code);
    }

    const { data: empData, error: empErr } = await sb
      .from('hr_employees')
      .select('id, company_id, first_name, last_name')
      .neq('status', 'terminated');
    if (empErr) return { error: empErr.message };

    const employees: EmployeeStubForAction[] = ((empData ?? []) as {
      id: string; company_id: string; first_name: string; last_name: string | null;
    }[]).map(e => ({
      ...e,
      building_code: contractByEmp.get(e.id) ?? null,
    }));

    const protectedIds = await getProtectedEmployeeIds(dateParam);
    const result = await parseAttendanceFile(buffer, employees, protectedIds);
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Parse error' };
  }
}

// ── confirmAttendanceAction ───────────────────────────────────────────────────
// Upsert matched rows. Protected rows already excluded by parser.

export async function confirmAttendanceAction(
  date: string,
  rows: AttendancePreviewRow[]
): Promise<{ saved: number; skipped: number; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { saved: 0, skipped: 0, error: 'Not authenticated' };

    const toInsert = rows.filter(r => r.matchStatus === 'matched' && r.status !== null);
    const skipped = rows.length - toInsert.length;

    if (!toInsert.length) return { saved: 0, skipped };

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_attendance_records')
      .upsert(
        toInsert.map(r => ({
          employee_id:    r.matchedEmployeeId!,
          date,
          status:         r.status!,
          building_code:  r.building_code,
          approval_state: 'pending',
          submitted_by:   user.id,
          submitted_at:   new Date().toISOString(),
        })),
        { onConflict: 'employee_id,date' }
      );

    if (error) return { saved: 0, skipped, error: error.message };

    revalidatePath('/beithady/hr/attendance');
    return { saved: toInsert.length, skipped };
  } catch (e) {
    return { saved: 0, skipped: 0, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── approveAttendanceAction ───────────────────────────────────────────────────
// Bulk-approve all pending records for date + optional building/department.

export async function approveAttendanceAction(
  filters: AttendanceFilter
): Promise<{ approved: number; error?: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    // Collect employee_ids for the filter
    let empIds: string[] | null = null;
    if (filters.building || filters.department) {
      const { data: contracts } = await sb
        .from('hr_employee_contracts')
        .select('employee_id, building_code')
        .is('effective_to', null);

      let filtered = (contracts ?? []) as { employee_id: string; building_code: string }[];
      if (filters.building) filtered = filtered.filter(c => c.building_code === filters.building);

      let empQuery = sb
        .from('hr_employees')
        .select('id')
        .in('id', filtered.map(c => c.employee_id))
        .neq('status', 'terminated');
      if (filters.department) empQuery = empQuery.eq('department', filters.department);
      const { data: emps } = await empQuery;
      empIds = ((emps ?? []) as { id: string }[]).map(e => e.id);
      if (!empIds.length) return { approved: 0 };
    }

    let updateQuery = sb
      .from('hr_attendance_records')
      .update({ approval_state: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('date', filters.date)
      .eq('approval_state', 'pending');

    if (empIds) updateQuery = updateQuery.in('employee_id', empIds);

    const { data, error } = await updateQuery.select('id');
    if (error) return { approved: 0, error: error.message };

    revalidatePath('/beithady/hr/attendance');
    return { approved: (data ?? []).length };
  } catch (e) {
    return { approved: 0, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── approveAttendanceRowAction ────────────────────────────────────────────────
// Approve a single attendance record by ID.

export async function approveAttendanceRowAction(
  recordId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    const { error } = await sb
      .from('hr_attendance_records')
      .update({ approval_state: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', recordId)
      .eq('approval_state', 'pending');

    if (error) return { ok: false, error: error.message };

    revalidatePath('/beithady/hr/attendance');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-attendance-actions.ts
git commit -m "feat(hr): attendance server actions — preview, confirm, approve bulk + row"
```

---

## Task 5: API Routes — Template + Day-View

**Files:**
- Create: `src/app/api/hr/attendance/template/route.ts`
- Create: `src/app/api/hr/attendance/day-view/route.ts`

- [ ] **Step 1: Write the template route**

```typescript
// src/app/api/hr/attendance/template/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getActiveEmployeesForFilter } from '@/lib/beithady/hr/hr-attendance-queries';
import { BUILDING_LABELS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode, Department } from '@/lib/beithady/hr/hr-types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const date     = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const building  = searchParams.get('building') ?? undefined;
  const department = searchParams.get('department') ?? undefined;

  const employees = await getActiveEmployeesForFilter({ building, department });

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendance');

  // Header row
  ws.addRow(['Name', 'BH-ID', 'Department', 'Building', 'Date', 'Status']);
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  header.alignment = { horizontal: 'center' };

  // Data rows
  for (const emp of employees) {
    ws.addRow([
      `${emp.first_name} ${emp.last_name ?? ''}`.trim(),
      emp.company_id,
      DEPARTMENT_LABELS[emp.department as Department] ?? emp.department ?? '',
      BUILDING_LABELS[emp.building_code as BuildingCode] ?? emp.building_code ?? '',
      date,
      '', // blank — supervisor fills in
    ]);
  }

  // Column widths
  ws.getColumn(1).width = 24; // Name
  ws.getColumn(2).width = 10; // BH-ID
  ws.getColumn(3).width = 20; // Department
  ws.getColumn(4).width = 18; // Building
  ws.getColumn(5).width = 12; // Date
  ws.getColumn(6).width = 14; // Status

  // Data validation on Status column (rows 2+)
  ws.getColumn(6).eachCell({ includeEmpty: true }, (cell, rowNum) => {
    if (rowNum === 1) return;
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Present,Absent"'],
    };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const filterTag = building ?? department ?? 'all';
  const filename = `attendance-template-${date}-${filterTag}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 2: Write the day-view route**

```typescript
// src/app/api/hr/attendance/day-view/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAttendanceDayView } from '@/lib/beithady/hr/hr-attendance-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const date       = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const building   = searchParams.get('building') ?? undefined;
  const department = searchParams.get('department') ?? undefined;

  const rows = await getAttendanceDayView(date, { building, department });
  return NextResponse.json({ rows });
}
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/hr/attendance/template/route.ts \
        src/app/api/hr/attendance/day-view/route.ts
git commit -m "feat(hr): attendance API routes — GET template (ExcelJS) + GET day-view"
```

---

## Task 6: Import Attendance Dialog

**Files:**
- Create: `src/app/beithady/hr/attendance/_components/import-attendance-dialog.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/app/beithady/hr/attendance/_components/import-attendance-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { X, Upload, CheckCircle2 } from 'lucide-react';
import { previewAttendanceAction, confirmAttendanceAction } from '@/lib/beithady/hr/hr-attendance-actions';
import type { AttendancePreviewResult, AttendancePreviewRow } from '@/lib/beithady/hr/hr-attendance-types';

type Step = 'upload' | 'preview' | 'done';
type Props = {
  open: boolean;
  defaultDate: string;  // YYYY-MM-DD
  onClose: () => void;
  onSaved: () => void;  // called after confirm so board can re-fetch
};

const STATUS_PILL: Record<string, string> = {
  matched:   'bg-violet-900/50 text-violet-300',
  unmatched: 'bg-amber-900/50 text-amber-300',
  protected: 'bg-slate-700 text-slate-400',
  error:     'bg-red-900/50 text-red-300',
};

export function ImportAttendanceDialog({ open, defaultDate, onClose, onSaved }: Props) {
  const [step, setStep]       = useState<Step>('upload');
  const [preview, setPreview] = useState<AttendancePreviewResult | null>(null);
  const [rows, setRows]       = useState<AttendancePreviewRow[]>([]);
  const [date, setDate]       = useState(defaultDate);
  const [parseError, setParseError] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function reset() { setStep('upload'); setPreview(null); setRows([]); setParseError(''); }

  function handleClose() { reset(); onClose(); }

  async function handleFile(file: File) {
    setParseError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('date', date);
    startTransition(async () => {
      const res = await previewAttendanceAction(fd);
      if (res.error) { setParseError(res.error); return; }
      if (res.result) {
        setPreview(res.result);
        setRows(res.result.rows);
        if (res.result.suggestedDate) setDate(res.result.suggestedDate);
        setStep('preview');
      }
    });
  }

  async function handleConfirm() {
    startTransition(async () => {
      const res = await confirmAttendanceAction(date, rows);
      if (res.error) { setParseError(res.error); return; }
      setSavedCount(res.saved);
      setStep('done');
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Import Attendance</h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* Step 1 — Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Date field */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">
                  Attendance Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="ix-input w-48"
                />
              </div>
              {/* Drop zone */}
              <label
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/20 rounded-xl p-10 cursor-pointer hover:border-violet-500/50 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                <Upload className="w-8 h-8 text-white/30" />
                <span className="text-sm text-white/50">Drop .xlsx / .xls or click to browse</span>
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              {isPending && <p className="text-sm text-white/40 text-center">Parsing…</p>}
              {parseError && <p className="text-sm text-red-400">{parseError}</p>}
            </div>
          )}

          {/* Step 2 — Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>Importing attendance for</span>
                <span className="font-semibold text-white">{date}</span>
              </div>
              {/* Summary chips */}
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs px-2 py-1 rounded-full bg-violet-900/50 text-violet-300">{preview.matchedCount} matched</span>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-900/50 text-amber-300">{preview.unmatchedCount} unmatched</span>
                {preview.protectedCount > 0 && (
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-400">{preview.protectedCount} protected</span>
                )}
                {preview.errorCount > 0 && (
                  <span className="text-xs px-2 py-1 rounded-full bg-red-900/50 text-red-300">{preview.errorCount} errors</span>
                )}
              </div>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
                      <th className="pb-2 pr-4">Name</th>
                      <th className="pb-2 pr-4">BH-ID</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.rowIndex} className="border-b border-white/5">
                        <td className="py-1.5 pr-4 text-white">{r.sheet_name}</td>
                        <td className="py-1.5 pr-4 text-white/60">{r.bh_id_raw || '—'}</td>
                        <td className="py-1.5 pr-4 text-white/60 capitalize">{r.status_raw || '—'}</td>
                        <td className="py-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_PILL[r.matchStatus]}`}>
                            {r.matchStatus}
                          </span>
                          {r.errorMessage && (
                            <span className="ml-2 text-xs text-red-400">{r.errorMessage}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parseError && <p className="text-sm text-red-400">{parseError}</p>}
            </div>
          )}

          {/* Step 3 — Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-lg font-semibold text-white">{savedCount} records saved</p>
              <p className="text-sm text-white/50">Pending admin approval</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          {step === 'upload' && (
            <button onClick={handleClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
              Cancel
            </button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
                ← Re-upload
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending || preview?.matchedCount === 0}
                className="px-5 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Saving…' : `Save ${preview?.matchedCount ?? 0} records`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={handleClose} className="px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/attendance/_components/import-attendance-dialog.tsx
git commit -m "feat(hr): ImportAttendanceDialog — 3-step upload→preview→saved wizard"
```

---

## Task 7: Attendance Board

**Files:**
- Create: `src/app/beithady/hr/attendance/_components/attendance-board.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/app/beithady/hr/attendance/_components/attendance-board.tsx
'use client';

import { useState } from 'react';
import { Download, Upload, CheckCircle2, Clock } from 'lucide-react';
import { ImportAttendanceDialog } from './import-attendance-dialog';
import { approveAttendanceAction, approveAttendanceRowAction } from '@/lib/beithady/hr/hr-attendance-actions';
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';
import type { AttendanceRow } from '@/lib/beithady/hr/hr-attendance-types';
import type { BuildingCode, Department } from '@/lib/beithady/hr/hr-types';

type Props = {
  initialRows: AttendanceRow[];
  initialDate: string;
  canApprove: boolean;  // true if user has hr:full
};

export function AttendanceBoard({ initialRows, initialDate, canApprove }: Props) {
  const [rows, setRows]               = useState<AttendanceRow[]>(initialRows);
  const [date, setDate]               = useState(initialDate);
  const [filterBuilding, setBuilding] = useState('');
  const [filterDept, setDept]         = useState('');
  const [importOpen, setImportOpen]   = useState(false);
  const [approving, setApproving]     = useState(false);

  async function fetchRows(d: string, b: string, dept: string) {
    const params = new URLSearchParams({ date: d });
    if (b)    params.set('building', b);
    if (dept) params.set('department', dept);
    const res = await fetch(`/api/hr/attendance/day-view?${params}`);
    if (res.ok) {
      const { rows: fetched } = await res.json() as { rows: AttendanceRow[] };
      setRows(fetched);
    }
  }

  function handleDateChange(d: string) {
    setDate(d);
    fetchRows(d, filterBuilding, filterDept);
  }
  function handleBuildingChange(b: string) {
    setBuilding(b);
    fetchRows(date, b, filterDept);
  }
  function handleDeptChange(dept: string) {
    setDept(dept);
    fetchRows(date, filterBuilding, dept);
  }

  async function handleApproveAll() {
    setApproving(true);
    const res = await approveAttendanceAction({
      date,
      building: filterBuilding || undefined,
      department: filterDept || undefined,
    });
    if (res.approved > 0) await fetchRows(date, filterBuilding, filterDept);
    setApproving(false);
  }

  async function handleApproveRow(recordId: string) {
    const res = await approveAttendanceRowAction(recordId);
    if (res.ok) {
      setRows(prev => prev.map(r =>
        r.record_id === recordId ? { ...r, approval_state: 'approved' } : r
      ));
    }
  }

  function handleTemplateDownload() {
    const params = new URLSearchParams({ date });
    if (filterBuilding) params.set('building', filterBuilding);
    if (filterDept)     params.set('department', filterDept);
    window.open(`/api/hr/attendance/template?${params}`, '_blank');
  }

  const pendingCount  = rows.filter(r => r.approval_state === 'pending').length;
  const approvedCount = rows.filter(r => r.approval_state === 'approved').length;
  const noRecordCount = rows.filter(r => r.record_id === null).length;

  return (
    <div className="space-y-4">
      {/* Filters + actions bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={e => handleDateChange(e.target.value)}
          className="ix-input text-sm"
        />

        <select
          value={filterBuilding}
          onChange={e => handleBuildingChange(e.target.value)}
          className="ix-input text-sm"
        >
          <option value="">All Buildings</option>
          {BUILDING_CODES.filter(b => b !== 'OTHER').map(b => (
            <option key={b} value={b}>{BUILDING_LABELS[b as BuildingCode]}</option>
          ))}
        </select>

        <select
          value={filterDept}
          onChange={e => handleDeptChange(e.target.value)}
          className="ix-input text-sm"
        >
          <option value="">All Departments</option>
          {DEPARTMENTS.map(d => (
            <option key={d} value={d}>{DEPARTMENT_LABELS[d as Department]}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleTemplateDownload}
            className="flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">BH-ID</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/30 italic">
                  No active employees for this filter.
                </td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.employee_id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="px-4 py-2.5 text-white font-medium">
                    {r.first_name} {r.last_name ?? ''}
                    {r.arabic_name && (
                      <span className="block text-xs text-white/40 font-normal" dir="rtl">{r.arabic_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono bg-violet-900/40 text-violet-300 px-2 py-0.5 rounded">
                      {r.company_id}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-white/60">
                    {DEPARTMENT_LABELS[r.department as Department] ?? r.department}
                  </td>
                  <td className="px-4 py-2.5 text-white/60">
                    {r.building_code ? (BUILDING_LABELS[r.building_code as BuildingCode] ?? r.building_code) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.status === 'present' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300">✅ Present</span>
                    )}
                    {r.status === 'absent' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-300">❌ Absent</span>
                    )}
                    {r.status === null && (
                      <span className="text-xs text-white/25">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.approval_state === 'approved' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    {r.approval_state === 'pending' && canApprove && r.record_id && (
                      <button
                        onClick={() => handleApproveRow(r.record_id!)}
                        title="Approve"
                        className="w-5 h-5 rounded-full border border-amber-500/50 text-amber-400 hover:bg-amber-900/40 flex items-center justify-center transition-colors"
                      >
                        <Clock className="w-3 h-3" />
                      </button>
                    )}
                    {r.approval_state === 'pending' && !canApprove && (
                      <Clock className="w-4 h-4 text-amber-400/50" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-white/50">
        <span>
          {pendingCount} pending · {approvedCount} approved · {noRecordCount} not recorded
        </span>
        {canApprove && pendingCount > 0 && (
          <button
            onClick={handleApproveAll}
            disabled={approving}
            className="px-4 py-1.5 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {approving ? 'Approving…' : `Approve All Pending (${pendingCount})`}
          </button>
        )}
      </div>

      <ImportAttendanceDialog
        open={importOpen}
        defaultDate={date}
        onClose={() => setImportOpen(false)}
        onSaved={() => fetchRows(date, filterBuilding, filterDept)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/attendance/_components/attendance-board.tsx
git commit -m "feat(hr): AttendanceBoard — date/filter/download/import/approve UI"
```

---

## Task 8: Page + Activate Tile + Deploy

**Files:**
- Create: `src/app/beithady/hr/attendance/page.tsx`
- Modify: `src/app/beithady/hr/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// src/app/beithady/hr/attendance/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getAttendanceDayView } from '@/lib/beithady/hr/hr-attendance-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AttendanceBoard } from './_components/attendance-board';

export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const { roles } = await requireBeithadyPermission('hr', 'read');
  const canApprove = roles.some(r => r === 'admin' || r === 'manager');

  const today = new Date().toISOString().slice(0, 10);
  const initialRows = await getAttendanceDayView(today, {});

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Daily Attendance' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Daily Attendance"
        subtitle="Download template · import roll call · approve records"
      />
      <AttendanceBoard
        initialRows={initialRows}
        initialDate={today}
        canApprove={canApprove}
      />
    </BeithadyShell>
  );
}
```

- [ ] **Step 2: Activate the hub tile**

In `src/app/beithady/hr/page.tsx`, find the Daily Attendance tile:

```typescript
    {
      href: '/beithady/hr/attendance',
      title: 'Daily Attendance',
      description: 'Roll call · manual check-in/out by supervisor. Feeds Monthly Payroll working-days column.',
      icon: CalendarCheck,
      accent: 'cyan',
      disabled: true,
      comingSoonLabel: 'Sprint 4',
    },
```

Remove the `disabled: true,` and `comingSoonLabel: 'Sprint 4',` lines. Result:

```typescript
    {
      href: '/beithady/hr/attendance',
      title: 'Daily Attendance',
      description: 'Roll call · manual check-in/out by supervisor. Feeds Monthly Payroll working-days column.',
      icon: CalendarCheck,
      accent: 'cyan',
    },
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Deploy**

```bash
git add src/app/beithady/hr/attendance/page.tsx src/app/beithady/hr/page.tsx
git commit -m "feat(hr): Daily Attendance page + activate Sprint 4 tile — Sprint 4 complete"
git fetch origin main
git rebase origin/main
git push origin HEAD:main
vercel --prod --yes
```
