# Beithady HR Module — Sprint 5: Biometric Upload

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Sprint 5 of 11 — Biometric attendance tagging (source tracking)

---

## 1. Overview

Biometric fingerprint devices output the same simple presence sheet format as Sprint 4's manual template (Employee ID · Date · Present/Absent). Sprint 5 adds source tracking so records from the device are distinguishable from manually-filled sheets. No new parser, no new approval flow — reuses Sprint 4's infrastructure entirely.

**Immediate outputs:**
- `source` column on `hr_attendance_records` (`'manual'` default, `'biometric'` for device uploads)
- "Biometric Upload" button on the attendance board → same 3-step wizard → saves with `source = 'biometric'`
- Source badge in the attendance table (violet "Bio" chip on biometric records)

---

## 2. Data Model Change — 1 Migration

```sql
alter table public.hr_attendance_records
  add column source text not null default 'manual'
  check (source in ('manual', 'biometric'));
```

Migration file: `supabase/migrations/0129_hr_attendance_source.sql`

All existing records default to `'manual'`. No backfill needed.

---

## 3. UI Changes — `/beithady/hr/attendance`

### 3.1 Attendance board — top bar

Add "Biometric Upload" button next to the existing "Import" button:

```
[↓ Download Template]  [↑ Import]  [🔬 Biometric Upload]
```

Clicking "Biometric Upload" opens the existing `ImportAttendanceDialog` with `source='biometric'` passed in. Clicking "Import" continues to open it with `source='manual'`.

### 3.2 Attendance table — source badge

Add a source column (or inline badge on the Status cell):

| Name | BH-ID | Dept | Building | Status | Source | State |
|------|-------|------|----------|--------|--------|-------|
| Mohamed Ali | BH-001 | Engineering | BH-26 | ✅ Present | 🔬 Bio | ✓ |
| Ahmed Fathy | BH-002 | Finance | HO | ❌ Absent | Manual | ⏳ |

Biometric records show a small violet `Bio` chip. Manual records show muted `Manual` text. Records with no attendance show `—`.

### 3.3 Hub tile

Already exists on `/beithady/hr` as Sprint 5 tile (dimmed, "Sprint 5"). Sprint 5 activates it — but there is **no separate `/beithady/hr/biometric` page**. The tile links directly to `/beithady/hr/attendance` (the existing attendance page). Update the tile's `href` and remove `disabled`/`comingSoonLabel`.

---

## 4. Code Changes

### 4.1 `hr-attendance-types.ts`

Add `AttendanceSource` type and `source` field to `AttendanceRow`:

```typescript
export type AttendanceSource = 'manual' | 'biometric';

// AttendanceRow gains:
source: AttendanceSource | null;
```

### 4.2 `hr-attendance-actions.ts`

`confirmAttendanceAction` accepts an optional `source` parameter (default `'manual'`):

```typescript
export async function confirmAttendanceAction(
  date: string,
  rows: AttendancePreviewRow[],
  source: AttendanceSource = 'manual'
): Promise<{ saved: number; skipped: number; error?: string }>
```

The upsert includes `source` in the inserted record.

### 4.3 `import-attendance-dialog.tsx`

`ImportAttendanceDialog` accepts a `source` prop:

```typescript
type Props = {
  open: boolean;
  defaultDate: string;
  source: AttendanceSource;   // 'manual' | 'biometric'
  onClose: () => void;
  onSaved: () => void;
};
```

Dialog title changes: "Import Attendance" for manual, "Biometric Upload" for biometric. Passes `source` to `confirmAttendanceAction`.

### 4.4 `attendance-board.tsx`

- Import button: `source='manual'`
- Biometric Upload button: `source='biometric'`
- Table adds `source` column with `Bio` chip / `Manual` text
- `fetchRows` response now includes `source` field on each row

### 4.5 `hr-attendance-queries.ts`

`getAttendanceDayView` selects `source` from `hr_attendance_records` and includes it in `AttendanceRow`.

### 4.6 `src/app/api/hr/attendance/day-view/route.ts`

No changes needed — passes through whatever `getAttendanceDayView` returns.

### 4.7 `src/app/beithady/hr/page.tsx`

- Update Biometric Upload tile `href` from `/beithady/hr/biometric` to `/beithady/hr/attendance`
- Remove `disabled: true` and `comingSoonLabel: 'Sprint 5'`

---

## 5. File Structure

```
supabase/migrations/
  0129_hr_attendance_source.sql     — add source column

src/lib/beithady/hr/
  hr-attendance-types.ts            — MODIFY: add AttendanceSource, source field on AttendanceRow
  hr-attendance-actions.ts          — MODIFY: confirmAttendanceAction accepts source param
  hr-attendance-queries.ts          — MODIFY: select source column in getAttendanceDayView

src/app/beithady/hr/attendance/_components/
  import-attendance-dialog.tsx      — MODIFY: accept + pass source prop
  attendance-board.tsx              — MODIFY: biometric button + source column in table

src/app/beithady/hr/
  page.tsx                          — MODIFY: activate Sprint 5 tile, href → /beithady/hr/attendance
```

---

## 6. Out of Scope (Sprint 5)

- Parsing proprietary biometric device formats (ZKTeco, etc.) — device already exports standard XLSX
- Biometric device API integration
- Conflict resolution when biometric + manual records disagree for the same employee/date
- Separate `/beithady/hr/biometric` page
