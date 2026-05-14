# Beithady HR Sprint 8: Documents & Compliance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/beithady/hr/documents` — employee document storage (upload PDFs/images to Supabase Storage), expiry tracking with on-page alert banner, daily WhatsApp HR digest, individual employee reminders at 30 and 7 days, and a Documents tab on the employee profile drawer.

**Architecture:** One new DB table (`hr_employee_documents`) + private Supabase Storage bucket (`hr-documents`). Files upload client-side via signed URLs to bypass the 15 MB server action limit. A server-only query layer provides data for the page and cron. Four server actions handle CRUD. A DST-safe 9 AM Cairo cron sends WhatsApp alerts. The employee profile drawer gets a new Documents tab.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind v4 · Supabase (supabaseAdmin + Storage) · Vitest · Green-API WhatsApp (`@/lib/whatsapp/green-api`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0132_hr_documents.sql` | Create | hr_employee_documents table + storage bucket |
| `src/lib/beithady/hr/hr-documents-types.ts` | Create | DocType, HrDocument, inputs, daysUntilExpiry, getExpiryStatus |
| `src/lib/beithady/hr/hr-documents-types.test.ts` | Create | TDD tests for helpers |
| `src/lib/beithady/hr/hr-documents-queries.ts` | Create | server-only: getExpiringDocuments, getEmployeeDocuments, getAllEmployeeDocSummary |
| `src/lib/beithady/hr/hr-documents-actions.ts` | Create | 5 server actions |
| `src/app/api/hr/documents/upload-url/route.ts` | Create | GET → signed upload URL |
| `src/app/api/cron/hr-documents-expiry/route.ts` | Create | 9 AM Cairo cron — HR digest + individual reminders |
| `src/app/beithady/hr/documents/_components/expiring-banner.tsx` | Create | Section 1 expiry alert banner |
| `src/app/beithady/hr/documents/_components/add-document-dialog.tsx` | Create | Add/Edit modal with signed-URL file upload |
| `src/app/beithady/hr/documents/_components/employee-doc-list.tsx` | Create | 'use client' expandable employee list |
| `src/app/beithady/hr/documents/page.tsx` | Create | Server page, auth-gated |
| `src/app/beithady/hr/team/_components/documents-tab.tsx` | Create | Documents tab for employee profile drawer |
| `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx` | Modify | Add 'documents' tab entry |
| `src/app/beithady/hr/page.tsx` | Modify | Remove disabled + comingSoonLabel from Sprint 8 tile |
| `vercel.json` | Modify | Add 2 cron entries for hr-documents-expiry |

---

## Task 1: DB Migration + Storage Bucket

**Files:**
- Create: `supabase/migrations/0132_hr_documents.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0132_hr_documents.sql
-- Beithady HR Sprint 8 — Documents & Compliance

create table public.hr_employee_documents (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.hr_employees(id) on delete cascade,
  doc_type        text not null check (doc_type in ('id','contract','police_report','military_certificate','other')),
  title           text not null,
  document_number text,
  issue_date      date,
  expiry_date     date,
  file_path       text,
  file_name       text,
  notes           text,
  created_by      uuid references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_hr_docs_employee on public.hr_employee_documents(employee_id);
create index idx_hr_docs_expiry   on public.hr_employee_documents(expiry_date) where expiry_date is not null;
create index idx_hr_docs_type     on public.hr_employee_documents(doc_type);

-- Private storage bucket for HR documents
insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply to Supabase**

Paste into Supabase dashboard SQL Editor for project `bpjproljatbrbmszwbov` and run. Verify no errors and that `hr_employee_documents` appears in Tables and `hr-documents` appears in Storage → Buckets.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0132_hr_documents.sql
git commit -m "feat(hr): migration 0132 — hr_employee_documents table + hr-documents storage bucket"
```

---

## Task 2: Types + TDD

**Files:**
- Create: `src/lib/beithady/hr/hr-documents-types.ts`
- Create: `src/lib/beithady/hr/hr-documents-types.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/beithady/hr/hr-documents-types.test.ts
import { describe, it, expect } from 'vitest';
import { daysUntilExpiry, getExpiryStatus } from './hr-documents-types';

describe('daysUntilExpiry', () => {
  it('returns null for null expiry', () => {
    expect(daysUntilExpiry(null)).toBeNull();
  });
  it('returns 0 for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(daysUntilExpiry(today)).toBe(0);
  });
  it('returns negative for past date', () => {
    expect(daysUntilExpiry('2020-01-01')).toBeLessThan(0);
  });
  it('returns positive for future date', () => {
    expect(daysUntilExpiry('2099-01-01')).toBeGreaterThan(0);
  });
});

describe('getExpiryStatus', () => {
  it('returns no_expiry for null', () => {
    expect(getExpiryStatus(null)).toBe('no_expiry');
  });
  it('returns expired for past date', () => {
    expect(getExpiryStatus('2020-01-01')).toBe('expired');
  });
  it('returns critical for 5 days from today', () => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    expect(getExpiryStatus(d.toISOString().slice(0, 10))).toBe('critical');
  });
  it('returns warning for 20 days from today', () => {
    const d = new Date();
    d.setDate(d.getDate() + 20);
    expect(getExpiryStatus(d.toISOString().slice(0, 10))).toBe('warning');
  });
  it('returns upcoming for 45 days from today', () => {
    const d = new Date();
    d.setDate(d.getDate() + 45);
    expect(getExpiryStatus(d.toISOString().slice(0, 10))).toBe('upcoming');
  });
  it('returns valid for 90 days from today', () => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    expect(getExpiryStatus(d.toISOString().slice(0, 10))).toBe('valid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run hr-documents-types
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the types + implementation**

```typescript
// src/lib/beithady/hr/hr-documents-types.ts
// Pure types + helpers. No imports. Safe for any context.

export type DocType =
  | 'id'
  | 'contract'
  | 'police_report'
  | 'military_certificate'
  | 'other';

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  id:                   'National ID',
  contract:             'Employment Contract',
  police_report:        'Police Report',
  military_certificate: 'Military Certificate',
  other:                'Other',
};

export const DOC_TYPES: DocType[] = [
  'id', 'contract', 'police_report', 'military_certificate', 'other',
];

// ── DB row ────────────────────────────────────────────────────────────────────

export type HrDocument = {
  id: string;
  employee_id: string;
  doc_type: DocType;
  title: string;
  document_number: string | null;
  issue_date: string | null;    // YYYY-MM-DD
  expiry_date: string | null;   // YYYY-MM-DD, null = no expiry
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// Joined with employee fields (for list page + cron)
export type HrDocumentRow = HrDocument & {
  employee_name: string;
  company_id: string;
  employee_phone: string | null;
};

// Per-employee summary for the expandable list
export type EmployeeDocSummary = {
  employee_id: string;
  employee_name: string;
  company_id: string;
  building_code: string | null;
  documents: HrDocument[];
};

// ── Form inputs ───────────────────────────────────────────────────────────────

export type AddDocumentInput = {
  employee_id: string;
  doc_type: DocType;
  title: string;
  document_number: string;
  issue_date: string;     // YYYY-MM-DD or ''
  expiry_date: string;    // YYYY-MM-DD or '' (empty = no expiry)
  notes: string;
};

export type UpdateDocumentInput = {
  doc_type?: DocType;
  title?: string;
  document_number?: string;
  issue_date?: string;
  expiry_date?: string;
  notes?: string;
};

// ── Expiry status ─────────────────────────────────────────────────────────────

export type ExpiryStatus =
  | 'expired'     // < 0 days
  | 'critical'    // 0–7 days
  | 'warning'     // 8–30 days
  | 'upcoming'    // 31–60 days
  | 'valid'       // > 60 days
  | 'no_expiry';  // null expiry_date

export const EXPIRY_STATUS_COLORS: Record<ExpiryStatus, string> = {
  expired:   'bg-red-900/50 text-red-300',
  critical:  'bg-red-900/50 text-red-300',
  warning:   'bg-amber-900/50 text-amber-300',
  upcoming:  'bg-blue-900/50 text-blue-300',
  valid:     'bg-emerald-900/50 text-emerald-300',
  no_expiry: 'bg-white/10 text-white/50',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns days until expiry (negative = already expired, 0 = today).
 * Returns null if expiry_date is null.
 */
export function daysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate + 'T00:00:00');
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Returns the expiry status bucket for display and alerting.
 */
export function getExpiryStatus(expiryDate: string | null): ExpiryStatus {
  const days = daysUntilExpiry(expiryDate);
  if (days === null)  return 'no_expiry';
  if (days < 0)       return 'expired';
  if (days <= 7)      return 'critical';
  if (days <= 30)     return 'warning';
  if (days <= 60)     return 'upcoming';
  return 'valid';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- --run hr-documents-types
```

Expected: 10/10 PASS.

- [ ] **Step 5: Run full suite**

```
npm test -- --run
```

Expected: all tests pass (≥517).

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady/hr/hr-documents-types.ts \
        src/lib/beithady/hr/hr-documents-types.test.ts
git commit -m "feat(hr): documents types + daysUntilExpiry/getExpiryStatus helpers — TDD"
```

---

## Task 3: Server-Only Queries

**Files:**
- Create: `src/lib/beithady/hr/hr-documents-queries.ts`

- [ ] **Step 1: Write the queries file**

```typescript
// src/lib/beithady/hr/hr-documents-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  HrDocument, HrDocumentRow, EmployeeDocSummary,
} from './hr-documents-types';

type EmpRow = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  building_code: string | null;
  phone: string | null;
};

// ── Expiring documents (for banner + cron) ────────────────────────────────────

export async function getExpiringDocuments(withinDays: number): Promise<HrDocumentRow[]> {
  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  const limitDate = limit.toISOString().slice(0, 10);

  type RawDoc = HrDocument & {
    hr_employees: { company_id: string; first_name: string; last_name: string | null; phone: string | null } | null;
  };

  const { data, error } = await sb
    .from('hr_employee_documents')
    .select('*, hr_employees(company_id, first_name, last_name, phone)')
    .lte('expiry_date', limitDate)
    .order('expiry_date', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawDoc[]).map(r => ({
    ...r,
    employee_name: r.hr_employees
      ? `${r.hr_employees.first_name} ${r.hr_employees.last_name ?? ''}`.trim()
      : '—',
    company_id:     r.hr_employees?.company_id ?? '—',
    employee_phone: r.hr_employees?.phone ?? null,
  }));
}

// ── Documents for one employee ────────────────────────────────────────────────

export async function getEmployeeDocuments(employeeId: string): Promise<HrDocument[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_employee_documents')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as HrDocument[];
}

// ── All active employees + their documents (for the list page) ────────────────

export async function getAllEmployeeDocSummary(): Promise<EmployeeDocSummary[]> {
  const sb = supabaseAdmin();

  const { data: emps, error: eErr } = await sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name, building_code, phone')
    .neq('status', 'terminated')
    .order('first_name');
  if (eErr) throw new Error(eErr.message);

  const { data: docs, error: dErr } = await sb
    .from('hr_employee_documents')
    .select('*')
    .order('created_at', { ascending: false });
  if (dErr) throw new Error(dErr.message);

  const docsByEmp = new Map<string, HrDocument[]>();
  for (const d of (docs ?? []) as HrDocument[]) {
    const arr = docsByEmp.get(d.employee_id) ?? [];
    arr.push(d);
    docsByEmp.set(d.employee_id, arr);
  }

  return ((emps ?? []) as EmpRow[]).map(e => ({
    employee_id:   e.id,
    employee_name: `${e.first_name} ${e.last_name ?? ''}`.trim(),
    company_id:    e.company_id,
    building_code: e.building_code,
    documents:     docsByEmp.get(e.id) ?? [],
  }));
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-documents-queries.ts
git commit -m "feat(hr): documents server-only queries — getExpiringDocuments, getEmployeeDocuments, getAllEmployeeDocSummary"
```

---

## Task 4: Server Actions

**Files:**
- Create: `src/lib/beithady/hr/hr-documents-actions.ts`

- [ ] **Step 1: Write the actions file**

```typescript
// src/lib/beithady/hr/hr-documents-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import type { AddDocumentInput, UpdateDocumentInput } from './hr-documents-types';

const REVALIDATE = '/beithady/hr/documents';
const BUCKET = 'hr-documents';

// ── addDocumentAction ─────────────────────────────────────────────────────────

export async function addDocumentAction(
  input: AddDocumentInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (!input.employee_id) return { ok: false, error: 'Employee is required' };
    if (!input.title.trim()) return { ok: false, error: 'Title is required' };

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('hr_employee_documents')
      .insert({
        employee_id:     input.employee_id,
        doc_type:        input.doc_type,
        title:           input.title.trim(),
        document_number: input.document_number || null,
        issue_date:      input.issue_date || null,
        expiry_date:     input.expiry_date || null,
        notes:           input.notes || null,
        created_by:      user.id,
        updated_at:      new Date().toISOString(),
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

// ── updateDocumentAction ──────────────────────────────────────────────────────

export async function updateDocumentAction(
  docId: string,
  input: UpdateDocumentInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');

    const sb = supabaseAdmin();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.doc_type        !== undefined) update.doc_type        = input.doc_type;
    if (input.title           !== undefined) update.title           = input.title.trim();
    if (input.document_number !== undefined) update.document_number = input.document_number || null;
    if (input.issue_date      !== undefined) update.issue_date      = input.issue_date || null;
    if (input.expiry_date     !== undefined) update.expiry_date     = input.expiry_date || null;
    if (input.notes           !== undefined) update.notes           = input.notes || null;

    const { error } = await sb
      .from('hr_employee_documents')
      .update(update)
      .eq('id', docId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── deleteDocumentAction ──────────────────────────────────────────────────────

export async function deleteDocumentAction(
  docId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    // Get file_path before deleting so we can remove the file too
    const { data: doc } = await sb
      .from('hr_employee_documents')
      .select('file_path')
      .eq('id', docId)
      .single();

    if (doc?.file_path) {
      await sb.storage.from(BUCKET).remove([(doc as { file_path: string }).file_path]);
    }

    const { error } = await sb
      .from('hr_employee_documents')
      .delete()
      .eq('id', docId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── setDocumentFileAction ─────────────────────────────────────────────────────
// Called after client uploads file to Supabase Storage via signed URL.

export async function setDocumentFileAction(
  docId: string,
  filePath: string,
  fileName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_employee_documents')
      .update({ file_path: filePath, file_name: fileName, updated_at: new Date().toISOString() })
      .eq('id', docId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── getDocumentDownloadUrl ────────────────────────────────────────────────────

export async function getDocumentDownloadUrl(
  docId: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const sb = supabaseAdmin();
    const { data: doc } = await sb
      .from('hr_employee_documents')
      .select('file_path')
      .eq('id', docId)
      .single();

    if (!(doc as { file_path: string | null } | null)?.file_path) {
      return { ok: false, error: 'No file attached' };
    }

    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl((doc as { file_path: string }).file_path, 60);
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

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-documents-actions.ts
git commit -m "feat(hr): documents server actions — add, update, delete, setFile, getDownloadUrl"
```

---

## Task 5: Upload URL API Route

**Files:**
- Create: `src/app/api/hr/documents/upload-url/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/hr/documents/upload-url/route.ts
// Returns a signed upload URL so the client can PUT a file directly to Supabase Storage.
// The doc must already exist (created by addDocumentAction) before calling this route.

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const BUCKET = 'hr-documents';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const docId    = searchParams.get('doc_id');
  const filename = searchParams.get('filename');
  if (!docId || !filename) {
    return NextResponse.json({ error: 'doc_id and filename are required' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Verify the document exists and get employee_id for the storage path
  const { data: doc, error: dErr } = await sb
    .from('hr_employee_documents')
    .select('employee_id')
    .eq('id', docId)
    .single();
  if (dErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Sanitize filename and build storage path
  const safeName = filename.replace(/[^a-zA-Z0-9._\-()]/g, '_');
  const filePath = `${(doc as { employee_id: string }).employee_id}/${docId}/${safeName}`;

  const { data, error: sErr } = await sb.storage.from(BUCKET).createSignedUploadUrl(filePath);
  if (sErr || !data) {
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, filePath, token: data.token });
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/hr/documents/upload-url/route.ts
git commit -m "feat(hr): documents upload-url API route — signed PUT URL for Supabase Storage"
```

---

## Task 6: Cron Route + vercel.json

**Files:**
- Create: `src/app/api/cron/hr-documents-expiry/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the cron route**

```typescript
// src/app/api/cron/hr-documents-expiry/route.ts
// Daily 9 AM Cairo — HR WhatsApp digest of expiring documents + individual employee reminders.
// DST-safe: vercel.json registers UTC 06:00 + 07:00; handler gates on Cairo hour == 9.

import { NextRequest, NextResponse } from 'next/server';
import { getExpiringDocuments } from '@/lib/beithady/hr/hr-documents-queries';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { DOC_TYPE_LABELS, daysUntilExpiry } from '@/lib/beithady/hr/hr-documents-types';
import type { DocType } from '@/lib/beithady/hr/hr-documents-types';

export const dynamic   = 'force-dynamic';
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
    // Documents expiring within 30 days (for HR digest)
    const expiringDocs = await getExpiringDocuments(30);

    let digestSent = 0;
    let remindersSent = 0;

    // ── HR digest ────────────────────────────────────────────────────────────
    if (expiringDocs.length > 0) {
      const critical = expiringDocs.filter(d => {
        const days = daysUntilExpiry(d.expiry_date);
        return days !== null && days <= 7;
      });
      const warning = expiringDocs.filter(d => {
        const days = daysUntilExpiry(d.expiry_date);
        return days !== null && days > 7 && days <= 30;
      });

      let msg = '📋 *HR Documents Expiry Alert*\n\n';
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
      }

      const hrPhones = (process.env.BEITHADY_OPS_ALERT_PHONES || '')
        .split(',')
        .map(p => p.trim().replace(/^\+/, ''))
        .filter(Boolean);

      for (const phone of hrPhones) {
        try {
          await sendWhatsApp({ to: phone, message: msg });
          digestSent++;
        } catch {
          // Log but don't fail the whole cron
        }
      }
    }

    // ── Individual employee reminders (≤7 days or 25–30 days) ────────────────
    const reminderDocs = await getExpiringDocuments(30);
    for (const d of reminderDocs) {
      if (!d.employee_phone) continue;
      const days = daysUntilExpiry(d.expiry_date);
      if (days === null) continue;
      // Send reminder when approaching 30-day mark (25–30) or 7-day mark (0–7)
      const shouldRemind = (days >= 25 && days <= 30) || (days >= 0 && days <= 7);
      if (!shouldRemind) continue;

      const phone = d.employee_phone.replace(/^\+/, '');
      const typeLabel = DOC_TYPE_LABELS[d.doc_type as DocType];
      const message = `Hi ${d.employee_name}, your ${typeLabel} expires on ${d.expiry_date}. Please renew it and upload the updated document to the HR system.`;
      try {
        await sendWhatsApp({ to: phone, message });
        remindersSent++;
      } catch {
        // Log but don't fail
      }
    }

    return NextResponse.json({ ok: true, expiringCount: expiringDocs.length, digestSent, remindersSent });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Add cron entries to vercel.json**

Open `vercel.json`. Find the last two `hr-headcount-snapshot` entries:
```json
    { "path": "/api/cron/hr-headcount-snapshot",     "schedule": "0 6 * * *"  },
    { "path": "/api/cron/hr-headcount-snapshot",     "schedule": "0 7 * * *"  }
  ]
```

Replace with:
```json
    { "path": "/api/cron/hr-headcount-snapshot",     "schedule": "0 6 * * *"  },
    { "path": "/api/cron/hr-headcount-snapshot",     "schedule": "0 7 * * *"  },
    { "path": "/api/cron/hr-documents-expiry",       "schedule": "0 6 * * *"  },
    { "path": "/api/cron/hr-documents-expiry",       "schedule": "0 7 * * *"  }
  ]
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/hr-documents-expiry/route.ts vercel.json
git commit -m "feat(hr): documents expiry cron (9 AM Cairo DST-safe) — HR digest + individual reminders"
```

---

## Task 7: ExpiringBanner Component

**Files:**
- Create: `src/app/beithady/hr/documents/_components/expiring-banner.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/documents/_components/expiring-banner.tsx
import { DOC_TYPE_LABELS, daysUntilExpiry } from '@/lib/beithady/hr/hr-documents-types';
import type { HrDocumentRow, DocType } from '@/lib/beithady/hr/hr-documents-types';

type Props = { docs: HrDocumentRow[] };  // docs expiring within 60 days

export function ExpiringBanner({ docs }: Props) {
  if (docs.length === 0) return null;

  const critical = docs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n <= 7; });
  const warning  = docs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n > 7 && n <= 30; });
  const upcoming = docs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n > 30 && n <= 60; });

  function DocRow({ d }: { d: HrDocumentRow }) {
    const days = daysUntilExpiry(d.expiry_date);
    const label = days === null ? '' : days < 0 ? `expired ${Math.abs(days)}d ago` : days === 0 ? 'expires today' : `expires in ${days}d`;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-white">{d.employee_name}</span>
        <span className="text-white/50">·</span>
        <span className="text-white/70">{DOC_TYPE_LABELS[d.doc_type as DocType]}</span>
        <span className="text-white/50">·</span>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-amber-300">⚠️ Expiring Documents ({docs.length})</h3>
      {critical.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">🔴 Critical — ≤7 days</p>
          {critical.map(d => <DocRow key={d.id} d={d} />)}
        </div>
      )}
      {warning.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">🟡 Warning — 8–30 days</p>
          {warning.map(d => <DocRow key={d.id} d={d} />)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">🔵 Upcoming — 31–60 days</p>
          {upcoming.map(d => <DocRow key={d.id} d={d} />)}
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
git add src/app/beithady/hr/documents/_components/expiring-banner.tsx
git commit -m "feat(hr): ExpiringBanner — critical/warning/upcoming expiry alert"
```

---

## Task 8: AddDocumentDialog Component

**Files:**
- Create: `src/app/beithady/hr/documents/_components/add-document-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/documents/_components/add-document-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { X, Upload } from 'lucide-react';
import {
  addDocumentAction,
  updateDocumentAction,
  setDocumentFileAction,
} from '@/lib/beithady/hr/hr-documents-actions';
import { DOC_TYPE_LABELS, DOC_TYPES } from '@/lib/beithady/hr/hr-documents-types';
import type { HrDocument, DocType } from '@/lib/beithady/hr/hr-documents-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  open: boolean;
  employees: EmployeeOption[];
  editDoc?: HrDocument | null;         // null/undefined = add mode
  defaultEmployeeId?: string;          // pre-select employee (from expanded row)
  onClose: () => void;
  onSaved: () => void;
};

export function AddDocumentDialog({
  open, employees, editDoc, defaultEmployeeId, onClose, onSaved,
}: Props) {
  const isEdit = !!editDoc;

  const [employeeId, setEmployeeId]   = useState(defaultEmployeeId ?? editDoc?.employee_id ?? '');
  const [docType, setDocType]         = useState<DocType>(editDoc?.doc_type ?? 'id');
  const [title, setTitle]             = useState(editDoc?.title ?? '');
  const [docNumber, setDocNumber]     = useState(editDoc?.document_number ?? '');
  const [issueDate, setIssueDate]     = useState(editDoc?.issue_date ?? '');
  const [expiryDate, setExpiryDate]   = useState(editDoc?.expiry_date ?? '');
  const [notes, setNotes]             = useState(editDoc?.notes ?? '');
  const [file, setFile]               = useState<File | null>(null);
  const [error, setError]             = useState('');
  const [isPending, startTransition]  = useTransition();

  if (!open) return null;

  function reset() {
    setEmployeeId(defaultEmployeeId ?? '');
    setDocType('id'); setTitle(''); setDocNumber('');
    setIssueDate(''); setExpiryDate(''); setNotes('');
    setFile(null); setError('');
  }
  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!isEdit && !employeeId) { setError('Select an employee'); return; }
    if (!title.trim())           { setError('Title is required'); return; }

    startTransition(async () => {
      try {
        let docId = editDoc?.id;

        if (isEdit) {
          const res = await updateDocumentAction(editDoc!.id, {
            doc_type: docType, title, document_number: docNumber,
            issue_date: issueDate, expiry_date: expiryDate, notes,
          });
          if (!res.ok) { setError(res.error ?? 'Update failed'); return; }
        } else {
          const res = await addDocumentAction({
            employee_id: employeeId, doc_type: docType, title,
            document_number: docNumber, issue_date: issueDate,
            expiry_date: expiryDate, notes,
          });
          if (!res.ok) { setError(res.error ?? 'Save failed'); return; }
          docId = res.id;
        }

        // Upload file if selected
        if (file && docId) {
          const params = new URLSearchParams({ doc_id: docId, filename: file.name });
          const urlRes = await fetch(`/api/hr/documents/upload-url?${params}`);
          if (!urlRes.ok) { setError('Failed to get upload URL'); return; }
          const { signedUrl, filePath } = await urlRes.json() as { signedUrl: string; filePath: string };

          const uploadRes = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          });
          if (!uploadRes.ok) { setError('File upload failed'); return; }

          const fileRes = await setDocumentFileAction(docId, filePath, file.name);
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-neutral-900">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? 'Edit Document' : 'Add Document'}
          </h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Employee — only shown in add mode */}
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

          {/* Document Type */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value as DocType)} className="ix-input w-full">
              {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. National ID — Mohamed Ali" className="ix-input w-full" />
          </div>

          {/* Document Number */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Document Number (optional)</label>
            <input type="text" value={docNumber} onChange={e => setDocNumber(e.target.value)}
              placeholder="ID number, contract ref, etc." className="ix-input w-full" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Issue Date</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="ix-input w-full" />
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
              File {isEdit && editDoc?.file_name ? `(current: ${editDoc.file_name})` : '(optional)'}
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
                  if (f && f.size <= 10 * 1024 * 1024) setFile(f);
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3 sticky bottom-0 bg-neutral-900">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-5 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Document'}
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
git add src/app/beithady/hr/documents/_components/add-document-dialog.tsx
git commit -m "feat(hr): AddDocumentDialog — add/edit modal with signed-URL file upload"
```

---

## Task 9: EmployeeDocList Component

**Files:**
- Create: `src/app/beithady/hr/documents/_components/employee-doc-list.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/documents/_components/employee-doc-list.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Download, Pencil, Trash2, Plus } from 'lucide-react';
import { AddDocumentDialog } from './add-document-dialog';
import {
  deleteDocumentAction,
  getDocumentDownloadUrl,
} from '@/lib/beithady/hr/hr-documents-actions';
import {
  DOC_TYPE_LABELS,
  getExpiryStatus,
  EXPIRY_STATUS_COLORS,
} from '@/lib/beithady/hr/hr-documents-types';
import type { HrDocument, DocType, EmployeeDocSummary } from '@/lib/beithady/hr/hr-documents-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  initialSummary: EmployeeDocSummary[];
  employees: EmployeeOption[];
  canManage: boolean;   // hr:full
  onRefresh: () => void;
};

export function EmployeeDocList({ initialSummary, employees, canManage, onRefresh }: Props) {
  const router = useRouter();
  const [summary, setSummary]     = useState(initialSummary);
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDoc, setEditDoc]     = useState<HrDocument | null>(null);
  const [dialogEmpId, setDialogEmpId] = useState('');
  const [deleting, setDeleting]   = useState<string | null>(null);

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

  function openAdd(empId: string) {
    setEditDoc(null);
    setDialogEmpId(empId);
    setDialogOpen(true);
  }

  function openEdit(doc: HrDocument) {
    setEditDoc(doc);
    setDialogEmpId('');
    setDialogOpen(true);
  }

  async function handleDelete(docId: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    setDeleting(docId);
    const res = await deleteDocumentAction(docId);
    setDeleting(null);
    if (res.ok) {
      setSummary(prev => prev.map(e => ({
        ...e,
        documents: e.documents.filter(d => d.id !== docId),
      })));
    }
  }

  async function handleDownload(docId: string) {
    const res = await getDocumentDownloadUrl(docId);
    if (res.ok && res.url) window.open(res.url, '_blank');
  }

  function handleSaved() {
    onRefresh();
    router.refresh();   // re-fetch server component data to show newly added/edited docs
  }

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
            onClick={() => { setEditDoc(null); setDialogEmpId(''); setDialogOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Document
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
              {/* Row header */}
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
                {/* Document chips */}
                <div className="flex items-center gap-1.5 ml-2 flex-wrap">
                  {emp.documents.map(d => {
                    const status = getExpiryStatus(d.expiry_date);
                    return (
                      <span key={d.id} className={`text-xs px-2 py-0.5 rounded-full ${EXPIRY_STATUS_COLORS[status]}`}>
                        {DOC_TYPE_LABELS[d.doc_type as DocType]}
                      </span>
                    );
                  })}
                  {emp.documents.length === 0 && (
                    <span className="text-xs text-white/20 italic">no documents</span>
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="px-4 pb-4 pt-1 bg-white/2 space-y-2">
                  {emp.documents.map(doc => {
                    const status = getExpiryStatus(doc.expiry_date);
                    return (
                      <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-white/8 px-3 py-2.5 bg-neutral-900">
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${EXPIRY_STATUS_COLORS[status]}`}>
                          {DOC_TYPE_LABELS[doc.doc_type as DocType]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-white/40">
                            {doc.document_number && <span className="mr-3">#{doc.document_number}</span>}
                            {doc.issue_date && <span className="mr-3">Issued {doc.issue_date}</span>}
                            {doc.expiry_date
                              ? <span>Expires {doc.expiry_date}</span>
                              : <span className="text-white/25">No expiry</span>
                            }
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {doc.file_name && (
                            <button
                              onClick={() => handleDownload(doc.id)}
                              title={`Download ${doc.file_name}`}
                              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canManage && (
                            <>
                              <button
                                onClick={() => openEdit(doc)}
                                className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(doc.id)}
                                disabled={deleting === doc.id}
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
                      <Plus className="w-3 h-3" /> Add document for {emp.employee_name.split(' ')[0]}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddDocumentDialog
        open={dialogOpen}
        employees={employees}
        editDoc={editDoc}
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
git add src/app/beithady/hr/documents/_components/employee-doc-list.tsx
git commit -m "feat(hr): EmployeeDocList — expandable employee rows with document chips + upload/edit/delete/download"
```

---

## Task 10: Documents Page

**Files:**
- Create: `src/app/beithady/hr/documents/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// src/app/beithady/hr/documents/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  getExpiringDocuments,
  getAllEmployeeDocSummary,
} from '@/lib/beithady/hr/hr-documents-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ExpiringBanner }   from './_components/expiring-banner';
import { EmployeeDocList }  from './_components/employee-doc-list';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const { roles } = await requireBeithadyPermission('hr', 'read');
  const canManage = roles.some(r => r === 'admin' || r === 'manager');

  const [expiringDocs, summary] = await Promise.all([
    getExpiringDocuments(60),
    getAllEmployeeDocSummary(),
  ]);

  // Build employee options for the Add dialog
  const employees = summary.map(e => ({
    id:           e.employee_id,
    company_id:   e.company_id,
    display_name: e.employee_name,
  }));

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Documents & Compliance' },
      ]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Documents & Compliance"
        subtitle="Contract files · IDs · police reports · expiry tracking"
      />
      <div className="space-y-6">
        <ExpiringBanner docs={expiringDocs} />
        <EmployeeDocList
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

**Note:** `onRefresh` is a no-op here because the page is server-rendered. The `EmployeeDocList` component locally updates state on delete (optimistic). For add/edit, the modal calls `onSaved` which triggers `revalidatePath` via the server action, causing Next.js to re-render the server component. This is the correct App Router pattern — no client-side refetch needed.

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/documents/page.tsx
git commit -m "feat(hr): Documents & Compliance page — expiry banner + employee doc list"
```

---

## Task 11: Team Drawer Documents Tab

**Files:**
- Create: `src/app/beithady/hr/team/_components/documents-tab.tsx`
- Modify: `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx`

- [ ] **Step 1: Write the Documents tab component**

```tsx
// src/app/beithady/hr/team/_components/documents-tab.tsx
'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Download, Plus } from 'lucide-react';
import { getDocumentDownloadUrl } from '@/lib/beithady/hr/hr-documents-actions';
import {
  DOC_TYPE_LABELS,
  getExpiryStatus,
  EXPIRY_STATUS_COLORS,
} from '@/lib/beithady/hr/hr-documents-types';
import type { HrDocument, DocType } from '@/lib/beithady/hr/hr-documents-types';

type Props = {
  employeeId: string;
  canManage: boolean;
};

export function DocumentsTab({ employeeId, canManage }: Props) {
  const [docs, setDocs]       = useState<HrDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/hr/documents/by-employee?employee_id=${employeeId}`)
      .then(r => r.ok ? r.json() : { docs: [] })
      .then(({ docs: d }) => { setDocs(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [employeeId]);

  async function handleDownload(docId: string) {
    const res = await getDocumentDownloadUrl(docId);
    if (res.ok && res.url) window.open(res.url, '_blank');
  }

  if (loading) {
    return <p className="text-sm text-white/30 py-4">Loading documents…</p>;
  }

  return (
    <div className="space-y-3">
      {docs.length === 0 ? (
        <p className="text-sm text-white/30 italic py-4">No documents on file.</p>
      ) : (
        docs.map(doc => {
          const status = getExpiryStatus(doc.expiry_date);
          return (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5">
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${EXPIRY_STATUS_COLORS[status]}`}>
                {DOC_TYPE_LABELS[doc.doc_type as DocType]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{doc.title}</p>
                <p className="text-xs text-white/40">
                  {doc.expiry_date
                    ? `Expires ${doc.expiry_date}`
                    : <span className="text-white/25">No expiry</span>
                  }
                </p>
              </div>
              {doc.file_name && (
                <button
                  onClick={() => handleDownload(doc.id)}
                  title={`Download ${doc.file_name}`}
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
        href="/beithady/hr/documents"
        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors mt-2"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Manage all documents
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Add the API route for fetching employee documents**

This tab uses a fetch (not a server action) because it's loaded lazily in `useEffect`. Create `src/app/api/hr/documents/by-employee/route.ts`:

```typescript
// src/app/api/hr/documents/by-employee/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getEmployeeDocuments } from '@/lib/beithady/hr/hr-documents-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const employee_id = request.nextUrl.searchParams.get('employee_id');
  if (!employee_id) return NextResponse.json({ error: 'employee_id required' }, { status: 400 });

  const docs = await getEmployeeDocuments(employee_id);
  return NextResponse.json({ docs });
}
```

- [ ] **Step 3: Modify `add-edit-member-dialog.tsx` to add Documents tab**

Read `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx` first.

Find the TABS array (around line 159):
```typescript
const TABS = [
  { id: 'personal',  label: 'Personal' },
  { id: 'contract',  label: 'Contract & Payout' },
  { id: 'timeline',  label: 'Timeline' },
] as const;
```

Replace with:
```typescript
const TABS = [
  { id: 'personal',  label: 'Personal' },
  { id: 'contract',  label: 'Contract & Payout' },
  { id: 'timeline',  label: 'Timeline' },
  { id: 'documents', label: 'Documents' },
] as const;
```

Find the `type Tab` definition (around line 11) and add `'documents'`:
```typescript
type Tab = 'personal' | 'contract' | 'timeline' | 'documents';
```

Find the tab content section (around line 203) where the three conditional renders are. Add after `{tab === 'timeline' && <TimelineTab ... />}`:
```tsx
{tab === 'documents' && employee?.id && (
  <DocumentsTab
    employeeId={employee.id}
    canManage={canManage}
  />
)}
```

Add the import at the top of the file alongside the other tab imports:
```typescript
import { DocumentsTab } from './documents-tab';
```

The `canManage` prop may or may not already exist in the dialog — check. If it doesn't exist, add it to the Props type:
```typescript
type Props = {
  // ... existing props
  canManage?: boolean;
};
```
And pass `canManage={canManage ?? false}` to DocumentsTab.

- [ ] **Step 4: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/hr/team/_components/documents-tab.tsx \
        src/app/api/hr/documents/by-employee/route.ts \
        src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx
git commit -m "feat(hr): Documents tab on employee profile + GET /by-employee API route"
```

---

## Task 12: Activate Tile + Deploy

**Files:**
- Modify: `src/app/beithady/hr/page.tsx`

- [ ] **Step 1: Activate the hub tile**

In `src/app/beithady/hr/page.tsx`, find:
```typescript
    {
      href: '/beithady/hr/documents',
      title: 'Documents & Compliance',
      description: 'Contract files · IDs · tax forms · visa/contract expiry alerts.',
      icon: FileCheck,
      accent: 'gold',
      disabled: true,
      comingSoonLabel: 'Sprint 8',
    },
```

Replace with:
```typescript
    {
      href: '/beithady/hr/documents',
      title: 'Documents & Compliance',
      description: 'Contract files · IDs · tax forms · visa/contract expiry alerts.',
      icon: FileCheck,
      accent: 'gold',
    },
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Deploy**

```bash
git add src/app/beithady/hr/page.tsx
git commit -m "feat(hr): Documents & Compliance page + activate Sprint 8 tile — Sprint 8 complete"
git fetch origin main
git rebase origin/main
git push origin HEAD:main
vercel --prod --yes
```
