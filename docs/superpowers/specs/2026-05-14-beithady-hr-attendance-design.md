# Beithady HR Module — Sprint 4: Daily Attendance

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Sprint 4 of 11 — Daily Attendance (import, store, approve, report)

---

## 1. Overview

Track daily employee attendance via Excel import. A supervisor downloads a pre-filled template for their building or department, marks Present/Absent, and uploads it back. An admin reviews and approves the records. The attendance table acts as both the submission UI and the report — filter by date and building/department to see any day's roll call.

**Immediate outputs:**
- Download a pre-filled Excel template for any date + building/department filter
- Import attendance records via 3-step wizard (upload → preview/match → saved)
- Per-row and bulk approval by admin
- Attendance table: all active employees for the selected filter, showing whether each has a record for that day
- No payroll integration — attendance is a standalone report

---

## 2. Page Structure — `/beithady/hr/attendance`

### 2.1 Hub tile

Already exists on `/beithady/hr` as Sprint 4 tile (dimmed, "Sprint 4"). Sprint 4 activates it.

### 2.2 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Date: [14 May 2026 ▾]   [All Buildings ▾]  [All Depts ▾]    │
│                         [↓ Download Template] [↑ Import]     │
├──────────────────────────────────────────────────────────────┤
│  Name          BH-ID   Dept        Building   Status   State │
│  Mohamed Ali   BH-001  Engineering BH-26    ✅ Present   ✓   │
│  Ahmed Fathy   BH-002  Finance     HO       ❌ Absent    ✓   │
│  Osama Alaa    BH-084  HK          BH-73      —         ⏳   │
├──────────────────────────────────────────────────────────────┤
│ [Approve All Pending]  3 pending · 47 approved · 12 not recorded│
└──────────────────────────────────────────────────────────────┘
```

**Top bar:**
- Date picker — single day, defaults to today (YYYY-MM-DD)
- Building filter chip (All Buildings / BH-26 / BH-73 / BH-435 / BH-OK / Head Office)
- Department filter chip (All Departments + each department)
- "Download Template" button → calls `GET /api/hr/attendance/template`
- "Import" button → opens 3-step import dialog

**Table columns:** Name · BH-ID · Department · Building · Status (Present / Absent / — if no record) · Approval State (✓ approved / ⏳ pending / — none)

**Footer:** "Approve All Pending" button (scoped to current date + filter) · summary counts (pending / approved / not recorded)

**Empty state (no employees match filter):** "No active employees for this filter."

### 2.3 Access control

- `requireBeithadyPermission('hr', 'read')` — page visible to all HR-permitted users
- Importing records: any user with `hr: 'read'` or above
- Approving records: `hr: 'full'` only (admin and manager)

---

## 3. Template Download — `GET /api/hr/attendance/template`

**Query params:** `date` (YYYY-MM-DD, required) · `building` (optional) · `department` (optional)

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
**Filename:** `attendance-template-{date}-{filter}.xlsx`

**Columns in the generated Excel:**

| Column | Value |
|--------|-------|
| Name | `first_name last_name` (or arabic_name if set) |
| BH-ID | company_id |
| Department | department label |
| Building | building_code from active contract |
| Date | the requested date (YYYY-MM-DD) |
| Status | blank — supervisor fills in `Present` or `Absent` |

**Data source:** all `hr_employees` with status NOT `terminated`, joined to their active contract (`effective_to IS NULL`), filtered by building_code and/or department as requested. Sorted by building, then name.

---

## 4. Import Dialog — 3-Step Wizard

Same modal pattern as Sprint 1 import and Sprint 2 payroll upload.

### Step 1 — Upload

- Drag-and-drop or browse: `.xlsx`, `.xls`
- Date field (defaults to today, editable)
- Accepted columns (case-insensitive, order flexible): `Name · BH-ID · Date · Status`
- Status values accepted: `present`, `absent`, `p`, `a`, `1`, `0` (case-insensitive)

### Step 2 — Preview & Match

Table shows all parsed rows with match status:

| Status | Indicator | Meaning |
|--------|-----------|---------|
| ✅ Matched | `BH-001` violet chip | BH-ID found in hr_employees |
| ⚠️ Unmatched | amber "Unmatched" | BH-ID not found — row skipped on confirm |
| 🔒 Protected | grey "Approved" | Record exists and is approved — row skipped |
| ❌ Error | red | Missing name or invalid status — skipped |

Top of preview shows: "Importing attendance for **14 May 2026**" (editable).

**Protected row handling:** if a record for (employee_id, date) already exists with `approval_state = 'approved'`, the import skips that row and shows it as 🔒 Protected. Pending records are overwritten (upsert).

### Step 3 — Done

"X records saved · Y matched · Z skipped (unmatched/protected/error)" with link to view the day.

---

## 5. Data Model — 1 New Table

```sql
create table hr_attendance_records (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references hr_employees(id) on delete cascade,
  date           date not null,
  status         text not null check (status in ('present', 'absent')),
  building_code  text,
  approval_state text not null default 'pending'
                 check (approval_state in ('pending', 'approved')),
  submitted_by   uuid references app_users(id),
  submitted_at   timestamptz not null default now(),
  approved_by    uuid references app_users(id),
  approved_at    timestamptz,
  unique (employee_id, date)
);

create index idx_hr_attendance_date     on hr_attendance_records(date);
create index idx_hr_attendance_employee on hr_attendance_records(employee_id);
create index idx_hr_attendance_building on hr_attendance_records(building_code);
```

**Upsert on re-import:** `INSERT … ON CONFLICT (employee_id, date) DO UPDATE` — only if existing record has `approval_state = 'pending'`. If approved, skip.

---

## 6. Approval

### Approve All Pending

Server action `approveAttendanceAction(filters)` where filters includes `date`, optional `building`, optional `department`:
1. `requireBeithadyPermission('hr', 'full')`
2. Update all `hr_attendance_records` where `date = date AND approval_state = 'pending'` (+ optional building/department join) → set `approval_state = 'approved'`, `approved_by = user.id`, `approved_at = now()`
3. `revalidatePath('/beithady/hr/attendance')`

### Individual row approval

Same action, scoped to a single `recordId`. Shown as a small checkmark button on each pending row.

---

## 7. Server Actions & Routes

| Action / Route | Purpose |
|----------------|---------|
| `GET /api/hr/attendance/template` | Generate + stream pre-filled Excel template |
| `previewAttendanceAction(formData)` | Parse Excel, run BH-ID matching, NO DB writes |
| `confirmAttendanceAction(date, rows)` | Upsert records (skip approved), return summary |
| `approveAttendanceAction({ date, building?, department? })` | Bulk-approve pending records for date+filter |
| `approveAttendanceRowAction(recordId)` | Approve a single record |

---

## 8. File Structure

```
supabase/migrations/
  0128_hr_attendance.sql              — hr_attendance_records table + indexes

src/lib/beithady/hr/
  hr-attendance-types.ts             — AttendanceRecord, AttendanceRow, AttendanceFilter types
  hr-attendance-parser.ts            — Excel parsing + BH-ID matching
  hr-attendance-parser.test.ts       — Vitest tests for parser + status normalisation
  hr-attendance-queries.ts           — listAttendanceForDay(), getAttendanceSummary() (server-only)
  hr-attendance-actions.ts           — previewAttendanceAction, confirmAttendanceAction,
                                       approveAttendanceAction, approveAttendanceRowAction

src/app/api/hr/attendance/
  template/route.ts                  — GET template download (ExcelJS)

src/app/beithady/hr/
  attendance/
    page.tsx                         — Server component, auth-gated
    _components/
      attendance-board.tsx           — 'use client' table + filters + approval
      import-attendance-dialog.tsx   — 3-step wizard

src/app/beithady/hr/
  page.tsx                           — MODIFY: activate Sprint 4 tile
```

---

## 9. Out of Scope (Sprint 4)

- Feeding working_days into payroll (no integration with hr_payroll_entries)
- Leave balance tracking (Sprint 6 — Leave & Overtime)
- Biometric device upload (Sprint 5)
- Monthly attendance summary report with export
- Late / Half-day status tracking
