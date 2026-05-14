
## 2026-05-13T14:30 UTC — Task 2: Shared TypeScript Types (HC Estimator)

**COMPLETED** ✓

Created `src/lib/beithady/hc-estimator-types.ts` with comprehensive type definitions for the Head Count Estimator module:

- **Core domain types:** BuildingKey, UnitTypeCounts, DayData, HKBaseData
- **Input types:** HKBuildingInput, HKInputs
- **Output types:** HKDayResult, HKWeekResult, HKMonthResult
- **Security types:** SecurityPost, SecurityBuildingConfig, SecurityResult

All types follow strict TypeScript conventions (no optional fields, explicit unions for building codes). Buildings list includes BH-26, BH-73, BH-435, BH-OK.

Committed: 1 file changed, 121 insertions

## 2026-05-13: Task 3 - Unit Type Resolver Helper (HC-Estimator)

**Status:** DONE

**What was created:**
- `src/lib/beithady/hc-unit-type.ts` — Pure utility module for resolving unit types from Guesty listing IDs
  - `resolveUnitType(listingId)` — Checks tags (BH-ST, BH-1BR, BH-2BR, BH-3BR, BH-4BR) first, then falls back to regex title parsing (e.g., "studio", "1 br", "2 bedroom"). Returns one of: `studio | oneBR | twoBR | threeBR | fourBR | null`.
  - `isLargeUnit(type)` — Predicate for 2BR+ units (used in occupancy capacity rules).
  - Exported type `UnitTypeKey = keyof UnitTypeCounts` for type safety in downstream consumers.

**Commit:**
- `feat(hc-estimator): unit type resolver from catalog` (9de2643)

**No concerns.** File is self-contained and ready for use by HC estimator and other HC-related modules.


## 2026-05-14T11:19 UTC — Beithady HR Sprint 3 · Task 6: Salary Access Page (FINAL)

**COMPLETED** ✓

### Deliverables

1. **Created `src/app/beithady/hr/salary-access/page.tsx`**
   - Server-side route with `force-dynamic` export
   - Auth gate: `requireBeithadyPermission('hr', 'full')`
   - Fetches users via `listSalaryAccessUsers()` → passes to `SalaryAccessBoard` as `initialUsers`
   - Shell: breadcrumbs `People` → `Salary Access`, title, subtitle
   - Reuses `BeithadyShell` + `BeithadyHeader` pattern from payroll page

2. **Activated Salary Access tile on HR hub**
   - Removed `disabled: true` + `comingSoonLabel: 'Sprint 3'` from `src/app/beithady/hr/page.tsx`
   - Tile now live: users with `hr:read` can navigate to the page

### Test Results

```
Test Files  92 passed | 3 skipped (95)
Tests       491 passed | 22 skipped (513)
Duration    4.11s
```

**All tests passing.** ✓

### Deployment

```
Commit:   96f3013 feat(hr): Salary Access page + activate Sprint 3 tile on HR hub — Sprint 3 complete
Pushed:   origin/main (96f3013)
Vercel:   Auto-deploy via GitHub integration (limeinc.vercel.app)
```

**Sprint 3 complete.** All tasks delivered (Tasks 1–6):
- ✓ Task 1: SalaryAccessUser types + listSalaryAccessUsers query
- ✓ Task 2: setSalaryAccessTierAction (upsert)
- ✓ Task 3: TierChip component with popover tier-picker
- ✓ Task 4: SalaryAccessBoard (5-tier grid)
- ✓ Task 5: Page + auth gate + shell
- ✓ Task 6: Activate tile on HR hub (THIS SESSION)


## 2026-05-14 · AttendanceBoard Component (Task 7)

✅ **COMPLETE** — Created `src/app/beithady/hr/attendance/_components/attendance-board.tsx`

**File delivered:**
- Date/building/department filters with live refetch on `day-view` API
- Template download & import dialog trigger
- Full attendance table: name (English + Arabic), BH-ID, dept, building, status (present/absent/blank), approval state
- Per-row approve button (visible only to `canApprove` users with pending records)
- "Approve All Pending" footer button (batch approval)
- Pending/approved/not-recorded counts

**Commit:** 12f2ccb (`feat(hr): AttendanceBoard — date/filter/download/import/approve UI`)

**Tests:** All 530 passing, no failures

**Dependencies validated:**
- `ImportAttendanceDialog` imported & used on dialog open
- `approveAttendanceAction` & `approveAttendanceRowAction` wired for batch + row approvals
- Types from `hr-attendance-types.ts` & `hr-types.ts` all available
- Styling: Tailwind v4 dark theme (white/1–50, emerald/red/amber/violet status indicators)

**Next steps:** Task 8 (page-level `page.tsx` tying components + data together).

## 2026-05-14 Task 6 — HR Documents Expiry Cron

**Status:** DONE

**Work completed:**
- Created `src/app/api/cron/hr-documents-expiry/route.ts` — Daily 9 AM Cairo cron that:
  - Fetches documents expiring within 30 days via `getExpiringDocuments(30)`
  - Sends HR digest to ops alert phones with critical (≤7d) and upcoming (8-30d) breakdowns
  - Sends individual reminders to employees at 25-30d and 0-7d ranges via WhatsApp
  - DST-safe: registered in UTC 06:00 + 07:00, gates on Cairo hour == 9
  - Auth: checks `Authorization: Bearer $CRON_SECRET` or `?force=1&secret=...`
  
- Updated `vercel.json`: Added two new cron entries after hr-headcount-snapshot
  - `{ "path": "/api/cron/hr-documents-expiry", "schedule": "0 6 * * *" }`
  - `{ "path": "/api/cron/hr-documents-expiry", "schedule": "0 7 * * *" }`

**Test results:** 527 passed | 22 skipped (all green)

**Commit:** 9ab3391 feat(hr): documents expiry cron (9 AM Cairo DST-safe) — HR digest + individual reminders

**Deploy:** Pushed to main → GitHub auto-deploy triggered via Vercel integration (limeinc.vercel.app)
