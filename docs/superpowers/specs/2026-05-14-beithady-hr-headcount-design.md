# Beithady HR Module — Sprint 7: Headcount Report

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Sprint 7 of 11 — Live headcount grid + HC Estimator comparison + daily snapshot log

---

## 1. Overview

A single-page report at `/beithady/hr/headcount` with three stacked sections:

1. **Live Today Grid** — current `on_job` employee counts by building × department matrix
2. **Operational Staffing Comparison** — Housekeeping and Security actual vs. planned (HK only) per building
3. **Historical Log** — stored daily snapshots with date-range and building/department filters

A cron job runs daily at 9 AM Cairo time, upserts one row per building × department into `hr_headcount_snapshots`. The HC Estimator comparison reads the most recent `hc_snapshots` record (already written by the existing `hc-snapshot` cron) for planned HK figures.

**Active headcount definition:** employees with `status = 'on_job'` only. Probation, on_leave, suspended, and terminated are excluded.

---

## 2. Data Model

```sql
-- supabase/migrations/0131_hr_headcount.sql

create table public.hr_headcount_snapshots (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  building_code text not null,
  department    text not null,
  count         int  not null default 0,
  recorded_at   timestamptz not null default now(),
  constraint uq_hr_hc_snapshot unique (date, building_code, department)
);

create index idx_hr_hc_snap_date     on public.hr_headcount_snapshots(date desc);
create index idx_hr_hc_snap_building on public.hr_headcount_snapshots(building_code);
```

The unique constraint on `(date, building_code, department)` makes the cron idempotent — re-running on the same day upserts without duplicating rows.

---

## 3. Page Structure — `/beithady/hr/headcount`

### 3.1 Section 1: Live Today Grid

A matrix rendered server-side on every page load:

- **Rows:** all 13 departments (executive, finance, reservations, real_estate, engineering, operations, housekeeping, security, maintenance, front_of_house, drivers, storekeeping, lifeguard)
- **Columns:** BH-26 · BH-73 · BH-435 · BH-OK · Head Office · Other · **Total**
- **Cell value:** count of `hr_employees` rows with `status = 'on_job'` for that building × department combination
- Cells with 0 displayed dimmed (`text-white/20`)
- **Totals row** at the bottom (sum of each column)
- **Total column** on the right (sum of each row)
- No client-side interactivity — purely server-rendered, refreshes on page reload

### 3.2 Section 2: Operational Staffing Comparison

A compact table — one row per building (BH-26, BH-73, BH-435, BH-OK only; HEAD_OFFICE and OTHER excluded as they don't have operational HK/security):

| Building | HK On-Job | HK Planned | HK Δ | Security On-Job |
|----------|-----------|------------|------|-----------------|

- **HK On-Job:** count of `on_job` employees with `department = 'housekeeping'` for that building
- **HK Planned:** total projected HK (`dayHKs + nightHKs + supervisors`) per building, derived by loading the most recent row from `hc_estimator_snapshots` (JSONB blob of `HKBaseData`), running it through the existing `calculateHK()` function from `src/lib/beithady/hc-estimator.ts`, and summing the on-shift peaks for each building. If no snapshot exists → "—"
- **HK Δ:** On-Job minus Planned. Green if ≥ 0, red if negative
- **Security On-Job:** count of `on_job` employees with `department = 'security'` for that building. No planned column (HC Estimator doesn't project security needs)

### 3.3 Section 3: Historical Log

`'use client'` component with:

- **Date range:** start date + end date inputs (default: last 30 days)
- **Building filter:** dropdown (All Buildings + individual options)
- **Department filter:** dropdown (All Departments + individual options)
- **Table:** Date · Building · Department · Count — sorted newest first
- Filter changes trigger a `GET /api/hr/headcount/history?from=&to=&building=&department=` fetch

---

## 4. Cron Job

**File:** `src/app/api/cron/hr-headcount-snapshot/route.ts`

**Schedule (vercel.json):** Two entries for DST safety:
```json
{ "path": "/api/cron/hr-headcount-snapshot", "schedule": "0 6 * * *" },
{ "path": "/api/cron/hr-headcount-snapshot", "schedule": "0 7 * * *" }
```
Handler gates on Cairo local hour == 9 (or `?force=1` to bypass).

**Logic:**
1. Verify `Authorization: Bearer $CRON_SECRET`
2. Check Cairo local hour == 9 (unless `?force=1`)
3. Query `hr_employees` grouped by `building_code, department` where `status = 'on_job'`
4. Upsert each group into `hr_headcount_snapshots` for today's date

---

## 5. API Route

**`GET /api/hr/headcount/history`**

Query params: `from` (date), `to` (date), `building` (optional), `department` (optional)

Returns: `{ rows: HeadcountSnapshot[] }`

Auth: `getCurrentUser()` — 401 if not authenticated.

---

## 6. Server Actions

No write actions needed from the UI — all writes go through the cron. The page is read-only.

---

## 7. Types

```typescript
// src/lib/beithady/hr/hr-headcount-types.ts

export type HeadcountSnapshot = {
  id: string;
  date: string;           // YYYY-MM-DD
  building_code: string;
  department: string;
  count: number;
  recorded_at: string;
};

// Live grid cell
export type GridCell = {
  building_code: string;
  department: string;
  count: number;
};

// HC Estimator comparison row (one per operational building)
export type HcComparisonRow = {
  building_code: string;
  hk_actual: number;
  hk_planned: number | null;  // null if no HC snapshot exists
  security_actual: number;
};
```

---

## 8. Queries

```typescript
// src/lib/beithady/hr/hr-headcount-queries.ts  (server-only)

// getLiveHeadcount() — query hr_employees grouped by building_code + department
// getHcComparison()  — query hr_employees for HK+Security counts; load most recent hc_estimator_snapshots
//                      JSONB blob, run calculateHK() to get per-building planned totals
// getHeadcountHistory(filters) — query hr_headcount_snapshots with date range + optional filters
```

---

## 9. File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0131_hr_headcount.sql` | Create | hr_headcount_snapshots table + indexes |
| `src/lib/beithady/hr/hr-headcount-types.ts` | Create | HeadcountSnapshot, GridCell, HcComparisonRow |
| `src/lib/beithady/hr/hr-headcount-queries.ts` | Create | getLiveHeadcount, getHcComparison, getHeadcountHistory |
| `src/app/api/cron/hr-headcount-snapshot/route.ts` | Create | Daily 9 AM Cairo cron — upserts snapshot |
| `src/app/api/hr/headcount/history/route.ts` | Create | GET with date range + filters |
| `src/app/beithady/hr/headcount/_components/headcount-grid.tsx` | Create | Live matrix (server component) |
| `src/app/beithady/hr/headcount/_components/hc-comparison.tsx` | Create | HK+Security comparison table |
| `src/app/beithady/hr/headcount/_components/headcount-history.tsx` | Create | 'use client' filtered history |
| `src/app/beithady/hr/headcount/page.tsx` | Create | Server page, auth-gated |
| `src/app/beithady/hr/page.tsx` | Modify | Remove disabled + comingSoonLabel from Sprint 7 tile |
| `vercel.json` | Modify | Add 2 cron entries for hr-headcount-snapshot |

---

## 10. Access Control

- Page visible: `requireBeithadyPermission('hr', 'read')`
- All data is read-only — no write actions from the UI
- Cron route: `Authorization: Bearer $CRON_SECRET`

---

## 11. Out of Scope (Sprint 7)

- Security planned headcount (no projection model exists)
- Per-shift headcount tracking (day/night split for HR employees)
- Headcount targets / budgeted FTE per department
- Email/WhatsApp alerts when actual falls below planned
- Chart/graph view of historical trends (table only for now)
