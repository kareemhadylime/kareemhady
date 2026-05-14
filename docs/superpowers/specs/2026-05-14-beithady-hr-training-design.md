# Beithady HR Module — Sprint 9: Training & Certifications

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Sprint 9 of 11 — Training records + certification tracking, expiry alerts, file attachments

---

## 1. Overview

A single page at `/beithady/hr/training` following the same layout pattern as Sprint 8 (Documents & Compliance). One combined table stores both training records and certifications, distinguished by a `record_type` field. Records have optional expiry dates. The existing `hr-documents-expiry` cron is extended to also alert on expiring training/certification records. Files upload directly to Supabase Storage via signed URLs.

---

## 2. Data Model

### 2.1 New table: `hr_training_records`

```sql
-- supabase/migrations/0133_hr_training.sql

create table public.hr_training_records (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.hr_employees(id) on delete cascade,
  record_type  text not null check (record_type in ('training', 'certification')),
  title        text not null,
  date         date,             -- completion date (training) or issue date (certification)
  expiry_date  date,             -- null = no expiry
  file_path    text,             -- path in hr-training Supabase Storage bucket
  file_name    text,             -- original filename for display
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

### 2.2 Record types

| Value | Label | Icon | Notes |
|-------|-------|------|-------|
| `training` | Training | 🎓 | Completed course/session. Expiry optional. |
| `certification` | Certification | 🏅 | Credential earned. Often has expiry date. |

---

## 3. Page — `/beithady/hr/training`

### 3.1 Access control
- Page visible: `requireBeithadyPermission('hr', 'read')`
- Add / Edit / Delete: `hr:full` (admin and manager)
- File download: any `hr:read` user

### 3.2 Section 1 — Expiring Soon banner

Same logic as Sprint 8: records with `expiry_date` within 60 days.

| Color | Condition |
|-------|-----------|
| 🔴 Red | ≤ 7 days (or already expired) |
| 🟡 Amber | 8–30 days |
| 🔵 Blue | 31–60 days |

Each entry shows: Employee name · Record type (Training/Certification) · Title · "expires in N days". Server-rendered.

### 3.3 Section 2 — Employee list

- **Search bar** — client-side filter by employee name or BH-ID
- **Expandable employee rows** — one row per active employee showing:
  - Employee name + BH-ID chip
  - Type chips per record: 🏅 Certification or 🎓 Training, color-coded by expiry status
- **Expanded view** — per record: type emoji + title + date + expiry date + file download + Edit + Delete
- **"+ Add Record"** global button and per-employee inline button (hr:full)

### 3.4 Add/Edit Modal

Fields:
- **Record Type** — toggle between Training (🎓) and Certification (🏅)
- **Title** (required)
- **Date** — completion/issue date (optional)
- **Expiry Date** — optional; leave blank for non-expiring records
- **File** — optional; PDF, JPG, PNG ≤10 MB; same signed-URL upload flow as Sprint 8
- **Notes** — optional textarea

---

## 4. Expiry Notifications — Cron Extension

**File to modify:** `src/app/api/cron/hr-documents-expiry/route.ts`

The existing cron is extended to also query `hr_training_records` for records expiring ≤30 days. The logic is identical to the document expiry logic:

- **HR digest** — training/cert expiry items appended to the existing WhatsApp digest message under a separate section heading "📚 *Training & Certifications Expiry*"
- **Individual reminders** — same 25–30 day and 0–7 day window, same WhatsApp format

The cron now makes two expiry queries (documents + training) and merges them into a single combined digest per run.

---

## 5. File Upload Flow

Identical to Sprint 8:
1. `addTrainingRecordAction(input)` inserts record, returns `{ ok, id }`
2. Client calls `GET /api/hr/training/upload-url?record_id=&filename=` → signed upload URL
3. Client PUTs file directly to Supabase Storage bucket `hr-training`
4. Client calls `setTrainingRecordFileAction(id, filePath, fileName)`

File path: `{employee_id}/{record_id}/{safe_filename}`

---

## 6. Server Actions

| Action | Auth | Effect |
|--------|------|--------|
| `addTrainingRecordAction(input)` | `hr:full` | Insert `hr_training_records`, returns `{ ok, id }` |
| `updateTrainingRecordAction(id, input)` | `hr:full` | Update record + updated_at |
| `deleteTrainingRecordAction(id)` | `hr:full` | Delete record + remove file from storage |
| `setTrainingRecordFileAction(id, filePath, fileName)` | `hr:read` | Update file_path + file_name |
| `getTrainingRecordDownloadUrl(id)` | `hr:read` | Return signed download URL (60s TTL) |

---

## 7. Queries

```typescript
// src/lib/beithady/hr/hr-training-queries.ts (server-only)

// getExpiringTrainingRecords(days)      — records expiring within N days, with employee name/phone
// getAllEmployeeTrainingSummary()        — all active employees + their training/cert records
// getEmployeeTrainingRecords(empId)     — all records for one employee (for team drawer tab)
```

---

## 8. File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0133_hr_training.sql` | Create | hr_training_records + hr-training bucket |
| `src/lib/beithady/hr/hr-training-types.ts` | Create | RecordType, HrTrainingRecord, EmployeeTrainingSummary, helpers |
| `src/lib/beithady/hr/hr-training-types.test.ts` | Create | TDD tests |
| `src/lib/beithady/hr/hr-training-queries.ts` | Create | 3 server-only queries |
| `src/lib/beithady/hr/hr-training-actions.ts` | Create | 5 server actions |
| `src/app/api/hr/training/upload-url/route.ts` | Create | GET → signed upload URL |
| `src/app/api/hr/training/by-employee/route.ts` | Create | GET → records for one employee (team drawer) |
| `src/app/api/cron/hr-documents-expiry/route.ts` | Modify | Extend to include training/cert expiry alerts |
| `src/app/beithady/hr/training/_components/training-expiry-banner.tsx` | Create | Section 1 banner |
| `src/app/beithady/hr/training/_components/add-training-dialog.tsx` | Create | Add/Edit modal |
| `src/app/beithady/hr/training/_components/employee-training-list.tsx` | Create | Expandable employee list |
| `src/app/beithady/hr/training/page.tsx` | Create | Server page, auth-gated |
| `src/app/beithady/hr/team/_components/training-tab.tsx` | Create | Training tab on employee profile drawer |
| `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx` | Modify | Add 'training' tab |
| `src/app/beithady/hr/page.tsx` | Modify | Activate Sprint 9 tile |

---

## 9. Employee Profile Integration

The Team Members employee profile drawer gains a **"Training"** tab (alongside Personal · Contract & Payout · Timeline · Documents). It shows the employee's training/certification list with expiry chips and file download. Loaded lazily via `GET /api/hr/training/by-employee?employee_id=`.

---

## 10. Types

```typescript
// src/lib/beithady/hr/hr-training-types.ts

export type RecordType = 'training' | 'certification';

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  training:      'Training',
  certification: 'Certification',
};

export const RECORD_TYPE_ICONS: Record<RecordType, string> = {
  training:      '🎓',
  certification: '🏅',
};

export type HrTrainingRecord = {
  id: string;
  employee_id: string;
  record_type: RecordType;
  title: string;
  date: string | null;         // YYYY-MM-DD
  expiry_date: string | null;  // YYYY-MM-DD
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HrTrainingRecordRow = HrTrainingRecord & {
  employee_name: string;
  company_id: string;
  employee_phone: string | null;
};

export type EmployeeTrainingSummary = {
  employee_id: string;
  employee_name: string;
  company_id: string;
  building_code: string | null;
  records: HrTrainingRecord[];
};

export type AddTrainingInput = {
  employee_id: string;
  record_type: RecordType;
  title: string;
  date: string;
  expiry_date: string;
  notes: string;
};

export type UpdateTrainingInput = Partial<Omit<AddTrainingInput, 'employee_id'>>;
```

The helpers `daysUntilExpiry` and `getExpiryStatus` are **reused from `hr-documents-types.ts`** — no duplication needed since they are pure functions that work on any date string.

---

## 11. Out of Scope (Sprint 9)

- Training plans / scheduled upcoming training
- Provider/Issuer field (kept minimal per design decision)
- Score/grade tracking
- Training cost tracking
- Bulk import of training records
- Training calendar view
