# Beithady HR Sprint 6: Leave & Overtime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/beithady/hr/leave-ot` — two-tab page for leave requests (with HR-set balances, auto-deduct on approval) and overtime logging (supervisor → manager approval).

**Architecture:** Three new DB tables share one migration. A server-only query layer returns joined rows (employee name + record). Five server actions handle all writes. Two thin API routes serve filter-driven refetches from the client board. Six focused UI components (two dialogs + two tab views + one board wrapper + one page) keep each file under ~200 lines.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind v4 · Supabase (supabaseAdmin) · Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0130_hr_leave_ot.sql` | Create | hr_leave_balances + hr_leave_requests + hr_overtime_records |
| `src/lib/beithady/hr/hr-leave-ot-types.ts` | Create | Pure types + `calcLeaveDays()` helper |
| `src/lib/beithady/hr/hr-leave-ot-types.test.ts` | Create | TDD tests for `calcLeaveDays` |
| `src/lib/beithady/hr/hr-leave-ot-queries.ts` | Create | listLeaveRequests, listLeaveBalances, listOvertimeRecords, listActiveEmployeesSimple |
| `src/lib/beithady/hr/hr-leave-ot-actions.ts` | Create | 5 server actions |
| `src/app/api/hr/leave-ot/leave/route.ts` | Create | GET — pending requests + balances for Leave tab |
| `src/app/api/hr/leave-ot/ot/route.ts` | Create | GET — pending + approved OT for OT tab |
| `src/app/beithady/hr/leave-ot/_components/add-leave-dialog.tsx` | Create | Add leave request modal |
| `src/app/beithady/hr/leave-ot/_components/log-ot-dialog.tsx` | Create | Log OT modal |
| `src/app/beithady/hr/leave-ot/_components/leave-tab.tsx` | Create | Pending requests + balances table |
| `src/app/beithady/hr/leave-ot/_components/ot-tab.tsx` | Create | Pending + approved OT list |
| `src/app/beithady/hr/leave-ot/_components/leave-ot-board.tsx` | Create | Tab switcher + filter state + refetch |
| `src/app/beithady/hr/leave-ot/page.tsx` | Create | Server component, auth-gated |
| `src/app/beithady/hr/page.tsx` | Modify | Remove disabled + comingSoonLabel from Sprint 6 tile |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/0130_hr_leave_ot.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0130_hr_leave_ot.sql
-- Beithady HR Sprint 6 — Leave & Overtime

-- Leave balances: HR sets total_days; used_days auto-incremented on request approval
create table public.hr_leave_balances (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  year        int not null,
  leave_type  text not null check (leave_type in ('annual', 'sick', 'emergency')),
  total_days  numeric not null default 0 check (total_days >= 0),
  used_days   numeric not null default 0 check (used_days >= 0),
  constraint uq_hr_leave_balance unique (employee_id, year, leave_type)
);
create index idx_hr_leave_bal_emp on public.hr_leave_balances(employee_id, year);

-- Leave requests
create table public.hr_leave_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.hr_employees(id) on delete cascade,
  leave_type   text not null check (leave_type in ('annual', 'sick', 'emergency')),
  start_date   date not null,
  end_date     date not null,
  days_count   numeric not null check (days_count > 0),
  reason       text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references public.app_users(id),
  reviewed_at  timestamptz,
  submitted_by uuid references public.app_users(id),
  submitted_at timestamptz not null default now()
);
create index idx_hr_leave_req_emp    on public.hr_leave_requests(employee_id);
create index idx_hr_leave_req_status on public.hr_leave_requests(status);

-- Overtime records
create table public.hr_overtime_records (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.hr_employees(id) on delete cascade,
  date         date not null,
  hours        numeric not null check (hours > 0),
  reason       text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references public.app_users(id),
  reviewed_at  timestamptz,
  submitted_by uuid references public.app_users(id),
  submitted_at timestamptz not null default now()
);
create index idx_hr_ot_emp    on public.hr_overtime_records(employee_id);
create index idx_hr_ot_date   on public.hr_overtime_records(date);
create index idx_hr_ot_status on public.hr_overtime_records(status);
```

- [ ] **Step 2: Apply to Supabase**

Paste the SQL into the Supabase dashboard SQL Editor for project `bpjproljatbrbmszwbov` and run it. Verify no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0130_hr_leave_ot.sql
git commit -m "feat(hr): migration 0130 — hr_leave_balances + hr_leave_requests + hr_overtime_records"
```

---

## Task 2: Types (TDD)

**Files:**
- Create: `src/lib/beithady/hr/hr-leave-ot-types.ts`
- Create: `src/lib/beithady/hr/hr-leave-ot-types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/beithady/hr/hr-leave-ot-types.test.ts
import { describe, it, expect } from 'vitest';
import { calcLeaveDays } from './hr-leave-ot-types';

describe('calcLeaveDays', () => {
  it('single day returns 1', () => {
    expect(calcLeaveDays('2026-05-14', '2026-05-14')).toBe(1);
  });
  it('consecutive days are inclusive', () => {
    expect(calcLeaveDays('2026-05-14', '2026-05-15')).toBe(2);
  });
  it('4-day range', () => {
    expect(calcLeaveDays('2026-05-12', '2026-05-15')).toBe(4);
  });
  it('end before start returns 0', () => {
    expect(calcLeaveDays('2026-05-15', '2026-05-14')).toBe(0);
  });
  it('month boundary', () => {
    expect(calcLeaveDays('2026-05-30', '2026-06-01')).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run hr-leave-ot-types
```

Expected: FAIL — `calcLeaveDays` not found.

- [ ] **Step 3: Write the types + implementation**

```typescript
// src/lib/beithady/hr/hr-leave-ot-types.ts
// Pure types + helpers. No imports. Safe for any context.

export type LeaveType = 'annual' | 'sick' | 'emergency';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual:    'Annual Leave',
  sick:      'Sick Leave',
  emergency: 'Emergency Leave',
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending:  'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// ── DB row shapes ─────────────────────────────────────────────────────────────

export type LeaveBalance = {
  id: string;
  employee_id: string;
  year: number;
  leave_type: LeaveType;
  total_days: number;
  used_days: number;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;    // YYYY-MM-DD
  end_date: string;
  days_count: number;
  reason: string | null;
  status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_by: string | null;
  submitted_at: string;
};

export type OvertimeRecord = {
  id: string;
  employee_id: string;
  date: string;          // YYYY-MM-DD
  hours: number;
  reason: string | null;
  status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_by: string | null;
  submitted_at: string;
};

// ── Joined view models (include employee display fields) ──────────────────────

export type LeaveRequestRow = LeaveRequest & {
  employee_name: string;
  company_id: string;
};

export type OvertimeRecordRow = OvertimeRecord & {
  employee_name: string;
  company_id: string;
};

export type LeaveBalanceRow = {
  employee_id: string;
  employee_name: string;
  company_id: string;
  annual_total: number;
  annual_used: number;
  sick_total: number;
  sick_used: number;
};

// ── Form input shapes ─────────────────────────────────────────────────────────

export type AddLeaveInput = {
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
};

export type LogOtInput = {
  employee_id: string;
  date: string;
  hours: number;
  reason: string;
};

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Calendar days between start and end, inclusive.
 * Returns 0 if end is before start.
 */
export function calcLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- --run hr-leave-ot-types
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/hr/hr-leave-ot-types.ts \
        src/lib/beithady/hr/hr-leave-ot-types.test.ts
git commit -m "feat(hr): leave-ot types + calcLeaveDays helper — TDD"
```

---

## Task 3: Server-Only Queries

**Files:**
- Create: `src/lib/beithady/hr/hr-leave-ot-queries.ts`

- [ ] **Step 1: Write the queries file**

```typescript
// src/lib/beithady/hr/hr-leave-ot-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  LeaveRequestRow, LeaveBalanceRow, OvertimeRecordRow,
  LeaveType, ReviewStatus,
} from './hr-leave-ot-types';

type EmpRow = { id: string; company_id: string; first_name: string; last_name: string | null };

function empName(e: EmpRow): string {
  return `${e.first_name} ${e.last_name ?? ''}`.trim();
}

// ── Leave requests ────────────────────────────────────────────────────────────

export async function listLeaveRequests(filters: {
  status?: ReviewStatus;
  year?: number;
  employee_id?: string;
} = {}): Promise<LeaveRequestRow[]> {
  const sb = supabaseAdmin();

  type RawReq = {
    id: string; employee_id: string; leave_type: string;
    start_date: string; end_date: string; days_count: number;
    reason: string | null; status: string;
    reviewed_by: string | null; reviewed_at: string | null;
    submitted_by: string | null; submitted_at: string;
    hr_employees: { company_id: string; first_name: string; last_name: string | null } | null;
  };

  let q = sb
    .from('hr_leave_requests')
    .select('*, hr_employees(company_id, first_name, last_name)')
    .order('submitted_at', { ascending: false });

  if (filters.status)      q = q.eq('status', filters.status);
  if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
  if (filters.year) {
    q = q
      .gte('start_date', `${filters.year}-01-01`)
      .lte('start_date', `${filters.year}-12-31`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawReq[]).map(r => ({
    id:            r.id,
    employee_id:   r.employee_id,
    leave_type:    r.leave_type as LeaveType,
    start_date:    r.start_date,
    end_date:      r.end_date,
    days_count:    r.days_count,
    reason:        r.reason,
    status:        r.status as ReviewStatus,
    reviewed_by:   r.reviewed_by,
    reviewed_at:   r.reviewed_at,
    submitted_by:  r.submitted_by,
    submitted_at:  r.submitted_at,
    employee_name: r.hr_employees
      ? `${r.hr_employees.first_name} ${r.hr_employees.last_name ?? ''}`.trim()
      : '—',
    company_id:    r.hr_employees?.company_id ?? '—',
  }));
}

// ── Leave balances ────────────────────────────────────────────────────────────

export async function listLeaveBalances(year: number): Promise<LeaveBalanceRow[]> {
  const sb = supabaseAdmin();

  // All active employees
  const { data: emps, error: eErr } = await sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name')
    .neq('status', 'terminated')
    .order('first_name');
  if (eErr) throw new Error(eErr.message);

  // All balance rows for this year
  const empIds = ((emps ?? []) as EmpRow[]).map(e => e.id);
  if (!empIds.length) return [];

  const { data: bals, error: bErr } = await sb
    .from('hr_leave_balances')
    .select('employee_id, leave_type, total_days, used_days')
    .eq('year', year)
    .in('employee_id', empIds);
  if (bErr) throw new Error(bErr.message);

  type BalRow = { employee_id: string; leave_type: string; total_days: number; used_days: number };

  const balMap = new Map<string, BalRow[]>();
  for (const b of (bals ?? []) as BalRow[]) {
    const arr = balMap.get(b.employee_id) ?? [];
    arr.push(b);
    balMap.set(b.employee_id, arr);
  }

  return ((emps ?? []) as EmpRow[]).map(e => {
    const rows = balMap.get(e.id) ?? [];
    const annual    = rows.find(r => r.leave_type === 'annual');
    const sick      = rows.find(r => r.leave_type === 'sick');
    return {
      employee_id:   e.id,
      employee_name: empName(e),
      company_id:    e.company_id,
      annual_total:  annual?.total_days ?? 0,
      annual_used:   annual?.used_days ?? 0,
      sick_total:    sick?.total_days ?? 0,
      sick_used:     sick?.used_days ?? 0,
    };
  });
}

// ── Overtime records ──────────────────────────────────────────────────────────

export async function listOvertimeRecords(filters: {
  status?: ReviewStatus;
  month?: string;       // "YYYY-MM"
  employee_id?: string;
} = {}): Promise<OvertimeRecordRow[]> {
  const sb = supabaseAdmin();

  type RawOt = {
    id: string; employee_id: string; date: string; hours: number;
    reason: string | null; status: string;
    reviewed_by: string | null; reviewed_at: string | null;
    submitted_by: string | null; submitted_at: string;
    hr_employees: { company_id: string; first_name: string; last_name: string | null } | null;
  };

  let q = sb
    .from('hr_overtime_records')
    .select('*, hr_employees(company_id, first_name, last_name)')
    .order('date', { ascending: false });

  if (filters.status)      q = q.eq('status', filters.status);
  if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
  if (filters.month) {
    q = q
      .gte('date', `${filters.month}-01`)
      .lte('date', `${filters.month}-31`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawOt[]).map(r => ({
    id:            r.id,
    employee_id:   r.employee_id,
    date:          r.date,
    hours:         r.hours,
    reason:        r.reason,
    status:        r.status as ReviewStatus,
    reviewed_by:   r.reviewed_by,
    reviewed_at:   r.reviewed_at,
    submitted_by:  r.submitted_by,
    submitted_at:  r.submitted_at,
    employee_name: r.hr_employees
      ? `${r.hr_employees.first_name} ${r.hr_employees.last_name ?? ''}`.trim()
      : '—',
    company_id:    r.hr_employees?.company_id ?? '—',
  }));
}

// ── Active employees (for dialog selectors) ───────────────────────────────────

export async function listActiveEmployeesSimple(): Promise<
  { id: string; company_id: string; display_name: string }[]
> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name')
    .neq('status', 'terminated')
    .order('first_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as EmpRow[]).map(e => ({
    id:           e.id,
    company_id:   e.company_id,
    display_name: empName(e),
  }));
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-leave-ot-queries.ts
git commit -m "feat(hr): leave-ot server-only queries — listLeaveRequests, listLeaveBalances, listOvertimeRecords, listActiveEmployeesSimple"
```

---

## Task 4: Server Actions

**Files:**
- Create: `src/lib/beithady/hr/hr-leave-ot-actions.ts`

- [ ] **Step 1: Write the actions file**

```typescript
// src/lib/beithady/hr/hr-leave-ot-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import type { AddLeaveInput, LogOtInput, LeaveType } from './hr-leave-ot-types';

const REVALIDATE = '/beithady/hr/leave-ot';

// ── addLeaveRequestAction ─────────────────────────────────────────────────────

export async function addLeaveRequestAction(
  input: AddLeaveInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (!input.employee_id) return { ok: false, error: 'Employee is required' };
    if (!input.start_date || !input.end_date) return { ok: false, error: 'Dates are required' };
    if (input.days_count <= 0) return { ok: false, error: 'Days count must be > 0' };

    const sb = supabaseAdmin();
    const { error } = await sb.from('hr_leave_requests').insert({
      employee_id:  input.employee_id,
      leave_type:   input.leave_type,
      start_date:   input.start_date,
      end_date:     input.end_date,
      days_count:   input.days_count,
      reason:       input.reason || null,
      status:       'pending',
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── reviewLeaveRequestAction ──────────────────────────────────────────────────

export async function reviewLeaveRequestAction(
  requestId: string,
  decision: 'approved' | 'rejected'
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    // Fetch the request
    const { data: req, error: rErr } = await sb
      .from('hr_leave_requests')
      .select('employee_id, leave_type, days_count, start_date, status')
      .eq('id', requestId)
      .single();
    if (rErr || !req) return { ok: false, error: 'Request not found' };
    if ((req as { status: string }).status !== 'pending') return { ok: false, error: 'Request already reviewed' };

    const r = req as { employee_id: string; leave_type: string; days_count: number; start_date: string };

    // Update status
    const { error: uErr } = await sb
      .from('hr_leave_requests')
      .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', requestId);
    if (uErr) return { ok: false, error: uErr.message };

    // Deduct balance if approved + not emergency
    if (decision === 'approved' && r.leave_type !== 'emergency') {
      const year = new Date(r.start_date).getFullYear();
      const { data: bal } = await sb
        .from('hr_leave_balances')
        .select('id, used_days')
        .eq('employee_id', r.employee_id)
        .eq('year', year)
        .eq('leave_type', r.leave_type)
        .maybeSingle();

      if (bal) {
        await sb
          .from('hr_leave_balances')
          .update({ used_days: (bal as { id: string; used_days: number }).used_days + r.days_count })
          .eq('id', (bal as { id: string }).id);
      } else {
        await sb.from('hr_leave_balances').insert({
          employee_id: r.employee_id,
          year,
          leave_type:  r.leave_type,
          total_days:  0,
          used_days:   r.days_count,
        });
      }
    }

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── setLeaveBalanceAction ─────────────────────────────────────────────────────

export async function setLeaveBalanceAction(
  employeeId: string,
  year: number,
  leaveType: LeaveType,
  totalDays: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    if (totalDays < 0) return { ok: false, error: 'Total days must be ≥ 0' };

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_leave_balances')
      .upsert(
        { employee_id: employeeId, year, leave_type: leaveType, total_days: totalDays },
        { onConflict: 'employee_id,year,leave_type' }
      );
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── logOvertimeAction ─────────────────────────────────────────────────────────

export async function logOvertimeAction(
  input: LogOtInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (!input.employee_id) return { ok: false, error: 'Employee is required' };
    if (!input.date)        return { ok: false, error: 'Date is required' };
    if (input.hours <= 0)   return { ok: false, error: 'Hours must be > 0' };

    const sb = supabaseAdmin();
    const { error } = await sb.from('hr_overtime_records').insert({
      employee_id:  input.employee_id,
      date:         input.date,
      hours:        input.hours,
      reason:       input.reason || null,
      status:       'pending',
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── reviewOvertimeAction ──────────────────────────────────────────────────────

export async function reviewOvertimeAction(
  recordId: string,
  decision: 'approved' | 'rejected'
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    const { error } = await sb
      .from('hr_overtime_records')
      .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', recordId)
      .eq('status', 'pending');
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
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
git add src/lib/beithady/hr/hr-leave-ot-actions.ts
git commit -m "feat(hr): leave-ot server actions — add/review leave, set balance, log/review OT"
```

---

## Task 5: API Routes

**Files:**
- Create: `src/app/api/hr/leave-ot/leave/route.ts`
- Create: `src/app/api/hr/leave-ot/ot/route.ts`

- [ ] **Step 1: Write the leave route**

```typescript
// src/app/api/hr/leave-ot/leave/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listLeaveRequests, listLeaveBalances } from '@/lib/beithady/hr/hr-leave-ot-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const year        = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10);
  const employee_id = searchParams.get('employee_id') ?? undefined;

  const [pending, balances] = await Promise.all([
    listLeaveRequests({ status: 'pending', year, employee_id }),
    listLeaveBalances(year),
  ]);

  return NextResponse.json({ pending, balances });
}
```

- [ ] **Step 2: Write the OT route**

```typescript
// src/app/api/hr/leave-ot/ot/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listOvertimeRecords } from '@/lib/beithady/hr/hr-leave-ot-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const month       = searchParams.get('month') ?? undefined;
  const employee_id = searchParams.get('employee_id') ?? undefined;

  const [pending, approved] = await Promise.all([
    listOvertimeRecords({ status: 'pending', month, employee_id }),
    listOvertimeRecords({ status: 'approved', month, employee_id }),
  ]);

  return NextResponse.json({ pending, approved });
}
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/hr/leave-ot/leave/route.ts \
        src/app/api/hr/leave-ot/ot/route.ts
git commit -m "feat(hr): leave-ot API routes — GET /leave (pending+balances) + GET /ot (pending+approved)"
```

---

## Task 6: Dialogs — Add Leave + Log OT

**Files:**
- Create: `src/app/beithady/hr/leave-ot/_components/add-leave-dialog.tsx`
- Create: `src/app/beithady/hr/leave-ot/_components/log-ot-dialog.tsx`

- [ ] **Step 1: Write `add-leave-dialog.tsx`**

```typescript
// src/app/beithady/hr/leave-ot/_components/add-leave-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { addLeaveRequestAction } from '@/lib/beithady/hr/hr-leave-ot-actions';
import { calcLeaveDays, LEAVE_TYPE_LABELS } from '@/lib/beithady/hr/hr-leave-ot-types';
import type { LeaveType } from '@/lib/beithady/hr/hr-leave-ot-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  open: boolean;
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
};

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'emergency'];

export function AddLeaveDialog({ open, employees, onClose, onSaved }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [leaveType, setLeaveType]   = useState<LeaveType>('annual');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [reason, setReason]         = useState('');
  const [error, setError]           = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const daysCount = startDate && endDate ? calcLeaveDays(startDate, endDate) : 0;

  function reset() {
    setEmployeeId(''); setLeaveType('annual'); setStartDate('');
    setEndDate(''); setReason(''); setError('');
  }
  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!employeeId)          { setError('Select an employee'); return; }
    if (!startDate || !endDate) { setError('Select start and end dates'); return; }
    if (daysCount <= 0)        { setError('End date must be on or after start date'); return; }

    startTransition(async () => {
      const res = await addLeaveRequestAction({
        employee_id: employeeId,
        leave_type:  leaveType,
        start_date:  startDate,
        end_date:    endDate,
        days_count:  daysCount,
        reason,
      });
      if (!res.ok) { setError(res.error ?? 'Unknown error'); return; }
      reset();
      onSaved();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Add Leave Request</h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Employee</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="ix-input w-full">
              <option value="">Select employee…</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.display_name} ({e.company_id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Leave Type</label>
            <div className="flex gap-2">
              {LEAVE_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setLeaveType(t)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                    leaveType === t
                      ? 'bg-rose-600 border-rose-500 text-white font-semibold'
                      : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {LEAVE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="ix-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} className="ix-input w-full" />
            </div>
          </div>
          {daysCount > 0 && (
            <p className="text-sm text-white/60">
              Duration: <span className="font-semibold text-white">{daysCount} day{daysCount !== 1 ? 's' : ''}</span>
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Reason (optional)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="ix-input w-full resize-none" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-5 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `log-ot-dialog.tsx`**

```typescript
// src/app/beithady/hr/leave-ot/_components/log-ot-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { logOvertimeAction } from '@/lib/beithady/hr/hr-leave-ot-actions';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  open: boolean;
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
};

export function LogOtDialog({ open, employees, onClose, onSaved }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate]             = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours]           = useState('');
  const [reason, setReason]         = useState('');
  const [error, setError]           = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function reset() { setEmployeeId(''); setDate(new Date().toISOString().slice(0, 10)); setHours(''); setReason(''); setError(''); }
  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!employeeId)        { setError('Select an employee'); return; }
    if (!date)              { setError('Date is required'); return; }
    const h = parseFloat(hours);
    if (!hours || isNaN(h) || h <= 0) { setError('Hours must be > 0'); return; }

    startTransition(async () => {
      const res = await logOvertimeAction({ employee_id: employeeId, date, hours: h, reason });
      if (!res.ok) { setError(res.error ?? 'Unknown error'); return; }
      reset(); onSaved(); onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Log Overtime</h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Employee</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="ix-input w-full">
              <option value="">Select employee…</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.display_name} ({e.company_id})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="ix-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Hours</label>
              <input type="number" min="0.5" step="0.5" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 3" className="ix-input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Reason (optional)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="ix-input w-full resize-none" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={isPending}
            className="px-5 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors disabled:opacity-50">
            {isPending ? 'Saving…' : 'Log OT'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/hr/leave-ot/_components/add-leave-dialog.tsx \
        src/app/beithady/hr/leave-ot/_components/log-ot-dialog.tsx
git commit -m "feat(hr): AddLeaveDialog + LogOtDialog modals"
```

---

## Task 7: Leave Tab

**Files:**
- Create: `src/app/beithady/hr/leave-ot/_components/leave-tab.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/app/beithady/hr/leave-ot/_components/leave-tab.tsx
'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Plus } from 'lucide-react';
import { AddLeaveDialog } from './add-leave-dialog';
import { reviewLeaveRequestAction, setLeaveBalanceAction } from '@/lib/beithady/hr/hr-leave-ot-actions';
import { LEAVE_TYPE_LABELS } from '@/lib/beithady/hr/hr-leave-ot-types';
import type { LeaveRequestRow, LeaveBalanceRow, LeaveType } from '@/lib/beithady/hr/hr-leave-ot-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  pendingRequests: LeaveRequestRow[];
  balances: LeaveBalanceRow[];
  canApprove: boolean;
  employees: EmployeeOption[];
  year: number;
  onRefresh: () => void;
};

const LEAVE_TYPE_COLORS: Record<LeaveType, string> = {
  annual:    'bg-blue-900/50 text-blue-300',
  sick:      'bg-amber-900/50 text-amber-300',
  emergency: 'bg-red-900/50 text-red-300',
};

export function LeaveTab({ pendingRequests, balances, canApprove, employees, year, onRefresh }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingBalance, setEditingBalance] = useState<{ empId: string; year: number; type: LeaveType; value: string } | null>(null);

  async function handleReview(id: string, decision: 'approved' | 'rejected') {
    await reviewLeaveRequestAction(id, decision);
    onRefresh();
  }

  async function handleBalanceSave() {
    if (!editingBalance) return;
    const days = parseFloat(editingBalance.value);
    if (isNaN(days) || days < 0) return;
    await setLeaveBalanceAction(editingBalance.empId, editingBalance.year, editingBalance.type, days);
    setEditingBalance(null);
    onRefresh();
  }

  return (
    <div className="space-y-6">
      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
            ⏳ Pending ({pendingRequests.length})
          </h3>
          <div className="space-y-2">
            {pendingRequests.map(r => (
              <div key={r.id} className="flex items-center gap-3 bg-amber-950/20 border border-amber-700/20 rounded-xl px-4 py-3">
                <span className="font-medium text-white text-sm min-w-[140px]">{r.employee_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${LEAVE_TYPE_COLORS[r.leave_type]}`}>
                  {LEAVE_TYPE_LABELS[r.leave_type]}
                </span>
                <span className="text-sm text-white/60">
                  {r.start_date} → {r.end_date} · <span className="text-white">{r.days_count}d</span>
                </span>
                {r.reason && <span className="text-xs text-white/40 truncate max-w-[200px]">{r.reason}</span>}
                {canApprove && (
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => handleReview(r.id, 'approved')}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => handleReview(r.id, 'rejected')}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Balances table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/70">Balances — {year}</h3>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Request
          </button>
        </div>
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">BH-ID</th>
                <th className="px-4 py-3">Annual</th>
                <th className="px-4 py-3">Sick</th>
                <th className="px-4 py-3">Emergency</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-white/30 italic">No active employees.</td></tr>
              ) : balances.map(b => (
                <tr key={b.employee_id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="px-4 py-2.5 text-white font-medium">{b.employee_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono bg-violet-900/40 text-violet-300 px-2 py-0.5 rounded">{b.company_id}</span>
                  </td>
                  {/* Annual balance — editable */}
                  <td className="px-4 py-2.5">
                    {canApprove && editingBalance?.empId === b.employee_id && editingBalance.type === 'annual' ? (
                      <input
                        type="number" min="0" step="1"
                        value={editingBalance.value}
                        onChange={e => setEditingBalance(prev => prev ? { ...prev, value: e.target.value } : null)}
                        onBlur={handleBalanceSave}
                        onKeyDown={e => { if (e.key === 'Enter') handleBalanceSave(); if (e.key === 'Escape') setEditingBalance(null); }}
                        autoFocus
                        className="w-16 px-2 py-0.5 rounded bg-white/10 text-white text-sm border border-white/20 focus:outline-none"
                      />
                    ) : (
                      <span
                        className={`text-sm cursor-pointer hover:text-white transition-colors ${b.annual_used > b.annual_total && b.annual_total > 0 ? 'text-red-400' : 'text-white/70'}`}
                        onClick={() => canApprove && setEditingBalance({ empId: b.employee_id, year, type: 'annual', value: String(b.annual_total) })}
                        title={canApprove ? 'Click to edit total' : undefined}
                      >
                        {b.annual_used}/{b.annual_total}d
                      </span>
                    )}
                  </td>
                  {/* Sick balance — editable */}
                  <td className="px-4 py-2.5">
                    {canApprove && editingBalance?.empId === b.employee_id && editingBalance.type === 'sick' ? (
                      <input
                        type="number" min="0" step="1"
                        value={editingBalance.value}
                        onChange={e => setEditingBalance(prev => prev ? { ...prev, value: e.target.value } : null)}
                        onBlur={handleBalanceSave}
                        onKeyDown={e => { if (e.key === 'Enter') handleBalanceSave(); if (e.key === 'Escape') setEditingBalance(null); }}
                        autoFocus
                        className="w-16 px-2 py-0.5 rounded bg-white/10 text-white text-sm border border-white/20 focus:outline-none"
                      />
                    ) : (
                      <span
                        className="text-sm text-white/70 cursor-pointer hover:text-white transition-colors"
                        onClick={() => canApprove && setEditingBalance({ empId: b.employee_id, year, type: 'sick', value: String(b.sick_total) })}
                        title={canApprove ? 'Click to edit total' : undefined}
                      >
                        {b.sick_used}/{b.sick_total}d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-white/30 text-sm">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddLeaveDialog
        open={addOpen}
        employees={employees}
        onClose={() => setAddOpen(false)}
        onSaved={onRefresh}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/leave-ot/_components/leave-tab.tsx
git commit -m "feat(hr): LeaveTab — pending requests + inline-editable balance table"
```

---

## Task 8: OT Tab

**Files:**
- Create: `src/app/beithady/hr/leave-ot/_components/ot-tab.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/app/beithady/hr/leave-ot/_components/ot-tab.tsx
'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Plus } from 'lucide-react';
import { LogOtDialog } from './log-ot-dialog';
import { reviewOvertimeAction } from '@/lib/beithady/hr/hr-leave-ot-actions';
import type { OvertimeRecordRow } from '@/lib/beithady/hr/hr-leave-ot-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  pendingOT: OvertimeRecordRow[];
  approvedOT: OvertimeRecordRow[];
  canApprove: boolean;
  employees: EmployeeOption[];
  onRefresh: () => void;
};

export function OtTab({ pendingOT, approvedOT, canApprove, employees, onRefresh }: Props) {
  const [logOpen, setLogOpen] = useState(false);

  async function handleReview(id: string, decision: 'approved' | 'rejected') {
    await reviewOvertimeAction(id, decision);
    onRefresh();
  }

  function OtRow({ r, showActions }: { r: OvertimeRecordRow; showActions: boolean }) {
    return (
      <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${showActions ? 'bg-amber-950/20 border border-amber-700/20' : 'bg-white/3 border border-white/5'}`}>
        <span className="font-medium text-white text-sm min-w-[140px]">{r.employee_name}</span>
        <span className="text-xs font-mono bg-violet-900/40 text-violet-300 px-2 py-0.5 rounded">{r.company_id}</span>
        <span className="text-sm text-white/60">{r.date}</span>
        <span className="text-sm font-semibold text-white">{r.hours}h</span>
        {r.reason && <span className="text-xs text-white/40 truncate max-w-[200px]">{r.reason}</span>}
        {showActions && canApprove ? (
          <div className="ml-auto flex gap-2">
            <button onClick={() => handleReview(r.id, 'approved')}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
            <button onClick={() => handleReview(r.id, 'rejected')}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors">
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        ) : !showActions ? (
          <div className="ml-auto">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setLogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Log OT
        </button>
      </div>

      {pendingOT.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-300 mb-3">⏳ Pending ({pendingOT.length})</h3>
          <div className="space-y-2">
            {pendingOT.map(r => <OtRow key={r.id} r={r} showActions={true} />)}
          </div>
        </div>
      )}

      {approvedOT.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/50 mb-3">Approved</h3>
          <div className="space-y-2">
            {approvedOT.map(r => <OtRow key={r.id} r={r} showActions={false} />)}
          </div>
        </div>
      )}

      {pendingOT.length === 0 && approvedOT.length === 0 && (
        <p className="text-center text-white/30 italic py-8">No overtime records for this period.</p>
      )}

      <LogOtDialog
        open={logOpen}
        employees={employees}
        onClose={() => setLogOpen(false)}
        onSaved={onRefresh}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/leave-ot/_components/ot-tab.tsx
git commit -m "feat(hr): OtTab — pending + approved OT with approve/reject actions"
```

---

## Task 9: Leave-OT Board

**Files:**
- Create: `src/app/beithady/hr/leave-ot/_components/leave-ot-board.tsx`

- [ ] **Step 1: Write the board component**

```typescript
// src/app/beithady/hr/leave-ot/_components/leave-ot-board.tsx
'use client';

import { useState } from 'react';
import { LeaveTab } from './leave-tab';
import { OtTab } from './ot-tab';
import type {
  LeaveRequestRow, LeaveBalanceRow, OvertimeRecordRow,
} from '@/lib/beithady/hr/hr-leave-ot-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  initialPendingLeave: LeaveRequestRow[];
  initialBalances: LeaveBalanceRow[];
  initialPendingOT: OvertimeRecordRow[];
  initialApprovedOT: OvertimeRecordRow[];
  employees: EmployeeOption[];
  canApprove: boolean;
};

type Tab = 'leave' | 'overtime';

export function LeaveOtBoard({
  initialPendingLeave,
  initialBalances,
  initialPendingOT,
  initialApprovedOT,
  employees,
  canApprove,
}: Props) {
  const [activeTab, setActiveTab]         = useState<Tab>('leave');
  const [pendingLeave, setPendingLeave]   = useState(initialPendingLeave);
  const [balances, setBalances]           = useState(initialBalances);
  const [pendingOT, setPendingOT]         = useState(initialPendingOT);
  const [approvedOT, setApprovedOT]       = useState(initialApprovedOT);
  const [year, setYear]                   = useState(new Date().getFullYear());
  const [month, setMonth]                 = useState(
    new Date().toISOString().slice(0, 7)  // "YYYY-MM"
  );

  async function refreshLeave() {
    const res = await fetch(`/api/hr/leave-ot/leave?year=${year}`);
    if (res.ok) {
      const { pending, balances: b } = await res.json() as {
        pending: LeaveRequestRow[];
        balances: LeaveBalanceRow[];
      };
      setPendingLeave(pending);
      setBalances(b);
    }
  }

  async function refreshOT() {
    const res = await fetch(`/api/hr/leave-ot/ot?month=${month}`);
    if (res.ok) {
      const { pending, approved } = await res.json() as {
        pending: OvertimeRecordRow[];
        approved: OvertimeRecordRow[];
      };
      setPendingOT(pending);
      setApprovedOT(approved);
    }
  }

  function handleYearChange(y: number) {
    setYear(y);
    fetch(`/api/hr/leave-ot/leave?year=${y}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setPendingLeave(d.pending); setBalances(d.balances); }
    });
  }

  function handleMonthChange(m: string) {
    setMonth(m);
    fetch(`/api/hr/leave-ot/ot?month=${m}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setPendingOT(d.pending); setApprovedOT(d.approved); }
    });
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-0">
        {(['leave', 'overtime'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-rose-500 text-white'
                : 'border-transparent text-white/40 hover:text-white'
            }`}
          >
            {tab === 'leave' ? 'Leave' : 'Overtime'}
          </button>
        ))}

        {/* Filters — right side */}
        <div className="ml-auto flex items-center gap-2 pb-2">
          {activeTab === 'leave' && (
            <select
              value={year}
              onChange={e => handleYearChange(Number(e.target.value))}
              className="ix-input text-sm py-1"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {activeTab === 'overtime' && (
            <input
              type="month"
              value={month}
              onChange={e => handleMonthChange(e.target.value)}
              className="ix-input text-sm py-1"
            />
          )}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'leave' && (
        <LeaveTab
          pendingRequests={pendingLeave}
          balances={balances}
          canApprove={canApprove}
          employees={employees}
          year={year}
          onRefresh={refreshLeave}
        />
      )}
      {activeTab === 'overtime' && (
        <OtTab
          pendingOT={pendingOT}
          approvedOT={approvedOT}
          canApprove={canApprove}
          employees={employees}
          onRefresh={refreshOT}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/leave-ot/_components/leave-ot-board.tsx
git commit -m "feat(hr): LeaveOtBoard — tab switcher + year/month filter + refetch on change"
```

---

## Task 10: Page + Activate Tile + Deploy

**Files:**
- Create: `src/app/beithady/hr/leave-ot/page.tsx`
- Modify: `src/app/beithady/hr/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// src/app/beithady/hr/leave-ot/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  listLeaveRequests,
  listLeaveBalances,
  listOvertimeRecords,
  listActiveEmployeesSimple,
} from '@/lib/beithady/hr/hr-leave-ot-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { LeaveOtBoard } from './_components/leave-ot-board';

export const dynamic = 'force-dynamic';

export default async function LeaveOtPage() {
  const { roles } = await requireBeithadyPermission('hr', 'read');
  const canApprove = roles.some(r => r === 'admin' || r === 'manager');

  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [pendingLeave, balances, pendingOT, approvedOT, employees] = await Promise.all([
    listLeaveRequests({ status: 'pending', year: currentYear }),
    listLeaveBalances(currentYear),
    listOvertimeRecords({ status: 'pending', month: currentMonth }),
    listOvertimeRecords({ status: 'approved', month: currentMonth }),
    listActiveEmployeesSimple(),
  ]);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Leave & Overtime' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Leave & Overtime"
        subtitle="Leave requests · balance tracking · overtime logging · approvals"
      />
      <LeaveOtBoard
        initialPendingLeave={pendingLeave}
        initialBalances={balances}
        initialPendingOT={pendingOT}
        initialApprovedOT={approvedOT}
        employees={employees}
        canApprove={canApprove}
      />
    </BeithadyShell>
  );
}
```

- [ ] **Step 2: Activate the hub tile**

In `src/app/beithady/hr/page.tsx`, find the Leave & Overtime tile:

```typescript
    {
      href: '/beithady/hr/leave-ot',
      title: 'Leave & Overtime',
      description: 'Leave requests · approval workflow · balances · overtime logging per employee.',
      icon: CalendarOff,
      accent: 'rose',
      disabled: true,
      comingSoonLabel: 'Sprint 6',
    },
```

Remove `disabled: true,` and `comingSoonLabel: 'Sprint 6',`:

```typescript
    {
      href: '/beithady/hr/leave-ot',
      title: 'Leave & Overtime',
      description: 'Leave requests · approval workflow · balances · overtime logging per employee.',
      icon: CalendarOff,
      accent: 'rose',
    },
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Deploy**

```bash
git add src/app/beithady/hr/leave-ot/page.tsx src/app/beithady/hr/page.tsx
git commit -m "feat(hr): Leave & Overtime page + activate Sprint 6 tile — Sprint 6 complete"
git fetch origin main
git rebase origin/main
git push origin HEAD:main
vercel --prod --yes
```
