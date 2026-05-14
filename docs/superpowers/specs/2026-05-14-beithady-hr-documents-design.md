# Beithady HR Module — Sprint 8: Documents & Compliance

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Sprint 8 of 11 — Employee document storage, expiry tracking, on-page alerts, WhatsApp notifications, employee profile integration

---

## 1. Overview

A document management system at `/beithady/hr/documents` that lets HR upload and track compliance documents per employee (contracts, IDs, police reports, military certificates). Documents have optional expiry dates. The system alerts HR via a page banner, surfaces warnings on the employee profile, and sends WhatsApp notifications — a daily HR digest and per-employee reminders at 30 and 7 days before expiry.

---

## 2. Document Types

Fixed enum — 5 values:

| Value | Label |
|-------|-------|
| `id` | National ID |
| `contract` | Employment Contract |
| `police_report` | Police Report |
| `military_certificate` | Military Certificate |
| `other` | Other |

Military Certificate is relevant for male employees only; no system-level enforcement — HR decides when to use it.

---

## 3. Data Model

### 3.1 New table: `hr_employee_documents`

```sql
-- supabase/migrations/0132_hr_documents.sql

create table public.hr_employee_documents (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.hr_employees(id) on delete cascade,
  doc_type        text not null check (doc_type in ('id','contract','police_report','military_certificate','other')),
  title           text not null,
  document_number text,
  issue_date      date,
  expiry_date     date,            -- null = no expiry
  file_path       text,            -- path in hr-documents Supabase Storage bucket
  file_name       text,            -- original filename for display
  notes           text,
  created_by      uuid references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_hr_docs_employee  on public.hr_employee_documents(employee_id);
create index idx_hr_docs_expiry    on public.hr_employee_documents(expiry_date) where expiry_date is not null;
create index idx_hr_docs_type      on public.hr_employee_documents(doc_type);
```

### 3.2 Supabase Storage bucket

Bucket name: `hr-documents`  
Access: **private** — no public URLs. Files accessed via server-generated signed URLs (60-second TTL for download, 5-minute TTL for upload).

```sql
insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', false);
```

---

## 4. Page — `/beithady/hr/documents`

### 4.1 Access control

- Page visible: `requireBeithadyPermission('hr', 'read')`
- Add / Edit / Delete documents: `hr:full` (admin and manager)
- File download: any `hr:read` user

### 4.2 Section 1 — Expiring Soon banner

Shown at the top if any documents expire within 60 days. Three urgency tiers:

| Color | Condition |
|-------|-----------|
| 🔴 Red | expiry_date ≤ today + 7 days (or already expired) |
| 🟡 Amber | expiry_date 8–30 days from today |
| 🔵 Blue | expiry_date 31–60 days from today |

Each entry shows: Employee name · Document type label · "expires in N days" (or "expired N days ago"). Server-rendered, no client state needed.

### 4.3 Section 2 — Employee document list

- **Search bar** — client-side filter by employee name or BH-ID
- **Employee rows** — one row per active (non-terminated) employee, showing:
  - Employee name + BH-ID chip
  - Document type chips: one per uploaded document, color-coded by expiry status (red/amber/green/grey)
  - Click to expand: reveals full document list with details
- **Expanded view** — per document: type label · title · document number · issue/expiry dates · file download link · Edit and Delete buttons (hr:full only)
- **"+ Add Document" button** — opens Add/Edit modal (hr:full only, shown per-employee in expanded row and as a global top-right button)

### 4.4 Add/Edit Document Modal

Fields:
- Document Type (select: 5 options)
- Title (text input, required, e.g. "National ID", "Employment Contract Jan 2026")
- Document Number (optional text)
- Issue Date (date picker, optional)
- Expiry Date (date picker, optional — leave blank for non-expiring documents)
- File Upload (optional — PDF, JPG, PNG, max 10 MB)
- Notes (textarea, optional)

On submit: server action inserts/updates record, then if a file was selected, triggers a signed upload URL flow. Edit pre-fills all fields.

### 4.5 File upload flow

1. Client calls `GET /api/hr/documents/upload-url?employee_id=&doc_id=&filename=` → server returns a signed upload URL from Supabase Storage
2. Client uploads file directly to Supabase Storage via PUT to the signed URL
3. Server action updates `hr_employee_documents.file_path` and `file_name`

File path convention: `{employee_id}/{doc_id}/{filename}`

### 4.6 File download

Clicking a file link calls a server action `getDocumentDownloadUrl(docId)` which generates a signed URL (60-second TTL) and opens it in a new tab.

---

## 5. Employee Profile Integration

In `/beithady/hr/team`, the employee profile drawer/sheet gains a **"Documents" tab** alongside existing tabs (Personal · Contract & Payout · Timeline).

The Documents tab shows:
- List of the employee's documents with expiry status chips
- Expired documents highlighted in red
- A "+ Add" button (hr:full only) that opens the same Add/Edit modal
- "View All" link → navigates to `/beithady/hr/documents` filtered to that employee

---

## 6. Notifications

### 6.1 Cron route

**File:** `src/app/api/cron/hr-documents-expiry/route.ts`  
**Schedule:** DST-safe 9 AM Cairo — two entries in vercel.json:
```json
{ "path": "/api/cron/hr-documents-expiry", "schedule": "0 6 * * *" },
{ "path": "/api/cron/hr-documents-expiry", "schedule": "0 7 * * *" }
```
Handler gates on Cairo local hour == 9 (or `?force=1`).

### 6.2 HR daily digest

Queries all documents with `expiry_date` between today and today+30 days (across all employees). If any exist, sends one WhatsApp message to `process.env.BH_HR_WHATSAPP` (the HR team number). Message format:

```
📋 *HR Documents Expiry Alert*

🔴 Critical (≤7 days):
• Mohamed Ali — National ID — expires 18 May

🟡 Upcoming (8–30 days):
• Ahmed Fathy — Contract — expires 5 Jun

Reply STOP to unsubscribe.
```

Skips the message entirely if no documents expire within 30 days.

### 6.3 Individual employee reminders

For each document with `expiry_date` exactly 30 days or exactly 7 days from today:
- Look up the employee's phone number (`hr_employees.phone`)
- If phone exists, send WhatsApp: *"Hi [Name], your [Document Type] expires on [date]. Please renew and upload the updated document to the HR system."*
- If no phone number on record, skip (no fallback to email for individuals)

### 6.4 WhatsApp sending

Uses the existing Green-API WhatsApp integration already in the codebase (`src/lib/beithady/whatsapp/` or similar). Same pattern as other WhatsApp sends in the project.

---

## 7. Server Actions

| Action | Auth | Effect |
|--------|------|--------|
| `addDocumentAction(input)` | `hr:full` | Insert `hr_employee_documents` — returns `{ ok, id, error? }` so client can request upload URL |
| `updateDocumentAction(id, input)` | `hr:full` | Update record + updated_at |
| `deleteDocumentAction(id)` | `hr:full` | Delete record + remove file from storage |
| `getDocumentDownloadUrl(id)` | `hr:read` | Return signed download URL (60s TTL) |

---

## 8. Queries

```typescript
// src/lib/beithady/hr/hr-documents-queries.ts (server-only)

// getExpiringDocuments(days)   — all docs expiring within N days, joined with employee name
// getEmployeeDocuments(empId)  — all docs for one employee
// getAllEmployeeDocSummary()   — all active employees + their doc counts/expiry status (for list page)
```

---

## 9. File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0132_hr_documents.sql` | Create | hr_employee_documents table + indexes + storage bucket |
| `src/lib/beithady/hr/hr-documents-types.ts` | Create | DocType enum, HrDocument type, input types |
| `src/lib/beithady/hr/hr-documents-queries.ts` | Create | getExpiringDocuments, getEmployeeDocuments, getAllEmployeeDocSummary |
| `src/lib/beithady/hr/hr-documents-actions.ts` | Create | 4 server actions |
| `src/app/api/hr/documents/upload-url/route.ts` | Create | GET → signed upload URL |
| `src/app/api/cron/hr-documents-expiry/route.ts` | Create | 9 AM Cairo cron — HR digest + individual reminders |
| `src/app/beithady/hr/documents/_components/expiring-banner.tsx` | Create | Section 1 expiry alert banner |
| `src/app/beithady/hr/documents/_components/employee-doc-list.tsx` | Create | 'use client' — searchable expandable employee list |
| `src/app/beithady/hr/documents/_components/add-document-dialog.tsx` | Create | Add/Edit modal with file upload |
| `src/app/beithady/hr/documents/page.tsx` | Create | Server page, auth-gated |
| `src/app/beithady/hr/team/_components/` | Modify | Add Documents tab to employee profile drawer |
| `src/app/beithady/hr/page.tsx` | Modify | Remove disabled + comingSoonLabel from Sprint 8 tile |
| `vercel.json` | Modify | Add 2 cron entries for hr-documents-expiry |

---

## 10. Out of Scope (Sprint 8)

- Document approval workflow (HR must approve uploaded documents)
- Document templates / auto-generation
- Email notifications (WhatsApp only for individuals; HR digest is WhatsApp only)
- Document versioning (replacing a file overwrites the current one)
- Bulk document upload
- OCR / data extraction from uploaded files
