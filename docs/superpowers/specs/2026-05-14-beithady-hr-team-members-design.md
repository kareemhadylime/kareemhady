# Beithady HR Module — Sprint 1: Team Members

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Sprint 1 of 11 — Employee Master (Team Members roster, Add/Edit dialog, Bulk Import)

---

## 1. Overview

A new **"People"** module under Beithady, accessible at `/beithady/hr`. Sprint 1 delivers the Employee Master — the foundation every subsequent HR sprint builds on. It replaces the existing practice of managing staff through the April salary Excel sheet.

**Immediate outputs:**
- Working team directory (102 staff seeded from April salary sheet)
- Add/Edit member form with bilingual support
- Company IDs (BH-001…) generated and locked in
- Bulk import to onboard existing staff in one go

---

## 2. Navigation & Hub

### 2.1 Beithady Left Nav

New "**People**" entry in the Beithady sidebar (after Analytics). Points to `/beithady/hr`.

### 2.2 Hub Landing Page — `/beithady/hr`

Title: **"Beithady People"**  
Subtitle: "Workforce management · Payroll · Attendance · Compliance"

Tile grid (11 tiles). Sprints 2–11 render dimmed with "Coming soon" label until shipped:

| Tile | Icon | Route | Sprint |
|---|---|---|---|
| Team Members | Users | `/beithady/hr/team` | 1 ← active |
| Monthly Payroll | Banknote | `/beithady/hr/payroll` | 2 |
| Salary Access | ShieldCheck | `/beithady/hr/salary-access` | 3 |
| Daily Attendance | CalendarCheck | `/beithady/hr/attendance` | 4 |
| Biometric Upload | Fingerprint | `/beithady/hr/biometric` | 5 |
| Leave & Overtime | CalendarOff | `/beithady/hr/leave-ot` | 6 |
| Headcount Report | BarChart3 | `/beithady/hr/headcount` | 7 |
| Documents & Compliance | FileCheck | `/beithady/hr/documents` | 8 |
| Training & Certifications | Award | `/beithady/hr/training` | 9 |
| Onboarding Checklist | ClipboardList | `/beithady/hr/onboarding` | 10 |
| Org Chart | Network | `/beithady/hr/org-chart` | 11 |

---

## 3. Team Members Roster — `/beithady/hr/team`

### 3.1 Page Layout

**Top bar (left to right):**
- Search input — queries: English name, Arabic name, National ID (last 4 digits), BH-ID
- Filter chip: **Department** (dropdown of 13 departments)
- Filter chip: **Building** (BH-26 / BH-73 / BH-435 / BH-OK / Head Office / Other)
- Filter chip: **Status** (On Job / Probation / On Leave / Suspended / Terminated)
- **Import** button (secondary style) — opens bulk import flow
- **+ Add Member** button (primary style) — opens Add dialog

**Table columns:**

| Column | Content | Notes |
|---|---|---|
| Photo | 32px avatar circle; initials fallback | Supabase Storage |
| Name | EN bold, AR muted below | Bilingual |
| BH-ID | BH-001 chip | Monospace |
| Position | Free text job title | From contract |
| Department | Dept label | Enum |
| Building | BH-26 / BH-73 / BH-435 / BH-OK / Head Office / Other | Cost center |
| Status | Colored badge (see below) | |
| Joined | Date | |
| Actions | Edit · ··· | ··· = Transfer / Terminate / Delete |

**Status badge colors:**
- On Job → green
- Probation → blue
- On Leave → amber
- Suspended → orange
- Terminated → red; entire row gets 50% opacity + strikethrough on name

**Pagination:** 50 rows per page. Filter state preserved in URL params for bookmarking.

---

## 4. Add/Edit Member Dialog

Slide-over panel (right side, full height). Three tabs in header: **Personal Info · Contract & Payout · Timeline**

### Tab 1 — Personal Info

| Field | Type | Required | Notes |
|---|---|---|---|
| Portrait Photo | Image upload | No | Max 100 KB; stored in Supabase Storage `hr-photos/`; preview in 96×96 square |
| First Name | Text | ✅ | |
| Last Name | Text | ✅ | |
| Arabic Name | Text (RTL input) | No | Indexed for Arabic-script search |
| National ID | Text (14 digits) | ✅ | Unique; Egyptian format; on blur → auto-fill DOB + gender |
| Date of Birth | Date picker | ✅ | Auto-filled from NID digits 1–7, always editable |
| Gender | Read-only chip | — | Derived from NID digit 1 (2/3 = female, 2/3 prefix era); shown as label |
| Department | Dropdown | ✅ | See enum §7.1 |
| Position | Text | ✅ | Actual contract job title (free text) |
| Job Role | Dropdown | ✅ | Categorical; see enum §7.2; used for filtering + payroll role mapping |
| Status | Dropdown | ✅ | Default: On Job; see enum §7.3 |
| Date Joined | Date picker | ✅ | |
| Date Terminated | Date picker | Conditional | Visible + required when Status = Terminated |
| Termination Reason | Textarea | Conditional | Visible when Status = Terminated |
| Phone | Text | ✅ | Format: +20XXXXXXXXXX |
| Email | Text | No | |
| Company ID | Text (read-only) | — | Auto-generated BH-NNN; shown in amber monospace |

**NID auto-fill logic (Egyptian National ID):**
- Digit 1: era (2 = born 1900s, 3 = born 2000s)
- Digits 2–7: YYMMDD → DOB
- Digit 13 (second-to-last): odd = male, even = female

### Tab 2 — Contract & Payout

| Field | Type | Required | Notes |
|---|---|---|---|
| Contract Type | Dropdown | ✅ | Permanent / Fixed-term / Hourly |
| Contract Start | Date picker | ✅ | |
| Contract End | Date picker | No | Visible + required when type = Fixed-term |
| Building / Cost Center | Dropdown | ✅ | BH-26 / BH-73 / BH-435 / BH-OK / Head Office / Other |
| Salary Package | Number (EGP) | ✅ | Gross monthly; salary visibility gated by tier in Sprint 3 |
| Transport Allowance | Number (EGP) | No | Fixed monthly |
| Travel Allowance | Number (EGP) | No | Fixed monthly |
| Fixed Bonus | Number (EGP) | No | Fixed monthly |
| Bank Name | Text | No | |
| Bank Account | Text | No | |
| IBAN | Text | No | |
| Payment Method | Dropdown | No | Bank / Cash; default Bank |

**Salary revision history:** read-only chips below the salary field, newest first:
`Apr 2026 · EGP 11,500` → `[previous version if exists]`

On save with a changed salary: old contract row gets `effective_to = today`, new row inserted with `effective_from = today`.

### Tab 3 — Timeline (read-only)

Auto-populated from `hr_employee_events` table. Newest first. Each entry:
- Icon (color-coded by event type)
- Date
- Description: e.g., "Joined as Maintenance Technician at BH-73"
- Actor: which admin recorded the change

**Event types and their triggers:**
| Event | Trigger |
|---|---|
| `hired` | First save of new member |
| `status_change` | Status field changes on edit |
| `salary_change` | Salary Package changes on edit |
| `building_transfer` | Building/Cost Center changes on edit |
| `role_change` | Department or Job Role changes |
| `terminated` | Status set to Terminated |

---

## 5. Bulk Import Flow

Entry: **Import** button → full-width dialog (not slide-over)

### Step 1 — Upload
- Drag-and-drop or click-to-select: `.xlsx`, `.xls`, `.csv`
- Accepted column names (case-insensitive, order flexible): `Name`, `JobTitle`, `Working days`, `S.Package`, `Transportation Allowance`, `Bonus`, `OT`, `Analytic`
- Red-row detection: reads background fill color from `.xlsx` cell formatting (OOXML `fgColor`) → maps to `status = terminated`. Fallback: if file has no style data (e.g. exported from Google Sheets), import preview shows a "Mark as Terminated" checkbox per row that the user can toggle manually.

### Step 2 — Preview & Validation
Table shows all rows with per-row status:
- ✅ Ready (all required fields mapped)
- ⚠️ Incomplete — salary/title OK, but missing: National ID, Phone, DOB, Email, Date Joined (will import; fields flagged for follow-up)
- ❌ Error — duplicate National ID in DB, or missing name

**Auto-mapping rules:**

| Source column | Maps to | Transformation |
|---|---|---|
| `Name` (full name) | `first_name` | Full name imported as-is into `first_name`; `last_name` left blank + flagged in `incomplete_fields`. Arabic naming (3-word names like "Yassin Kareem Abdelhady") has no reliable automatic split point — user fills last_name via Edit dialog. |
| `JobTitle` | `position` | Direct text copy |
| `S.Package` | `hr_employee_contracts.salary_package` | Numeric strip |
| `Analytic` | `building_code` | See mapping table below |
| Red row highlight | `status` | `terminated` |
| `Transportation Allowance` | `transport_allowance` | Numeric strip |
| `Bonus` | `fixed_bonus` | Numeric strip |

**Analytic → Building mapping:**

| Excel value | building_code |
|---|---|
| Lotus 26 | BH-26 |
| Lotus 73 / LOTUS 73 | BH-73 |
| A1 Hospitality / a1 hospitality | BH-435 |
| One kattameya | BH-OK |
| Head Office | HEAD_OFFICE |
| El-Gona / El Gouna | OTHER (flagged for manual review) |

### Step 3 — Confirm
- Summary: "X employees will be imported (Y incomplete, Z errors skipped)"
- Partial import OK — ❌ rows stay in preview for correction
- Progress bar during insert
- On complete: redirect to `/beithady/hr/team` with success toast

**Post-import:** "Incomplete" employees shown with a ⚠️ badge in roster. Clicking badge opens their Edit dialog focused on the missing fields.

---

## 6. Data Model

### Table: `hr_employees`

```sql
create table hr_employees (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null unique,           -- BH-001, auto-generated
  first_name          text not null,
  last_name           text not null,
  arabic_name         text,
  national_id         text unique,                    -- 14 digits; nullable for imported rows pending fill
  date_of_birth       date,
  gender              text,                           -- 'male' | 'female' | null
  department          text not null,                  -- see enum §7.1
  position            text not null,                  -- free text job title
  job_role            text not null,                  -- see enum §7.2
  status              text not null default 'on_job', -- see enum §7.3
  date_joined         date,
  date_terminated     date,
  termination_reason  text,
  phone               text,
  email               text,
  portrait_url        text,                           -- Supabase Storage path
  incomplete_fields   text[],                         -- ['national_id','phone'] etc. for import-seeded rows
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references accounts(id)
);

-- Auto-increment company_id: BH-001 ... BH-999
create sequence hr_employee_seq start 1;
-- generated via trigger: 'BH-' || lpad(nextval('hr_employee_seq')::text, 3, '0')
```

### Table: `hr_employee_contracts`

```sql
create table hr_employee_contracts (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references hr_employees(id) on delete cascade,
  contract_type       text not null default 'permanent',  -- permanent | fixed_term | hourly
  contract_start      date not null,
  contract_end        date,
  building_code       text not null,                      -- BH-26 | BH-73 | BH-435 | BH-OK | HEAD_OFFICE | OTHER
  salary_package      numeric not null default 0,
  transport_allowance numeric not null default 0,
  travel_allowance    numeric not null default 0,
  fixed_bonus         numeric not null default 0,
  bank_name           text,
  bank_account        text,
  bank_iban           text,
  payment_method      text not null default 'bank',       -- bank | cash
  effective_from      date not null,
  effective_to        date,                               -- null = current contract
  created_at          timestamptz not null default now(),
  created_by          uuid references accounts(id)
);
```

### Table: `hr_employee_events`

```sql
create table hr_employee_events (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references hr_employees(id) on delete cascade,
  event_type   text not null,   -- hired | status_change | salary_change | building_transfer | role_change | terminated
  event_date   date not null,
  description  text not null,   -- human-readable summary
  metadata     jsonb,           -- { old_value, new_value } for changes
  created_at   timestamptz not null default now(),
  created_by   uuid references accounts(id)
);
```

### Table: `hr_salary_access`

```sql
create table hr_salary_access (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null unique references accounts(id) on delete cascade,
  tier        smallint not null default 0,  -- 0=none, 1=≤10K, 2=≤20K, 3=≤50K, 4=unlimited
  granted_by  uuid references accounts(id),
  granted_at  timestamptz not null default now()
);
```

**Salary visibility rule (enforced server-side):** when fetching contract data, if requesting user's tier < 4:
- `tier 0`: salary fields return `null` (masked)
- `tier 1–3`: salary fields return `null` if `salary_package > tier_limit`
- `tier 4`: no masking

This gating is built in Sprint 3 (Salary Access) but the table is created in Sprint 1's migration so the column exists.

---

## 7. Enums

### 7.1 Departments

```
executive           → Executive
finance             → Finance
reservations        → Reservations
real_estate         → Real Estate & Acquisitions
engineering         → Engineering & Design
operations          → Operations
housekeeping        → Housekeeping
security            → Security
maintenance         → Maintenance
front_of_house      → Front of House
drivers             → Drivers
storekeeping        → Storekeeping
lifeguard           → Lifeguard
```

### 7.2 Job Roles

```
owner_director      → Owner / Director
manager             → Manager
supervisor          → Supervisor
accountant          → Accountant
reservation_agent   → Reservation Agent
housekeeper         → Housekeeper
hk_supervisor       → HK Supervisor
security_guard      → Security Guard
maintenance_tech    → Maintenance Technician
receptionist        → Receptionist
driver              → Driver
storekeeper         → Storekeeper
architect           → Architect / Designer
property_officer    → Property Officer
lifeguard           → Lifeguard
```

### 7.3 Status

```
on_job       → On Job       (default, green)
probation    → Probation    (blue)
on_leave     → On Leave     (amber)
suspended    → Suspended    (orange)
terminated   → Terminated   (red)
```

### 7.4 Building Codes

```
BH-26        → BH-26 (Lotus 26)
BH-73        → BH-73 (Lotus 73)
BH-435       → BH-435 (A1 Hospitality)
BH-OK        → BH-OK (One Katameya)
HEAD_OFFICE  → Head Office
OTHER        → Other
```

---

## 8. Server Actions & API Routes

| Action | Route / Server Action | Notes |
|---|---|---|
| List employees | Server component query | Filtered + paginated |
| Add employee | Server Action | Inserts hr_employees + hr_employee_contracts + fires `hired` event |
| Edit employee | Server Action | Diffs fields; inserts new contract version if salary/building changed |
| Terminate | Server Action | Sets status=terminated, date_terminated, fires `terminated` event |
| Upload photo | `/api/hr/upload-photo` route | Multipart → Supabase Storage |
| Bulk import | Server Action | Parses XLSX via `xlsx` npm package; batch insert |
| Import preview | Server Action | Returns parsed rows with validation state; no DB writes |

---

## 9. File Structure

```
src/
  app/
    beithady/
      hr/
        layout.tsx                     # HR shell (shared nav/breadcrumb)
        page.tsx                       # Hub tile grid (server component)
        team/
          page.tsx                     # Roster (server component)
          _components/
            team-roster.tsx            # Client table with filters/search
            add-edit-member-dialog.tsx # Slide-over, 3 tabs
            personal-info-tab.tsx      # Tab 1 form
            contract-payout-tab.tsx    # Tab 2 form
            timeline-tab.tsx           # Tab 3 read-only
            import-dialog.tsx          # Bulk import wizard
            status-badge.tsx           # Colored status pill
  lib/
    beithady/
      hr/
        hr-types.ts                    # All TS types + enums
        hr-actions.ts                  # Server actions (add, edit, terminate, import)
        hr-queries.ts                  # Read-only DB queries
        hr-import.ts                   # XLSX parse + validation logic
        hr-company-id.ts               # BH-NNN generation
  app/
    api/
      hr/
        upload-photo/
          route.ts                     # Photo upload → Supabase Storage
```

---

## 10. Migrations

One migration file: `supabase/migrations/0080_hr_team_members.sql`

Creates: `hr_employee_seq` sequence + `hr_employees` + `hr_employee_contracts` + `hr_employee_events` + `hr_salary_access` + indexes on `national_id`, `company_id`, `arabic_name` (GIN tsvector for Arabic search), `building_code`, `status`.

---

## 11. Testing

- `src/lib/beithady/hr/hr-import.test.ts` — unit tests for XLSX parsing, auto-mapping, red-row detection, NID DOB extraction
- `src/lib/beithady/hr/hr-company-id.test.ts` — BH-NNN generation, padding, uniqueness
- Manual E2E: add member → verify timeline entry created; import April sheet → verify 102 rows + 13 terminated flagged

---

## 12. Out of Scope (Sprint 1)

- Salary visibility masking (Sprint 3 — `hr_salary_access` table created here but gating logic deferred)
- Payslip generation (Sprint 2)
- Attendance integration (Sprint 4+)
- Employee self-service portal (Phase 3)
- Org Chart rendering (Sprint 11)
