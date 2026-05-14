# Beithady HR Module — Sprint 6: Leave & Overtime

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Sprint 6 of 11 — Leave requests + balance tracking + overtime logging + approval workflow

---

## 1. Overview

Two subsystems on one page at `/beithady/hr/leave-ot`, separated by tabs.

**Leave:** HR manually sets each employee's annual leave balance (total_days) per year per type. Employees (or HR on their behalf) submit leave requests. Managers approve or reject. Approved annual/sick requests auto-deduct from the balance. Emergency leave has no balance limit.

**Overtime:** Supervisors log OT entries (employee + date + hours). Managers approve or reject. No calculations — OT records are informational only (payroll integration deferred).

**Leave types:** Annual · Sick · Emergency (unlimited, no deduction)  
**Approval:** `hr:full` only (admin and manager Beithady roles)

---

## 2. Page Structure — `/beithady/hr/leave-ot`

### 2.1 Hub tile

Already exists on `/beithady/hr` as Sprint 6 tile (dimmed, "Sprint 6"). Sprint 6 activates it.

### 2.2 Leave Tab

```
┌──────────────────────────────────────────────────────────────┐
│ Year: [2026 ▾]   Employee: [All ▾]        [+ Add Request]   │
│                                                               │
│ ⏳ Pending (3)                                               │
│  Mohamed Ali · Annual · 12–15 May (4d) · [✓ Approve] [✗]   │
│  Ahmed Fathy  · Sick   · 14 May (1d)   · [✓ Approve] [✗]   │
│                                                               │
│ Balances                                                      │
│  Name           Annual    Sick    Emergency                   │
│  Mohamed Ali    14/21d    3/10d   —                          │
│  Ahmed Fathy    18/21d    4/10d   —                          │
└──────────────────────────────────────────────────────────────┘
```

**Top bar:** Year dropdown (defaults current year) · Employee filter (All or specific) · "+ Add Request" button (opens modal)

**Pending section:** Amber header · one row per pending request showing employee name, leave type chip, date range, days count, Approve (green) and Reject (red) buttons. Approve/Reject require `hr:full`. Approving annual/sick requests deducts `days_count` from the employee's `used_days` for that year/type.

**Balances table:** All active employees (non-terminated) for the selected year. Columns: Name · Annual (used/total) · Sick (used/total) · Emergency (—, unlimited). HR can click a balance cell to edit `total_days` inline.

### 2.3 Overtime Tab

```
┌──────────────────────────────────────────────────────────────┐
│ Employee: [All ▾]    Month: [May 2026 ▾]    [+ Log OT]      │
│                                                               │
│ ⏳ Pending (2)                                               │
│  Mohamed Ali · 13 May · 3 hrs · Urgent repairs [✓] [✗]      │
│                                                               │
│ Approved                                                      │
│  Ahmed Fathy · 10 May · 2 hrs · Emergency call              │
└──────────────────────────────────────────────────────────────┘
```

**Top bar:** Employee filter · Month picker · "+ Log OT" button (opens modal)

**Pending section:** Amber header · one row per pending OT entry. Approve/Reject buttons (`hr:full` only).

**Approved section:** Approved OT for the selected month/employee filter.

### 2.4 Access control

- Page visible: `requireBeithadyPermission('hr', 'read')`
- Add request / Log OT: any user with `hr: 'read'` or above
- Approve / Reject / Edit balances: `hr: 'full'` (admin and manager)

---

## 3. Add Leave Request Modal

Fields:
- Employee (searchable select from active employees)
- Leave Type (Annual / Sick / Emergency)
- Start Date (date picker)
- End Date (date picker, must be ≥ start date)
- Days Count (auto-calculated from start/end, editable for partial days)
- Reason (textarea, optional)

**Validation:** For annual/sick, warn if `days_count` exceeds remaining balance (allow override — HR decision). Emergency always allowed.

---

## 4. Log OT Modal

Fields:
- Employee (searchable select from active employees)
- Date (date picker, defaults today)
- Hours (number input, > 0)
- Reason (textarea, optional)

---

## 5. Data Model — 3 New Tables

```sql
-- supabase/migrations/0130_hr_leave_ot.sql

-- Leave balances: HR sets total_days; used_days auto-updated on approval
create table public.hr_leave_balances (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  year        int not null,
  leave_type  text not null check (leave_type in ('annual', 'sick', 'emergency')),
  total_days  numeric not null default 0 check (total_days >= 0),
  used_days   numeric not null default 0 check (used_days >= 0),
  constraint uq_hr_leave_balance unique (employee_id, year, leave_type)
);

create index idx_hr_leave_bal_emp  on public.hr_leave_balances(employee_id, year);

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

**Balance deduction on leave approval:**
```
if leave_type in ('annual', 'sick'):
  upsert hr_leave_balances (employee_id, year=year(start_date), leave_type)
    on conflict: used_days += days_count
```
Emergency leaves never touch `hr_leave_balances`.

---

## 6. Server Actions

| Action | Auth | Side effects |
|--------|------|-------------|
| `addLeaveRequestAction(input)` | `hr:read` | Insert `hr_leave_requests` |
| `reviewLeaveRequestAction(id, decision)` | `hr:full` | Update status + deduct balance if approved |
| `setLeaveBalanceAction(employeeId, year, type, totalDays)` | `hr:full` | Upsert `hr_leave_balances` |
| `logOvertimeAction(input)` | `hr:read` | Insert `hr_overtime_records` |
| `reviewOvertimeAction(id, decision)` | `hr:full` | Update status |

---

## 7. File Structure

```
supabase/migrations/
  0130_hr_leave_ot.sql                — 3 tables + indexes

src/lib/beithady/hr/
  hr-leave-ot-types.ts               — Pure types: LeaveRequest, OvertimeRecord, LeaveBalance, etc.
  hr-leave-ot-queries.ts             — listLeaveRequests, listLeaveBalances, listOvertimeRecords (server-only)
  hr-leave-ot-actions.ts             — all 5 server actions

src/app/beithady/hr/
  leave-ot/
    page.tsx                         — Server component, auth-gated
    _components/
      leave-ot-board.tsx             — 'use client' — tabs, state, refetch
      leave-tab.tsx                  — Leave pending + balances table
      ot-tab.tsx                     — OT pending + approved list
      add-leave-dialog.tsx           — Add leave request modal
      log-ot-dialog.tsx              — Log OT modal

src/app/beithady/hr/
  page.tsx                           — MODIFY: activate Sprint 6 tile
```

---

## 8. Out of Scope (Sprint 6)

- Employee self-service portal (requests submitted by employees themselves, not HR on their behalf)
- Leave accrual auto-calculation (Egyptian labor law)
- OT rate calculation / payroll feed
- Leave calendar view
- Email / WhatsApp notifications for request status changes
- Carry-over balance from previous year
