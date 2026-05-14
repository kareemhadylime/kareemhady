# Beithady HR Sprint 9: Training & Certifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/beithady/hr/training` — employee training records and certification tracking, with expiry alerts, signed-URL file uploads, extension of the existing documents cron, and a Training tab on the employee profile drawer.

**Architecture:** One new DB table (`hr_training_records`) + private `hr-training` storage bucket, following the identical pattern as Sprint 8. Expiry helpers (`daysUntilExpiry`, `getExpiryStatus`, `EXPIRY_STATUS_COLORS`) are **imported from `hr-documents-types.ts`** — no duplication. The existing `hr-documents-expiry` cron is extended with a parallel training query and an appended digest section. All file uploads use signed URLs (client-side PUT to Supabase Storage).

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind v4 · Supabase (supabaseAdmin + Storage) · Vitest · Green-API WhatsApp

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0133_hr_training.sql` | Create | hr_training_records table + hr-training bucket |
| `src/lib/beithady/hr/hr-training-types.ts` | Create | RecordType, HrTrainingRecord, inputs, formatTrainingDateRange |
| `src/lib/beithady/hr/hr-training-types.test.ts` | Create | TDD tests for formatTrainingDateRange |
| `src/lib/beithady/hr/hr-training-queries.ts` | Create | server-only: getExpiringTrainingRecords, getAllEmployeeTrainingSummary, getEmployeeTrainingRecords |
| `src/lib/beithady/hr/hr-training-actions.ts` | Create | 5 server actions |
| `src/app/api/hr/training/upload-url/route.ts` | Create | GET → signed upload URL for hr-training bucket |
| `src/app/api/hr/training/by-employee/route.ts` | Create | GET → records for one employee (team drawer) |
| `src/app/api/cron/hr-documents-expiry/route.ts` | Modify | Extend to include training/cert expiry in digest |
| `src/app/beithady/hr/training/_components/training-expiry-banner.tsx` | Create | Section 1 expiry banner |
| `src/app/beithady/hr/training/_components/add-training-dialog.tsx` | Create | Add/Edit modal |
| `src/app/beithady/hr/training/_components/employee-training-list.tsx` | Create | Expandable employee list ('use client') |
| `src/app/beithady/hr/training/page.tsx` | Create | Server page, auth-gated |
| `src/app/beithady/hr/team/_components/training-tab.tsx` | Create | Training tab for employee profile drawer |
| `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx` | Modify | Add 'training' tab |
| `src/app/beithady/hr/page.tsx` | Modify | Remove disabled + comingSoonLabel from Sprint 9 tile |

---

## Task 1: DB Migration + Storage Bucket

**Files:**
- Create: `supabase/migrations/0133_hr_training.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0133_hr_training.sql
-- Beithady HR Sprint 9 — Training & Certifications

create table public.hr_training_records (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.hr_employees(id) on delete cascade,
  record_type  text not null check (record_type in ('training', 'certification')),
  title        text not null,
  date         date,
  expiry_date  date,
  file_path    text,
  file_name    text,
  notes        text,
  created_by   uuid references public.app_users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_hr_training_employee on public.hr_training_records(employee_id);
create index idx_hr_training_expiry   on public.hr_training_records(expiry_date) where expiry_date is not null;
create index idx_hr_training_type     on public.hr_training_records(record_type);

-- Private storage bucket for training files
insert into storage.buckets (id, name, public)
values ('hr-training', 'hr-training', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply to Supabase**

Paste into Supabase dashboard SQL Editor for project `bpjproljatbrbmszwbov` and run. Verify no errors and that `hr_training_records` appears in Tables and `hr-training` appears in Storage → Buckets.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0133_hr_training.sql
git commit -m "feat(hr): migration 0133 — hr_training_records table + hr-training storage bucket"
```

---

## Task 2: Types + TDD

**Files:**
- Create: `src/lib/beithady/hr/hr-training-types.ts`
- Create: `src/lib/beithady/hr/hr-training-types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/beithady/hr/hr-training-types.test.ts
import { describe, it, expect } from 'vitest';
import { formatTrainingDateRange } from './hr-training-types';

describe('formatTrainingDateRange', () => {
  it('returns — when both dates are null', () => {
    expect(formatTrainingDateRange(null, null)).toBe('—');
  });
  it('returns completed date when only date is set', () => {
    expect(formatTrainingDateRange('2026-03-01', null)).toBe('Completed 2026-03-01');
  });
  it('returns expires date when only expiry is set', () => {
    expect(formatTrainingDateRange(null, '2027-06-30')).toBe('Expires 2027-06-30');
  });
  it('returns range when both are set', () => {
    expect(formatTrainingDateRange('2026-03-01', '2027-03-01')).toBe('2026-03-01 → 2027-03-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run hr-training-types
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the types + implementation**

```typescript
// src/lib/beithady/hr/hr-training-types.ts
// Pure types + helpers for training records and certifications.
// Expiry helpers (daysUntilExpiry, getExpiryStatus, EXPIRY_STATUS_COLORS)
// are intentionally NOT duplicated here — import from hr-documents-types.ts.

export type RecordType = 'training' | 'certification';

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  training:      'Training',
  certification: 'Certification',
};

export const RECORD_TYPE_ICONS: Record<RecordType, string> = {
  training:      '🎓',
  certification: '🏅',
};

export const RECORD_TYPES: RecordType[] = ['training', 'certification'];

// ── DB row ────────────────────────────────────────────────────────────────────

export type HrTrainingRecord = {
  id: string;
  employee_id: string;
  record_type: RecordType;
  title: string;
  date: string | null;         // YYYY-MM-DD — completion / issue date
  expiry_date: string | null;  // YYYY-MM-DD — null = no expiry
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// Joined with employee fields (for list page + cron)
export type HrTrainingRecordRow = HrTrainingRecord & {
  employee_name: string;
  company_id: string;
  employee_phone: string | null;
};

// Per-employee summary for the expandable list
export type EmployeeTrainingSummary = {
  employee_id: string;
  employee_name: string;
  company_id: string;
  building_code: string | null;
  records: HrTrainingRecord[];
};

// ── Form inputs ───────────────────────────────────────────────────────────────

export type AddTrainingInput = {
  employee_id: string;
  record_type: RecordType;
  title: string;
  date: string;         // YYYY-MM-DD or ''
  expiry_date: string;  // YYYY-MM-DD or '' (empty = no expiry)
  notes: string;
};

export type UpdateTrainingInput = {
  record_type?: RecordType;
  title?: string;
  date?: string;
  expiry_date?: string;
  notes?: string;
};

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable date summary for a training record.
 */
export function formatTrainingDateRange(
  date: string | null,
  expiryDate: string | null
): string {
  if (!date && !expiryDate) return '—';
  if (date && !expiryDate)  return `Completed ${date}`;
  if (!date && expiryDate)  return `Expires ${expiryDate}`;
  return `${date} → ${expiryDate}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- --run hr-training-types
```

Expected: 4/4 PASS.

- [ ] **Step 5: Run full suite**

```
npm test -- --run
```

Expected: all tests pass (≥527).

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady/hr/hr-training-types.ts \
        src/lib/beithady/hr/hr-training-types.test.ts
git commit -m "feat(hr): training types + formatTrainingDateRange helper — TDD"
```

---

## Task 3: Server-Only Queries

**Files:**
- Create: `src/lib/beithady/hr/hr-training-queries.ts`

- [ ] **Step 1: Write the queries file**

```typescript
// src/lib/beithady/hr/hr-training-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  HrTrainingRecord, HrTrainingRecordRow, EmployeeTrainingSummary,
} from './hr-training-types';

type EmpRow = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  building_code: string | null;
  phone: string | null;
};

// ── Expiring records (for banner + cron) ──────────────────────────────────────

export async function getExpiringTrainingRecords(
  withinDays: number
): Promise<HrTrainingRecordRow[]> {
  const sb = supabaseAdmin();
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  const limitDate = limit.toISOString().slice(0, 10);

  type RawRow = HrTrainingRecord & {
    hr_employees: {
      company_id: string;
      first_name: string;
      last_name: string | null;
      phone: string | null;
    } | null;
  };

  const { data, error } = await sb
    .from('hr_training_records')
    .select('*, hr_employees(company_id, first_name, last_name, phone)')
    .lte('expiry_date', limitDate)
    .order('expiry_date', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawRow[]).map(r => ({
    ...r,
    employee_name: r.hr_employees
      ? `${r.hr_employees.first_name} ${r.hr_employees.last_name ?? ''}`.trim()
      : '—',
    company_id:     r.hr_employees?.company_id ?? '—',
    employee_phone: r.hr_employees?.phone ?? null,
  }));
}

// ── All active employees + their records (for the list page) ──────────────────

export async function getAllEmployeeTrainingSummary(): Promise<EmployeeTrainingSummary[]> {
  const sb = supabaseAdmin();

  const { data: emps, error: eErr } = await sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name, building_code, phone')
    .neq('status', 'terminated')
    .order('first_name');
  if (eErr) throw new Error(eErr.message);

  const { data: recs, error: rErr } = await sb
    .from('hr_training_records')
    .select('*')
    .order('created_at', { ascending: false });
  if (rErr) throw new Error(rErr.message);

  const recsByEmp = new Map<string, HrTrainingRecord[]>();
  for (const r of (recs ?? []) as HrTrainingRecord[]) {
    const arr = recsByEmp.get(r.employee_id) ?? [];
    arr.push(r);
    recsByEmp.set(r.employee_id, arr);
  }

  return ((emps ?? []) as EmpRow[]).map(e => ({
    employee_id:   e.id,
    employee_name: `${e.first_name} ${e.last_name ?? ''}`.trim(),
    company_id:    e.company_id,
    building_code: e.building_code,
    records:       recsByEmp.get(e.id) ?? [],
  }));
}

// ── Records for one employee (team drawer tab) ────────────────────────────────

export async function getEmployeeTrainingRecords(
  employeeId: string
): Promise<HrTrainingRecord[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_training_records')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as HrTrainingRecord[];
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass (≥527).

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-training-queries.ts
git commit -m "feat(hr): training server-only queries — getExpiringTrainingRecords, getAllEmployeeTrainingSummary, getEmployeeTrainingRecords"
```

---

## Task 4: Server Actions

**Files:**
- Create: `src/lib/beithady/hr/hr-training-actions.ts`

- [ ] **Step 1: Write the actions file**

```typescript
// src/lib/beithady/hr/hr-training-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import type { AddTrainingInput, UpdateTrainingInput } from './hr-training-types';

const REVALIDATE = '/beithady/hr/training';
const BUCKET     = 'hr-training';

// ── addTrainingRecordAction ───────────────────────────────────────────────────

export async function addTrainingRecordAction(
  input: AddTrainingInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (!input.employee_id)    return { ok: false, error: 'Employee is required' };
    if (!input.title.trim())   return { ok: false, error: 'Title is required' };

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('hr_training_records')
      .insert({
        employee_id: input.employee_id,
        record_type: input.record_type,
        title:       input.title.trim(),
        date:        input.date        || null,
        expiry_date: input.expiry_date || null,
        notes:       input.notes       || null,
        created_by:  user.id,
        updated_at:  new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── updateTrainingRecordAction ────────────────────────────────────────────────

export async function updateTrainingRecordAction(
  recordId: string,
  input: UpdateTrainingInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');

    const sb = supabaseAdmin();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.record_type !== undefined) update.record_type = input.record_type;
    if (input.title       !== undefined) update.title       = input.title.trim();
    if (input.date        !== undefined) update.date        = input.date || null;
    if (input.expiry_date !== undefined) update.expiry_date = input.expiry_date || null;
    if (input.notes       !== undefined) update.notes       = input.notes || null;

    const { error } = await sb
      .from('hr_training_records')
      .update(update)
      .eq('id', recordId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── deleteTrainingRecordAction ────────────────────────────────────────────────

export async function deleteTrainingRecordAction(
  recordId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    const { data: rec } = await sb
      .from('hr_training_records')
      .select('file_path')
      .eq('id', recordId)
      .single();

    if (rec?.file_path) {
      await sb.storage.from(BUCKET).remove([(rec as { file_path: string }).file_path]);
    }

    const { error } = await sb
      .from('hr_training_records')
      .delete()
      .eq('id', recordId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── setTrainingRecordFileAction ───────────────────────────────────────────────

export async function setTrainingRecordFileAction(
  recordId: string,
  filePath: string,
  fileName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_training_records')
      .update({ file_path: filePath, file_name: fileName, updated_at: new Date().toISOString() })
      .eq('id', recordId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── getTrainingRecordDownloadUrl ──────────────────────────────────────────────

export async function getTrainingRecordDownloadUrl(
  recordId: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const sb = supabaseAdmin();
    const { data: rec } = await sb
      .from('hr_training_records')
      .select('file_path')
      .eq('id', recordId)
      .single();

    if (!(rec as { file_path: string | null } | null)?.file_path) {
      return { ok: false, error: 'No file attached' };
    }

    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl((rec as { file_path: string }).file_path, 60);
    if (error || !data) return { ok: false, error: 'Storage error' };

    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass (≥527).

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-training-actions.ts
git commit -m "feat(hr): training server actions — add, update, delete, setFile, getDownloadUrl"
```

---

## Task 5: Upload URL + By-Employee API Routes

**Files:**
- Create: `src/app/api/hr/training/upload-url/route.ts`
- Create: `src/app/api/hr/training/by-employee/route.ts`

- [ ] **Step 1: Write the upload-url route**

```typescript
// src/app/api/hr/training/upload-url/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const BUCKET = 'hr-training';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const recordId = searchParams.get('record_id');
  const filename = searchParams.get('filename');
  if (!recordId || !filename) {
    return NextResponse.json({ error: 'record_id and filename are required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: rec, error: rErr } = await sb
    .from('hr_training_records')
    .select('employee_id')
    .eq('id', recordId)
    .single();
  if (rErr || !rec) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._\-()]/g, '_');
  const filePath = `${(rec as { employee_id: string }).employee_id}/${recordId}/${safeName}`;

  const { data, error: sErr } = await sb.storage.from(BUCKET).createSignedUploadUrl(filePath);
  if (sErr || !data) {
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, filePath, token: data.token });
}
```

- [ ] **Step 2: Write the by-employee route**

```typescript
// src/app/api/hr/training/by-employee/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getEmployeeTrainingRecords } from '@/lib/beithady/hr/hr-training-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const employee_id = request.nextUrl.searchParams.get('employee_id');
  if (!employee_id) return NextResponse.json({ error: 'employee_id required' }, { status: 400 });

  const records = await getEmployeeTrainingRecords(employee_id);
  return NextResponse.json({ records });
}
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass (≥527).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/hr/training/upload-url/route.ts \
        src/app/api/hr/training/by-employee/route.ts
git commit -m "feat(hr): training API routes — signed upload URL + by-employee records"
```

---

## Task 6: Extend hr-documents-expiry Cron

**Files:**
- Modify: `src/app/api/cron/hr-documents-expiry/route.ts`

- [ ] **Step 1: Read the current cron file**

Read `src/app/api/cron/hr-documents-expiry/route.ts` to confirm its current state matches what's expected (it currently has only document expiry logic, no training).

- [ ] **Step 2: Write the updated cron file**

Replace the entire file with this extended version that handles both documents and training records:

```typescript
// src/app/api/cron/hr-documents-expiry/route.ts
// Daily 9 AM Cairo — HR digest of expiring documents AND training/certs + individual reminders.
// DST-safe: vercel.json registers UTC 06:00 + 07:00; handler gates on Cairo hour == 9.

import { NextRequest, NextResponse } from 'next/server';
import { getExpiringDocuments } from '@/lib/beithady/hr/hr-documents-queries';
import { getExpiringTrainingRecords } from '@/lib/beithady/hr/hr-training-queries';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { DOC_TYPE_LABELS, daysUntilExpiry } from '@/lib/beithady/hr/hr-documents-types';
import { RECORD_TYPE_LABELS, RECORD_TYPE_ICONS } from '@/lib/beithady/hr/hr-training-types';
import type { DocType } from '@/lib/beithady/hr/hr-documents-types';
import type { RecordType } from '@/lib/beithady/hr/hr-training-types';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

function cairoHour(): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    hour12: false,
  });
  return Number(f.format(new Date()));
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get('force') === '1';
  const hour  = cairoHour();
  if (!force && hour !== 9) {
    return NextResponse.json({ ok: true, skipped: 'not_cairo_9am', cairo_hour: hour });
  }

  try {
    // Fetch both document and training expiry data in parallel
    const [expiringDocs, expiringTraining] = await Promise.all([
      getExpiringDocuments(30),
      getExpiringTrainingRecords(30),
    ]);

    let digestSent    = 0;
    let remindersSent = 0;

    const hasAnything = expiringDocs.length > 0 || expiringTraining.length > 0;

    // ── HR digest ────────────────────────────────────────────────────────────
    if (hasAnything) {
      let msg = '';

      // Documents section
      if (expiringDocs.length > 0) {
        const critical = expiringDocs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n <= 7; });
        const warning  = expiringDocs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n > 7 && n <= 30; });

        msg += '📋 *HR Documents Expiry Alert*\n\n';
        if (critical.length > 0) {
          msg += '🔴 *Critical (≤7 days):*\n';
          for (const d of critical) {
            const days = daysUntilExpiry(d.expiry_date);
            const label = days !== null && days < 0 ? `expired ${Math.abs(days)}d ago` : `expires in ${days}d`;
            msg += `• ${d.employee_name} — ${DOC_TYPE_LABELS[d.doc_type as DocType]} — ${label}\n`;
          }
          msg += '\n';
        }
        if (warning.length > 0) {
          msg += '🟡 *Upcoming (8–30 days):*\n';
          for (const d of warning) {
            msg += `• ${d.employee_name} — ${DOC_TYPE_LABELS[d.doc_type as DocType]} — expires ${d.expiry_date}\n`;
          }
          msg += '\n';
        }
      }

      // Training & certifications section
      if (expiringTraining.length > 0) {
        const critical = expiringTraining.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n <= 7; });
        const warning  = expiringTraining.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n > 7 && n <= 30; });

        msg += '📚 *Training & Certifications Expiry*\n\n';
        if (critical.length > 0) {
          msg += '🔴 *Critical (≤7 days):*\n';
          for (const r of critical) {
            const days = daysUntilExpiry(r.expiry_date);
            const label = days !== null && days < 0 ? `expired ${Math.abs(days)}d ago` : `expires in ${days}d`;
            const icon = RECORD_TYPE_ICONS[r.record_type as RecordType];
            msg += `• ${r.employee_name} — ${icon} ${RECORD_TYPE_LABELS[r.record_type as RecordType]}: ${r.title} — ${label}\n`;
          }
          msg += '\n';
        }
        if (warning.length > 0) {
          msg += '🟡 *Upcoming (8–30 days):*\n';
          for (const r of warning) {
            const icon = RECORD_TYPE_ICONS[r.record_type as RecordType];
            msg += `• ${r.employee_name} — ${icon} ${r.title} — expires ${r.expiry_date}\n`;
          }
        }
      }

      if (msg.trim()) {
        const hrPhones = (process.env.BEITHADY_OPS_ALERT_PHONES || '')
          .split(',')
          .map(p => p.trim().replace(/^\+/, ''))
          .filter(Boolean);

        for (const phone of hrPhones) {
          try {
            await sendWhatsApp({ to: phone, message: msg.trim() });
            digestSent++;
          } catch {
            // Log but don't fail
          }
        }
      }
    }

    // ── Individual reminders — documents ─────────────────────────────────────
    for (const d of expiringDocs) {
      if (!d.employee_phone) continue;
      const days = daysUntilExpiry(d.expiry_date);
      if (days === null) continue;
      if (!((days >= 25 && days <= 30) || (days >= 0 && days <= 7))) continue;

      const phone = d.employee_phone.replace(/^\+/, '');
      const message = `Hi ${d.employee_name}, your ${DOC_TYPE_LABELS[d.doc_type as DocType]} expires on ${d.expiry_date}. Please renew it and upload the updated document to the HR system.`;
      try { await sendWhatsApp({ to: phone, message }); remindersSent++; } catch { /* continue */ }
    }

    // ── Individual reminders — training / certifications ──────────────────────
    for (const r of expiringTraining) {
      if (!r.employee_phone) continue;
      const days = daysUntilExpiry(r.expiry_date);
      if (days === null) continue;
      if (!((days >= 25 && days <= 30) || (days >= 0 && days <= 7))) continue;

      const phone = r.employee_phone.replace(/^\+/, '');
      const icon  = RECORD_TYPE_ICONS[r.record_type as RecordType];
      const message = `Hi ${r.employee_name}, your ${icon} ${r.title} expires on ${r.expiry_date}. Please renew it and update the record in the HR system.`;
      try { await sendWhatsApp({ to: phone, message }); remindersSent++; } catch { /* continue */ }
    }

    return NextResponse.json({
      ok: true,
      expiringDocs: expiringDocs.length,
      expiringTraining: expiringTraining.length,
      digestSent,
      remindersSent,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass (≥527).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/hr-documents-expiry/route.ts
git commit -m "feat(hr): extend hr-documents-expiry cron to include training/cert expiry alerts"
```

---

## Task 7: TrainingExpiryBanner Component

**Files:**
- Create: `src/app/beithady/hr/training/_components/training-expiry-banner.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/training/_components/training-expiry-banner.tsx
import { daysUntilExpiry } from '@/lib/beithady/hr/hr-documents-types';
import { RECORD_TYPE_LABELS, RECORD_TYPE_ICONS } from '@/lib/beithady/hr/hr-training-types';
import type { HrTrainingRecordRow, RecordType } from '@/lib/beithady/hr/hr-training-types';

type Props = { records: HrTrainingRecordRow[] };  // records expiring within 60 days

export function TrainingExpiryBanner({ records }: Props) {
  if (records.length === 0) return null;

  const critical = records.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n <= 7; });
  const warning  = records.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n > 7 && n <= 30; });
  const upcoming = records.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n > 30 && n <= 60; });

  function RecordRow({ r }: { r: HrTrainingRecordRow }) {
    const days = daysUntilExpiry(r.expiry_date);
    const label = days === null ? '' : days < 0 ? `expired ${Math.abs(days)}d ago` : days === 0 ? 'expires today' : `expires in ${days}d`;
    const icon = RECORD_TYPE_ICONS[r.record_type as RecordType];
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-white">{r.employee_name}</span>
        <span className="text-white/50">·</span>
        <span className="text-white/70">{icon} {RECORD_TYPE_LABELS[r.record_type as RecordType]}: {r.title}</span>
        <span className="text-white/50">·</span>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-amber-300">⚠️ Expiring Soon ({records.length})</h3>
      {critical.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">🔴 Critical — ≤7 days</p>
          {critical.map(r => <RecordRow key={r.id} r={r} />)}
        </div>
      )}
      {warning.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">🟡 Warning — 8–30 days</p>
          {warning.map(r => <RecordRow key={r.id} r={r} />)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">🔵 Upcoming — 31–60 days</p>
          {upcoming.map(r => <RecordRow key={r.id} r={r} />)}
        </div>
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
git add src/app/beithady/hr/training/_components/training-expiry-banner.tsx
git commit -m "feat(hr): TrainingExpiryBanner — critical/warning/upcoming expiry alert for training records"
```

---

## Task 8: AddTrainingDialog Component

**Files:**
- Create: `src/app/beithady/hr/training/_components/add-training-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/training/_components/add-training-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { X, Upload } from 'lucide-react';
import {
  addTrainingRecordAction,
  updateTrainingRecordAction,
  setTrainingRecordFileAction,
} from '@/lib/beithady/hr/hr-training-actions';
import { RECORD_TYPE_LABELS, RECORD_TYPES } from '@/lib/beithady/hr/hr-training-types';
import type { HrTrainingRecord, RecordType } from '@/lib/beithady/hr/hr-training-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  open: boolean;
  employees: EmployeeOption[];
  editRecord?: HrTrainingRecord | null;
  defaultEmployeeId?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function AddTrainingDialog({
  open, employees, editRecord, defaultEmployeeId, onClose, onSaved,
}: Props) {
  const isEdit = !!editRecord;

  const [employeeId, setEmployeeId]  = useState(defaultEmployeeId ?? editRecord?.employee_id ?? '');
  const [recordType, setRecordType]  = useState<RecordType>(editRecord?.record_type ?? 'training');
  const [title, setTitle]            = useState(editRecord?.title ?? '');
  const [date, setDate]              = useState(editRecord?.date ?? '');
  const [expiryDate, setExpiryDate]  = useState(editRecord?.expiry_date ?? '');
  const [notes, setNotes]            = useState(editRecord?.notes ?? '');
  const [file, setFile]              = useState<File | null>(null);
  const [error, setError]            = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function reset() {
    setEmployeeId(defaultEmployeeId ?? '');
    setRecordType('training'); setTitle(''); setDate('');
    setExpiryDate(''); setNotes(''); setFile(null); setError('');
  }
  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!isEdit && !employeeId) { setError('Select an employee'); return; }
    if (!title.trim())           { setError('Title is required'); return; }

    startTransition(async () => {
      try {
        let recordId = editRecord?.id;

        if (isEdit) {
          const res = await updateTrainingRecordAction(editRecord!.id, {
            record_type: recordType, title, date, expiry_date: expiryDate, notes,
          });
          if (!res.ok) { setError(res.error ?? 'Update failed'); return; }
        } else {
          const res = await addTrainingRecordAction({
            employee_id: employeeId, record_type: recordType,
            title, date, expiry_date: expiryDate, notes,
          });
          if (!res.ok) { setError(res.error ?? 'Save failed'); return; }
          recordId = res.id;
        }

        if (file && recordId) {
          const params = new URLSearchParams({ record_id: recordId, filename: file.name });
          const urlRes = await fetch(`/api/hr/training/upload-url?${params}`);
          if (!urlRes.ok) { setError('Failed to get upload URL'); return; }
          const { signedUrl, filePath } = await urlRes.json() as { signedUrl: string; filePath: string };

          const uploadRes = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          });
          if (!uploadRes.ok) { setError('File upload failed'); return; }

          const fileRes = await setTrainingRecordFileAction(recordId, filePath, file.name);
          if (!fileRes.ok) { setError(fileRes.error ?? 'Failed to save file path'); return; }
        }

        reset();
        onSaved();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-neutral-900">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? 'Edit Record' : 'Add Training / Certification'}
          </h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Employee — add mode only */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Employee</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="ix-input w-full">
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.display_name} ({e.company_id})</option>
                ))}
              </select>
            </div>
          )}

          {/* Record Type toggle */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Type</label>
            <div className="flex gap-2">
              {RECORD_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setRecordType(t)}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                    recordType === t
                      ? 'bg-emerald-700 border-emerald-600 text-white font-semibold'
                      : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t === 'training' ? '🎓' : '🏅'} {RECORD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. First Aid Certificate, OSHA Safety Training"
              className="ix-input w-full" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">
                {recordType === 'certification' ? 'Issue Date' : 'Completion Date'}
              </label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="ix-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Expiry Date</label>
              <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="ix-input w-full" />
              <p className="text-xs text-white/30 mt-0.5">Leave blank if no expiry</p>
            </div>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">
              Certificate / File {isEdit && editRecord?.file_name ? `(current: ${editRecord.file_name})` : '(optional)'}
            </label>
            <label className="flex items-center gap-2 px-3 py-2 border border-white/10 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
              <Upload className="w-4 h-4 text-white/40" />
              <span className="text-sm text-white/60">{file ? file.name : 'Choose file (PDF, JPG, PNG — max 10 MB)'}</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f && f.size <= 10 * 1024 * 1024) { setFile(f); setError(''); }
                  else if (f) setError('File must be ≤10 MB');
                }}
              />
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} className="ix-input w-full resize-none" />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3 sticky bottom-0 bg-neutral-900">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-5 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Record'}
          </button>
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

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/training/_components/add-training-dialog.tsx
git commit -m "feat(hr): AddTrainingDialog — add/edit modal with type toggle and signed-URL file upload"
```

---

## Task 9: EmployeeTrainingList Component

**Files:**
- Create: `src/app/beithady/hr/training/_components/employee-training-list.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/training/_components/employee-training-list.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Download, Pencil, Trash2, Plus } from 'lucide-react';
import { AddTrainingDialog } from './add-training-dialog';
import {
  deleteTrainingRecordAction,
  getTrainingRecordDownloadUrl,
} from '@/lib/beithady/hr/hr-training-actions';
import {
  RECORD_TYPE_LABELS,
  RECORD_TYPE_ICONS,
  formatTrainingDateRange,
} from '@/lib/beithady/hr/hr-training-types';
import {
  getExpiryStatus,
  EXPIRY_STATUS_COLORS,
} from '@/lib/beithady/hr/hr-documents-types';
import type { HrTrainingRecord, RecordType, EmployeeTrainingSummary } from '@/lib/beithady/hr/hr-training-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  initialSummary: EmployeeTrainingSummary[];
  employees: EmployeeOption[];
  canManage: boolean;
  onRefresh: () => void;
};

export function EmployeeTrainingList({ initialSummary, employees, canManage, onRefresh }: Props) {
  const router = useRouter();
  const [summary, setSummary]         = useState(initialSummary);
  const [search, setSearch]           = useState('');
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editRecord, setEditRecord]   = useState<HrTrainingRecord | null>(null);
  const [dialogEmpId, setDialogEmpId] = useState('');
  const [deleting, setDeleting]       = useState<string | null>(null);

  const filtered = summary.filter(e =>
    e.employee_name.toLowerCase().includes(search.toLowerCase()) ||
    e.company_id.toLowerCase().includes(search.toLowerCase())
  );

  function toggleExpand(empId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  }

  function openAdd(empId: string) { setEditRecord(null); setDialogEmpId(empId); setDialogOpen(true); }
  function openEdit(rec: HrTrainingRecord) { setEditRecord(rec); setDialogEmpId(''); setDialogOpen(true); }

  async function handleDelete(recordId: string) {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    setDeleting(recordId);
    const res = await deleteTrainingRecordAction(recordId);
    setDeleting(null);
    if (res.ok) {
      setSummary(prev => prev.map(e => ({
        ...e,
        records: e.records.filter(r => r.id !== recordId),
      })));
    }
  }

  async function handleDownload(recordId: string) {
    const res = await getTrainingRecordDownloadUrl(recordId);
    if (res.ok && res.url) window.open(res.url, '_blank');
  }

  function handleSaved() { onRefresh(); router.refresh(); }

  return (
    <div className="space-y-3">
      {/* Search + Add */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employee…"
          className="ix-input text-sm flex-1"
        />
        {canManage && (
          <button
            onClick={() => { setEditRecord(null); setDialogEmpId(''); setDialogOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Record
          </button>
        )}
      </div>

      {/* Employee rows */}
      <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-white/30 italic">No employees found.</p>
        )}
        {filtered.map(emp => {
          const isOpen = expanded.has(emp.employee_id);
          return (
            <div key={emp.employee_id}>
              <button
                onClick={() => toggleExpand(emp.employee_id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left"
              >
                {isOpen
                  ? <ChevronDown className="w-4 h-4 text-white/40 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-white/40 flex-shrink-0" />
                }
                <span className="font-medium text-white text-sm">{emp.employee_name}</span>
                <span className="text-xs font-mono bg-violet-900/40 text-violet-300 px-2 py-0.5 rounded">
                  {emp.company_id}
                </span>
                <div className="flex items-center gap-1.5 ml-2 flex-wrap">
                  {emp.records.map(r => {
                    const status = getExpiryStatus(r.expiry_date);
                    return (
                      <span key={r.id} className={`text-xs px-2 py-0.5 rounded-full ${EXPIRY_STATUS_COLORS[status]}`}>
                        {RECORD_TYPE_ICONS[r.record_type as RecordType]} {r.title}
                      </span>
                    );
                  })}
                  {emp.records.length === 0 && (
                    <span className="text-xs text-white/20 italic">no records</span>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 bg-white/2 space-y-2">
                  {emp.records.map(rec => {
                    const status = getExpiryStatus(rec.expiry_date);
                    return (
                      <div key={rec.id} className="flex items-center gap-3 rounded-xl border border-white/8 px-3 py-2.5 bg-neutral-900">
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${EXPIRY_STATUS_COLORS[status]}`}>
                          {RECORD_TYPE_ICONS[rec.record_type as RecordType]} {RECORD_TYPE_LABELS[rec.record_type as RecordType]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{rec.title}</p>
                          <p className="text-xs text-white/40">{formatTrainingDateRange(rec.date, rec.expiry_date)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {rec.file_name && (
                            <button
                              onClick={() => handleDownload(rec.id)}
                              title={`Download ${rec.file_name}`}
                              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canManage && (
                            <>
                              <button onClick={() => openEdit(rec)}
                                className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(rec.id)}
                                disabled={deleting === rec.id}
                                className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {canManage && (
                    <button
                      onClick={() => openAdd(emp.employee_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/40 hover:text-white border border-dashed border-white/20 hover:border-white/40 rounded-lg transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add record for {emp.employee_name.split(' ')[0]}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddTrainingDialog
        open={dialogOpen}
        employees={employees}
        editRecord={editRecord}
        defaultEmployeeId={dialogEmpId}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
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
git add src/app/beithady/hr/training/_components/employee-training-list.tsx
git commit -m "feat(hr): EmployeeTrainingList — expandable employee rows with training/cert chips + CRUD"
```

---

## Task 10: Training Page

**Files:**
- Create: `src/app/beithady/hr/training/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// src/app/beithady/hr/training/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  getExpiringTrainingRecords,
  getAllEmployeeTrainingSummary,
} from '@/lib/beithady/hr/hr-training-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { TrainingExpiryBanner }  from './_components/training-expiry-banner';
import { EmployeeTrainingList }  from './_components/employee-training-list';

export const dynamic = 'force-dynamic';

export default async function TrainingPage() {
  const { roles } = await requireBeithadyPermission('hr', 'read');
  const canManage = roles.some(r => r === 'admin' || r === 'manager');

  const [expiringRecords, summary] = await Promise.all([
    getExpiringTrainingRecords(60),
    getAllEmployeeTrainingSummary(),
  ]);

  const employees = summary.map(e => ({
    id:           e.employee_id,
    company_id:   e.company_id,
    display_name: e.employee_name,
  }));

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Training & Certifications' },
      ]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Training & Certifications"
        subtitle="Training records · certifications · expiry tracking per employee"
      />
      <div className="space-y-6">
        <TrainingExpiryBanner records={expiringRecords} />
        <EmployeeTrainingList
          initialSummary={summary}
          employees={employees}
          canManage={canManage}
          onRefresh={() => {}}
        />
      </div>
    </BeithadyShell>
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
git add src/app/beithady/hr/training/page.tsx
git commit -m "feat(hr): Training & Certifications page — expiry banner + employee training list"
```

---

## Task 11: Team Drawer Training Tab

**Files:**
- Create: `src/app/beithady/hr/team/_components/training-tab.tsx`
- Modify: `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx`

- [ ] **Step 1: Write the Training tab component**

```tsx
// src/app/beithady/hr/team/_components/training-tab.tsx
'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Download } from 'lucide-react';
import { getTrainingRecordDownloadUrl } from '@/lib/beithady/hr/hr-training-actions';
import {
  RECORD_TYPE_LABELS,
  RECORD_TYPE_ICONS,
  formatTrainingDateRange,
} from '@/lib/beithady/hr/hr-training-types';
import {
  getExpiryStatus,
  EXPIRY_STATUS_COLORS,
} from '@/lib/beithady/hr/hr-documents-types';
import type { HrTrainingRecord, RecordType } from '@/lib/beithady/hr/hr-training-types';

type Props = { employeeId: string };

export function TrainingTab({ employeeId }: Props) {
  const [records, setRecords] = useState<HrTrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/hr/training/by-employee?employee_id=${employeeId}`)
      .then(r => r.ok ? r.json() : { records: [] })
      .then(({ records: r }) => { setRecords(r ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [employeeId]);

  async function handleDownload(recordId: string) {
    const res = await getTrainingRecordDownloadUrl(recordId);
    if (res.ok && res.url) window.open(res.url, '_blank');
  }

  if (loading) {
    return <p className="text-sm text-white/30 py-4">Loading records…</p>;
  }

  return (
    <div className="space-y-3">
      {records.length === 0 ? (
        <p className="text-sm text-white/30 italic py-4">No training records on file.</p>
      ) : (
        records.map(rec => {
          const status = getExpiryStatus(rec.expiry_date);
          return (
            <div key={rec.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5">
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${EXPIRY_STATUS_COLORS[status]}`}>
                {RECORD_TYPE_ICONS[rec.record_type as RecordType]} {RECORD_TYPE_LABELS[rec.record_type as RecordType]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{rec.title}</p>
                <p className="text-xs text-white/40">{formatTrainingDateRange(rec.date, rec.expiry_date)}</p>
              </div>
              {rec.file_name && (
                <button
                  onClick={() => handleDownload(rec.id)}
                  title={`Download ${rec.file_name}`}
                  className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })
      )}
      <a
        href="/beithady/hr/training"
        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors mt-2"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Manage all training records
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Modify `add-edit-member-dialog.tsx` to add Training tab**

Read `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx` first.

The current state has:
- `type Tab = 'personal' | 'contract' | 'timeline' | 'documents'`
- `TABS` array with 4 entries ending with `{ id: 'documents', label: '🗂 Documents' }`
- `{tab === 'documents' && employee?.id && <DocumentsTab ... />}`

Make these three targeted edits:

**Edit 1** — Update `type Tab` to add `'training'`:
```typescript
type Tab = 'personal' | 'contract' | 'timeline' | 'documents' | 'training';
```

**Edit 2** — Add to `TABS` array after the documents entry:
```typescript
{ id: 'training',  label: '🎓 Training' },
```

**Edit 3** — Add tab content after the documents tab render block:
```tsx
{tab === 'training' && employee?.id && (
  <TrainingTab employeeId={employee.id} />
)}
```

**Edit 4** — Add import at the top alongside the other tab imports:
```typescript
import { TrainingTab } from './training-tab';
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/hr/team/_components/training-tab.tsx \
        src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx
git commit -m "feat(hr): Training tab on employee profile + GET /by-employee API route"
```

---

## Task 12: Activate Tile + Deploy

**Files:**
- Modify: `src/app/beithady/hr/page.tsx`

- [ ] **Step 1: Activate the hub tile**

In `src/app/beithady/hr/page.tsx`, find:
```typescript
    {
      href: '/beithady/hr/training',
      title: 'Training & Certifications',
      description: 'Training records · certifications · expiry tracking per employee.',
      icon: Award,
      accent: 'emerald',
      disabled: true,
      comingSoonLabel: 'Sprint 9',
    },
```

Replace with:
```typescript
    {
      href: '/beithady/hr/training',
      title: 'Training & Certifications',
      description: 'Training records · certifications · expiry tracking per employee.',
      icon: Award,
      accent: 'emerald',
    },
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass (≥527).

- [ ] **Step 3: Deploy**

```bash
git add src/app/beithady/hr/page.tsx
git commit -m "feat(hr): Training & Certifications page + activate Sprint 9 tile — Sprint 9 complete"
git fetch origin main
git rebase origin/main
git push origin HEAD:main
vercel --prod --yes
```
