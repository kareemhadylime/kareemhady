# Beithady HR Sprint 5: Biometric Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag attendance records with their source (`manual` or `biometric`) and add a "Biometric Upload" button on the attendance board so device-generated files are distinguishable from manually-filled sheets.

**Architecture:** Thin sprint — all modifications to existing Sprint 4 files. One new migration adds `source` column to `hr_attendance_records`. The type, query, action, dialog, and board are each updated minimally to thread the new field through. No new pages, no new parser, no new approval flow.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind v4 · Supabase · Vitest

---

## File Map

| File | Action | Change |
|------|--------|--------|
| `supabase/migrations/0129_hr_attendance_source.sql` | Create | Add `source` column |
| `src/lib/beithady/hr/hr-attendance-types.ts` | Modify | Add `AttendanceSource` type + `source` field on `AttendanceRow` |
| `src/lib/beithady/hr/hr-attendance-queries.ts` | Modify | Select `source` in `getAttendanceDayView`, include in return |
| `src/lib/beithady/hr/hr-attendance-actions.ts` | Modify | `confirmAttendanceAction` gains optional `source` param |
| `src/app/beithady/hr/attendance/_components/import-attendance-dialog.tsx` | Modify | Add `source` prop, pass to action, change title |
| `src/app/beithady/hr/attendance/_components/attendance-board.tsx` | Modify | Biometric Upload button + Source column in table |
| `src/app/beithady/hr/page.tsx` | Modify | Activate Sprint 5 tile, href → `/beithady/hr/attendance` |

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/0129_hr_attendance_source.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0129_hr_attendance_source.sql
-- Beithady HR Sprint 5 — tag attendance records with their source

alter table public.hr_attendance_records
  add column source text not null default 'manual'
  check (source in ('manual', 'biometric'));
```

- [ ] **Step 2: Apply to Supabase**

Paste the SQL into the Supabase dashboard SQL Editor for project `bpjproljatbrbmszwbov` and run it. Verify success with no errors. All existing rows will default to `'manual'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0129_hr_attendance_source.sql
git commit -m "feat(hr): migration 0129 — source column on hr_attendance_records"
```

---

## Task 2: Types + Queries

**Files:**
- Modify: `src/lib/beithady/hr/hr-attendance-types.ts`
- Modify: `src/lib/beithady/hr/hr-attendance-queries.ts`

- [ ] **Step 1: Update `hr-attendance-types.ts`**

Add `AttendanceSource` type and `source` field to `AttendanceRow`. The full file after changes:

```typescript
// src/lib/beithady/hr/hr-attendance-types.ts
// Pure types — no imports. Safe for any context.

export type AttendanceStatus = 'present' | 'absent';
export type AttendanceApprovalState = 'pending' | 'approved';
export type AttendanceMatchStatus = 'matched' | 'unmatched' | 'protected' | 'error';
export type AttendanceSource = 'manual' | 'biometric';

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  date: string;
  status: AttendanceStatus;
  building_code: string | null;
  approval_state: AttendanceApprovalState;
  source: AttendanceSource;
  submitted_by: string | null;
  submitted_at: string;
  approved_by: string | null;
  approved_at: string | null;
};

export type AttendanceRow = {
  employee_id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  arabic_name: string | null;
  department: string;
  building_code: string | null;
  record_id: string | null;
  status: AttendanceStatus | null;
  approval_state: AttendanceApprovalState | null;
  source: AttendanceSource | null;
};

export type AttendancePreviewRow = {
  rowIndex: number;
  sheet_name: string;
  bh_id_raw: string;
  status_raw: string;
  status: AttendanceStatus | null;
  matchStatus: AttendanceMatchStatus;
  matchedEmployeeId: string | null;
  building_code: string | null;
  errorMessage: string;
};

export type AttendancePreviewResult = {
  rows: AttendancePreviewRow[];
  suggestedDate: string;
  matchedCount: number;
  unmatchedCount: number;
  protectedCount: number;
  errorCount: number;
};

export type AttendanceFilter = {
  date: string;
  building?: string;
  department?: string;
};
```

- [ ] **Step 2: Update `hr-attendance-queries.ts`**

Three changes: (1) add `source` to the `RecordRow` local type, (2) select `source` in the query, (3) include `source` in the returned `AttendanceRow`. Make these targeted edits:

In `hr-attendance-queries.ts`, change the `RecordRow` type definition:
```typescript
// BEFORE:
type RecordRow = { id: string; employee_id: string; status: string; approval_state: string };

// AFTER:
type RecordRow = { id: string; employee_id: string; status: string; approval_state: string; source: string };
```

Change the `.select(...)` call in `getAttendanceDayView`:
```typescript
// BEFORE:
.select('id, employee_id, status, approval_state')

// AFTER:
.select('id, employee_id, status, approval_state, source')
```

Change the return map inside `getAttendanceDayView` to include `source`:
```typescript
// BEFORE (the return object inside .map):
return {
  employee_id:    e.id,
  company_id:     e.company_id,
  first_name:     e.first_name,
  last_name:      e.last_name,
  arabic_name:    e.arabic_name,
  department:     e.department,
  building_code:  contractByEmp.get(e.id) ?? null,
  record_id:      rec?.id ?? null,
  status:         (rec?.status as AttendanceStatus) ?? null,
  approval_state: (rec?.approval_state as AttendanceApprovalState) ?? null,
};

// AFTER:
return {
  employee_id:    e.id,
  company_id:     e.company_id,
  first_name:     e.first_name,
  last_name:      e.last_name,
  arabic_name:    e.arabic_name,
  department:     e.department,
  building_code:  contractByEmp.get(e.id) ?? null,
  record_id:      rec?.id ?? null,
  status:         (rec?.status as AttendanceStatus) ?? null,
  approval_state: (rec?.approval_state as AttendanceApprovalState) ?? null,
  source:         (rec?.source as AttendanceSource) ?? null,
};
```

Also add `AttendanceSource` to the import line at the top of the file:
```typescript
// BEFORE:
import type { AttendanceRow, AttendanceApprovalState, AttendanceStatus } from './hr-attendance-types';

// AFTER:
import type { AttendanceRow, AttendanceApprovalState, AttendanceStatus, AttendanceSource } from './hr-attendance-types';
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all existing tests pass. TypeScript will enforce that `AttendanceRow.source` is included wherever `AttendanceRow` is constructed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady/hr/hr-attendance-types.ts \
        src/lib/beithady/hr/hr-attendance-queries.ts
git commit -m "feat(hr): add AttendanceSource type + source field to AttendanceRow and query"
```

---

## Task 3: Server Action

**Files:**
- Modify: `src/lib/beithady/hr/hr-attendance-actions.ts`

Add `AttendanceSource` import and optional `source` parameter to `confirmAttendanceAction`.

- [ ] **Step 1: Update the import line**

```typescript
// BEFORE:
import type { AttendancePreviewResult, AttendancePreviewRow, AttendanceFilter } from './hr-attendance-types';

// AFTER:
import type { AttendancePreviewResult, AttendancePreviewRow, AttendanceFilter, AttendanceSource } from './hr-attendance-types';
```

- [ ] **Step 2: Update `confirmAttendanceAction` signature and upsert**

```typescript
// BEFORE:
export async function confirmAttendanceAction(
  date: string,
  rows: AttendancePreviewRow[]
): Promise<{ saved: number; skipped: number; error?: string }> {

// AFTER:
export async function confirmAttendanceAction(
  date: string,
  rows: AttendancePreviewRow[],
  source: AttendanceSource = 'manual'
): Promise<{ saved: number; skipped: number; error?: string }> {
```

Inside `confirmAttendanceAction`, update the upsert payload to include `source`:

```typescript
// BEFORE (inside .upsert):
toInsert.map(r => ({
  employee_id:    r.matchedEmployeeId!,
  date,
  status:         r.status!,
  building_code:  r.building_code,
  approval_state: 'pending',
  submitted_by:   user.id,
  submitted_at:   new Date().toISOString(),
})),

// AFTER:
toInsert.map(r => ({
  employee_id:    r.matchedEmployeeId!,
  date,
  status:         r.status!,
  building_code:  r.building_code,
  approval_state: 'pending',
  source,
  submitted_by:   user.id,
  submitted_at:   new Date().toISOString(),
})),
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady/hr/hr-attendance-actions.ts
git commit -m "feat(hr): confirmAttendanceAction gains optional source param (default 'manual')"
```

---

## Task 4: Import Dialog

**Files:**
- Modify: `src/app/beithady/hr/attendance/_components/import-attendance-dialog.tsx`

Add `source` prop, pass to `confirmAttendanceAction`, change title.

- [ ] **Step 1: Add `AttendanceSource` import**

```typescript
// BEFORE:
import type { AttendancePreviewResult, AttendancePreviewRow } from '@/lib/beithady/hr/hr-attendance-types';

// AFTER:
import type { AttendancePreviewResult, AttendancePreviewRow, AttendanceSource } from '@/lib/beithady/hr/hr-attendance-types';
```

- [ ] **Step 2: Add `source` to Props type**

```typescript
// BEFORE:
type Props = {
  open: boolean;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
};

// AFTER:
type Props = {
  open: boolean;
  defaultDate: string;
  source: AttendanceSource;
  onClose: () => void;
  onSaved: () => void;
};
```

- [ ] **Step 3: Destructure `source` in the component**

```typescript
// BEFORE:
export function ImportAttendanceDialog({ open, defaultDate, onClose, onSaved }: Props) {

// AFTER:
export function ImportAttendanceDialog({ open, defaultDate, source, onClose, onSaved }: Props) {
```

- [ ] **Step 4: Pass `source` to `confirmAttendanceAction`**

```typescript
// BEFORE (inside handleConfirm):
const res = await confirmAttendanceAction(date, rows);

// AFTER:
const res = await confirmAttendanceAction(date, rows, source);
```

- [ ] **Step 5: Change the dialog title**

```typescript
// BEFORE:
<h2 className="text-base font-semibold text-white">Import Attendance</h2>

// AFTER:
<h2 className="text-base font-semibold text-white">
  {source === 'biometric' ? 'Biometric Upload' : 'Import Attendance'}
</h2>
```

- [ ] **Step 6: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/beithady/hr/attendance/_components/import-attendance-dialog.tsx
git commit -m "feat(hr): ImportAttendanceDialog gains source prop — title + action param"
```

---

## Task 5: Attendance Board + Hub Tile + Deploy

**Files:**
- Modify: `src/app/beithady/hr/attendance/_components/attendance-board.tsx`
- Modify: `src/app/beithady/hr/page.tsx`

- [ ] **Step 1: Update board — add biometricOpen state, Source column, Biometric button**

In `attendance-board.tsx`, make these changes:

**Add `AttendanceSource` import:**
```typescript
// BEFORE:
import type { AttendanceRow } from '@/lib/beithady/hr/hr-attendance-types';

// AFTER:
import type { AttendanceRow, AttendanceSource } from '@/lib/beithady/hr/hr-attendance-types';
```

**Add `Microscope` icon import (use `Microscope` for biometric, already in lucide):**
```typescript
// BEFORE:
import { Download, Upload, CheckCircle2, Clock } from 'lucide-react';

// AFTER:
import { Download, Upload, CheckCircle2, Clock, Fingerprint } from 'lucide-react';
```

**Add `biometricOpen` state after the existing `importOpen` state:**
```typescript
// BEFORE:
const [importOpen, setImportOpen]   = useState(false);

// AFTER:
const [importOpen, setImportOpen]     = useState(false);
const [biometricOpen, setBiometricOpen] = useState(false);
```

**Add Biometric Upload button after the existing Import button (inside the `ml-auto` div):**
```typescript
// BEFORE (the Import button):
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>

// AFTER (Import button + new Biometric button):
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={() => setBiometricOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            <Fingerprint className="w-4 h-4" />
            Biometric Upload
          </button>
```

**Add Source column header (7 columns total, update colSpan too):**
```typescript
// BEFORE (thead tr):
<tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
  <th className="px-4 py-3">Name</th>
  <th className="px-4 py-3">BH-ID</th>
  <th className="px-4 py-3">Department</th>
  <th className="px-4 py-3">Building</th>
  <th className="px-4 py-3">Status</th>
  <th className="px-4 py-3">State</th>
</tr>

// AFTER:
<tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
  <th className="px-4 py-3">Name</th>
  <th className="px-4 py-3">BH-ID</th>
  <th className="px-4 py-3">Department</th>
  <th className="px-4 py-3">Building</th>
  <th className="px-4 py-3">Status</th>
  <th className="px-4 py-3">Source</th>
  <th className="px-4 py-3">State</th>
</tr>
```

**Update empty-state colSpan from 6 to 7:**
```typescript
// BEFORE:
<td colSpan={6} className="px-4 py-8 text-center text-white/30 italic">

// AFTER:
<td colSpan={7} className="px-4 py-8 text-center text-white/30 italic">
```

**Add Source cell after the Status cell (inside the rows.map tbody):**
```typescript
// BEFORE (State cell):
                  <td className="px-4 py-2.5">
                    {r.approval_state === 'approved' && (

// AFTER — insert Source cell before the State cell:
                  <td className="px-4 py-2.5">
                    {r.source === 'biometric' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-300">Bio</span>
                    )}
                    {r.source === 'manual' && (
                      <span className="text-xs text-white/30">Manual</span>
                    )}
                    {r.source === null && (
                      <span className="text-xs text-white/20">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.approval_state === 'approved' && (
```

**Add second `ImportAttendanceDialog` for biometric after the existing one:**
```typescript
// BEFORE (at the end, before closing </div>):
      <ImportAttendanceDialog
        open={importOpen}
        defaultDate={date}
        onClose={() => setImportOpen(false)}
        onSaved={() => fetchRows(date, filterBuilding, filterDept)}
      />
    </div>

// AFTER:
      <ImportAttendanceDialog
        open={importOpen}
        defaultDate={date}
        source="manual"
        onClose={() => setImportOpen(false)}
        onSaved={() => fetchRows(date, filterBuilding, filterDept)}
      />
      <ImportAttendanceDialog
        open={biometricOpen}
        defaultDate={date}
        source="biometric"
        onClose={() => setBiometricOpen(false)}
        onSaved={() => fetchRows(date, filterBuilding, filterDept)}
      />
    </div>
```

- [ ] **Step 2: Activate the Sprint 5 hub tile**

In `src/app/beithady/hr/page.tsx`, find the Biometric Upload tile:

```typescript
    {
      href: '/beithady/hr/biometric',
      title: 'Biometric Upload',
      description: 'Upload fingerprint device .xlsx → PM review → finalize. Replaces manual attendance entry.',
      icon: Fingerprint,
      accent: 'indigo',
      disabled: true,
      comingSoonLabel: 'Sprint 5',
    },
```

Change it to:

```typescript
    {
      href: '/beithady/hr/attendance',
      title: 'Biometric Upload',
      description: 'Upload fingerprint device .xlsx → PM review → finalize. Replaces manual attendance entry.',
      icon: Fingerprint,
      accent: 'indigo',
    },
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Deploy**

```bash
git add src/app/beithady/hr/attendance/_components/attendance-board.tsx \
        src/app/beithady/hr/page.tsx
git commit -m "feat(hr): Biometric Upload button + source column + activate Sprint 5 tile — Sprint 5 complete"
git fetch origin main
git rebase origin/main
git push origin HEAD:main
vercel --prod --yes
```
