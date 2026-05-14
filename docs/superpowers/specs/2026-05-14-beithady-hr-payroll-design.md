# Beithady HR Module — Sprint 2: Monthly Payroll

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Sprint 2 of 11 — Monthly Payroll (upload, store, print payslips)

---

## 1. Overview

Upload the monthly salary Excel sheet → parse all columns → store as a snapshot → print bilingual payslips (per employee or batch-filtered). Payslip language (Arabic or English) is a per-employee setting on the People Card.

**Immediate outputs:**
- Monthly payroll stored per month, re-uploadable (overwrite model)
- Payslips printed per employee in their preferred language
- Batch print filtered by building or department into one PDF
- Name-based auto-match links payroll entries to the employee master

---

## 2. Sprint 1 Retrofix

A small migration and UI change needed before Sprint 2 ships:

### Migration `0125_hr_payslip_language.sql`

```sql
alter table public.hr_employees
  add column payslip_language text not null default 'arabic'
  check (payslip_language in ('arabic', 'english'));
```

### PersonalInfoTab update

Add a **Payslip Language** field to the Personal Info tab (below Email, above Company ID):

```
PAYSLIP LANGUAGE
  ○ Arabic (default)   ○ English
```

Stored as `payslip_language` on `hr_employees`. Default: `'arabic'`.

---

## 3. Page Structure — `/beithady/hr/payroll`

### 3.1 Hub tile

Already exists on `/beithady/hr` as Sprint 2 tile (dimmed, "Sprint 2"). Sprint 2 activates it.

### 3.2 Layout

```
┌──────────────────────────────────────────────────────────┐
│ Month: [April 2026 ▾]          [Upload New Month]        │
│                                [Print Payslips ▾]        │
├──────────────────────────────────────────────────────────┤
│ (filter chips: All Buildings ▾  All Depts ▾)             │
│                                                          │
│  Name            BH-ID    Position   Building  Net   🖨  │
│  Mohamed Ali     BH-001   Engineer   BH-26   11,500  🖨  │
│  Ahmed Fathy     ⚠️ unmatched  Sr. Acct  HO  18,500  🖨  │
│  Osama Alaa      BH-084   HK         BH-73    3,467  🖨  │
│  ...                                                     │
├──────────────────────────────────────────────────────────┤
│ Total: 102 employees · Net payroll: EGP 1,234,567        │
└──────────────────────────────────────────────────────────┘
```

**Top bar:**
- Month picker dropdown — lists all stored `hr_payroll_months` (newest first) + "Upload New Month" button
- "Print Payslips ▾" — opens filter drawer (see §3.3)
- Filter chips for building and department (client-side, same pattern as team roster)

**Table columns:** Name · BH-ID (chip: matched=violet, ⚠️=amber) · Position · Building · Working Days · Net Salary · 🖨 (print individual payslip)

**Footer:** employee count + total net payroll for the visible filter

**Empty state (no months uploaded yet):** Full-width "Upload your first payroll sheet" call-to-action.

### 3.3 Print Payslips Filter Drawer

Slides in from right when "Print Payslips ▾" is clicked:
- Building filter (multi-select chips: BH-26 / BH-73 / BH-435 / BH-OK / Head Office / All)
- Department filter (multi-select)
- Exclude terminated toggle (default: on)
- Preview count: "Will print **34 payslips**"
- "Generate PDF" button → triggers server action → returns PDF download

Each employee's payslip renders in their `payslip_language`. Multiple payslips are concatenated into a single PDF in alphabetical order.

---

## 4. Data Model — 2 New Tables

### `hr_payroll_months`

```sql
create table hr_payroll_months (
  id           uuid primary key default gen_random_uuid(),
  month_key    text not null unique,   -- "2026-04" (YYYY-MM)
  label        text not null,          -- "April 2026"
  uploaded_at  timestamptz not null default now(),
  uploaded_by  uuid references accounts(id)
);
```

### `hr_payroll_entries`

```sql
create table hr_payroll_entries (
  id                  uuid primary key default gen_random_uuid(),
  month_id            uuid not null references hr_payroll_months(id) on delete cascade,
  employee_id         uuid references hr_employees(id) on delete set null,
  -- Raw data from salary sheet
  sheet_name          text not null,          -- original name as typed
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
  building_code       text,                   -- mapped from Analytic column
  analytic_raw        text,                   -- original Analytic cell value
  is_terminated       boolean not null default false,
  created_at          timestamptz not null default now(),
  created_by          uuid references accounts(id)
);

create index idx_hr_payroll_entries_month    on hr_payroll_entries(month_id);
create index idx_hr_payroll_entries_employee on hr_payroll_entries(employee_id);
```

**Overwrite on re-upload:** delete all `hr_payroll_entries` where `month_id = existing_month.id`, then re-insert. Update `hr_payroll_months.uploaded_at`.

---

## 5. Upload Flow — 3-Step Wizard

Same modal pattern as Sprint 1 import dialog.

### Step 1 — Upload

- Drag-and-drop or browse: `.xlsx`, `.xls`
- **Month:** a month picker (`<select>`) defaults to the current calendar month (YYYY-MM). User changes it before confirming. No filename inference — explicit selection avoids silent mistakes.
- Accepted columns (case-insensitive, order flexible):
  `Name · JobTitle · Working days · S.Package · OT · Transportation Allowance · Bonus · Travel Allowance · salary in advance · Deduction · Net Salary · Analytic`

### Step 2 — Preview & Match

Table shows all parsed rows with match status:

| Status | Indicator | Meaning |
|---|---|---|
| ✅ Matched | `BH-001` violet chip | Name uniquely matched to one `hr_employees` row |
| ⚠️ Unmatched | amber "Unmatched" | No matching employee found — still imports, prints without photo/BH-ID |
| 🔄 Ambiguous | dropdown | 2+ employees matched — user picks correct one |
| ❌ Error | red | Missing name — skipped |

Month label shown at top: "Saving as: **April 2026**" (editable).

**Name matching algorithm:**
1. Normalise both sides: lowercase, collapse whitespace, strip punctuation
2. Exact match first
3. Fuzzy: `hr_employees.first_name` contained in sheet name (or vice versa)
4. Multiple matches → ambiguous

### Step 3 — Done

"X entries saved · Y matched · Z unmatched" with link to view the month.

---

## 6. Payslip PDF Templates

Two templates using `@react-pdf/renderer` (already in `package.json`):

### 6.1 English Template (`payslip-en.tsx`)

LTR layout, A4 page.

**Sections:**
1. **Header:** Beithady wordmark (from `/brand/beithady/Wordmark-03.png`) · "Salary Slip" · Month label
2. **Employee:** Name (EN) · BH-ID · Position · Building · Working Days: N
3. **Earnings table:** Basic Salary · Overtime · Transport Allowance · Travel Allowance · Bonus · **Total Earnings**
4. **Deductions table:** Salary in Advance · Other Deductions · **Total Deductions**
5. **Net Salary** (large, bold, highlighted)
6. **Footer:** HR Signature ____________ · Employee Signature ____________

### 6.2 Arabic Template (`payslip-ar.tsx`)

RTL layout (`direction: 'rtl'`), A4 page. All labels in Arabic.

**Labels:**
- Header: كشف مرتب
- Employee section: الاسم · رقم الموظف · المسمى الوظيفي · الموقع · أيام العمل
- Earnings: المكافآت / الراتب الأساسي · العمل الإضافي · بدل مواصلات · بدل سفر · مكافأة · إجمالي المكافآت
- Deductions: الخصومات / سلفة · خصومات أخرى · إجمالي الخصومات
- Net: صافي الراتب
- Footer: توقيع الموظف · توقيع قسم الموارد البشرية

### 6.3 Template data shape

Both templates accept:

```typescript
type PayslipData = {
  month_label: string;          // "April 2026"
  employee_name: string;        // from sheet or hr_employees
  arabic_name: string | null;   // from hr_employees (Arabic template only)
  bh_id: string | null;         // null if unmatched
  job_title: string;
  building_label: string;
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
```

### 6.4 Batch PDF generation

- Server action `generatePayslipsPdfAction(monthId, filters)` 
- For each matching entry: look up `hr_employees.payslip_language`, render the correct template
- Merge all pages into one PDF using `@react-pdf/renderer`'s `pdf()` function
- Return as `application/pdf` response for browser download

---

## 7. Server Actions & Routes

| Action/Route | Purpose |
|---|---|
| `uploadPayrollAction(formData)` | Parse Excel, run name-matching, preview result (no DB write) |
| `confirmPayrollAction(monthKey, label, entries)` | Write `hr_payroll_months` + `hr_payroll_entries` (overwrite) |
| `GET /api/hr/payslip/[entryId]` | Stream individual payslip PDF |
| `POST /api/hr/payslips/batch` | Accept `{monthId, filters}`, return merged PDF |

---

## 8. File Structure

```
supabase/migrations/
  0125_hr_payslip_language.sql     — add payslip_language to hr_employees
  0126_hr_payroll_tables.sql       — hr_payroll_months + hr_payroll_entries

src/lib/beithady/hr/
  hr-payroll-types.ts              — PayslipData, PayrollEntry, PayrollMonth types
  hr-payroll-parser.ts             — Excel parsing (extends hr-import.ts pattern)
  hr-payroll-parser.test.ts        — Vitest tests for parser + name-matching
  hr-payroll-actions.ts            — uploadPayrollAction, confirmPayrollAction
  hr-payroll-queries.ts            — listMonths, getMonthEntries, etc.

src/app/beithady/hr/
  payroll/
    page.tsx                       — Payroll roster server component
    _components/
      payroll-roster.tsx           — Client table + filter chips
      upload-payroll-dialog.tsx    — 3-step wizard
      print-filter-drawer.tsx      — Filter + generate PDF
      payslip-en.tsx               — English PDF template
      payslip-ar.tsx               — Arabic PDF template

src/app/api/hr/
  payslip/[entryId]/route.ts       — Individual payslip stream
  payslips/batch/route.ts          — Batch PDF generator

src/app/beithady/hr/team/_components/
  personal-info-tab.tsx            — MODIFY: add payslip_language radio
```

---

## 9. Out of Scope (Sprint 2)

- Salary visibility masking by tier (Sprint 3 — `hr_salary_access`)
- Payroll approval workflow (sign-off before finalising)
- Automated calculations (OT rates, tax, social insurance)
- Email/WhatsApp payslip delivery
- Odoo payroll integration
