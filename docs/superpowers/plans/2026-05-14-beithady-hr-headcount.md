# Beithady HR Sprint 7: Headcount Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/beithady/hr/headcount` — a read-only page showing a live headcount grid, HK+Security comparison vs HC Estimator planned totals, a filterable daily snapshot history, and a monthly averages matrix.

**Architecture:** One new DB table (`hr_headcount_snapshots`) stores one row per date/building/department, populated by a DST-safe 9 AM Cairo cron. A server-only query layer computes the live grid, HC comparison, history, and monthly averages. Four display components (two pure, two client-side) render the four page sections. No write actions from the UI.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind v4 · Supabase (supabaseAdmin) · Vitest · `hk-calc.ts` (existing) · `hr-types.ts` (existing building/department constants)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0131_hr_headcount.sql` | Create | hr_headcount_snapshots table + indexes |
| `src/lib/beithady/hr/hr-headcount-types.ts` | Create | Pure types + `calcHcDelta()` helper |
| `src/lib/beithady/hr/hr-headcount-types.test.ts` | Create | TDD tests for `calcHcDelta` |
| `src/lib/beithady/hr/hr-headcount-queries.ts` | Create | getLiveHeadcount, getHcComparison, getHeadcountHistory, getMonthlyAvgHeadcount |
| `src/app/api/cron/hr-headcount-snapshot/route.ts` | Create | 9 AM Cairo cron — upserts snapshot |
| `src/app/api/hr/headcount/history/route.ts` | Create | GET filtered daily history |
| `src/app/api/hr/headcount/monthly-avg/route.ts` | Create | GET monthly averages |
| `src/app/beithady/hr/headcount/_components/headcount-grid.tsx` | Create | Section 1 live matrix (pure display) |
| `src/app/beithady/hr/headcount/_components/hc-comparison.tsx` | Create | Section 2 HK+Security comparison (pure display) |
| `src/app/beithady/hr/headcount/_components/headcount-history.tsx` | Create | Section 3 filterable log ('use client') |
| `src/app/beithady/hr/headcount/_components/headcount-monthly-avg.tsx` | Create | Section 4 monthly avg grid ('use client') |
| `src/app/beithady/hr/headcount/page.tsx` | Create | Server page, auth-gated |
| `src/app/beithady/hr/page.tsx` | Modify | Remove disabled + comingSoonLabel from Sprint 7 tile |
| `vercel.json` | Modify | Add 2 cron entries for hr-headcount-snapshot |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/0131_hr_headcount.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0131_hr_headcount.sql
-- Beithady HR Sprint 7 — Headcount Report

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

- [ ] **Step 2: Apply to Supabase**

Paste into Supabase dashboard SQL Editor for project `bpjproljatbrbmszwbov` and run. Verify no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0131_hr_headcount.sql
git commit -m "feat(hr): migration 0131 — hr_headcount_snapshots table"
```

---

## Task 2: Types + TDD

**Files:**
- Create: `src/lib/beithady/hr/hr-headcount-types.ts`
- Create: `src/lib/beithady/hr/hr-headcount-types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/beithady/hr/hr-headcount-types.test.ts
import { describe, it, expect } from 'vitest';
import { calcHcDelta } from './hr-headcount-types';

describe('calcHcDelta', () => {
  it('returns null when planned is null', () => {
    expect(calcHcDelta(10, null)).toBeNull();
  });
  it('positive delta when actual > planned', () => {
    expect(calcHcDelta(12, 10)).toBe(2);
  });
  it('negative delta when actual < planned', () => {
    expect(calcHcDelta(8, 10)).toBe(-2);
  });
  it('zero when equal', () => {
    expect(calcHcDelta(10, 10)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run hr-headcount-types
```

Expected: FAIL — `calcHcDelta` not found.

- [ ] **Step 3: Write the types + implementation**

```typescript
// src/lib/beithady/hr/hr-headcount-types.ts
// Pure types + helpers. No imports. Safe for any context.

// ── DB row shape ──────────────────────────────────────────────────────────────

export type HeadcountSnapshot = {
  id: string;
  date: string;           // YYYY-MM-DD
  building_code: string;
  department: string;
  count: number;
  recorded_at: string;
};

// ── Live grid ─────────────────────────────────────────────────────────────────

export type GridCell = {
  building_code: string;
  department: string;
  count: number;
};

// ── HC comparison ─────────────────────────────────────────────────────────────

// Per-building actual counts (HK + Security)
export type HcComparisonRow = {
  building_code: string;
  hk_actual: number;
  security_actual: number;
};

// Portfolio-level: per-building actuals + total planned HK from HC Estimator
export type HcComparisonData = {
  buildings: HcComparisonRow[];
  total_hk_actual: number;
  total_hk_planned: number | null;   // null if no hc_estimator_snapshots row exists
  total_security_actual: number;
};

// ── Monthly averages ──────────────────────────────────────────────────────────

export type MonthlyAvgCell = {
  building_code: string;
  department: string;
  avg_count: number;   // rounded to 1 decimal place
};

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Returns actual - planned, or null if planned is unknown.
 * Positive = over-staffed, negative = under-staffed.
 */
export function calcHcDelta(actual: number, planned: number | null): number | null {
  if (planned === null) return null;
  return actual - planned;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- --run hr-headcount-types
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/hr/hr-headcount-types.ts \
        src/lib/beithady/hr/hr-headcount-types.test.ts
git commit -m "feat(hr): headcount types + calcHcDelta helper — TDD"
```

---

## Task 3: Server-Only Queries

**Files:**
- Create: `src/lib/beithady/hr/hr-headcount-queries.ts`

- [ ] **Step 1: Write the queries file**

```typescript
// src/lib/beithady/hr/hr-headcount-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateHKWeeks } from '@/lib/beithady/hk-calc';
import type { HKInputs, HKBaseData } from '@/lib/beithady/hc-estimator-types';
import type {
  GridCell, HcComparisonData, HcComparisonRow, HeadcountSnapshot, MonthlyAvgCell,
} from './hr-headcount-types';

// Operational buildings only (no HEAD_OFFICE / OTHER for HK comparison)
const OPS_BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK'] as const;

// Default HK inputs — zeros for area hours / night shift (matching HC Estimator defaults)
const DEFAULT_HK_INPUTS: HKInputs = {
  multiplier: 1,
  buildings: {
    'BH-26':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-73':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-435': { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-OK':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
  },
};

// ── Section 1: Live headcount grid ────────────────────────────────────────────

export async function getLiveHeadcount(): Promise<GridCell[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_employees')
    .select('building_code, department')
    .eq('status', 'on_job');
  if (error) throw new Error(error.message);

  const map = new Map<string, number>();
  for (const e of (data ?? []) as { building_code: string | null; department: string }[]) {
    const bc = e.building_code ?? 'OTHER';
    const key = `${bc}__${e.department}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries()).map(([key, count]) => {
    const sep = key.indexOf('__');
    return { building_code: key.slice(0, sep), department: key.slice(sep + 2), count };
  });
}

// ── Section 2: HK + Security comparison vs HC Estimator planned ───────────────

export async function getHcComparison(): Promise<HcComparisonData> {
  const sb = supabaseAdmin();

  // Actual HK + Security on_job per operational building
  const { data: emps, error: eErr } = await sb
    .from('hr_employees')
    .select('building_code, department')
    .eq('status', 'on_job')
    .in('department', ['housekeeping', 'security'])
    .in('building_code', OPS_BUILDINGS as unknown as string[]);
  if (eErr) throw new Error(eErr.message);

  const hkMap  = new Map<string, number>();
  const secMap = new Map<string, number>();
  for (const e of (emps ?? []) as { building_code: string; department: string }[]) {
    if (e.department === 'housekeeping') {
      hkMap.set(e.building_code, (hkMap.get(e.building_code) ?? 0) + 1);
    } else {
      secMap.set(e.building_code, (secMap.get(e.building_code) ?? 0) + 1);
    }
  }

  const buildings: HcComparisonDataRow[] = OPS_BUILDINGS.map(b => ({
    building_code:    b,
    hk_actual:       hkMap.get(b) ?? 0,
    security_actual: secMap.get(b) ?? 0,
  }));

  const total_hk_actual       = buildings.reduce((s, b) => s + b.hk_actual, 0);
  const total_security_actual = buildings.reduce((s, b) => s + b.security_actual, 0);

  // Planned HK — load most recent HC Estimator snapshot and compute
  const { data: snap } = await sb
    .from('hc_estimator_snapshots')
    .select('data')
    .order('month_key', { ascending: false })
    .limit(1)
    .maybeSingle();

  let total_hk_planned: number | null = null;
  if (snap) {
    try {
      const result = calculateHKWeeks(snap.data as HKBaseData, DEFAULT_HK_INPUTS);
      total_hk_planned = result.grandTotalOnShift;
    } catch {
      // Malformed snapshot — leave planned as null
    }
  }

  return { buildings, total_hk_actual, total_hk_planned, total_security_actual };
}

// ── Section 3: Historical snapshots ──────────────────────────────────────────

export async function getHeadcountHistory(filters: {
  from?: string;   // YYYY-MM-DD
  to?: string;
  building_code?: string;
  department?: string;
} = {}): Promise<HeadcountSnapshot[]> {
  const sb = supabaseAdmin();

  let q = sb
    .from('hr_headcount_snapshots')
    .select('*')
    .order('date', { ascending: false })
    .order('building_code')
    .order('department');

  if (filters.from)          q = q.gte('date', filters.from);
  if (filters.to)            q = q.lte('date', filters.to);
  if (filters.building_code) q = q.eq('building_code', filters.building_code);
  if (filters.department)    q = q.eq('department', filters.department);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as HeadcountSnapshot[];
}

// ── Section 4: Monthly averages ──────────────────────────────────────────────

export async function getMonthlyAvgHeadcount(month: string): Promise<{
  rows: MonthlyAvgCell[];
  days_recorded: number;
}> {
  const sb = supabaseAdmin();
  const from = `${month}-01`;
  const to   = `${month}-31`;   // Supabase date filter handles month boundaries

  const { data, error } = await sb
    .from('hr_headcount_snapshots')
    .select('date, building_code, department, count')
    .gte('date', from)
    .lte('date', to);
  if (error) throw new Error(error.message);

  type Row = { date: string; building_code: string; department: string; count: number };
  const rows = (data ?? []) as Row[];

  const dates = new Set(rows.map(r => r.date));
  const days_recorded = dates.size;
  if (days_recorded === 0) return { rows: [], days_recorded: 0 };

  const sumMap = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.building_code}__${r.department}`;
    sumMap.set(key, (sumMap.get(key) ?? 0) + r.count);
  }

  const avgRows: MonthlyAvgCell[] = Array.from(sumMap.entries()).map(([key, total]) => {
    const sep = key.indexOf('__');
    return {
      building_code: key.slice(0, sep),
      department:    key.slice(sep + 2),
      avg_count:     Math.round((total / days_recorded) * 10) / 10,
    };
  });

  return { rows: avgRows, days_recorded };
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all existing tests pass (≥513).

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-headcount-queries.ts
git commit -m "feat(hr): headcount server-only queries — live grid, HC comparison, history, monthly avg"
```

---

## Task 4: Cron Route + vercel.json

**Files:**
- Create: `src/app/api/cron/hr-headcount-snapshot/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the cron route**

```typescript
// src/app/api/cron/hr-headcount-snapshot/route.ts
// Daily 9 AM Cairo — upserts on_job headcount per building×department into hr_headcount_snapshots.
// DST-safe: vercel.json registers UTC 06:00 + 07:00; handler gates on Cairo hour == 9.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

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
    const sb    = supabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    // Count on_job employees grouped by building_code + department
    const { data: emps, error: eErr } = await sb
      .from('hr_employees')
      .select('building_code, department')
      .eq('status', 'on_job');
    if (eErr) throw new Error(eErr.message);

    const countMap = new Map<string, { building_code: string; department: string; count: number }>();
    for (const e of (emps ?? []) as { building_code: string | null; department: string }[]) {
      const bc  = e.building_code ?? 'OTHER';
      const key = `${bc}__${e.department}`;
      const existing = countMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        countMap.set(key, { building_code: bc, department: e.department, count: 1 });
      }
    }

    const rows = Array.from(countMap.values()).map(r => ({
      date:          today,
      building_code: r.building_code,
      department:    r.department,
      count:         r.count,
    }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, upserted: 0, date: today });
    }

    const { error: uErr } = await sb
      .from('hr_headcount_snapshots')
      .upsert(rows, { onConflict: 'date,building_code,department' });
    if (uErr) throw new Error(uErr.message);

    return NextResponse.json({ ok: true, upserted: rows.length, date: today });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Add cron entries to vercel.json**

Open `vercel.json`. Find the `crons` array closing bracket (`]`) — currently the last entry is:
```json
    { "path": "/api/cron/hc-snapshot", "schedule": "0 6 15 * *" }
  ]
```

Replace that closing section with:
```json
    { "path": "/api/cron/hc-snapshot",              "schedule": "0 6 15 * *" },
    { "path": "/api/cron/hr-headcount-snapshot",     "schedule": "0 6 * * *"  },
    { "path": "/api/cron/hr-headcount-snapshot",     "schedule": "0 7 * * *"  }
  ]
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/hr-headcount-snapshot/route.ts vercel.json
git commit -m "feat(hr): headcount snapshot cron (9 AM Cairo DST-safe) + vercel.json schedule"
```

---

## Task 5: API Routes

**Files:**
- Create: `src/app/api/hr/headcount/history/route.ts`
- Create: `src/app/api/hr/headcount/monthly-avg/route.ts`

- [ ] **Step 1: Write the history route**

```typescript
// src/app/api/hr/headcount/history/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getHeadcountHistory } from '@/lib/beithady/hr/hr-headcount-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const from          = searchParams.get('from')         ?? undefined;
  const to            = searchParams.get('to')           ?? undefined;
  const building_code = searchParams.get('building')     ?? undefined;
  const department    = searchParams.get('department')   ?? undefined;

  const rows = await getHeadcountHistory({ from, to, building_code, department });
  return NextResponse.json({ rows });
}
```

- [ ] **Step 2: Write the monthly-avg route**

```typescript
// src/app/api/hr/headcount/monthly-avg/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMonthlyAvgHeadcount } from '@/lib/beithady/hr/hr-headcount-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = request.nextUrl.searchParams.get('month')
    ?? new Date().toISOString().slice(0, 7);

  const result = await getMonthlyAvgHeadcount(month);
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/hr/headcount/history/route.ts \
        src/app/api/hr/headcount/monthly-avg/route.ts
git commit -m "feat(hr): headcount API routes — GET /history + GET /monthly-avg"
```

---

## Task 6: HeadcountGrid Component (Section 1)

**Files:**
- Create: `src/app/beithady/hr/headcount/_components/headcount-grid.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/headcount/_components/headcount-grid.tsx
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode, Department } from '@/lib/beithady/hr/hr-types';
import type { GridCell } from '@/lib/beithady/hr/hr-headcount-types';

type Props = { cells: GridCell[] };

const DISPLAY_BUILDINGS = BUILDING_CODES as readonly BuildingCode[];

export function HeadcountGrid({ cells }: Props) {
  // Build lookup map
  const map = new Map<string, number>();
  for (const c of cells) {
    map.set(`${c.building_code}__${c.department}`, c.count);
  }
  const cell = (b: string, d: string) => map.get(`${b}__${d}`) ?? 0;

  // Column totals (per building)
  const colTotal = (b: string) => DEPARTMENTS.reduce((s, d) => s + cell(b, d), 0);
  // Row totals (per department)
  const rowTotal = (d: string) => DISPLAY_BUILDINGS.reduce((s, b) => s + cell(b, d), 0);
  // Grand total
  const grandTotal = DEPARTMENTS.reduce((s, d) => s + rowTotal(d), 0);

  return (
    <div>
      <h2 className="text-sm font-semibold text-white/70 mb-3">Live Headcount — Today</h2>
      <div className="rounded-xl border border-white/10 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
              <th className="px-4 py-3 sticky left-0 bg-neutral-900">Department</th>
              {DISPLAY_BUILDINGS.map(b => (
                <th key={b} className="px-3 py-3 text-center">{BUILDING_LABELS[b]}</th>
              ))}
              <th className="px-3 py-3 text-center font-semibold text-white/60">Total</th>
            </tr>
          </thead>
          <tbody>
            {DEPARTMENTS.map(dept => {
              const total = rowTotal(dept);
              return (
                <tr key={dept} className="border-b border-white/5 hover:bg-white/3">
                  <td className="px-4 py-2 sticky left-0 bg-neutral-900 text-white/70 text-xs">
                    {DEPARTMENT_LABELS[dept as Department]}
                  </td>
                  {DISPLAY_BUILDINGS.map(b => {
                    const n = cell(b, dept);
                    return (
                      <td key={b} className={`px-3 py-2 text-center text-sm ${n === 0 ? 'text-white/20' : 'text-white font-medium'}`}>
                        {n === 0 ? '—' : n}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2 text-center text-sm font-semibold ${total === 0 ? 'text-white/20' : 'text-white'}`}>
                    {total === 0 ? '—' : total}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/20 bg-white/3">
              <td className="px-4 py-2.5 sticky left-0 bg-neutral-900 text-xs font-semibold text-white/60 uppercase tracking-wide">
                Total
              </td>
              {DISPLAY_BUILDINGS.map(b => {
                const n = colTotal(b);
                return (
                  <td key={b} className={`px-3 py-2.5 text-center text-sm font-semibold ${n === 0 ? 'text-white/20' : 'text-emerald-400'}`}>
                    {n === 0 ? '—' : n}
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-center text-sm font-bold text-emerald-300">
                {grandTotal}
              </td>
            </tr>
          </tfoot>
        </table>
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
git add src/app/beithady/hr/headcount/_components/headcount-grid.tsx
git commit -m "feat(hr): HeadcountGrid — live dept×building matrix with totals"
```

---

## Task 7: HcComparisonData Component (Section 2)

**Files:**
- Create: `src/app/beithady/hr/headcount/_components/hc-comparison.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/headcount/_components/hc-comparison.tsx
import { BUILDING_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode } from '@/lib/beithady/hr/hr-types';
import { calcHcDelta } from '@/lib/beithady/hr/hr-headcount-types';
import type { HcComparisonData } from '@/lib/beithady/hr/hr-headcount-types';

type Props = { data: HcComparisonData };

export function HcComparison({ data }: Props) {
  const delta = calcHcDelta(data.total_hk_actual, data.total_hk_planned);

  return (
    <div>
      <h2 className="text-sm font-semibold text-white/70 mb-3">Operational Staffing — HK & Security</h2>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3 text-center">HK On-Job</th>
              <th className="px-4 py-3 text-center">Security On-Job</th>
            </tr>
          </thead>
          <tbody>
            {data.buildings.map(b => (
              <tr key={b.building_code} className="border-b border-white/5 hover:bg-white/3">
                <td className="px-4 py-2.5 text-white/70 text-sm">
                  {BUILDING_LABELS[b.building_code as BuildingCode] ?? b.building_code}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-sm font-medium ${b.hk_actual === 0 ? 'text-white/20' : 'text-white'}`}>
                    {b.hk_actual === 0 ? '—' : b.hk_actual}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-sm font-medium ${b.security_actual === 0 ? 'text-white/20' : 'text-white'}`}>
                    {b.security_actual === 0 ? '—' : b.security_actual}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/20 bg-white/3">
              <td className="px-4 py-2.5 text-xs font-semibold text-white/60 uppercase tracking-wide">
                Portfolio Total
              </td>
              <td className="px-4 py-2.5 text-center">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm font-bold text-white">{data.total_hk_actual}</span>
                  {data.total_hk_planned !== null ? (
                    <span className="text-xs text-white/40">
                      of {data.total_hk_planned} planned
                      {delta !== null && (
                        <span className={`ml-1 font-semibold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          ({delta >= 0 ? '+' : ''}{delta})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-white/30">no HC snapshot</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5 text-center">
                <span className="text-sm font-bold text-white">{data.total_security_actual}</span>
              </td>
            </tr>
          </tfoot>
        </table>
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
git add src/app/beithady/hr/headcount/_components/hc-comparison.tsx
git commit -m "feat(hr): HcComparisonData — HK+Security per building with portfolio planned delta"
```

---

## Task 8: HeadcountHistory Component (Section 3)

**Files:**
- Create: `src/app/beithady/hr/headcount/_components/headcount-history.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/headcount/_components/headcount-history.tsx
'use client';

import { useState } from 'react';
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode, Department } from '@/lib/beithady/hr/hr-types';
import type { HeadcountSnapshot } from '@/lib/beithady/hr/hr-headcount-types';

type Props = { initialRows: HeadcountSnapshot[] };

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export function HeadcountHistory({ initialRows }: Props) {
  const [rows, setRows]       = useState(initialRows);
  const [from, setFrom]       = useState(defaultFrom());
  const [to, setTo]           = useState(defaultTo());
  const [building, setBuilding] = useState('');
  const [dept, setDept]       = useState('');

  async function fetchRows(f: string, t: string, b: string, d: string) {
    const params = new URLSearchParams({ from: f, to: t });
    if (b) params.set('building', b);
    if (d) params.set('department', d);
    const res = await fetch(`/api/hr/headcount/history?${params}`);
    if (res.ok) {
      const { rows: r } = await res.json() as { rows: HeadcountSnapshot[] };
      setRows(r);
    }
  }

  function handleFrom(v: string)  { setFrom(v);     fetchRows(v, to, building, dept); }
  function handleTo(v: string)    { setTo(v);       fetchRows(from, v, building, dept); }
  function handleBuilding(v: string) { setBuilding(v); fetchRows(from, to, v, dept); }
  function handleDept(v: string)  { setDept(v);     fetchRows(from, to, building, v); }

  return (
    <div>
      <h2 className="text-sm font-semibold text-white/70 mb-3">Daily Snapshot History</h2>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="date" value={from} onChange={e => handleFrom(e.target.value)} className="ix-input text-sm" />
        <input type="date" value={to}   onChange={e => handleTo(e.target.value)}   className="ix-input text-sm" />
        <select value={building} onChange={e => handleBuilding(e.target.value)} className="ix-input text-sm">
          <option value="">All Buildings</option>
          {(BUILDING_CODES as readonly string[]).map(b => (
            <option key={b} value={b}>{BUILDING_LABELS[b as BuildingCode] ?? b}</option>
          ))}
        </select>
        <select value={dept} onChange={e => handleDept(e.target.value)} className="ix-input text-sm">
          <option value="">All Departments</option>
          {DEPARTMENTS.map(d => (
            <option key={d} value={d}>{DEPARTMENT_LABELS[d as Department]}</option>
          ))}
        </select>
      </div>
      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-white/30 italic">
                  No snapshots found for this filter.
                </td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/3">
                <td className="px-4 py-2 text-white/60 font-mono text-xs">{r.date}</td>
                <td className="px-4 py-2 text-white/70 text-sm">
                  {BUILDING_LABELS[r.building_code as BuildingCode] ?? r.building_code}
                </td>
                <td className="px-4 py-2 text-white/70 text-sm">
                  {DEPARTMENT_LABELS[r.department as Department] ?? r.department}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className={`text-sm font-medium ${r.count === 0 ? 'text-white/20' : 'text-white'}`}>
                    {r.count}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-white/30">{rows.length} records</p>
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
git add src/app/beithady/hr/headcount/_components/headcount-history.tsx
git commit -m "feat(hr): HeadcountHistory — filterable daily snapshot log"
```

---

## Task 9: HeadcountMonthlyAvg Component (Section 4)

**Files:**
- Create: `src/app/beithady/hr/headcount/_components/headcount-monthly-avg.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/beithady/hr/headcount/_components/headcount-monthly-avg.tsx
'use client';

import { useState } from 'react';
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode, Department } from '@/lib/beithady/hr/hr-types';
import type { MonthlyAvgCell } from '@/lib/beithady/hr/hr-headcount-types';

type Props = {
  initialRows: MonthlyAvgCell[];
  initialDaysRecorded: number;
};

const DISPLAY_BUILDINGS = BUILDING_CODES as readonly string[];

export function HeadcountMonthlyAvg({ initialRows, initialDaysRecorded }: Props) {
  const [rows, setRows]           = useState(initialRows);
  const [daysRecorded, setDays]   = useState(initialDaysRecorded);
  const [month, setMonth]         = useState(new Date().toISOString().slice(0, 7));

  async function fetchMonth(m: string) {
    const res = await fetch(`/api/hr/headcount/monthly-avg?month=${m}`);
    if (res.ok) {
      const { rows: r, days_recorded } = await res.json() as {
        rows: MonthlyAvgCell[];
        days_recorded: number;
      };
      setRows(r);
      setDays(days_recorded);
    }
  }

  function handleMonth(v: string) { setMonth(v); fetchMonth(v); }

  // Build lookup
  const map = new Map<string, number>();
  for (const c of rows) map.set(`${c.building_code}__${c.department}`, c.avg_count);
  const cell = (b: string, d: string) => map.get(`${b}__${d}`) ?? 0;

  // Totals
  const rowTotal   = (d: string) => DISPLAY_BUILDINGS.reduce((s, b) => s + cell(b, d), 0);
  const colTotal   = (b: string) => DEPARTMENTS.reduce((s, d) => s + cell(b, d), 0);
  const grandTotal = DEPARTMENTS.reduce((s, d) => s + rowTotal(d), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/70">Monthly Averages</h2>
        <div className="flex items-center gap-3">
          {daysRecorded > 0 && (
            <span className="text-xs text-white/30">Based on {daysRecorded} day{daysRecorded !== 1 ? 's' : ''} of data</span>
          )}
          <input
            type="month"
            value={month}
            onChange={e => handleMonth(e.target.value)}
            className="ix-input text-sm py-1"
          />
        </div>
      </div>

      {daysRecorded === 0 ? (
        <p className="text-center text-white/30 italic py-8 border border-white/10 rounded-xl">
          No data recorded for this month yet.
        </p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
                <th className="px-4 py-3 sticky left-0 bg-neutral-900">Department</th>
                {DISPLAY_BUILDINGS.map(b => (
                  <th key={b} className="px-3 py-3 text-center">
                    {BUILDING_LABELS[b as BuildingCode] ?? b}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-semibold text-white/60">Avg Total</th>
              </tr>
            </thead>
            <tbody>
              {DEPARTMENTS.map(dept => {
                const total = rowTotal(dept);
                return (
                  <tr key={dept} className="border-b border-white/5 hover:bg-white/3">
                    <td className="px-4 py-2 sticky left-0 bg-neutral-900 text-white/70 text-xs">
                      {DEPARTMENT_LABELS[dept as Department]}
                    </td>
                    {DISPLAY_BUILDINGS.map(b => {
                      const n = cell(b, dept);
                      return (
                        <td key={b} className={`px-3 py-2 text-center text-sm ${n === 0 ? 'text-white/20' : 'text-white/80'}`}>
                          {n === 0 ? '—' : n.toFixed(1)}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-center text-sm font-semibold ${total === 0 ? 'text-white/20' : 'text-white'}`}>
                      {total === 0 ? '—' : total.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/20 bg-white/3">
                <td className="px-4 py-2.5 sticky left-0 bg-neutral-900 text-xs font-semibold text-white/60 uppercase tracking-wide">
                  Avg Total
                </td>
                {DISPLAY_BUILDINGS.map(b => {
                  const n = colTotal(b);
                  return (
                    <td key={b} className={`px-3 py-2.5 text-center text-sm font-semibold ${n === 0 ? 'text-white/20' : 'text-emerald-400'}`}>
                      {n === 0 ? '—' : n.toFixed(1)}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center text-sm font-bold text-emerald-300">
                  {grandTotal.toFixed(1)}
                </td>
              </tr>
            </tfoot>
          </table>
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
git add src/app/beithady/hr/headcount/_components/headcount-monthly-avg.tsx
git commit -m "feat(hr): HeadcountMonthlyAvg — monthly avg grid with month picker"
```

---

## Task 10: Page + Activate Tile + Deploy

**Files:**
- Create: `src/app/beithady/hr/headcount/page.tsx`
- Modify: `src/app/beithady/hr/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// src/app/beithady/hr/headcount/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  getLiveHeadcount,
  getHcComparison,
  getHeadcountHistory,
  getMonthlyAvgHeadcount,
} from '@/lib/beithady/hr/hr-headcount-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { HeadcountGrid }      from './_components/headcount-grid';
import { HcComparison }           from './_components/hc-comparison';
import { HeadcountHistory }   from './_components/headcount-history';
import { HeadcountMonthlyAvg } from './_components/headcount-monthly-avg';

export const dynamic = 'force-dynamic';

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default async function HeadcountPage() {
  await requireBeithadyPermission('hr', 'read');

  const currentMonth = new Date().toISOString().slice(0, 7);
  const from         = defaultFrom();
  const to           = new Date().toISOString().slice(0, 10);

  const [cells, comparison, historyRows, monthlyAvg] = await Promise.all([
    getLiveHeadcount(),
    getHcComparison(),
    getHeadcountHistory({ from, to }),
    getMonthlyAvgHeadcount(currentMonth),
  ]);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Headcount Report' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Headcount Report"
        subtitle="Live roster · HK & Security staffing · daily log · monthly averages"
      />
      <div className="space-y-10">
        <HeadcountGrid cells={cells} />
        <HcComparison data={comparison} />
        <HeadcountHistory initialRows={historyRows} />
        <HeadcountMonthlyAvg
          initialRows={monthlyAvg.rows}
          initialDaysRecorded={monthlyAvg.days_recorded}
        />
      </div>
    </BeithadyShell>
  );
}
```

- [ ] **Step 2: Activate the hub tile**

In `src/app/beithady/hr/page.tsx`, find:

```typescript
    {
      href: '/beithady/hr/headcount',
      title: 'Headcount Report',
      description: 'Daily manpower by scope & role. Cross-references HC Estimator planned vs. actual.',
      icon: BarChart3,
      accent: 'slate',
      disabled: true,
      comingSoonLabel: 'Sprint 7',
    },
```

Replace with:

```typescript
    {
      href: '/beithady/hr/headcount',
      title: 'Headcount Report',
      description: 'Daily manpower by scope & role. Cross-references HC Estimator planned vs. actual.',
      icon: BarChart3,
      accent: 'slate',
    },
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Deploy**

```bash
git add src/app/beithady/hr/headcount/page.tsx src/app/beithady/hr/page.tsx
git commit -m "feat(hr): Headcount Report page + activate Sprint 7 tile — Sprint 7 complete"
git fetch origin main
git rebase origin/main
git push origin HEAD:main
vercel --prod --yes
```
