# Head Count Estimator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-tab Head Count Estimator module under BH Analytics that calculates Housekeeping and Security staffing needs from last month's Guesty reservation data.

**Architecture:** Server component fetches + aggregates last month's Guesty reservation data once on page load (or serves a cached snapshot after the 15th of the month); client component holds all user inputs in React state and recalculates synchronously on every change. Security tab is fully client-side with no server data.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (project `bpjproljatbrbmszwbov`), recharts, lucide-react, Vitest

---

## Pre-flight: Two spec corrections baked into this plan

1. Building code for OKAT is `'BH-OK'` everywhere in the codebase (not `'BH-OKAT'` as initially written in the spec).
2. `LauncherTile['accent']` does not include `teal` — use `'cyan'` instead.

---

## File Map

| File | Create/Modify | Responsibility |
|------|--------------|----------------|
| `src/lib/beithady/hc-estimator-types.ts` | Create | All shared TS types |
| `src/lib/beithady/hc-estimator.ts` | Create | Server-side aggregation, snapshot read/write |
| `src/lib/beithady/hc-estimator.test.ts` | Create | Vitest unit tests for aggregation |
| `src/lib/beithady/hk-calc.ts` | Create | Pure HK calculation engine |
| `src/lib/beithady/hk-calc.test.ts` | Create | Vitest unit tests for HK calc |
| `src/app/beithady/analytics/headcount/page.tsx` | Create | HK tab server component |
| `src/app/beithady/analytics/headcount/security/page.tsx` | Create | Security tab client component + full UI |
| `src/app/beithady/analytics/headcount/_components/hc-tabs.tsx` | Create | Tab nav (HK / Security) |
| `src/app/beithady/analytics/headcount/_components/hk-actuals-table.tsx` | Create | Read-only last-month actuals table |
| `src/app/beithady/analytics/headcount/_components/hk-weekly-table.tsx` | Create | Weekly breakdown table |
| `src/app/beithady/analytics/headcount/_components/hk-dashboard.tsx` | Create | KPI cards + recharts |
| `src/app/beithady/analytics/headcount/_components/hk-calculator.tsx` | Create | Client calculator shell (inputs + wires components) |
| `src/app/beithady/analytics/headcount/_components/security-building-card.tsx` | Create | Per-building posts table (add/remove rows) |
| `src/app/beithady/analytics/headcount/_components/security-dashboard.tsx` | Create | Security KPI cards + charts |
| `src/app/beithady/analytics/headcount/_components/security-calculator.tsx` | Create | Security client component (inputs + wires) |
| `src/app/api/cron/hc-snapshot/route.ts` | Create | Cron handler — 15th-of-month snapshot |
| `src/app/beithady/analytics/page.tsx` | Modify | Add HC Estimator tile to launcher |
| `vercel.json` | Modify | Register cron schedule |
| `supabase/migrations/0079_hc_estimator_snapshots.sql` | Create | New table |

---

## Task 1: Supabase migration — snapshot table

**Files:**
- Create: `supabase/migrations/0079_hc_estimator_snapshots.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0079_hc_estimator_snapshots.sql
create table if not exists hc_estimator_snapshots (
  id          uuid primary key default gen_random_uuid(),
  month_key   text not null unique,  -- "2026-04"
  data        jsonb not null,        -- serialised HKBaseData
  created_at  timestamptz default now()
);
```

- [ ] **Step 2: Apply via Supabase dashboard**

Open https://supabase.com/dashboard/project/bpjproljatbrbmszwbov/sql and paste + run the SQL above.

- [ ] **Step 3: Verify**

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'hc_estimator_snapshots';
```

Expected: one row returned.

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/0079_hc_estimator_snapshots.sql
git commit -m "feat(hc-estimator): migration — hc_estimator_snapshots table"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/lib/beithady/hc-estimator-types.ts`

- [ ] **Step 1: Write the types file**

```ts
// src/lib/beithady/hc-estimator-types.ts

export type BuildingKey = 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK';
export const BUILDINGS: BuildingKey[] = ['BH-26', 'BH-73', 'BH-435', 'BH-OK'];

export type UnitTypeCounts = {
  studio: number;
  oneBR: number;
  twoBR: number;
  threeBR: number;
  fourBR: number;
};

export type DayData = {
  date: string;           // "2026-04-03"
  building: BuildingKey;
  checkins: UnitTypeCounts;
  stayIns: number;        // occupied units not checking in or out today
  sameDayRollovers: number; // units with same-day checkout + checkin
};

export type HKBaseData = {
  month: string;                  // "April 2026"
  weeks: { week: 1 | 2 | 3 | 4; days: DayData[] }[];
  totalCheckins: UnitTypeCounts;  // portfolio total, all days
  totalRollovers: number;
  avgStayInsPerDay: number;
};

export type HKBuildingInput = {
  generalAreaHrsPerDay: number;
  nightShiftHKs: number;
};

export type HKInputs = {
  multiplier: number;
  buildings: Record<BuildingKey, HKBuildingInput>;
};

// --- Calculation output types ---

export type HKDayResult = {
  date: string;
  turnoverHrs: number;
  stayInHrs: number;
  areasHrs: number;
  totalHrs: number;
  dayHKsBaseline: number;
  rolloverPeakHKs: number;
  rolloverOverride: boolean;
  finalDayHKs: number;
  nightHKs: number;
  supervisors: number;
};

export type HKWeekResult = {
  week: 1 | 2 | 3 | 4;
  label: string;              // "W1 (Jun 1–7)"
  projectedCheckins: number;
  projectedRollovers: number;
  stayInHrs: number;
  areasHrs: number;
  totalHrs: number;
  dayHKs: number;             // peak day on-shift
  rolloverOverride: boolean;
  rolloverPeakHKs: number;    // peak rollover HKs for this week
  nightHKs: number;           // fixed, sum of building inputs
  supervisors: number;        // on-shift
};

export type HKMonthResult = {
  weeks: HKWeekResult[];
  peakWeek: 1 | 2 | 3 | 4;
  // On-shift peaks
  dayHKsOnShift: number;
  nightHKsOnShift: number;
  supervisorsOnShift: number;
  // To-hire (×7/6 coverage factor)
  dayHKsToHire: number;
  nightHKsToHire: number;
  supervisorsToHire: number;
  grandTotalOnShift: number;
  grandTotalToHire: number;
};

// --- Security types ---

export type SecurityPost = {
  id: string;           // uuid — client-generated for React key
  name: string;
  dayShift: number;
  nightShift: number;
  allDay: number;       // 24hr posts — counts as ×2 bodies
};

export type SecurityBuildingConfig = {
  building: BuildingKey;
  posts: SecurityPost[];
};

export type SecurityResult = {
  buildings: {
    building: BuildingKey;
    dayOnShift: number;
    nightOnShift: number;
    allDayBodies: number;   // allDay × 2
    totalOnShift: number;
    dayToHire: number;
    nightToHire: number;
    allDayToHire: number;
    totalToHire: number;
  }[];
  portfolioDayOnShift: number;
  portfolioNightOnShift: number;
  portfolioAllDayBodies: number;
  portfolioTotalOnShift: number;
  portfolioDayToHire: number;
  portfolioNightToHire: number;
  portfolioAllDayToHire: number;
  portfolioTotalToHire: number;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/beithady/hc-estimator-types.ts
git commit -m "feat(hc-estimator): shared TypeScript types"
```

---

## Task 3: Unit type resolver helper

**Files:**
- Create: `src/lib/beithady/hc-unit-type.ts`

This is a pure function (no server-only imports) so it can also be imported in tests.

- [ ] **Step 1: Write the resolver**

```ts
// src/lib/beithady/hc-unit-type.ts
import { getListingByGuestyId } from '@/lib/rules/beithady-listings';
import type { UnitTypeCounts } from './hc-estimator-types';

export type UnitTypeKey = keyof UnitTypeCounts;

export function resolveUnitType(listingId: string): UnitTypeKey | null {
  const cat = getListingByGuestyId(listingId);
  if (!cat) return null;

  if (cat.tags.includes('BH-ST')) return 'studio';
  if (cat.tags.includes('BH-1BR')) return 'oneBR';
  if (cat.tags.includes('BH-2BR')) return 'twoBR';
  if (cat.tags.includes('BH-3BR')) return 'threeBR';
  if (cat.tags.includes('BH-4BR')) return 'fourBR';

  const title = cat.title.toLowerCase();
  if (title.includes('studio')) return 'studio';
  if (/\b1[\s-]?br\b|\b1\s*bedroom\b/.test(title)) return 'oneBR';
  if (/\b2[\s-]?br\b|\b2\s*bedroom\b/.test(title)) return 'twoBR';
  if (/\b3[\s-]?br\b|\b3\s*bedroom\b/.test(title)) return 'threeBR';
  if (/\b4[\s-]?br\b|\b4\s*bedroom\b/.test(title)) return 'fourBR';

  return null;
}

export function isLargeUnit(type: UnitTypeKey): boolean {
  return type === 'twoBR' || type === 'threeBR' || type === 'fourBR';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/beithady/hc-unit-type.ts
git commit -m "feat(hc-estimator): unit type resolver from catalog"
```

---

## Task 4: Server-side aggregation + snapshot logic

**Files:**
- Create: `src/lib/beithady/hc-estimator.ts`
- Create: `src/lib/beithady/hc-estimator.test.ts`

- [ ] **Step 1: Write failing tests first**

```ts
// src/lib/beithady/hc-estimator.test.ts
import { describe, it, expect } from 'vitest';
import { getLastMonthKey, getLastMonthWindow, assignWeek } from './hc-estimator';

describe('getLastMonthKey', () => {
  it('returns YYYY-MM for last month', () => {
    const may2026 = new Date('2026-05-13T00:00:00Z');
    expect(getLastMonthKey(may2026)).toBe('2026-04');
  });

  it('handles January (wraps to previous year)', () => {
    const jan2027 = new Date('2027-01-15T00:00:00Z');
    expect(getLastMonthKey(jan2027)).toBe('2026-12');
  });
});

describe('getLastMonthWindow', () => {
  it('returns first and last day of previous month', () => {
    const may2026 = new Date('2026-05-13T00:00:00Z');
    const { from, to, label } = getLastMonthWindow(may2026);
    expect(from).toBe('2026-04-01');
    expect(to).toBe('2026-04-30');
    expect(label).toBe('April 2026');
  });
});

describe('assignWeek', () => {
  it('assigns day 1 to week 1', () => expect(assignWeek(1)).toBe(1));
  it('assigns day 7 to week 1', () => expect(assignWeek(7)).toBe(1));
  it('assigns day 8 to week 2', () => expect(assignWeek(8)).toBe(2));
  it('assigns day 14 to week 2', () => expect(assignWeek(14)).toBe(2));
  it('assigns day 15 to week 3', () => expect(assignWeek(15)).toBe(3));
  it('assigns day 22 to week 4', () => expect(assignWeek(22)).toBe(4));
  it('assigns day 31 to week 4', () => expect(assignWeek(31)).toBe(4));
});
```

- [ ] **Step 2: Run — expect failures**

```bash
npm run test -- hc-estimator.test
```

Expected: FAIL — `getLastMonthKey`, `getLastMonthWindow`, `assignWeek` not found.

- [ ] **Step 3: Write the aggregation module**

```ts
// src/lib/beithady/hc-estimator.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { bucketFromGuestyListing } from '@/lib/beithady-daily-report/units';
import { isExcludedFromReport } from '@/lib/beithady-daily-report/units';
import { resolveUnitType } from './hc-unit-type';
import type {
  BuildingKey,
  DayData,
  HKBaseData,
  UnitTypeCounts,
} from './hc-estimator-types';
import { BUILDINGS } from './hc-estimator-types';

// ─── Pure date helpers (also used by tests) ───────────────────────────────

export function getLastMonthKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getLastMonthWindow(now: Date): { from: string; to: string; label: string } {
  const firstOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastDay = new Date(firstOfThisMonth.getTime() - 86400_000);

  const from = firstOfLastMonth.toISOString().slice(0, 10);
  const to = lastDay.toISOString().slice(0, 10);
  const label = firstOfLastMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return { from, to, label };
}

export function assignWeek(dayOfMonth: number): 1 | 2 | 3 | 4 {
  if (dayOfMonth <= 7) return 1;
  if (dayOfMonth <= 14) return 2;
  if (dayOfMonth <= 21) return 3;
  return 4;
}

// ─── Core aggregation ──────────────────────────────────────────────────────

type RawRes = {
  listing_id: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  building_code: string | null; // from joined guesty_listings
};

async function fetchRawReservations(from: string, to: string): Promise<RawRes[]> {
  const sb = supabaseAdmin();
  const collected: RawRes[] = [];
  const PAGE = 1000;

  for (let offset = 0; offset < 50000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_reservations')
      .select(
        `listing_id, check_in_date, check_out_date,
         listing:guesty_listings!left(building_code)`
      )
      .lte('check_in_date', to)
      .gte('check_out_date', from)
      .not('status', 'in', '("cancelled","declined","canceled")')
      .order('check_in_date', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`hc_fetch_failed: ${error.message}`);
    const batch = (data || []) as Array<{
      listing_id: string | null;
      check_in_date: string | null;
      check_out_date: string | null;
      listing: { building_code: string | null } | null;
    }>;
    for (const r of batch) {
      collected.push({
        listing_id: r.listing_id,
        check_in_date: r.check_in_date,
        check_out_date: r.check_out_date,
        building_code: r.listing?.building_code ?? null,
      });
    }
    if (batch.length < PAGE) break;
  }

  return collected;
}

export async function computeHKBaseData(now: Date = new Date()): Promise<HKBaseData> {
  const { from, to, label } = getLastMonthWindow(now);
  const rows = await fetchRawReservations(from, to);

  // Build set of all calendar dates in the month
  const dates: string[] = [];
  const cursor = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Index rows by listing_id for rollover detection
  const byListing = new Map<string, RawRes[]>();
  for (const r of rows) {
    if (!r.listing_id) continue;
    const existing = byListing.get(r.listing_id) || [];
    existing.push(r);
    byListing.set(r.listing_id, existing);
  }

  const zeroCounts = (): UnitTypeCounts => ({ studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 });
  const dayDataMap = new Map<string, Map<BuildingKey, DayData>>();

  for (const date of dates) {
    const bldMap = new Map<BuildingKey, DayData>();
    for (const b of BUILDINGS) {
      bldMap.set(b, { date, building: b, checkins: zeroCounts(), stayIns: 0, sameDayRollovers: 0 });
    }
    dayDataMap.set(date, bldMap);
  }

  const totalCheckins = zeroCounts();
  let totalRollovers = 0;
  let totalStayIns = 0;

  for (const r of rows) {
    if (!r.listing_id || !r.check_in_date || !r.check_out_date) continue;

    const building = bucketFromGuestyListing({ building_code: r.building_code, id: r.listing_id });
    if (isExcludedFromReport(r.building_code)) continue;
    if (!BUILDINGS.includes(building as BuildingKey)) continue;
    const bk = building as BuildingKey;

    const unitType = resolveUnitType(r.listing_id);

    // Check-ins on this date
    if (r.check_in_date >= from && r.check_in_date <= to) {
      const bldMap = dayDataMap.get(r.check_in_date);
      if (bldMap && unitType) {
        bldMap.get(bk)!.checkins[unitType]++;
        totalCheckins[unitType]++;
      }

      // Same-day rollover: another reservation for same listing ending same day
      const siblings = byListing.get(r.listing_id) || [];
      const isRollover = siblings.some(
        s => s !== r && s.check_out_date === r.check_in_date
      );
      if (isRollover) {
        const bldMap2 = dayDataMap.get(r.check_in_date);
        if (bldMap2) {
          bldMap2.get(bk)!.sameDayRollovers++;
          totalRollovers++;
        }
      }
    }

    // Stay-ins: occupied on each interior date (not check-in or check-out day)
    for (const date of dates) {
      if (date > r.check_in_date && date < r.check_out_date) {
        const bldMap = dayDataMap.get(date);
        if (bldMap) {
          bldMap.get(bk)!.stayIns++;
          totalStayIns++;
        }
      }
    }
  }

  // Flatten into weeks
  const weekMap = new Map<1 | 2 | 3 | 4, DayData[]>([
    [1, []], [2, []], [3, []], [4, []],
  ]);

  for (const date of dates) {
    const day = parseInt(date.slice(8, 10), 10);
    const week = assignWeek(day);
    const bldMap = dayDataMap.get(date)!;
    for (const b of BUILDINGS) {
      weekMap.get(week)!.push(bldMap.get(b)!);
    }
  }

  const weeks = ([1, 2, 3, 4] as const).map(w => ({
    week: w,
    days: weekMap.get(w)!,
  }));

  return {
    month: label,
    weeks,
    totalCheckins,
    totalRollovers,
    avgStayInsPerDay: dates.length > 0 ? Math.round(totalStayIns / dates.length) : 0,
  };
}

// ─── Snapshot-aware public entrypoint ─────────────────────────────────────

export async function fetchHKBaseData(): Promise<HKBaseData> {
  const now = new Date();
  const day = now.getUTCDate();
  const monthKey = getLastMonthKey(now);

  if (day >= 15) {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('hc_estimator_snapshots')
      .select('data')
      .eq('month_key', monthKey)
      .maybeSingle();
    if (data) return data.data as HKBaseData;
  }

  return computeHKBaseData(now);
}

export async function saveSnapshot(now: Date = new Date()): Promise<void> {
  const monthKey = getLastMonthKey(now);
  const baseData = await computeHKBaseData(now);
  const sb = supabaseAdmin();
  await sb
    .from('hc_estimator_snapshots')
    .upsert({ month_key: monthKey, data: baseData }, { onConflict: 'month_key' });
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- hc-estimator.test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/hc-estimator.ts src/lib/beithady/hc-estimator.test.ts
git commit -m "feat(hc-estimator): server aggregation + snapshot logic"
```

---

## Task 5: Pure HK calculation engine

**Files:**
- Create: `src/lib/beithady/hk-calc.ts`
- Create: `src/lib/beithady/hk-calc.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/beithady/hk-calc.test.ts
import { describe, it, expect } from 'vitest';
import { calculateHKWeeks, coverageFactor } from './hk-calc';
import type { HKBaseData, HKInputs } from './hc-estimator-types';

const INPUTS: HKInputs = {
  multiplier: 1,
  buildings: {
    'BH-26':  { generalAreaHrsPerDay: 2, nightShiftHKs: 1 },
    'BH-73':  { generalAreaHrsPerDay: 2, nightShiftHKs: 1 },
    'BH-435': { generalAreaHrsPerDay: 1, nightShiftHKs: 1 },
    'BH-OK':  { generalAreaHrsPerDay: 1, nightShiftHKs: 1 },
  },
};

const BASE: HKBaseData = {
  month: 'April 2026',
  totalCheckins: { studio: 2, oneBR: 2, twoBR: 2, threeBR: 0, fourBR: 0 },
  totalRollovers: 0,
  avgStayInsPerDay: 4,
  weeks: [
    {
      week: 1,
      days: [
        {
          date: '2026-04-01',
          building: 'BH-26',
          checkins: { studio: 1, oneBR: 1, twoBR: 1, threeBR: 0, fourBR: 0 },
          stayIns: 4,
          sameDayRollovers: 0,
        },
        // Remaining buildings contribute 0 for simplicity
        { date: '2026-04-01', building: 'BH-73',  checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
        { date: '2026-04-01', building: 'BH-435', checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
        { date: '2026-04-01', building: 'BH-OK',  checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
      ],
    },
    { week: 2, days: [] },
    { week: 3, days: [] },
    { week: 4, days: [] },
  ],
};

describe('coverageFactor', () => {
  it('rounds up correctly', () => {
    expect(coverageFactor(6)).toBe(7);   // 6 × 7/6 = 7
    expect(coverageFactor(10)).toBe(12); // 10 × 7/6 = 11.67 → 12
    expect(coverageFactor(0)).toBe(0);
  });
});

describe('calculateHKWeeks — W1 with known inputs', () => {
  it('computes turnover hours correctly', () => {
    const result = calculateHKWeeks(BASE, INPUTS);
    const w1 = result.weeks[0];
    // Studio(1) + 1BR(1) = 2 small × 1hr × 1HK = 2hrs
    // 2BR(1) = 1 large × 1hr × 2HKs = 2hrs
    // stayIns 4 × 5% × 1hr = 0.2hrs
    // areas = 2+2+1+1 = 6hrs
    // total = 2 + 2 + 0.2 + 6 = 10.2hrs
    // dayHKs = ceil(10.2 / 8) = 2
    expect(w1.dayHKs).toBe(2);
    expect(w1.nightHKs).toBe(4); // 1 per building × 4 buildings
  });

  it('applies rollover override when rollovers demand more HKs', () => {
    const withRollovers: HKBaseData = {
      ...BASE,
      weeks: [
        {
          week: 1,
          days: [
            {
              date: '2026-04-01', building: 'BH-26',
              checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 },
              stayIns: 0,
              sameDayRollovers: 9, // 9 rollovers → 9 HK-hrs ÷ 4hr window = 3 peak HKs
            },
            { date: '2026-04-01', building: 'BH-73',  checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
            { date: '2026-04-01', building: 'BH-435', checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
            { date: '2026-04-01', building: 'BH-OK',  checkins: { studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 }, stayIns: 0, sameDayRollovers: 0 },
          ],
        },
        { week: 2, days: [] },
        { week: 3, days: [] },
        { week: 4, days: [] },
      ],
    };
    const result = calculateHKWeeks(withRollovers, INPUTS);
    const w1 = result.weeks[0];
    // Areas only: ceil(6/8) = 1 baseline day HK
    // Rollover: 9 rollovers, assume all studio (1 HK-hr each since no checkin type info)
    // rollover peak = ceil(9 / 4) = 3 → override fires
    expect(w1.rolloverOverride).toBe(true);
    expect(w1.dayHKs).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run — expect failures**

```bash
npm run test -- hk-calc.test
```

Expected: FAIL — `calculateHKWeeks`, `coverageFactor` not found.

- [ ] **Step 3: Implement the calculation engine**

```ts
// src/lib/beithady/hk-calc.ts
import type {
  HKBaseData,
  HKInputs,
  HKWeekResult,
  HKMonthResult,
  DayData,
  BuildingKey,
  UnitTypeCounts,
} from './hc-estimator-types';
import { BUILDINGS } from './hc-estimator-types';

export function coverageFactor(onShift: number): number {
  if (onShift === 0) return 0;
  return Math.ceil(onShift * 7 / 6);
}

function sumUnitCounts(counts: UnitTypeCounts, multiplier: number) {
  return {
    small: (counts.studio + counts.oneBR) * multiplier,
    large: (counts.twoBR + counts.threeBR + counts.fourBR) * multiplier,
  };
}

type PortfolioDayRow = {
  date: string;
  checkins: UnitTypeCounts;
  stayIns: number;
  sameDayRollovers: number;
};

function poolDays(days: DayData[]): PortfolioDayRow[] {
  const byDate = new Map<string, PortfolioDayRow>();
  for (const d of days) {
    const existing = byDate.get(d.date);
    if (!existing) {
      byDate.set(d.date, {
        date: d.date,
        checkins: { ...d.checkins },
        stayIns: d.stayIns,
        sameDayRollovers: d.sameDayRollovers,
      });
    } else {
      existing.checkins.studio     += d.checkins.studio;
      existing.checkins.oneBR      += d.checkins.oneBR;
      existing.checkins.twoBR      += d.checkins.twoBR;
      existing.checkins.threeBR    += d.checkins.threeBR;
      existing.checkins.fourBR     += d.checkins.fourBR;
      existing.stayIns             += d.stayIns;
      existing.sameDayRollovers    += d.sameDayRollovers;
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function totalAreasHrs(buildings: HKInputs['buildings']): number {
  return BUILDINGS.reduce((sum, b) => sum + (buildings[b]?.generalAreaHrsPerDay ?? 0), 0);
}

function totalNightHKs(buildings: HKInputs['buildings']): number {
  return BUILDINGS.reduce((sum, b) => sum + (buildings[b]?.nightShiftHKs ?? 0), 0);
}

function calcDayHKs(row: PortfolioDayRow, inputs: HKInputs, areasHrs: number): {
  finalDayHKs: number;
  rolloverOverride: boolean;
  rolloverPeakHKs: number;
  totalHrs: number;
  turnoverHrs: number;
  stayInHrs: number;
} {
  const m = inputs.multiplier;
  const { small, large } = sumUnitCounts(row.checkins, m);
  const turnoverHrs = small * 1 + large * 2;
  const stayInHrs = row.stayIns * m * 0.05 * 1;
  const totalHrs = turnoverHrs + stayInHrs + areasHrs;
  const baseline = Math.ceil(totalHrs / 8);

  // Rollover peak: assume all rollovers are small units (1 HK-hr each) — conservative
  const rolloverHKHrs = row.sameDayRollovers * m * 1;
  const rolloverPeakHKs = Math.ceil(rolloverHKHrs / 4);
  const finalDayHKs = Math.max(baseline, rolloverPeakHKs);

  return {
    finalDayHKs,
    rolloverOverride: rolloverPeakHKs > baseline,
    rolloverPeakHKs,
    totalHrs,
    turnoverHrs,
    stayInHrs,
  };
}

export function calculateHKWeeks(base: HKBaseData, inputs: HKInputs): HKMonthResult {
  const areasHrs = totalAreasHrs(inputs.buildings);
  const nightHKs = totalNightHKs(inputs.buildings);
  const targetYear = new Date().getUTCFullYear();
  const targetMonth = new Date().getUTCMonth() + 1; // 1-indexed

  const weekResults: HKWeekResult[] = base.weeks.map(w => {
    const pooled = poolDays(w.days);

    // Week label: derive from week number using current month context
    const weekStarts = [1, 8, 15, 22];
    const weekEnds   = [7, 14, 21, 31]; // 31 stands in for end-of-month
    const start = weekStarts[w.week - 1];
    const end   = weekEnds[w.week - 1];
    const label = `W${w.week} (${start}–${end})`;

    if (pooled.length === 0) {
      return {
        week: w.week,
        label,
        projectedCheckins: 0,
        projectedRollovers: 0,
        stayInHrs: 0,
        areasHrs: areasHrs * 7,
        totalHrs: areasHrs * 7,
        dayHKs: Math.ceil((areasHrs * 7) / 8),
        rolloverOverride: false,
        rolloverPeakHKs: 0,
        nightHKs,
        supervisors: Math.ceil((Math.ceil((areasHrs * 7) / 8) + nightHKs) / 10),
      };
    }

    // Peak day within the week
    let peakDayHKs = 0;
    let peakRolloverOverride = false;
    let peakRolloverPeakHKs = 0;
    let weekTurnoverHrs = 0;
    let weekStayInHrs = 0;
    let weekTotalHrs = 0;
    let weekCheckins = 0;
    let weekRollovers = 0;

    for (const row of pooled) {
      const calc = calcDayHKs(row, inputs, areasHrs);
      weekCheckins  += (row.checkins.studio + row.checkins.oneBR + row.checkins.twoBR + row.checkins.threeBR + row.checkins.fourBR) * inputs.multiplier;
      weekRollovers += row.sameDayRollovers * inputs.multiplier;
      weekTurnoverHrs += calc.turnoverHrs;
      weekStayInHrs   += calc.stayInHrs;
      weekTotalHrs    += calc.totalHrs;

      if (calc.finalDayHKs > peakDayHKs) {
        peakDayHKs = calc.finalDayHKs;
        peakRolloverOverride = calc.rolloverOverride;
        peakRolloverPeakHKs = calc.rolloverPeakHKs;
      }
    }

    const totalHKsOnShift = peakDayHKs + nightHKs;
    const supervisors = Math.ceil(totalHKsOnShift / 10);

    return {
      week: w.week,
      label,
      projectedCheckins: Math.round(weekCheckins),
      projectedRollovers: Math.round(weekRollovers),
      stayInHrs: Math.round(weekStayInHrs * 10) / 10,
      areasHrs: areasHrs * (pooled.length),
      totalHrs: Math.round(weekTotalHrs * 10) / 10,
      dayHKs: peakDayHKs,
      rolloverOverride: peakRolloverOverride,
      rolloverPeakHKs: peakRolloverPeakHKs,
      nightHKs,
      supervisors,
    };
  });

  const peakWeekResult = weekResults.reduce(
    (max, w) => (w.dayHKs > max.dayHKs ? w : max),
    weekResults[0]
  );

  const dayHKsOnShift = peakWeekResult.dayHKs;
  const nightHKsOnShift = nightHKs;
  const supervisorsOnShift = Math.ceil((dayHKsOnShift + nightHKsOnShift) / 10);

  return {
    weeks: weekResults,
    peakWeek: peakWeekResult.week,
    dayHKsOnShift,
    nightHKsOnShift,
    supervisorsOnShift,
    dayHKsToHire: coverageFactor(dayHKsOnShift),
    nightHKsToHire: coverageFactor(nightHKsOnShift),
    supervisorsToHire: coverageFactor(supervisorsOnShift),
    grandTotalOnShift: dayHKsOnShift + nightHKsOnShift + supervisorsOnShift,
    grandTotalToHire: coverageFactor(dayHKsOnShift) + coverageFactor(nightHKsOnShift) + coverageFactor(supervisorsOnShift),
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test -- hk-calc.test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/hk-calc.ts src/lib/beithady/hk-calc.test.ts
git commit -m "feat(hc-estimator): pure HK calculation engine + tests"
```

---

## Task 6: Tab nav + page skeletons

**Files:**
- Create: `src/app/beithady/analytics/headcount/_components/hc-tabs.tsx`
- Create: `src/app/beithady/analytics/headcount/page.tsx` (skeleton)
- Create: `src/app/beithady/analytics/headcount/security/page.tsx` (skeleton)

- [ ] **Step 1: Write tab nav**

```tsx
// src/app/beithady/analytics/headcount/_components/hc-tabs.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { slug: '',          label: 'Housekeeping' },
  { slug: '/security', label: 'Security'     },
];

export function HCTabs() {
  const pathname = usePathname();
  const base = '/beithady/analytics/headcount';
  return (
    <nav className="ix-tabs flex gap-2 border-b border-slate-200 dark:border-slate-700 mb-6">
      {TABS.map(t => {
        const href = base + t.slug;
        const active = t.slug === '' ? pathname === base : pathname?.startsWith(href);
        return (
          <Link
            key={t.slug || 'hk'}
            href={href}
            className={`px-3 py-2 text-sm font-medium ${
              active
                ? 'text-cyan-600 border-b-2 border-cyan-600'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Write HK page skeleton**

```tsx
// src/app/beithady/analytics/headcount/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { HCTabs } from './_components/hc-tabs';
import { fetchHKBaseData } from '@/lib/beithady/hc-estimator';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function HKPage() {
  await requireBeithadyPermission('analytics', 'read');
  const baseData = await fetchHKBaseData();

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Head Count Estimator' },
      ]}
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Head Count Estimator"
        subtitle={`Based on ${baseData.month} actuals — adjust multiplier to project forward.`}
      />
      <HCTabs />
      <p className="text-slate-500 text-sm">HK calculator coming in next task…</p>
    </BeithadyShell>
  );
}
```

- [ ] **Step 3: Write Security page skeleton**

```tsx
// src/app/beithady/analytics/headcount/security/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { HCTabs } from '../_components/hc-tabs';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  await requireBeithadyPermission('analytics', 'read');
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Head Count Estimator', href: '/beithady/analytics/headcount' },
        { label: 'Security' },
      ]}
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Head Count Estimator"
        subtitle="Define security posts per building to calculate required headcount."
      />
      <HCTabs />
      <p className="text-slate-500 text-sm">Security calculator coming in next task…</p>
    </BeithadyShell>
  );
}
```

- [ ] **Step 4: Start dev server and verify both routes load without errors**

```bash
npm run dev
```

Visit `http://localhost:3000/beithady/analytics/headcount` and `/beithady/analytics/headcount/security`. Both should render the shell with the tab nav. Check terminal for TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/analytics/headcount/
git commit -m "feat(hc-estimator): tab nav + page skeletons"
```

---

## Task 7: HK Actuals Table

**Files:**
- Create: `src/app/beithady/analytics/headcount/_components/hk-actuals-table.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/beithady/analytics/headcount/_components/hk-actuals-table.tsx
import type { HKBaseData } from '@/lib/beithady/hc-estimator-types';
import { BUILDINGS } from '@/lib/beithady/hc-estimator-types';

export function HKActualsTable({ base, projectedTotal }: {
  base: HKBaseData;
  projectedTotal: number;
}) {
  const buildingTotals = BUILDINGS.map(b => {
    const days = base.weeks.flatMap(w => w.days.filter(d => d.building === b));
    const checkins = days.reduce((sum, d) =>
      sum + d.checkins.studio + d.checkins.oneBR + d.checkins.twoBR + d.checkins.threeBR + d.checkins.fourBR, 0);
    const rollovers = days.reduce((sum, d) => sum + d.sameDayRollovers, 0);
    const stayIns = days.reduce((sum, d) => sum + d.stayIns, 0);
    const dayCount = new Set(days.map(d => d.date)).size;
    return { building: b, checkins, rollovers, avgStayIns: dayCount > 0 ? Math.round(stayIns / dayCount) : 0,
      studio: days.reduce((s, d) => s + d.checkins.studio, 0),
      oneBR: days.reduce((s, d) => s + d.checkins.oneBR, 0),
      twoBR: days.reduce((s, d) => s + d.checkins.twoBR, 0),
      threeBR: days.reduce((s, d) => s + d.checkins.threeBR, 0),
      fourBR: days.reduce((s, d) => s + d.checkins.fourBR, 0),
    };
  });

  const totalActual = buildingTotals.reduce((s, b) => s + b.checkins, 0);

  return (
    <div className="ix-card p-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {base.month} Actuals
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {totalActual} last month → <span className="font-semibold text-cyan-600">{projectedTotal} projected</span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
              <th className="text-left py-1 pr-3">Building</th>
              <th className="text-right py-1 px-2">Studio</th>
              <th className="text-right py-1 px-2">1BR</th>
              <th className="text-right py-1 px-2">2BR</th>
              <th className="text-right py-1 px-2">3BR</th>
              <th className="text-right py-1 px-2">4BR</th>
              <th className="text-right py-1 px-2 font-semibold">Total</th>
              <th className="text-right py-1 px-2">Rollovers</th>
              <th className="text-right py-1 pl-2">Avg Stay-ins</th>
            </tr>
          </thead>
          <tbody>
            {buildingTotals.map(row => (
              <tr key={row.building} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-3 font-medium text-slate-700 dark:text-slate-300">{row.building}</td>
                <td className="text-right py-1 px-2">{row.studio}</td>
                <td className="text-right py-1 px-2">{row.oneBR}</td>
                <td className="text-right py-1 px-2">{row.twoBR}</td>
                <td className="text-right py-1 px-2">{row.threeBR}</td>
                <td className="text-right py-1 px-2">{row.fourBR}</td>
                <td className="text-right py-1 px-2 font-semibold">{row.checkins}</td>
                <td className="text-right py-1 px-2">{row.rollovers}</td>
                <td className="text-right py-1 pl-2">{row.avgStayIns}/day</td>
              </tr>
            ))}
            <tr className="font-semibold text-slate-800 dark:text-slate-100">
              <td className="py-1 pr-3">Total</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.studio}</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.oneBR}</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.twoBR}</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.threeBR}</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.fourBR}</td>
              <td className="text-right py-1 px-2">{totalActual}</td>
              <td className="text-right py-1 px-2">{base.totalRollovers}</td>
              <td className="text-right py-1 pl-2">{base.avgStayInsPerDay}/day</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/beithady/analytics/headcount/_components/hk-actuals-table.tsx
git commit -m "feat(hc-estimator): HK actuals reference table"
```

---

## Task 8: HK Weekly Table

**Files:**
- Create: `src/app/beithady/analytics/headcount/_components/hk-weekly-table.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/beithady/analytics/headcount/_components/hk-weekly-table.tsx
import type { HKMonthResult } from '@/lib/beithady/hc-estimator-types';

export function HKWeeklyTable({ result }: { result: HKMonthResult }) {
  const monthTotalCheckins = result.weeks.reduce((s, w) => s + w.projectedCheckins, 0);
  const monthTotalRollovers = result.weeks.reduce((s, w) => s + w.projectedRollovers, 0);
  const monthTotalStayInHrs = result.weeks.reduce((s, w) => s + w.stayInHrs, 0);
  const monthTotalAreasHrs  = result.weeks.reduce((s, w) => s + w.areasHrs, 0);
  const monthTotalHrs       = result.weeks.reduce((s, w) => s + w.totalHrs, 0);

  return (
    <div className="ix-card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 text-left">
            <th className="py-2 px-3">Week</th>
            <th className="py-2 px-3 text-right">Check-ins</th>
            <th className="py-2 px-3 text-right">Rollovers</th>
            <th className="py-2 px-3 text-right">Stay-in HK-hrs</th>
            <th className="py-2 px-3 text-right">Areas HK-hrs</th>
            <th className="py-2 px-3 text-right">Total HK-hrs</th>
            <th className="py-2 px-3 text-right">Day HKs</th>
            <th className="py-2 px-3 text-center">Override</th>
            <th className="py-2 px-3 text-right">Night HKs</th>
            <th className="py-2 px-3 text-right">Supervisors</th>
          </tr>
        </thead>
        <tbody>
          {result.weeks.map(w => (
            <tr
              key={w.week}
              className={`border-b border-slate-100 dark:border-slate-800 ${w.week === result.peakWeek ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
            >
              <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300">
                {w.label}
              </td>
              <td className="py-2 px-3 text-right">{Math.round(w.projectedCheckins)}</td>
              <td className="py-2 px-3 text-right">{Math.round(w.projectedRollovers)}</td>
              <td className="py-2 px-3 text-right">{w.stayInHrs.toFixed(1)}</td>
              <td className="py-2 px-3 text-right">{w.areasHrs.toFixed(1)}</td>
              <td className="py-2 px-3 text-right">{w.totalHrs.toFixed(1)}</td>
              <td className="py-2 px-3 text-right font-semibold">{w.dayHKs}</td>
              <td className="py-2 px-3 text-center">
                {w.rolloverOverride ? (
                  <span
                    className="text-amber-600 font-bold cursor-help"
                    title={`${Math.round(w.projectedRollovers)} same-day rollovers require ${w.rolloverPeakHKs} concurrent HKs in the 11 AM–3 PM window (overrides daily average of ${Math.ceil(w.totalHrs / 8)})`}
                  >
                    ⚠️
                  </span>
                ) : '—'}
              </td>
              <td className="py-2 px-3 text-right">{w.nightHKs}</td>
              <td className="py-2 px-3 text-right">{w.supervisors}</td>
            </tr>
          ))}
          <tr className="font-semibold text-slate-800 dark:text-slate-100 border-t-2 border-slate-300 dark:border-slate-600">
            <td className="py-2 px-3">Monthly</td>
            <td className="py-2 px-3 text-right">{Math.round(monthTotalCheckins)}</td>
            <td className="py-2 px-3 text-right">{Math.round(monthTotalRollovers)}</td>
            <td className="py-2 px-3 text-right">{monthTotalStayInHrs.toFixed(1)}</td>
            <td className="py-2 px-3 text-right">{monthTotalAreasHrs.toFixed(1)}</td>
            <td className="py-2 px-3 text-right">{monthTotalHrs.toFixed(1)}</td>
            <td className="py-2 px-3 text-right">{result.dayHKsOnShift}</td>
            <td className="py-2 px-3 text-center">—</td>
            <td className="py-2 px-3 text-right">{result.nightHKsOnShift}</td>
            <td className="py-2 px-3 text-right">{result.supervisorsOnShift}</td>
          </tr>
        </tbody>
      </table>
      <div className="px-3 py-2 text-[10px] text-slate-400 space-y-0.5 border-t border-slate-100 dark:border-slate-800">
        <p>Table shows on-shift numbers. KPI cards show to-hire numbers (×7/6 coverage, 1 day off/week rotating).</p>
        <p>5% stay-in rate applied to projected occupied units. General areas hours are fixed (no multiplier).</p>
        <p className="text-amber-600">Highlighted row = peak week (drives monthly hiring recommendation).</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/beithady/analytics/headcount/_components/hk-weekly-table.tsx
git commit -m "feat(hc-estimator): HK weekly breakdown table"
```

---

## Task 9: HK Dashboard (KPI cards + charts)

**Files:**
- Create: `src/app/beithady/analytics/headcount/_components/hk-dashboard.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/beithady/analytics/headcount/_components/hk-dashboard.tsx
'use client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { HKMonthResult } from '@/lib/beithady/hc-estimator-types';

function KPICard({
  label, onShift, toHire, color,
}: {
  label: string;
  onShift: number;
  toHire: number;
  color: string;
}) {
  return (
    <div className={`ix-card p-4 border-l-4 ${color}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: 'var(--bh-navy)' }}>{toHire}</p>
      <p className="text-xs text-slate-500 mt-0.5">On shift: {onShift}</p>
    </div>
  );
}

export function HKDashboard({ result }: { result: HKMonthResult }) {
  const barData = result.weeks.map(w => ({
    name: `W${w.week}`,
    hks: w.dayHKs,
    isPeak: w.week === result.peakWeek,
  }));

  const total = result.grandTotalOnShift;
  const segments = [
    { label: 'Day HKs',    value: result.dayHKsOnShift,    color: 'bg-cyan-500' },
    { label: 'Night HKs',  value: result.nightHKsOnShift,  color: 'bg-sky-400' },
    { label: 'Supervisors',value: result.supervisorsOnShift,color: 'bg-slate-400' },
  ];

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Day HKs"     onShift={result.dayHKsOnShift}     toHire={result.dayHKsToHire}     color="border-cyan-500" />
        <KPICard label="Night HKs"   onShift={result.nightHKsOnShift}   toHire={result.nightHKsToHire}   color="border-sky-400" />
        <KPICard label="Supervisors" onShift={result.supervisorsOnShift} toHire={result.supervisorsToHire} color="border-slate-400" />
        <KPICard label="Grand Total" onShift={result.grandTotalOnShift}  toHire={result.grandTotalToHire}  color="border-amber-400" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bar chart — week by week */}
        <div className="ix-card p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Day HKs by Week</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} barSize={32}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="hks" name="Day HKs">
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.isPeak ? '#f59e0b' : '#06b6d4'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Staff composition */}
        <div className="ix-card p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff Composition (on-shift)</p>
          {segments.map(seg => (
            <div key={seg.label} className="space-y-1">
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>{seg.label}</span>
                <span className="font-semibold">{seg.value}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${seg.color}`}
                  style={{ width: total > 0 ? `${(seg.value / total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/beithady/analytics/headcount/_components/hk-dashboard.tsx
git commit -m "feat(hc-estimator): HK dashboard — KPI cards + charts"
```

---

## Task 10: HK Calculator — input panel + wires everything

**Files:**
- Create: `src/app/beithady/analytics/headcount/_components/hk-calculator.tsx`
- Modify: `src/app/beithady/analytics/headcount/page.tsx`

- [ ] **Step 1: Implement the client calculator**

```tsx
// src/app/beithady/analytics/headcount/_components/hk-calculator.tsx
'use client';
import { useState, useMemo } from 'react';
import type { HKBaseData, HKInputs, BuildingKey } from '@/lib/beithady/hc-estimator-types';
import { BUILDINGS } from '@/lib/beithady/hc-estimator-types';
import { calculateHKWeeks } from '@/lib/beithady/hk-calc';
import { HKActualsTable } from './hk-actuals-table';
import { HKDashboard } from './hk-dashboard';
import { HKWeeklyTable } from './hk-weekly-table';

const DEFAULT_INPUTS: HKInputs = {
  multiplier: 1,
  buildings: {
    'BH-26':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-73':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-435': { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-OK':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
  },
};

const PRESETS = [1.5, 2, 2.5, 3];

export function HKCalculator({ base }: { base: HKBaseData }) {
  const [inputs, setInputs] = useState<HKInputs>(DEFAULT_INPUTS);

  const setMultiplier = (v: number) =>
    setInputs(prev => ({ ...prev, multiplier: Math.max(0.1, v) }));

  const setBuildingInput = (
    building: BuildingKey,
    field: 'generalAreaHrsPerDay' | 'nightShiftHKs',
    value: number,
  ) =>
    setInputs(prev => ({
      ...prev,
      buildings: {
        ...prev.buildings,
        [building]: { ...prev.buildings[building], [field]: Math.max(0, value) },
      },
    }));

  const result = useMemo(() => calculateHKWeeks(base, inputs), [base, inputs]);

  const totalActual =
    base.totalCheckins.studio + base.totalCheckins.oneBR +
    base.totalCheckins.twoBR + base.totalCheckins.threeBR + base.totalCheckins.fourBR;
  const projectedTotal = Math.round(totalActual * inputs.multiplier);

  return (
    <div className="space-y-6">
      {/* Input panel */}
      <div className="ix-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Settings</h3>

        {/* Multiplier */}
        <div className="space-y-1">
          <label className="text-xs text-slate-500 uppercase tracking-wide">Projection Multiplier</label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={inputs.multiplier}
              onChange={e => setMultiplier(parseFloat(e.target.value) || 1)}
              className="w-20 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
            />
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setMultiplier(p)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition ${
                  inputs.multiplier === p
                    ? 'bg-cyan-600 text-white border-cyan-600'
                    : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-cyan-400'
                }`}
              >
                ×{p}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            {totalActual} checkins last month → <span className="font-semibold text-cyan-600">{projectedTotal} projected</span>
          </p>
        </div>

        {/* Per-building inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BUILDINGS.map(b => (
            <div key={b} className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{b}</p>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">Areas hrs/day</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={inputs.buildings[b].generalAreaHrsPerDay}
                  onChange={e => setBuildingInput(b, 'generalAreaHrsPerDay', parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">Night shift HKs</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={inputs.buildings[b].nightShiftHKs}
                  onChange={e => setBuildingInput(b, 'nightShiftHKs', parseInt(e.target.value) || 0)}
                  className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actuals reference */}
      <HKActualsTable base={base} projectedTotal={projectedTotal} />

      {/* Dashboard + table */}
      <HKDashboard result={result} />
      <HKWeeklyTable result={result} />
    </div>
  );
}
```

- [ ] **Step 2: Update HK page to use calculator**

Replace the skeleton content in `src/app/beithady/analytics/headcount/page.tsx`:

```tsx
// src/app/beithady/analytics/headcount/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { HCTabs } from './_components/hc-tabs';
import { HKCalculator } from './_components/hk-calculator';
import { fetchHKBaseData } from '@/lib/beithady/hc-estimator';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function HKPage() {
  await requireBeithadyPermission('analytics', 'read');
  const baseData = await fetchHKBaseData();

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Head Count Estimator' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Head Count Estimator"
        subtitle={`Based on ${baseData.month} actuals — adjust multiplier to project forward.`}
      />
      <HCTabs />
      <HKCalculator base={baseData} />
    </BeithadyShell>
  );
}
```

- [ ] **Step 3: Verify in browser**

Visit `http://localhost:3000/beithady/analytics/headcount`. Change the multiplier to ×2 — KPI cards and table should update instantly with no page reload.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/headcount/_components/hk-calculator.tsx src/app/beithady/analytics/headcount/page.tsx
git commit -m "feat(hc-estimator): HK calculator — input panel wired to live output"
```

---

## Task 11: Security — building card

**Files:**
- Create: `src/app/beithady/analytics/headcount/_components/security-building-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/beithady/analytics/headcount/_components/security-building-card.tsx
'use client';
import { Trash2 } from 'lucide-react';
import type { SecurityBuildingConfig, SecurityPost } from '@/lib/beithady/hc-estimator-types';

function newPost(): SecurityPost {
  return { id: crypto.randomUUID(), name: '', dayShift: 0, nightShift: 0, allDay: 0 };
}

export function SecurityBuildingCard({
  config,
  onChange,
}: {
  config: SecurityBuildingConfig;
  onChange: (updated: SecurityBuildingConfig) => void;
}) {
  const dayTotal  = config.posts.reduce((s, p) => s + p.dayShift + p.allDay, 0);
  const nightTotal= config.posts.reduce((s, p) => s + p.nightShift + p.allDay, 0);
  const allDayCount = config.posts.reduce((s, p) => s + p.allDay, 0);

  const update = (id: string, field: keyof SecurityPost, value: string | number) =>
    onChange({
      ...config,
      posts: config.posts.map(p => p.id === id ? { ...p, [field]: field === 'name' ? value : Math.max(0, Number(value)) } : p),
    });

  const addRow = () => onChange({ ...config, posts: [...config.posts, newPost()] });
  const removeRow = (id: string) => onChange({ ...config, posts: config.posts.filter(p => p.id !== id) });

  return (
    <div className="ix-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{config.building}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
              <th className="text-left py-1 pr-2 w-40">Post</th>
              <th className="text-right py-1 px-2 w-20">Day (9–5)</th>
              <th className="text-right py-1 px-2 w-20">Night (5–1)</th>
              <th className="text-right py-1 px-2 w-16">24hr</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {config.posts.map(post => (
              <tr key={post.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-2">
                  <input
                    value={post.name}
                    onChange={e => update(post.id, 'name', e.target.value)}
                    placeholder="Post name"
                    className="w-full px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                  />
                </td>
                {(['dayShift', 'nightShift', 'allDay'] as const).map(field => (
                  <td key={field} className="py-1 px-2">
                    <input
                      type="number"
                      min={0}
                      value={post[field]}
                      onChange={e => update(post.id, field, e.target.value)}
                      className="w-full text-right px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                    />
                  </td>
                ))}
                <td className="py-1 pl-1">
                  <button onClick={() => removeRow(post.id)} className="text-slate-400 hover:text-rose-500">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="text-slate-500 font-semibold border-t border-slate-200 dark:border-slate-700">
              <td className="py-1 pr-2">Total</td>
              <td className="py-1 px-2 text-right">{dayTotal}</td>
              <td className="py-1 px-2 text-right">{nightTotal}</td>
              <td className="py-1 px-2 text-right">{allDayCount > 0 ? `${allDayCount} ×2` : '—'}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <button
        onClick={addRow}
        className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
      >
        + Add Post
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/beithady/analytics/headcount/_components/security-building-card.tsx
git commit -m "feat(hc-estimator): security per-building post editor"
```

---

## Task 12: Security dashboard + calculator + page

**Files:**
- Create: `src/app/beithady/analytics/headcount/_components/security-dashboard.tsx`
- Create: `src/app/beithady/analytics/headcount/_components/security-calculator.tsx`
- Modify: `src/app/beithady/analytics/headcount/security/page.tsx`

- [ ] **Step 1: Security calculation helper** — add to `src/lib/beithady/hk-calc.ts`

Open `src/lib/beithady/hk-calc.ts` and append at the bottom:

```ts
// ─── Security calculation (append to hk-calc.ts) ──────────────────────────

import type { SecurityBuildingConfig, SecurityResult } from './hc-estimator-types';

export function calculateSecurity(
  configs: SecurityBuildingConfig[],
): SecurityResult {
  const buildings = configs.map(c => {
    const dayOnShift   = c.posts.reduce((s, p) => s + p.dayShift + p.allDay, 0);
    const nightOnShift = c.posts.reduce((s, p) => s + p.nightShift + p.allDay, 0);
    const allDayBodies = c.posts.reduce((s, p) => s + p.allDay * 2, 0);
    const totalOnShift = dayOnShift + nightOnShift;
    return {
      building: c.building,
      dayOnShift,
      nightOnShift,
      allDayBodies,
      totalOnShift,
      dayToHire:   coverageFactor(dayOnShift),
      nightToHire: coverageFactor(nightOnShift),
      allDayToHire: coverageFactor(c.posts.reduce((s, p) => s + p.allDay, 0)) * 2,
      totalToHire: coverageFactor(dayOnShift) + coverageFactor(nightOnShift),
    };
  });

  return {
    buildings,
    portfolioDayOnShift:   buildings.reduce((s, b) => s + b.dayOnShift, 0),
    portfolioNightOnShift: buildings.reduce((s, b) => s + b.nightOnShift, 0),
    portfolioAllDayBodies: buildings.reduce((s, b) => s + b.allDayBodies, 0),
    portfolioTotalOnShift: buildings.reduce((s, b) => s + b.totalOnShift, 0),
    portfolioDayToHire:    buildings.reduce((s, b) => s + b.dayToHire, 0),
    portfolioNightToHire:  buildings.reduce((s, b) => s + b.nightToHire, 0),
    portfolioAllDayToHire: buildings.reduce((s, b) => s + b.allDayToHire, 0),
    portfolioTotalToHire:  buildings.reduce((s, b) => s + b.totalToHire, 0),
  };
}
```

- [ ] **Step 2: Security dashboard**

```tsx
// src/app/beithady/analytics/headcount/_components/security-dashboard.tsx
'use client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { SecurityResult } from '@/lib/beithady/hc-estimator-types';

function KPICard({ label, onShift, toHire, color }: {
  label: string; onShift: number; toHire: number; color: string;
}) {
  return (
    <div className={`ix-card p-4 border-l-4 ${color}`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: 'var(--bh-navy)' }}>{toHire}</p>
      <p className="text-xs text-slate-500 mt-0.5">On shift: {onShift}</p>
    </div>
  );
}

export function SecurityDashboard({ result }: { result: SecurityResult }) {
  const barData = result.buildings.map(b => ({
    name: b.building,
    Day: b.dayOnShift,
    Night: b.nightOnShift,
    '24hr': b.allDayBodies,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Day Guards"   onShift={result.portfolioDayOnShift}   toHire={result.portfolioDayToHire}   color="border-cyan-500" />
        <KPICard label="Night Guards" onShift={result.portfolioNightOnShift} toHire={result.portfolioNightToHire} color="border-sky-400" />
        <KPICard label="24hr Bodies"  onShift={result.portfolioAllDayBodies} toHire={result.portfolioAllDayToHire} color="border-violet-400" />
        <KPICard label="Grand Total"  onShift={result.portfolioTotalOnShift} toHire={result.portfolioTotalToHire} color="border-amber-400" />
      </div>
      <div className="ix-card p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Per-Building Breakdown</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={barData} barSize={24}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Day"   fill="#06b6d4" stackId="a" />
            <Bar dataKey="Night" fill="#38bdf8" stackId="a" />
            <Bar dataKey="24hr"  fill="#a78bfa" stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Security calculator**

```tsx
// src/app/beithady/analytics/headcount/_components/security-calculator.tsx
'use client';
import { useState, useMemo } from 'react';
import type { SecurityBuildingConfig } from '@/lib/beithady/hc-estimator-types';
import { BUILDINGS } from '@/lib/beithady/hc-estimator-types';
import { calculateSecurity } from '@/lib/beithady/hk-calc';
import { SecurityBuildingCard } from './security-building-card';
import { SecurityDashboard } from './security-dashboard';

const DEFAULT_CONFIGS: SecurityBuildingConfig[] = BUILDINGS.map(b => ({
  building: b,
  posts: [],
}));

export function SecurityCalculator() {
  const [configs, setConfigs] = useState<SecurityBuildingConfig[]>(DEFAULT_CONFIGS);

  const updateBuilding = (updated: SecurityBuildingConfig) =>
    setConfigs(prev => prev.map(c => c.building === updated.building ? updated : c));

  const result = useMemo(() => calculateSecurity(configs), [configs]);

  return (
    <div className="space-y-6">
      <SecurityDashboard result={result} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {configs.map(c => (
          <SecurityBuildingCard key={c.building} config={c} onChange={updateBuilding} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update security page**

Replace content of `src/app/beithady/analytics/headcount/security/page.tsx`:

```tsx
// src/app/beithady/analytics/headcount/security/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { HCTabs } from '../_components/hc-tabs';
import { SecurityCalculator } from '../_components/security-calculator';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  await requireBeithadyPermission('analytics', 'read');
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Head Count Estimator', href: '/beithady/analytics/headcount' },
        { label: 'Security' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Head Count Estimator"
        subtitle="Define security posts per building — KPI cards update as you type."
      />
      <HCTabs />
      <SecurityCalculator />
    </BeithadyShell>
  );
}
```

- [ ] **Step 5: Verify security tab in browser**

Visit `http://localhost:3000/beithady/analytics/headcount/security`. Add a post to BH-26 (Day: 1, Night: 1). KPI cards should update to Day Guards: 2 to hire, Night Guards: 2 to hire.

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady/hk-calc.ts src/app/beithady/analytics/headcount/_components/security-dashboard.tsx src/app/beithady/analytics/headcount/_components/security-calculator.tsx src/app/beithady/analytics/headcount/security/page.tsx
git commit -m "feat(hc-estimator): security tab — per-building post editor + live KPI dashboard"
```

---

## Task 13: Snapshot cron

**Files:**
- Create: `src/app/api/cron/hc-snapshot/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write cron handler**

```ts
// src/app/api/cron/hc-snapshot/route.ts
import { saveSnapshot } from '@/lib/beithady/hc-estimator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    await saveSnapshot();
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[hc-snapshot]', err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add cron entry to vercel.json**

Open `vercel.json`. Find the `"crons"` array. Add this entry:

```json
{ "path": "/api/cron/hc-snapshot", "schedule": "0 6 15 * *" }
```

(Fires 15th of each month at 06:00 UTC = ~09:00 Cairo. If DST matters: add a second entry at `0 7 15 * *` and gate on Cairo hour == 9 inside the handler — same pattern as other crons in this project.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/hc-snapshot/route.ts vercel.json
git commit -m "feat(hc-estimator): monthly snapshot cron (15th of month)"
```

---

## Task 14: Analytics hub tile + final deploy

**Files:**
- Modify: `src/app/beithady/analytics/page.tsx`

- [ ] **Step 1: Add tile**

Open `src/app/beithady/analytics/page.tsx`. Add to the `tiles` array (after the Generate Report tile):

```ts
import { Users } from 'lucide-react'; // add to existing import
```

```ts
{
  href: '/beithady/analytics/headcount',
  title: 'Head Count Estimator',
  description: 'Project HK & Security staffing needs based on last month\'s check-ins — weekly breakdown, peak-driven monthly hire recommendation.',
  icon: Users,
  accent: 'cyan',
  badge: { label: 'New', tone: 'gold' },
},
```

- [ ] **Step 2: Verify tile appears at `/beithady/analytics`**

Navigate to `http://localhost:3000/beithady/analytics`. The Head Count Estimator tile should appear with cyan accent. Click it → lands on `/beithady/analytics/headcount`.

- [ ] **Step 3: Run full test suite**

```bash
npm run test
```

Expected: all tests pass including the new `hc-estimator.test.ts` and `hk-calc.test.ts`.

- [ ] **Step 4: Commit + push + deploy**

```bash
git add src/app/beithady/analytics/page.tsx
git commit -m "feat(hc-estimator): add launcher tile to BH Analytics hub"
git push origin main
vercel --prod
```

---

## Self-review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| New analytics tile (cyan, Users icon) | Task 14 |
| Two tabs: HK + Security | Task 6 |
| Last-month actuals table with projected total label | Task 7 |
| Multiplier presets ×1.5 ×2 ×2.5 ×3 | Task 10 |
| Per-building: areas hrs + night HKs inputs | Task 10 |
| 10-step HK calc engine (turnover, stay-in, areas, rollover peak override) | Task 5 |
| Coverage factor ×7/6 (1 day off/week, rotating) | Task 5 |
| Weekly breakdown table (W1–W4 + monthly row) | Task 8 |
| ⚠️ rollover override flag with tooltip | Task 8 |
| KPI cards (on-shift + to-hire both shown) | Task 9 |
| Week-by-week bar chart, peak highlighted amber | Task 9 |
| Staff composition horizontal bars | Task 9 |
| Security per-building editable posts table (add/remove) | Task 11 |
| Security 24hr post = 2 bodies | Task 11 |
| Security KPI cards + per-building stacked bar | Task 12 |
| ×7/6 coverage factor on security | Task 12 |
| Snapshot cron on 15th of month | Task 13 |
| Serve from snapshot when available (after 15th) | Task 4 |
| BH-OK as fourth building | All tasks use `'BH-OK'` |

All requirements covered. ✓
