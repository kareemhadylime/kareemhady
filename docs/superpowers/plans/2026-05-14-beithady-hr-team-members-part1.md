# Beithady HR — Team Members (Part 1: Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Run Part 1 fully before starting Part 2** (`2026-05-14-beithady-hr-team-members-part2.md`).

**Goal:** Lay the DB schema, TypeScript types, pure helpers, auth integration, server queries/actions, and the HR hub page — everything Part 2 components depend on.

**Architecture:** Supabase (4 new tables + sequence) → server-only query layer → `'use server'` actions → React Server Components for pages; client components only where interactivity is required. Follows existing Beithady patterns (`BeithadyShell`, `BeithadyLauncher`, `requireBeithadyPermission`).

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind v4 · Supabase (supabaseAdmin) · exceljs (already installed)

---

## File Map

| Status | Path | Purpose |
|---|---|---|
| **Create** | `supabase/migrations/0080_hr_team_members.sql` | 4 tables + sequence + trigger |
| **Create** | `src/lib/beithady/hr/hr-types.ts` | All TS types + enum constants |
| **Create** | `src/lib/beithady/hr/hr-company-id.ts` | `formatCompanyId(n)` pure fn |
| **Create** | `src/lib/beithady/hr/hr-company-id.test.ts` | Vitest unit tests |
| **Create** | `src/lib/beithady/hr/hr-nid.ts` | Egyptian NID parser pure fn |
| **Create** | `src/lib/beithady/hr/hr-nid.test.ts` | Vitest unit tests |
| **Create** | `src/lib/beithady/hr/hr-queries.ts` | Server-only DB reads |
| **Create** | `src/lib/beithady/hr/hr-actions.ts` | Server actions: add/edit/terminate |
| **Create** | `src/app/api/hr/upload-photo/route.ts` | Photo → Supabase Storage |
| **Create** | `src/app/beithady/hr/layout.tsx` | HR shell (breadcrumb wrapper) |
| **Create** | `src/app/beithady/hr/page.tsx` | Hub: 11-tile launcher |
| **Modify** | `src/lib/beithady/auth.ts` | Add `'hr'` to BeithadyCategory |
| **Modify** | `src/app/beithady/page.tsx` | Add People tile + order entry |

---

## Task 1: Supabase Migration

**Files:**
- Create: `supabase/migrations/0080_hr_team_members.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/0080_hr_team_members.sql
-- Beithady HR — Employee Master (Sprint 1)

-- Sequence backing BH-NNN company IDs
create sequence if not exists hr_employee_seq start with 1 increment by 1;

-- Core employee identity
create table hr_employees (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null unique,
  first_name          text not null,
  last_name           text,
  arabic_name         text,
  national_id         text unique,
  date_of_birth       date,
  gender              text check (gender in ('male', 'female')),
  department          text not null,
  position            text not null,
  job_role            text not null,
  status              text not null default 'on_job'
                      check (status in ('on_job','probation','on_leave','suspended','terminated')),
  date_joined         date,
  date_terminated     date,
  termination_reason  text,
  phone               text,
  email               text,
  portrait_url        text,
  incomplete_fields   text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references accounts(id)
);

create index idx_hr_emp_status     on hr_employees(status);
create index idx_hr_emp_department on hr_employees(department);

-- Contract versions (salary history — one active row per employee where effective_to IS NULL)
create table hr_employee_contracts (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references hr_employees(id) on delete cascade,
  contract_type       text not null default 'permanent'
                      check (contract_type in ('permanent','fixed_term','hourly')),
  contract_start      date not null,
  contract_end        date,
  building_code       text not null
                      check (building_code in ('BH-26','BH-73','BH-435','BH-OK','HEAD_OFFICE','OTHER')),
  salary_package      numeric not null default 0 check (salary_package >= 0),
  transport_allowance numeric not null default 0,
  travel_allowance    numeric not null default 0,
  fixed_bonus         numeric not null default 0,
  bank_name           text,
  bank_account        text,
  bank_iban           text,
  payment_method      text not null default 'bank' check (payment_method in ('bank','cash')),
  effective_from      date not null,
  effective_to        date,          -- NULL = current active contract
  created_at          timestamptz not null default now(),
  created_by          uuid references accounts(id)
);

create index idx_hr_contracts_emp     on hr_employee_contracts(employee_id);
create index idx_hr_contracts_active  on hr_employee_contracts(employee_id)
  where effective_to is null;
create index idx_hr_contracts_bldg    on hr_employee_contracts(building_code);

-- Immutable audit timeline
create table hr_employee_events (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references hr_employees(id) on delete cascade,
  event_type   text not null
               check (event_type in
                 ('hired','status_change','salary_change',
                  'building_transfer','role_change','terminated')),
  event_date   date not null,
  description  text not null,
  metadata     jsonb,
  created_at   timestamptz not null default now(),
  created_by   uuid references accounts(id)
);

create index idx_hr_events_emp on hr_employee_events(employee_id, event_date desc);

-- Salary visibility tiers (gating logic added in Sprint 3; table lives here)
create table hr_salary_access (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  tier       smallint not null default 0 check (tier between 0 and 4),
  -- 0=none 1=≤10K 2=≤20K 3=≤50K 4=unlimited
  granted_by uuid references accounts(id),
  granted_at timestamptz not null default now()
);

-- Auto-generate BH-NNN company ID
create or replace function generate_hr_company_id()
returns text language plpgsql as $$
declare v bigint;
begin
  v := nextval('hr_employee_seq');
  return 'BH-' || lpad(v::text, 3, '0');
end;
$$;
```

- [ ] **Step 2: Apply via Supabase dashboard**

Open https://supabase.com/dashboard → project `bpjproljatbrbmszwbov` → SQL Editor → paste and run the SQL above.

Expected: "Success. No rows returned."

- [ ] **Step 3: Create Supabase Storage bucket**

In Supabase dashboard → Storage → New bucket:
- Name: `hr-photos`
- Public: **No** (private; photos served via signed URLs)

- [ ] **Step 4: Verify**

In SQL Editor:
```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'hr_%'
order by table_name;
```
Expected 4 rows: `hr_employee_contracts`, `hr_employee_events`, `hr_employees`, `hr_salary_access`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0080_hr_team_members.sql
git commit -m "feat(hr): migration 0080 — 4 HR tables + BH-NNN sequence"
```

---

## Task 2: Types File

**Files:**
- Create: `src/lib/beithady/hr/hr-types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/lib/beithady/hr/hr-types.ts
// Pure types + enum constants. No imports — safe to use in any context.

export const DEPARTMENTS = [
  'executive', 'finance', 'reservations', 'real_estate', 'engineering',
  'operations', 'housekeeping', 'security', 'maintenance',
  'front_of_house', 'drivers', 'storekeeping', 'lifeguard',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  executive:     'Executive',
  finance:       'Finance',
  reservations:  'Reservations',
  real_estate:   'Real Estate & Acquisitions',
  engineering:   'Engineering & Design',
  operations:    'Operations',
  housekeeping:  'Housekeeping',
  security:      'Security',
  maintenance:   'Maintenance',
  front_of_house:'Front of House',
  drivers:       'Drivers',
  storekeeping:  'Storekeeping',
  lifeguard:     'Lifeguard',
};

export const JOB_ROLES = [
  'owner_director', 'manager', 'supervisor', 'accountant',
  'reservation_agent', 'housekeeper', 'hk_supervisor', 'security_guard',
  'maintenance_tech', 'receptionist', 'driver', 'storekeeper',
  'architect', 'property_officer', 'lifeguard',
] as const;
export type JobRole = (typeof JOB_ROLES)[number];

export const JOB_ROLE_LABELS: Record<JobRole, string> = {
  owner_director:   'Owner / Director',
  manager:          'Manager',
  supervisor:       'Supervisor',
  accountant:       'Accountant',
  reservation_agent:'Reservation Agent',
  housekeeper:      'Housekeeper',
  hk_supervisor:    'HK Supervisor',
  security_guard:   'Security Guard',
  maintenance_tech: 'Maintenance Technician',
  receptionist:     'Receptionist',
  driver:           'Driver',
  storekeeper:      'Storekeeper',
  architect:        'Architect / Designer',
  property_officer: 'Property Officer',
  lifeguard:        'Lifeguard',
};

export const EMPLOYEE_STATUSES = [
  'on_job', 'probation', 'on_leave', 'suspended', 'terminated',
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  on_job:     'On Job',
  probation:  'Probation',
  on_leave:   'On Leave',
  suspended:  'Suspended',
  terminated: 'Terminated',
};

export const BUILDING_CODES = [
  'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'HEAD_OFFICE', 'OTHER',
] as const;
export type BuildingCode = (typeof BUILDING_CODES)[number];

export const BUILDING_LABELS: Record<BuildingCode, string> = {
  'BH-26':      'BH-26 (Lotus 26)',
  'BH-73':      'BH-73 (Lotus 73)',
  'BH-435':     'BH-435 (A1 Hospitality)',
  'BH-OK':      'BH-OK (One Katameya)',
  HEAD_OFFICE:  'Head Office',
  OTHER:        'Other',
};

export const CONTRACT_TYPES = ['permanent', 'fixed_term', 'hourly'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const PAYMENT_METHODS = ['bank', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const EVENT_TYPES = [
  'hired', 'status_change', 'salary_change',
  'building_transfer', 'role_change', 'terminated',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// ── DB row shapes ──────────────────────────────────────────────────────────

export type HrEmployee = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  arabic_name: string | null;
  national_id: string | null;
  date_of_birth: string | null;   // ISO YYYY-MM-DD
  gender: 'male' | 'female' | null;
  department: Department;
  position: string;
  job_role: JobRole;
  status: EmployeeStatus;
  date_joined: string | null;
  date_terminated: string | null;
  termination_reason: string | null;
  phone: string | null;
  email: string | null;
  portrait_url: string | null;
  incomplete_fields: string[];
  created_at: string;
  updated_at: string;
};

export type HrContract = {
  id: string;
  employee_id: string;
  contract_type: ContractType;
  contract_start: string;
  contract_end: string | null;
  building_code: BuildingCode;
  salary_package: number;
  transport_allowance: number;
  travel_allowance: number;
  fixed_bonus: number;
  bank_name: string | null;
  bank_account: string | null;
  bank_iban: string | null;
  payment_method: PaymentMethod;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

export type HrEvent = {
  id: string;
  employee_id: string;
  event_type: EventType;
  event_date: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
};

// Joined view model used by the roster and dialog
export type HrEmployeeRow = HrEmployee & {
  current_contract: HrContract | null;
  contract_history: HrContract[];
};

// ── Form input shapes ──────────────────────────────────────────────────────

export type PersonalInfoInput = {
  first_name: string;
  last_name: string;
  arabic_name: string;
  national_id: string;
  date_of_birth: string;
  gender: 'male' | 'female' | '';
  department: Department | '';
  position: string;
  job_role: JobRole | '';
  status: EmployeeStatus;
  date_joined: string;
  date_terminated: string;
  termination_reason: string;
  phone: string;
  email: string;
  portrait_url: string;
};

export type ContractInput = {
  contract_type: ContractType;
  contract_start: string;
  contract_end: string;
  building_code: BuildingCode | '';
  salary_package: string;       // string in form → parsed to number in action
  transport_allowance: string;
  travel_allowance: string;
  fixed_bonus: string;
  bank_name: string;
  bank_account: string;
  bank_iban: string;
  payment_method: PaymentMethod;
};

// ── Import shapes ──────────────────────────────────────────────────────────

export type ImportRow = {
  rowIndex: number;
  first_name: string;           // full name from sheet (last_name left blank)
  position: string;
  salary_package: number;
  building_code: BuildingCode | null;
  transport_allowance: number;
  fixed_bonus: number;
  status: EmployeeStatus;
  validationState: 'ready' | 'incomplete' | 'error';
  errors: string[];
  incompleteFields: string[];
};

export type ImportPreviewResult = {
  rows: ImportRow[];
  readyCount: number;
  incompleteCount: number;
  errorCount: number;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep hr-types
```
Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-types.ts
git commit -m "feat(hr): shared TypeScript types + enum constants"
```

---

## Task 3: Company ID Generator (TDD)

**Files:**
- Create: `src/lib/beithady/hr/hr-company-id.ts`
- Create: `src/lib/beithady/hr/hr-company-id.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/beithady/hr/hr-company-id.test.ts
import { describe, it, expect } from 'vitest';
import { formatCompanyId } from './hr-company-id';

describe('formatCompanyId', () => {
  it('formats 1 as BH-001', () => {
    expect(formatCompanyId(1)).toBe('BH-001');
  });
  it('formats 42 as BH-042', () => {
    expect(formatCompanyId(42)).toBe('BH-042');
  });
  it('formats 999 as BH-999', () => {
    expect(formatCompanyId(999)).toBe('BH-999');
  });
  it('throws for 0', () => {
    expect(() => formatCompanyId(0)).toThrow('out of range');
  });
  it('throws for 1000', () => {
    expect(() => formatCompanyId(1000)).toThrow('out of range');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- hr-company-id
```
Expected: `ReferenceError: formatCompanyId is not defined` or similar.

- [ ] **Step 3: Implement**

```typescript
// src/lib/beithady/hr/hr-company-id.ts

/**
 * Format a sequence number as a BH-NNN company ID.
 * Valid range: 1–999. Throws for out-of-range values.
 */
export function formatCompanyId(n: number): string {
  if (n < 1 || n > 999) {
    throw new Error(`Company ID sequence ${n} out of range 1–999`);
  }
  return `BH-${String(n).padStart(3, '0')}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- hr-company-id
```
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/hr/hr-company-id.ts src/lib/beithady/hr/hr-company-id.test.ts
git commit -m "feat(hr): BH-NNN company ID formatter + tests"
```

---

## Task 4: Egyptian NID Parser (TDD)

**Files:**
- Create: `src/lib/beithady/hr/hr-nid.ts`
- Create: `src/lib/beithady/hr/hr-nid.test.ts`

Egyptian National ID (14 digits):
- Digit 1: century (2 = 1900s, 3 = 2000s)
- Digits 2–3: YY (birth year last 2 digits)
- Digits 4–5: MM
- Digits 6–7: DD
- Digits 8–9: governorate code
- Digits 10–13: sequential (digit 13 = index 12: odd = male, even = female)
- Digit 14: check digit

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/beithady/hr/hr-nid.test.ts
import { describe, it, expect } from 'vitest';
import { parseEgyptianNid } from './hr-nid';

describe('parseEgyptianNid', () => {
  it('parses a 1990s male NID', () => {
    // century=2→1900, YY=90, MM=06, DD=15, govt=01, seq=0001(odd→male), check=4
    expect(parseEgyptianNid('29006150100014')).toEqual({
      dateOfBirth: '1990-06-15',
      gender: 'male',
    });
  });

  it('parses a 2005 female NID', () => {
    // century=3→2000, YY=05, MM=03, DD=22, govt=11, seq=0002(even→female), check=7
    expect(parseEgyptianNid('30503221100027')).toEqual({
      dateOfBirth: '2005-03-22',
      gender: 'female',
    });
  });

  it('returns null for fewer than 14 digits', () => {
    expect(parseEgyptianNid('1234567')).toBeNull();
  });

  it('returns null for non-digit characters', () => {
    expect(parseEgyptianNid('XXXXXXXXXXXXXX')).toBeNull();
  });

  it('returns null for invalid century digit', () => {
    // century digit = 1 is not valid (only 2 or 3)
    expect(parseEgyptianNid('19001010100011')).toBeNull();
  });

  it('returns null for invalid month', () => {
    // MM=13 is invalid
    expect(parseEgyptianNid('29013010100011')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseEgyptianNid('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- hr-nid
```
Expected: module not found error.

- [ ] **Step 3: Implement**

```typescript
// src/lib/beithady/hr/hr-nid.ts

export type NidParseResult = {
  dateOfBirth: string;  // ISO YYYY-MM-DD
  gender: 'male' | 'female';
};

/**
 * Parse an Egyptian National ID (14 digits) and extract date of birth + gender.
 * Returns null if the NID format is invalid.
 *
 * Format: C YY MM DD GG SSSS N
 *   C  = century (2=1900s, 3=2000s)
 *   YY = year within century
 *   MM = month (01-12)
 *   DD = day (01-31)
 *   GG = governorate (01-27)
 *   SSSS = sequence; index 12 (digit 13) parity = gender (odd=male, even=female)
 *   N  = check digit (index 13)
 */
export function parseEgyptianNid(nid: string): NidParseResult | null {
  if (!nid || !/^\d{14}$/.test(nid)) return null;

  const centuryDigit = parseInt(nid[0], 10);
  if (centuryDigit !== 2 && centuryDigit !== 3) return null;

  const century = centuryDigit === 2 ? 1900 : 2000;
  const yy = parseInt(nid.slice(1, 3), 10);
  const mm = parseInt(nid.slice(3, 5), 10);
  const dd = parseInt(nid.slice(5, 7), 10);

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const year = century + yy;
  const dateOfBirth = [
    String(year),
    String(mm).padStart(2, '0'),
    String(dd).padStart(2, '0'),
  ].join('-');

  // Digit at index 12 (13th digit) determines gender: odd = male
  const genderDigit = parseInt(nid[12], 10);
  const gender: 'male' | 'female' = genderDigit % 2 !== 0 ? 'male' : 'female';

  return { dateOfBirth, gender };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- hr-nid
```
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/hr/hr-nid.ts src/lib/beithady/hr/hr-nid.test.ts
git commit -m "feat(hr): Egyptian NID parser — DOB + gender extraction + tests"
```

---

## Task 5: Auth Update + Beithady Landing

**Files:**
- Modify: `src/lib/beithady/auth.ts`
- Modify: `src/app/beithady/page.tsx`

- [ ] **Step 1: Add `'hr'` to `BeithadyCategory` in auth.ts**

Find the `BeithadyCategory` type (around line 23) and add `| 'hr'`:

```typescript
export type BeithadyCategory =
  | 'financial'
  | 'analytics'
  | 'crm'
  | 'communication'
  | 'settings'
  | 'gallery'
  | 'ads'
  | 'operations'
  | 'inventory'
  | 'fnb'
  | 'hr';               // Sprint 1 — People module
```

- [ ] **Step 2: Add `hr` to the PERMISSIONS matrix**

In every role entry inside `const PERMISSIONS`, add `hr: Permission`. The full updated matrix:

```typescript
const PERMISSIONS: Record<BeithadyRole, Record<BeithadyCategory, Permission>> = {
  guest_relations:   { financial:'none', analytics:'read',  crm:'full',  communication:'full',  settings:'read',  gallery:'full',  ads:'none',  operations:'read',  inventory:'none',  fnb:'full',  hr:'none' },
  finance:           { financial:'full', analytics:'read',  crm:'read',  communication:'none',  settings:'read',  gallery:'read',  ads:'none',  operations:'read',  inventory:'read',  fnb:'read',  hr:'read' },
  ops:               { financial:'read', analytics:'full',  crm:'full',  communication:'full',  settings:'read',  gallery:'full',  ads:'none',  operations:'full',  inventory:'full',  fnb:'full',  hr:'read' },
  manager:           { financial:'full', analytics:'full',  crm:'full',  communication:'full',  settings:'read',  gallery:'full',  ads:'full',  operations:'full',  inventory:'full',  fnb:'full',  hr:'full' },
  admin:             { financial:'full', analytics:'full',  crm:'full',  communication:'full',  settings:'full',  gallery:'full',  ads:'full',  operations:'full',  inventory:'full',  fnb:'full',  hr:'full' },
  warehouse_manager: { financial:'none', analytics:'read',  crm:'read',  communication:'none',  settings:'read',  gallery:'none',  ads:'none',  operations:'read',  inventory:'full',  fnb:'none',  hr:'none' },
  housekeeper:       { financial:'none', analytics:'none',  crm:'none',  communication:'none',  settings:'none',  gallery:'none',  ads:'none',  operations:'none',  inventory:'read',  fnb:'none',  hr:'none' },
  business_analyst:  { financial:'none', analytics:'full',  crm:'read',  communication:'none',  settings:'read',  gallery:'none',  ads:'read',  operations:'read',  inventory:'read',  fnb:'read',  hr:'none' },
  fnb_manager:       { financial:'none', analytics:'read',  crm:'read',  communication:'none',  settings:'read',  gallery:'none',  ads:'none',  operations:'read',  inventory:'none',  fnb:'full',  hr:'none' },
};
```

- [ ] **Step 3: Add `'hr'` to `visibleCategoriesFor`**

Find `visibleCategoriesFor` (around line 222) and add `'hr'` to the `all` array:

```typescript
export function visibleCategoriesFor(roles: BeithadyRole[]): BeithadyCategory[] {
  const all: BeithadyCategory[] = [
    'financial', 'analytics', 'crm', 'communication', 'settings',
    'gallery', 'ads', 'operations', 'inventory', 'fnb', 'hr',
  ];
  return all.filter(c => rolesGrantPermission(roles, c, 'read'));
}
```

- [ ] **Step 4: Add 'hr' tile to `src/app/beithady/page.tsx`**

Add the import:
```typescript
import { Users2 } from 'lucide-react';
```

Add to `CATEGORY_TILES`:
```typescript
hr: {
  href: '/beithady/hr',
  title: 'People',
  description: 'Team roster · Payroll · Attendance · Compliance. FMPLUS-style workforce management for all Beithady staff.',
  icon: Users2,
  accent: 'violet',
  badge: { label: 'New', tone: 'gold' },
},
```

Add `'hr'` to `PHASE_PENDING`:
```typescript
const PHASE_PENDING: Record<BeithadyCategory, string | undefined> = {
  financial: undefined, analytics: undefined, crm: undefined,
  communication: undefined, settings: undefined, gallery: undefined,
  ads: undefined, operations: undefined, inventory: undefined,
  fnb: undefined, hr: undefined,
};
```

Add `'hr'` to the `order` array (after `'operations'`, before `'inventory'`):
```typescript
const order: BeithadyCategory[] = [
  'financial', 'analytics', 'crm', 'communication',
  'operations', 'hr', 'inventory', 'fnb', 'settings', 'gallery', 'ads',
];
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "auth|page"
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady/auth.ts src/app/beithady/page.tsx
git commit -m "feat(hr): add 'hr' BeithadyCategory + People tile on BH landing"
```

---

## Task 6: HR Hub Layout + Page

**Files:**
- Create: `src/app/beithady/hr/layout.tsx`
- Create: `src/app/beithady/hr/page.tsx`

- [ ] **Step 1: Create layout.tsx**

```typescript
// src/app/beithady/hr/layout.tsx
import { requireDomainAccess } from '@/lib/auth';

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  await requireDomainAccess('beithady');
  return <>{children}</>;
}
```

- [ ] **Step 2: Create page.tsx**

```typescript
// src/app/beithady/hr/page.tsx
import {
  Users, Banknote, ShieldCheck, CalendarCheck, Fingerprint,
  CalendarOff, BarChart3, FileCheck, Award, ClipboardList, Network,
} from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { BeithadyLauncher, type LauncherTile } from '../_components/beithady-launcher';

export const dynamic = 'force-dynamic';

export default async function BeithadyHrPage() {
  await requireBeithadyPermission('hr', 'read');

  const tiles: LauncherTile[] = [
    {
      href: '/beithady/hr/team',
      title: 'Team Members',
      description: 'Full employee roster — add, edit, import from Excel. FMPLUS-style 3-tab profile: Personal · Contract & Payout · Timeline.',
      icon: Users,
      accent: 'violet',
    },
    {
      href: '/beithady/hr/payroll',
      title: 'Monthly Payroll',
      description: 'Upload monthly Excel → parse → store → print payslips per employee or batch by building.',
      icon: Banknote,
      accent: 'emerald',
      disabled: true,
      comingSoonLabel: 'Sprint 2',
    },
    {
      href: '/beithady/hr/salary-access',
      title: 'Salary Access',
      description: 'Control who can see salary data — 5 tiers: No Access · ≤10K · ≤20K · ≤50K · Unlimited.',
      icon: ShieldCheck,
      accent: 'amber',
      disabled: true,
      comingSoonLabel: 'Sprint 3',
    },
    {
      href: '/beithady/hr/attendance',
      title: 'Daily Attendance',
      description: 'Roll call · manual check-in/out by supervisor. Feeds Monthly Payroll working-days column.',
      icon: CalendarCheck,
      accent: 'cyan',
      disabled: true,
      comingSoonLabel: 'Sprint 4',
    },
    {
      href: '/beithady/hr/biometric',
      title: 'Biometric Upload',
      description: 'Upload fingerprint device .xlsx → PM review → finalize. Replaces manual attendance entry.',
      icon: Fingerprint,
      accent: 'indigo',
      disabled: true,
      comingSoonLabel: 'Sprint 5',
    },
    {
      href: '/beithady/hr/leave-ot',
      title: 'Leave & Overtime',
      description: 'Leave requests · approval workflow · balances · overtime logging per employee.',
      icon: CalendarOff,
      accent: 'rose',
      disabled: true,
      comingSoonLabel: 'Sprint 6',
    },
    {
      href: '/beithady/hr/headcount',
      title: 'Headcount Report',
      description: 'Daily manpower by scope & role. Cross-references HC Estimator planned vs. actual.',
      icon: BarChart3,
      accent: 'slate',
      disabled: true,
      comingSoonLabel: 'Sprint 7',
    },
    {
      href: '/beithady/hr/documents',
      title: 'Documents & Compliance',
      description: 'Contract files · IDs · tax forms · visa/contract expiry alerts.',
      icon: FileCheck,
      accent: 'gold',
      disabled: true,
      comingSoonLabel: 'Sprint 8',
    },
    {
      href: '/beithady/hr/training',
      title: 'Training & Certifications',
      description: 'Training records · certifications · expiry tracking per employee.',
      icon: Award,
      accent: 'emerald',
      disabled: true,
      comingSoonLabel: 'Sprint 9',
    },
    {
      href: '/beithady/hr/onboarding',
      title: 'Onboarding Checklist',
      description: 'New hire checklist · task assignments · completion tracking.',
      icon: ClipboardList,
      accent: 'amber',
      disabled: true,
      comingSoonLabel: 'Sprint 10',
    },
    {
      href: '/beithady/hr/org-chart',
      title: 'Org Chart',
      description: 'Visual reporting structure across all buildings and Head Office.',
      icon: Network,
      accent: 'violet',
      disabled: true,
      comingSoonLabel: 'Sprint 11',
    },
  ];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'People', href: '/beithady/hr' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Beithady People"
        subtitle="Workforce management · Payroll · Attendance · Compliance"
      />
      <BeithadyLauncher tiles={tiles} columns={3} />
    </BeithadyShell>
  );
}
```

- [ ] **Step 3: Verify page renders**

```bash
npm run dev
```
Open http://localhost:3000/beithady/hr — should show "Beithady People" hub with 11 tiles (1 active, 10 dimmed "Sprint N").

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/hr/layout.tsx src/app/beithady/hr/page.tsx
git commit -m "feat(hr): hub page with 11-tile launcher — Team Members active, sprints 2-11 coming soon"
```

---

## Task 7: HR Queries (Server-Only)

**Files:**
- Create: `src/lib/beithady/hr/hr-queries.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/beithady/hr/hr-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { HrEmployeeRow, HrEmployee, HrContract, HrEvent } from './hr-types';

export type EmployeeFilters = {
  department?: string;
  building_code?: string;
  status?: string;
  search?: string;   // searches first_name, arabic_name, national_id, company_id
  page?: number;     // 1-based
  pageSize?: number;
};

/**
 * List employees with current contract joined.
 * Returns paginated rows + total count.
 */
export async function listEmployees(filters: EmployeeFilters = {}): Promise<{
  rows: HrEmployeeRow[];
  total: number;
}> {
  const sb = supabaseAdmin();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = sb
    .from('hr_employees')
    .select('*, hr_employee_contracts!hr_employee_contracts_employee_id_fkey(*)', {
      count: 'exact',
    })
    .order('first_name', { ascending: true })
    .range(from, to);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.department) query = query.eq('department', filters.department);
  if (filters.search) {
    const s = `%${filters.search}%`;
    query = query.or(
      `first_name.ilike.${s},arabic_name.ilike.${s},national_id.ilike.${s},company_id.ilike.${s}`
    );
  }
  if (filters.building_code) {
    // building lives on contracts; we filter post-fetch for simplicity (small dataset)
    // For large datasets, use a view or RPC
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows: HrEmployeeRow[] = (data ?? []).map((emp: HrEmployee & { hr_employee_contracts: HrContract[] }) => {
    const allContracts: HrContract[] = emp.hr_employee_contracts ?? [];
    const current = allContracts.find(c => c.effective_to === null) ?? null;
    const history = allContracts.filter(c => c.effective_to !== null)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

    // Post-filter by building_code if requested
    if (filters.building_code && current?.building_code !== filters.building_code) {
      return null;
    }

    const { hr_employee_contracts: _, ...employee } = emp as HrEmployee & { hr_employee_contracts: HrContract[] };
    return { ...employee, current_contract: current, contract_history: history };
  }).filter((r): r is HrEmployeeRow => r !== null);

  return { rows, total: count ?? 0 };
}

/**
 * Fetch a single employee with full contract history and timeline events.
 */
export async function getEmployee(id: string): Promise<HrEmployeeRow | null> {
  const sb = supabaseAdmin();
  const { data: emp, error } = await sb
    .from('hr_employees')
    .select('*, hr_employee_contracts!hr_employee_contracts_employee_id_fkey(*)')
    .eq('id', id)
    .single();

  if (error || !emp) return null;

  const allContracts: HrContract[] = (emp as HrEmployee & { hr_employee_contracts: HrContract[] }).hr_employee_contracts ?? [];
  const current = allContracts.find(c => c.effective_to === null) ?? null;
  const history = allContracts
    .filter(c => c.effective_to !== null)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  const { hr_employee_contracts: _, ...employee } = emp as HrEmployee & { hr_employee_contracts: HrContract[] };
  return { ...employee, current_contract: current, contract_history: history };
}

/**
 * Fetch timeline events for an employee, newest first.
 */
export async function getEmployeeEvents(employeeId: string): Promise<HrEvent[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_employee_events')
    .select('*')
    .eq('employee_id', employeeId)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as HrEvent[];
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep hr-queries
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-queries.ts
git commit -m "feat(hr): server-only query layer — list/get employee + events"
```

---

## Task 8: HR Server Actions (Add / Edit / Terminate)

**Files:**
- Create: `src/lib/beithady/hr/hr-actions.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/beithady/hr/hr-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import type { PersonalInfoInput, ContractInput, Department, JobRole, BuildingCode, ContractType, PaymentMethod, EmployeeStatus } from './hr-types';

type ActionResult = { id?: string; error?: string };

// ── Guards ────────────────────────────────────────────────────────────────

async function requireHrAccess() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  // App admins always have access; role-based HR access checked by the page gate.
  return user;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) || n < 0 ? 0 : n;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function generateCompanyId(): Promise<string> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('generate_hr_company_id');
  if (error) throw new Error(error.message);
  return data as string;
}

async function logEvent(
  employeeId: string,
  eventType: string,
  description: string,
  createdBy: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('hr_employee_events').insert({
    employee_id: employeeId,
    event_type: eventType,
    event_date: today(),
    description,
    metadata: metadata ?? null,
    created_by: createdBy,
  });
}

// ── addEmployee ───────────────────────────────────────────────────────────

export async function addEmployeeAction(
  personal: PersonalInfoInput,
  contract: ContractInput
): Promise<ActionResult> {
  try {
    const user = await requireHrAccess();
    const sb = supabaseAdmin();
    const companyId = await generateCompanyId();

    // Determine incomplete fields
    const incompleteFields: string[] = [];
    if (!personal.national_id) incompleteFields.push('national_id');
    if (!personal.phone)       incompleteFields.push('phone');
    if (!personal.date_of_birth) incompleteFields.push('date_of_birth');
    if (!personal.date_joined) incompleteFields.push('date_joined');

    const { data: emp, error: empErr } = await sb
      .from('hr_employees')
      .insert({
        company_id:         companyId,
        first_name:         personal.first_name.trim(),
        last_name:          personal.last_name.trim() || null,
        arabic_name:        personal.arabic_name.trim() || null,
        national_id:        personal.national_id.trim() || null,
        date_of_birth:      personal.date_of_birth || null,
        gender:             personal.gender || null,
        department:         personal.department as Department,
        position:           personal.position.trim(),
        job_role:           personal.job_role as JobRole,
        status:             personal.status as EmployeeStatus,
        date_joined:        personal.date_joined || null,
        date_terminated:    personal.status === 'terminated' ? (personal.date_terminated || null) : null,
        termination_reason: personal.status === 'terminated' ? (personal.termination_reason || null) : null,
        phone:              personal.phone.trim() || null,
        email:              personal.email.trim() || null,
        portrait_url:       personal.portrait_url || null,
        incomplete_fields:  incompleteFields,
        created_by:         user.id,
      })
      .select('id')
      .single();

    if (empErr) return { error: empErr.message };

    const employeeId = emp.id as string;
    const contractStart = contract.contract_start || today();

    const { error: conErr } = await sb.from('hr_employee_contracts').insert({
      employee_id:         employeeId,
      contract_type:       contract.contract_type as ContractType,
      contract_start:      contractStart,
      contract_end:        contract.contract_type === 'fixed_term' ? (contract.contract_end || null) : null,
      building_code:       contract.building_code as BuildingCode,
      salary_package:      parseNum(contract.salary_package),
      transport_allowance: parseNum(contract.transport_allowance),
      travel_allowance:    parseNum(contract.travel_allowance),
      fixed_bonus:         parseNum(contract.fixed_bonus),
      bank_name:           contract.bank_name.trim() || null,
      bank_account:        contract.bank_account.trim() || null,
      bank_iban:           contract.bank_iban.trim() || null,
      payment_method:      contract.payment_method as PaymentMethod,
      effective_from:      contractStart,
      effective_to:        null,
      created_by:          user.id,
    });

    if (conErr) return { error: conErr.message };

    await logEvent(
      employeeId,
      'hired',
      `Joined as ${personal.position} at ${contract.building_code}`,
      user.id
    );

    revalidatePath('/beithady/hr/team');
    return { id: employeeId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── editEmployee ──────────────────────────────────────────────────────────

export async function editEmployeeAction(
  id: string,
  personal: PersonalInfoInput,
  contract: ContractInput,
  previousContract: { salary_package: number; building_code: string } | null
): Promise<ActionResult> {
  try {
    const user = await requireHrAccess();
    const sb = supabaseAdmin();

    const incompleteFields: string[] = [];
    if (!personal.national_id) incompleteFields.push('national_id');
    if (!personal.phone)       incompleteFields.push('phone');
    if (!personal.date_of_birth) incompleteFields.push('date_of_birth');
    if (!personal.date_joined) incompleteFields.push('date_joined');

    const { error: empErr } = await sb
      .from('hr_employees')
      .update({
        first_name:         personal.first_name.trim(),
        last_name:          personal.last_name.trim() || null,
        arabic_name:        personal.arabic_name.trim() || null,
        national_id:        personal.national_id.trim() || null,
        date_of_birth:      personal.date_of_birth || null,
        gender:             personal.gender || null,
        department:         personal.department as Department,
        position:           personal.position.trim(),
        job_role:           personal.job_role as JobRole,
        status:             personal.status as EmployeeStatus,
        date_joined:        personal.date_joined || null,
        date_terminated:    personal.status === 'terminated' ? (personal.date_terminated || null) : null,
        termination_reason: personal.status === 'terminated' ? (personal.termination_reason || null) : null,
        phone:              personal.phone.trim() || null,
        email:              personal.email.trim() || null,
        portrait_url:       personal.portrait_url || null,
        incomplete_fields:  incompleteFields,
        updated_at:         new Date().toISOString(),
      })
      .eq('id', id);

    if (empErr) return { error: empErr.message };

    const newSalary = parseNum(contract.salary_package);
    const salaryChanged = previousContract && previousContract.salary_package !== newSalary;
    const buildingChanged = previousContract && previousContract.building_code !== contract.building_code;

    if (salaryChanged || buildingChanged) {
      // Close old contract
      await sb
        .from('hr_employee_contracts')
        .update({ effective_to: today() })
        .eq('employee_id', id)
        .is('effective_to', null);

      // Insert new contract version
      const contractStart = contract.contract_start || today();
      await sb.from('hr_employee_contracts').insert({
        employee_id:         id,
        contract_type:       contract.contract_type as ContractType,
        contract_start:      contractStart,
        contract_end:        contract.contract_type === 'fixed_term' ? (contract.contract_end || null) : null,
        building_code:       contract.building_code as BuildingCode,
        salary_package:      newSalary,
        transport_allowance: parseNum(contract.transport_allowance),
        travel_allowance:    parseNum(contract.travel_allowance),
        fixed_bonus:         parseNum(contract.fixed_bonus),
        bank_name:           contract.bank_name.trim() || null,
        bank_account:        contract.bank_account.trim() || null,
        bank_iban:           contract.bank_iban.trim() || null,
        payment_method:      contract.payment_method as PaymentMethod,
        effective_from:      today(),
        effective_to:        null,
        created_by:          user.id,
      });

      if (salaryChanged && previousContract) {
        await logEvent(id, 'salary_change',
          `Salary updated from EGP ${previousContract.salary_package.toLocaleString()} to EGP ${newSalary.toLocaleString()}`,
          user.id,
          { old: previousContract.salary_package, new: newSalary }
        );
      }
      if (buildingChanged && previousContract) {
        await logEvent(id, 'building_transfer',
          `Transferred from ${previousContract.building_code} to ${contract.building_code}`,
          user.id,
          { old: previousContract.building_code, new: contract.building_code }
        );
      }
    } else {
      // No salary/building change — just update non-key contract fields
      await sb
        .from('hr_employee_contracts')
        .update({
          contract_type:       contract.contract_type as ContractType,
          contract_end:        contract.contract_type === 'fixed_term' ? (contract.contract_end || null) : null,
          transport_allowance: parseNum(contract.transport_allowance),
          travel_allowance:    parseNum(contract.travel_allowance),
          fixed_bonus:         parseNum(contract.fixed_bonus),
          bank_name:           contract.bank_name.trim() || null,
          bank_account:        contract.bank_account.trim() || null,
          bank_iban:           contract.bank_iban.trim() || null,
          payment_method:      contract.payment_method as PaymentMethod,
        })
        .eq('employee_id', id)
        .is('effective_to', null);
    }

    revalidatePath('/beithady/hr/team');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── terminateEmployee ─────────────────────────────────────────────────────

export async function terminateEmployeeAction(
  id: string,
  dateTerminated: string,
  reason: string
): Promise<ActionResult> {
  try {
    const user = await requireHrAccess();
    const sb = supabaseAdmin();

    const { error } = await sb
      .from('hr_employees')
      .update({
        status:             'terminated',
        date_terminated:    dateTerminated || today(),
        termination_reason: reason.trim() || null,
        updated_at:         new Date().toISOString(),
      })
      .eq('id', id);

    if (error) return { error: error.message };

    await logEvent(
      id,
      'terminated',
      `Employment terminated${reason ? ': ' + reason : ''}`,
      user.id,
      { date: dateTerminated, reason }
    );

    revalidatePath('/beithady/hr/team');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep hr-actions
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-actions.ts
git commit -m "feat(hr): server actions — add / edit / terminate employee"
```

---

## Task 9: Photo Upload API Route

**Files:**
- Create: `src/app/api/hr/upload-photo/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/hr/upload-photo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (file.size > 100 * 1024) {
    return NextResponse.json({ error: 'File too large (max 100 KB)' }, { status: 400 });
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, or WebP allowed' }, { status: 400 });
  }

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const sb = supabaseAdmin();

  const { error } = await sb.storage
    .from('hr-photos')
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = sb.storage.from('hr-photos').getPublicUrl(path);

  return NextResponse.json({ url: urlData.publicUrl, path });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep upload-photo
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/hr/upload-photo/route.ts
git commit -m "feat(hr): photo upload API route → Supabase Storage hr-photos bucket"
```

---

## Part 1 Complete

All foundation layers are in place:

| ✅ | What's done |
|---|---|
| DB | 4 tables + BH-NNN sequence applied to production |
| Types | All TS types and enums in `hr-types.ts` |
| Pure fns | `formatCompanyId` + `parseEgyptianNid` — tested, green |
| Auth | `'hr'` category wired into permission matrix |
| Landing | "People" tile visible on `/beithady` for admin/manager/ops/finance |
| Hub | `/beithady/hr` renders 11-tile launcher |
| Queries | `listEmployees` / `getEmployee` / `getEmployeeEvents` |
| Actions | `addEmployeeAction` / `editEmployeeAction` / `terminateEmployeeAction` |
| Upload | `POST /api/hr/upload-photo` → Supabase Storage |

**Next:** Run `2026-05-14-beithady-hr-team-members-part2.md` for the UI components.
