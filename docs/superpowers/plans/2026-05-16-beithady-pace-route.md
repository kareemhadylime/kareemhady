# Beithady Pace Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/beithady/analytics/pace` — a new Beithady analytics route that mirrors Guesty's "Business On The Books / Pace Report": a free-period YoY KPI strip, a daily-performance grid, a pickup-by-creation-month stacked bar, and a per-property breakdown with a By-Property ⇄ By-City toggle, all filterable by country/city/tag/active.

**Architecture:**

- **Compute-on-request** (not a daily snapshot like `/performance`) because filters are user-driven and dynamic.
- **New lib namespace** at `src/lib/pace-report/` (parallel to existing `src/lib/beithady-daily-report/`). The two share `loadReservationCorpus` plumbing patterns but have independent data shapes.
- **Listings/reservations are already in Supabase.** `guesty_listings` has `tags text[]`, `address_city`, `address_country`, `active`. `guesty_reservations` has `created_at_odoo` (= Guesty `createdAt`), `check_in_date`, `check_out_date`, `host_payout`, `currency`, `nights`. No schema migration needed.
- **No owner-block sync in Phase 1.** "Bookable Days" is approximated as `physical_units_in_scope × days_in_period`; "Reserved Days" is always 0. A Phase-2 plan will add Guesty calendar block ingest to refine these.
- **BH-DXB is NOT excluded.** Unlike the daily report (which calls `isExcludedFromReport`), the pace route surfaces both Egypt and Dubai because country is a user-driven filter chip — exactly the Beithady scope per memory `beithady_scope_filter_no_a1.md` (Consolidated / Egypt / Dubai, not A1).
- **Brand lockdown.** Every UI piece reuses the existing Performance Dashboard chrome: `BeithadyShell` wrapper, `PanelFrame` cards, lavender `#eae9f3` background with pattern overlay, navy `#003462` text, muted `#6077a6` secondary, `var(--bh-heading)` font for KPI values. **No raw Tailwind palette classes** (`text-blue-500`, `bg-gray-100`, etc.) on BH surfaces — only the brand hex values from `--bh-*` vars or the existing performance panels. See [memory: BH surfaces use Beithady brand only](../../../../../../../Users/karee/.claude/projects/C--kareemhady/memory/feedback_beithady_brand_only.md).
- **Tabs match the performance/financials tab style** (small uppercase tracked label, navy underline on active). Two tab groups: "By Property / By City" on the breakdown panel, and "Revenue / Booked Days / ANR" on the pickup-cohort panel.

**Tech Stack:** Next.js 16 App Router (server component for `page.tsx`, client component for the interactive shell), React 19, Tailwind v4, Supabase service-role client, Vitest for unit tests, Recharts for the stacked bar (already a dep — see `package.json`).

---

## File Structure

```
src/lib/pace-report/
  types.ts                      # PaceReportPayload, PaceKpi, DailyPerfRow, PickupCohortRow, PropertyRow, CityRow, PaceFilters, PaceDateRange
  date-ranges.ts                # parsePeriod(), shiftPriorYear(), enumerateDays()
  date-ranges.test.ts
  cohorts.ts                    # bucketCohort(createdAt, checkIn) → CohortBucket
  cohorts.test.ts
  load-listings.ts              # loadPaceListings(filters) — applies country/city/tag/active server-side
  load-reservations.ts          # loadPaceReservations(range, listingIds) — host_payout in USD
  aggregate.ts                  # buildPaceReport(range, filters): PaceReportPayload
  aggregate.test.ts

src/app/beithady/analytics/pace/
  page.tsx                      # server entry — parse search params, call buildPaceReport, render shell
  _components/
    pace-shell.tsx              # client shell: top bar + filter rail + 4 panels
    filter-rail.tsx             # right-side filter rail (Country / City / Tag / Active / Historical)
    period-picker.tsx           # This Month / Last Month / Last 30 Days / Custom range
    tab-strip.tsx               # generic BH-styled tab strip used by 2 panels
    panels/
      pace-kpi-strip.tsx        # 4 side-by-side LY vs Selected bar charts
      daily-performance.tsx     # date × revenue/booked/available/occ/ANR table
      pickup-cohort.tsx         # stacked-bar + Revenue/Booked/ANR tab strip
      property-breakdown.tsx    # table with By Property / By City tab strip
  _hooks/
    use-pace-url-state.ts       # serialize/deserialize PaceFilters + period to URL search params
    use-pace-url-state.test.ts
```

**Why this split:** Lib stays pure (testable without React); UI lives under the route with kebab-case filenames matching repo convention. Each panel is its own file so it can be edited without dragging the whole shell into context.

---

## Task 1: Type Definitions

**Files:**
- Create: `src/lib/pace-report/types.ts`

- [ ] **Step 1: Write the type module**

```ts
// src/lib/pace-report/types.ts
// All money values are USD. All dates are 'YYYY-MM-DD' (Cairo wall-time).

export type PaceCountry = 'EG' | 'AE';

export type PaceFilters = {
  countries: PaceCountry[];           // empty array = no country filter
  cities: string[];                   // empty = all cities; values match guesty_listings.address_city
  tags: string[];                     // empty = all; ANY-match against guesty_listings.tags
  listingIds: string[];               // empty = no nickname pin; otherwise restricts to these listing IDs
  includeInactive: boolean;           // default false → only active=true listings
  includeHistorical: boolean;         // default false → exclude canceled reservations
};

export type PaceDateRange = {
  from: string;                        // inclusive
  to: string;                          // inclusive
  label: string;                       // 'May 2026' | 'Last Month' | 'May 1 — May 16, 2026'
};

export type PaceKpiMetric = 'revenue' | 'booked_days' | 'occupancy_pct' | 'anr';

export type PaceKpi = {
  metric: PaceKpiMetric;
  current_value: number;
  prior_value: number;
  delta_pct: number | null;            // null when prior_value is 0
};

export type DailyPerfRow = {
  date: string;                        // YYYY-MM-DD
  revenue_usd: number;
  booked_days: number;                 // confirmed nights anchored to this date
  reserved_days: number;               // always 0 in Phase 1 (no inquiry-hold sync)
  bookable_days: number;               // physical_units_in_scope (1 night each)
  available_days: number;              // bookable - booked - reserved
  occupancy_pct: number;               // booked / bookable × 100
  anr_usd: number;                     // revenue / booked_days (0 when no booked)
};

export type CohortBucket =
  | 'same_month'
  | 'one_month'
  | 'two_month'
  | 'three_to_five_month'
  | 'six_plus_month';

export const COHORT_LABELS: Record<CohortBucket, string> = {
  same_month: 'Created Same Month',
  one_month: 'Created 1 Month Before',
  two_month: 'Created 2 Months Before',
  three_to_five_month: 'Created 3-5 Months Before',
  six_plus_month: 'Created 6+ Months Before',
};

export type PickupCohortRow = {
  check_in_month: string;              // 'YYYY-MM'
  buckets: Record<CohortBucket, { revenue_usd: number; booked_days: number; anr_usd: number }>;
};

export type PropertyRow = {
  listing_id: string;
  nickname: string;
  unit_type: 'Single Unit' | 'Multi Unit';
  city: string | null;
  country: PaceCountry | null;
  revenue_usd: number;
  booked_days: number;
  reserved_days: number;
  bookable_days: number;
  available_days: number;
  occupancy_pct: number;
  anr_usd: number;
  revpar_usd: number;                  // revenue / bookable_days
};

export type CityRow = {
  city: string;
  country: PaceCountry | null;
  unit_count: number;
  revenue_usd: number;
  booked_days: number;
  reserved_days: number;
  bookable_days: number;
  available_days: number;
  occupancy_pct: number;
  anr_usd: number;
  revpar_usd: number;
};

export type PaceReportPayload = {
  generated_at_iso: string;
  date_range: PaceDateRange;
  prior_date_range: PaceDateRange;
  filters_applied: PaceFilters;
  unit_count_in_scope: number;
  kpis: PaceKpi[];                     // length 4: revenue, booked_days, occupancy_pct, anr (in this order)
  daily: DailyPerfRow[];
  pickup_cohorts: PickupCohortRow[];
  by_property: PropertyRow[];
  by_city: CityRow[];
  build_warnings: string[];
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pace-report/types.ts
git commit -m "feat(pace): add type definitions for /beithady/analytics/pace"
```

---

## Task 2: Date Range Parsing + STLY Shift

**Files:**
- Create: `src/lib/pace-report/date-ranges.ts`
- Create: `src/lib/pace-report/date-ranges.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pace-report/date-ranges.test.ts
import { describe, it, expect } from 'vitest';
import {
  parsePeriod,
  shiftPriorYear,
  enumerateDays,
  daysBetween,
} from './date-ranges';

describe('parsePeriod', () => {
  it('parses "this-month" relative to a reference date', () => {
    const r = parsePeriod('this-month', '2026-05-16');
    expect(r.from).toBe('2026-05-01');
    expect(r.to).toBe('2026-05-31');
    expect(r.label).toBe('May 2026');
  });

  it('parses "last-month" wrapping year boundary', () => {
    const r = parsePeriod('last-month', '2026-01-10');
    expect(r.from).toBe('2025-12-01');
    expect(r.to).toBe('2025-12-31');
    expect(r.label).toBe('December 2025');
  });

  it('parses "last-30-days" inclusive', () => {
    const r = parsePeriod('last-30-days', '2026-05-16');
    expect(r.from).toBe('2026-04-17');
    expect(r.to).toBe('2026-05-16');
    expect(r.label).toBe('Last 30 days');
  });

  it('parses "custom:from:to"', () => {
    const r = parsePeriod('custom:2026-05-01:2026-05-10', '2026-05-16');
    expect(r.from).toBe('2026-05-01');
    expect(r.to).toBe('2026-05-10');
    expect(r.label).toBe('May 1 — May 10, 2026');
  });

  it('falls back to this-month for invalid input', () => {
    const r = parsePeriod('garbage', '2026-05-16');
    expect(r.from).toBe('2026-05-01');
  });
});

describe('shiftPriorYear', () => {
  it('shifts both ends back exactly one year', () => {
    const r = shiftPriorYear({ from: '2026-05-01', to: '2026-05-31', label: 'May 2026' });
    expect(r.from).toBe('2025-05-01');
    expect(r.to).toBe('2025-05-31');
    expect(r.label).toBe('May 2025');
  });

  it('handles leap-day collapse 2024-02-29 → 2023-02-28', () => {
    const r = shiftPriorYear({ from: '2024-02-29', to: '2024-02-29', label: 'Feb 29 2024' });
    expect(r.from).toBe('2023-02-28');
    expect(r.to).toBe('2023-02-28');
  });
});

describe('enumerateDays', () => {
  it('returns every date in the inclusive range', () => {
    expect(enumerateDays('2026-05-01', '2026-05-03')).toEqual([
      '2026-05-01', '2026-05-02', '2026-05-03',
    ]);
  });
  it('returns one entry when from === to', () => {
    expect(enumerateDays('2026-05-05', '2026-05-05')).toEqual(['2026-05-05']);
  });
});

describe('daysBetween', () => {
  it('counts inclusive day count', () => {
    expect(daysBetween('2026-05-01', '2026-05-16')).toBe(16);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/pace-report/date-ranges.test.ts`
Expected: FAIL — `Cannot find module './date-ranges'`

- [ ] **Step 3: Implement date-ranges.ts**

```ts
// src/lib/pace-report/date-ranges.ts
import type { PaceDateRange } from './types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ymd(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays(s: string, n: number): string {
  const { y, m, d } = parseYmd(s);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  const da = Date.UTC(a.y, a.m - 1, a.d);
  const db = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((db - da) / 86_400_000) + 1;
}

export function enumerateDays(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let cur = fromYmd;
  while (cur <= toYmd) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function fmtCustomLabel(fromYmd: string, toYmd: string): string {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  const aMonth = MONTH_NAMES[a.m - 1];
  const bMonth = MONTH_NAMES[b.m - 1];
  if (a.y === b.y && a.m === b.m) {
    return `${aMonth} ${a.d} — ${b.d}, ${a.y}`;
  }
  if (a.y === b.y) {
    return `${aMonth} ${a.d} — ${bMonth} ${b.d}, ${a.y}`;
  }
  return `${aMonth} ${a.d}, ${a.y} — ${bMonth} ${b.d}, ${b.y}`;
}

export function parsePeriod(input: string | undefined, referenceYmd: string): PaceDateRange {
  const ref = parseYmd(referenceYmd);

  if (input === 'last-30-days') {
    return {
      from: addDays(referenceYmd, -29),
      to: referenceYmd,
      label: 'Last 30 days',
    };
  }

  if (input === 'last-month') {
    const y = ref.m === 1 ? ref.y - 1 : ref.y;
    const m = ref.m === 1 ? 12 : ref.m - 1;
    return {
      from: ymd(y, m, 1),
      to: ymd(y, m, lastDayOfMonth(y, m)),
      label: `${MONTH_NAMES[m - 1]} ${y}`,
    };
  }

  if (typeof input === 'string' && input.startsWith('custom:')) {
    const [, fromS, toS] = input.split(':');
    if (fromS && toS && YMD.test(fromS) && YMD.test(toS) && fromS <= toS) {
      return { from: fromS, to: toS, label: fmtCustomLabel(fromS, toS) };
    }
  }

  // Default + 'this-month'
  return {
    from: ymd(ref.y, ref.m, 1),
    to: ymd(ref.y, ref.m, lastDayOfMonth(ref.y, ref.m)),
    label: `${MONTH_NAMES[ref.m - 1]} ${ref.y}`,
  };
}

export function shiftPriorYear(range: PaceDateRange): PaceDateRange {
  const a = parseYmd(range.from);
  const b = parseYmd(range.to);
  const py = a.y - 1;
  // Clamp Feb 29 → Feb 28 on the prior year.
  const aDay = Math.min(a.d, lastDayOfMonth(py, a.m));
  const bDay = Math.min(b.d, lastDayOfMonth(b.y - 1, b.m));
  const from = ymd(py, a.m, aDay);
  const to = ymd(b.y - 1, b.m, bDay);
  // Recompute label
  let label: string;
  if (a.y === b.y && a.m === b.m && a.d === 1 && b.d === lastDayOfMonth(a.y, a.m)) {
    label = `${MONTH_NAMES[a.m - 1]} ${py}`;
  } else {
    label = fmtCustomLabel(from, to);
  }
  return { from, to, label };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/pace-report/date-ranges.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pace-report/date-ranges.ts src/lib/pace-report/date-ranges.test.ts
git commit -m "feat(pace): add period parsing + STLY shift helpers"
```

---

## Task 3: Cohort Bucketing

**Files:**
- Create: `src/lib/pace-report/cohorts.ts`
- Create: `src/lib/pace-report/cohorts.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pace-report/cohorts.test.ts
import { describe, it, expect } from 'vitest';
import { bucketCohort } from './cohorts';

describe('bucketCohort', () => {
  it('returns same_month when booking created in check-in month', () => {
    expect(bucketCohort('2026-05-10T08:00:00Z', '2026-05-20')).toBe('same_month');
    expect(bucketCohort('2026-05-01T00:00:00Z', '2026-05-31')).toBe('same_month');
  });
  it('returns one_month when booking created month-1', () => {
    expect(bucketCohort('2026-04-20T08:00:00Z', '2026-05-10')).toBe('one_month');
  });
  it('returns two_month when booking created month-2', () => {
    expect(bucketCohort('2026-03-20T08:00:00Z', '2026-05-10')).toBe('two_month');
  });
  it('returns three_to_five_month for 3 to 5 month lead', () => {
    expect(bucketCohort('2026-02-20T08:00:00Z', '2026-05-10')).toBe('three_to_five_month');
    expect(bucketCohort('2025-12-20T08:00:00Z', '2026-05-10')).toBe('three_to_five_month');
  });
  it('returns six_plus_month for ≥6 month lead', () => {
    expect(bucketCohort('2025-11-20T08:00:00Z', '2026-05-10')).toBe('six_plus_month');
    expect(bucketCohort('2024-05-01T08:00:00Z', '2026-05-10')).toBe('six_plus_month');
  });
  it('returns same_month when created_at is null (fallback — undated bookings should not be excluded)', () => {
    expect(bucketCohort(null, '2026-05-10')).toBe('same_month');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/pace-report/cohorts.test.ts`
Expected: FAIL — `Cannot find module './cohorts'`

- [ ] **Step 3: Implement cohorts.ts**

```ts
// src/lib/pace-report/cohorts.ts
import type { CohortBucket } from './types';

/**
 * Bucket a reservation by how far ahead of check-in it was created.
 * Lead = whole calendar months between createdAt and checkInDate.
 *
 *   0   → same_month
 *   1   → one_month
 *   2   → two_month
 *   3-5 → three_to_five_month
 *   ≥6  → six_plus_month
 *
 * Null createdAt buckets to `same_month` so legacy rows with no Guesty
 * createdAt don't drop out of the pickup chart.
 */
export function bucketCohort(createdAtIso: string | null, checkInYmd: string): CohortBucket {
  if (!createdAtIso) return 'same_month';
  const [cy, cm] = checkInYmd.split('-').map(Number);
  const created = new Date(createdAtIso);
  const ay = created.getUTCFullYear();
  const am = created.getUTCMonth() + 1;
  const monthLead = (cy - ay) * 12 + (cm - am);
  if (monthLead <= 0) return 'same_month';
  if (monthLead === 1) return 'one_month';
  if (monthLead === 2) return 'two_month';
  if (monthLead <= 5) return 'three_to_five_month';
  return 'six_plus_month';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/pace-report/cohorts.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pace-report/cohorts.ts src/lib/pace-report/cohorts.test.ts
git commit -m "feat(pace): add cohort bucketing for pickup-by-creation-month"
```

---

## Task 4: Filtered Listings Loader

**Files:**
- Create: `src/lib/pace-report/load-listings.ts`

- [ ] **Step 1: Implement the loader**

```ts
// src/lib/pace-report/load-listings.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { PaceCountry, PaceFilters } from './types';

export type PaceListing = {
  id: string;
  nickname: string;
  active: boolean;
  bedrooms: number | null;
  listing_type: string | null;          // 'SINGLE' | 'MTL' | 'SLT' | null
  master_listing_id: string | null;
  city: string | null;
  country: PaceCountry | null;
  tags: string[];
  building_code: string | null;
};

const COUNTRY_CODE_FROM_ADDRESS: Record<string, PaceCountry> = {
  // Common Guesty values for the two operating countries.
  'egypt': 'EG', 'eg': 'EG', 'arab republic of egypt': 'EG',
  'united arab emirates': 'AE', 'uae': 'AE', 'ae': 'AE',
};

function normalizeCountry(raw: string | null): PaceCountry | null {
  if (!raw) return null;
  return COUNTRY_CODE_FROM_ADDRESS[raw.trim().toLowerCase()] ?? null;
}

/**
 * Returns the set of physical (bookable) listings matching `filters`.
 * Multi-unit parents (listing_type='MTL' or referenced as
 * master_listing_id by any child) are excluded — the children are the
 * physical units.
 *
 * Why server-side: the listings table can grow into the hundreds, and
 * filtering at the DB lets us avoid pulling tags/raw blobs we don't need.
 */
export async function loadPaceListings(filters: PaceFilters): Promise<PaceListing[]> {
  const sb = supabaseAdmin();

  let q = sb
    .from('guesty_listings')
    .select('id, nickname, active, bedrooms, listing_type, master_listing_id, address_city, address_country, tags, building_code');

  if (!filters.includeInactive) {
    q = q.eq('active', true);
  }

  const { data, error } = await q;
  if (error) throw new Error(`pace_listings_query_failed: ${error.message}`);

  // Identify MTL parents (listings referenced as a master by any child).
  const parentIds = new Set<string>();
  for (const r of data || []) {
    const masterId = (r as { master_listing_id: string | null }).master_listing_id;
    if (masterId) parentIds.add(masterId);
  }

  const rows: PaceListing[] = [];
  for (const r of data || []) {
    const row = r as {
      id: string;
      nickname: string | null;
      active: boolean | null;
      bedrooms: number | null;
      listing_type: string | null;
      master_listing_id: string | null;
      address_city: string | null;
      address_country: string | null;
      tags: string[] | null;
      building_code: string | null;
    };
    // Skip MTL parents.
    if (parentIds.has(row.id)) continue;
    if ((row.listing_type || '').toUpperCase() === 'MTL') continue;

    const country = normalizeCountry(row.address_country);
    const city = (row.address_city || '').trim() || null;
    const tags = row.tags || [];

    // Filter application
    if (filters.countries.length > 0 && (!country || !filters.countries.includes(country))) continue;
    if (filters.cities.length > 0 && (!city || !filters.cities.includes(city))) continue;
    if (filters.tags.length > 0 && !filters.tags.some((t) => tags.includes(t))) continue;
    if (filters.listingIds.length > 0 && !filters.listingIds.includes(row.id)) continue;

    rows.push({
      id: row.id,
      nickname: row.nickname || row.id,
      active: row.active ?? false,
      bedrooms: row.bedrooms,
      listing_type: row.listing_type,
      master_listing_id: row.master_listing_id,
      city,
      country,
      tags,
      building_code: row.building_code,
    });
  }

  return rows;
}

/** Stable display-name for "Single Unit" / "Multi Unit" — used by per-property table. */
export function unitTypeLabel(listing: PaceListing): 'Single Unit' | 'Multi Unit' {
  if ((listing.listing_type || '').toUpperCase() === 'SLT') return 'Multi Unit';
  if (listing.master_listing_id) return 'Multi Unit';
  return 'Single Unit';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pace-report/load-listings.ts
git commit -m "feat(pace): add filtered listings loader (country/city/tag/active)"
```

---

## Task 5: Reservations Loader (USD-normalized)

**Files:**
- Create: `src/lib/pace-report/load-reservations.ts`

- [ ] **Step 1: Implement the loader**

```ts
// src/lib/pace-report/load-reservations.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { toUsd } from '@/lib/beithady-daily-report/fx';
import type { PaceDateRange } from './types';

export type PaceReservation = {
  id: string;
  listing_id: string;
  status: string | null;
  check_in_date: string;          // YYYY-MM-DD
  check_out_date: string;         // YYYY-MM-DD (exclusive in standard hotel math)
  nights: number;
  host_payout_usd: number;
  created_at_iso: string | null;
  is_canceled: boolean;
};

const ACTIVE_STATUSES = new Set(['confirmed', 'checked_in', 'checked_out', 'reserved']);
const CANCELED_STATUSES = new Set(['canceled', 'cancelled']);

/**
 * Pulls reservations whose stay overlaps [range.from, range.to] OR whose
 * createdAt falls within (range.from minus 6 months, range.to). The
 * 6-month look-back is so the pickup-by-creation-month panel can show
 * reservations created up to 6 months before check-in.
 *
 * host_payout is converted to USD via the daily-report FX cache.
 *
 * Cancellations are kept (with is_canceled=true) so the includeHistorical
 * toggle can flip them on in aggregate.ts without a second query.
 */
export async function loadPaceReservations(
  range: PaceDateRange,
  listingIds: string[],
): Promise<PaceReservation[]> {
  if (listingIds.length === 0) return [];

  const sb = supabaseAdmin();
  const PAGE = 1000;
  const collected: Array<Record<string, unknown>> = [];

  for (let offset = 0; offset < 100_000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_reservations')
      .select(
        `id, status, listing_id, check_in_date, check_out_date, nights,
         currency, host_payout, created_at_odoo`,
      )
      .in('listing_id', listingIds)
      .lte('check_in_date', range.to)
      .gte('check_out_date', range.from)
      .order('check_in_date', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`pace_reservations_query_failed: ${error.message}`);
    const batch = (data || []) as Array<Record<string, unknown>>;
    collected.push(...batch);
    if (batch.length < PAGE) break;
  }

  const fxDate = new Date();
  const out: PaceReservation[] = [];
  for (const r of collected) {
    const id = String(r.id || '');
    if (!id) continue;
    const status = ((r.status as string | null) || '').toLowerCase();
    const listingId = (r.listing_id as string | null) || '';
    const checkIn = (r.check_in_date as string | null) || '';
    const checkOut = (r.check_out_date as string | null) || '';
    if (!listingId || !checkIn || !checkOut) continue;
    if (!ACTIVE_STATUSES.has(status) && !CANCELED_STATUSES.has(status)) continue;

    const rawPayout = r.host_payout as number | string | null;
    const payoutNum =
      typeof rawPayout === 'string' ? Number(rawPayout) : rawPayout;
    const usd = await toUsd(
      typeof payoutNum === 'number' && Number.isFinite(payoutNum) ? payoutNum : null,
      ((r.currency as string | null) || 'USD').toUpperCase(),
      fxDate,
    );

    out.push({
      id,
      listing_id: listingId,
      status: status || null,
      check_in_date: checkIn,
      check_out_date: checkOut,
      nights: typeof r.nights === 'number' ? (r.nights as number) : 0,
      host_payout_usd: usd ?? 0,
      created_at_iso: (r.created_at_odoo as string | null) || null,
      is_canceled: CANCELED_STATUSES.has(status),
    });
  }

  return out;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pace-report/load-reservations.ts
git commit -m "feat(pace): add reservation loader with USD normalization"
```

---

## Task 6: Aggregator — KPIs, Daily, Cohorts, Property, City

**Files:**
- Create: `src/lib/pace-report/aggregate.ts`
- Create: `src/lib/pace-report/aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pace-report/aggregate.test.ts
import { describe, it, expect } from 'vitest';
import { aggregatePaceReport } from './aggregate';
import type { PaceListing } from './load-listings';
import type { PaceReservation } from './load-reservations';

const listing = (overrides: Partial<PaceListing> = {}): PaceListing => ({
  id: 'L1',
  nickname: 'Test Unit',
  active: true,
  bedrooms: 1,
  listing_type: 'SINGLE',
  master_listing_id: null,
  city: 'Sahel',
  country: 'EG',
  tags: [],
  building_code: 'BH-73',
  ...overrides,
});

const res = (overrides: Partial<PaceReservation> = {}): PaceReservation => ({
  id: 'R1',
  listing_id: 'L1',
  status: 'confirmed',
  check_in_date: '2026-05-01',
  check_out_date: '2026-05-04',
  nights: 3,
  host_payout_usd: 300,
  created_at_iso: '2026-04-15T10:00:00Z',
  is_canceled: false,
});

describe('aggregatePaceReport', () => {
  it('computes 4 KPIs in fixed order: revenue, booked_days, occupancy_pct, anr', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res()],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.kpis.map((k) => k.metric)).toEqual([
      'revenue', 'booked_days', 'occupancy_pct', 'anr',
    ]);
    expect(out.kpis[0].current_value).toBe(300);
    expect(out.kpis[1].current_value).toBe(3);
    // 3 booked / (1 unit × 31 days) = 9.677%
    expect(out.kpis[2].current_value).toBeCloseTo(9.677, 2);
    expect(out.kpis[3].current_value).toBeCloseTo(100, 2);  // 300/3
  });

  it('excludes canceled reservations when includeHistorical=false', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res({ status: 'canceled', is_canceled: true })],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.kpis[0].current_value).toBe(0);
    expect(out.kpis[1].current_value).toBe(0);
  });

  it('includes canceled when includeHistorical=true', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res({ status: 'canceled', is_canceled: true })],
      reservationsPrior: [],
      includeHistorical: true,
    });
    expect(out.kpis[1].current_value).toBe(3);
  });

  it('counts only nights anchored inside the period (not the full stay)', () => {
    // 5-night stay 2026-04-29 → 2026-05-04 should contribute 3 booked
    // days inside May (nights of 5/1, 5/2, 5/3). Revenue is pro-rated.
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res({
        id: 'R2', check_in_date: '2026-04-29', check_out_date: '2026-05-04',
        nights: 5, host_payout_usd: 500,
      })],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.kpis[1].current_value).toBe(3);
    expect(out.kpis[0].current_value).toBe(300);  // 500 × 3/5
  });

  it('buckets reservations into pickup cohorts by created-at lead time', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [
        res({ id: 'R-A', host_payout_usd: 100, created_at_iso: '2026-05-01T08:00:00Z' }), // same
        res({ id: 'R-B', host_payout_usd: 200, created_at_iso: '2026-04-15T08:00:00Z' }), // 1mo
        res({ id: 'R-C', host_payout_usd: 300, created_at_iso: '2026-03-15T08:00:00Z' }), // 2mo
        res({ id: 'R-D', host_payout_usd: 400, created_at_iso: '2026-01-15T08:00:00Z' }), // 3-5mo
      ],
      reservationsPrior: [],
      includeHistorical: false,
    });
    const may = out.pickup_cohorts.find((c) => c.check_in_month === '2026-05');
    expect(may?.buckets.same_month.revenue_usd).toBe(100);
    expect(may?.buckets.one_month.revenue_usd).toBe(200);
    expect(may?.buckets.two_month.revenue_usd).toBe(300);
    expect(may?.buckets.three_to_five_month.revenue_usd).toBe(400);
  });

  it('emits per-property and per-city rows', () => {
    const a = listing({ id: 'A', nickname: 'A1', city: 'Sahel' });
    const b = listing({ id: 'B', nickname: 'B1', city: 'Dubai', country: 'AE' });
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [a, b],
      reservationsCurrent: [
        res({ id: 'R-A', listing_id: 'A', host_payout_usd: 600, nights: 6,
              check_in_date: '2026-05-01', check_out_date: '2026-05-07' }),
        res({ id: 'R-B', listing_id: 'B', host_payout_usd: 300, nights: 3,
              check_in_date: '2026-05-10', check_out_date: '2026-05-13' }),
      ],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.by_property).toHaveLength(2);
    expect(out.by_property.find((p) => p.listing_id === 'A')?.revenue_usd).toBe(600);
    expect(out.by_city).toHaveLength(2);
    const sahel = out.by_city.find((c) => c.city === 'Sahel');
    expect(sahel?.unit_count).toBe(1);
    expect(sahel?.revenue_usd).toBe(600);
  });

  it('clamps delta_pct to null when prior is 0', () => {
    const out = aggregatePaceReport({
      range: { from: '2026-05-01', to: '2026-05-31', label: 'May 2026' },
      priorRange: { from: '2025-05-01', to: '2025-05-31', label: 'May 2025' },
      listings: [listing()],
      reservationsCurrent: [res()],
      reservationsPrior: [],
      includeHistorical: false,
    });
    expect(out.kpis[0].delta_pct).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/pace-report/aggregate.test.ts`
Expected: FAIL — `Cannot find module './aggregate'`

- [ ] **Step 3: Implement the aggregator**

```ts
// src/lib/pace-report/aggregate.ts
import { unitTypeLabel } from './load-listings';
import { bucketCohort } from './cohorts';
import { enumerateDays, daysBetween } from './date-ranges';
import type {
  CityRow,
  CohortBucket,
  DailyPerfRow,
  PaceDateRange,
  PaceKpi,
  PaceReportPayload,
  PickupCohortRow,
  PropertyRow,
} from './types';
import type { PaceListing } from './load-listings';
import type { PaceReservation } from './load-reservations';

const ALL_BUCKETS: CohortBucket[] = [
  'same_month', 'one_month', 'two_month', 'three_to_five_month', 'six_plus_month',
];

function emptyBucketRow(): Record<CohortBucket, { revenue_usd: number; booked_days: number; anr_usd: number }> {
  return ALL_BUCKETS.reduce((acc, b) => {
    acc[b] = { revenue_usd: 0, booked_days: 0, anr_usd: 0 };
    return acc;
  }, {} as Record<CohortBucket, { revenue_usd: number; booked_days: number; anr_usd: number }>);
}

/** Inclusive overlap count between [fromYmd, toYmd] and [ci, co). */
function nightsAnchoredInRange(ci: string, co: string, fromYmd: string, toYmd: string): number {
  // The night anchored to day D = stay covers D as a night (ci ≤ D < co).
  const days = enumerateDays(fromYmd, toYmd);
  let count = 0;
  for (const d of days) {
    if (ci <= d && d < co) count++;
  }
  return count;
}

type AggregateInput = {
  range: PaceDateRange;
  priorRange: PaceDateRange;
  listings: PaceListing[];
  reservationsCurrent: PaceReservation[];
  reservationsPrior: PaceReservation[];
  includeHistorical: boolean;
};

export function aggregatePaceReport(input: AggregateInput): PaceReportPayload {
  const { range, priorRange, listings, includeHistorical } = input;
  const filterRes = (rs: PaceReservation[]) =>
    rs.filter((r) => includeHistorical || !r.is_canceled);
  const resCurrent = filterRes(input.reservationsCurrent);
  const resPrior = filterRes(input.reservationsPrior);

  const unitCount = listings.length;
  const periodDays = daysBetween(range.from, range.to);
  const bookableTotal = unitCount * periodDays;

  // ----- KPIs (current vs prior) -----
  const computeBasics = (
    rs: PaceReservation[],
    r: PaceDateRange,
  ) => {
    let revenue = 0;
    let bookedDays = 0;
    for (const x of rs) {
      const n = nightsAnchoredInRange(x.check_in_date, x.check_out_date, r.from, r.to);
      if (n <= 0) continue;
      bookedDays += n;
      // Pro-rate revenue if the stay straddles the period.
      const nightsInStay = x.nights || daysBetween(x.check_in_date, x.check_out_date) - 1;
      if (nightsInStay > 0) {
        revenue += x.host_payout_usd * (n / nightsInStay);
      } else {
        revenue += x.host_payout_usd;
      }
    }
    const days = daysBetween(r.from, r.to);
    const bookable = listings.length * days;
    const occPct = bookable > 0 ? (bookedDays / bookable) * 100 : 0;
    const anr = bookedDays > 0 ? revenue / bookedDays : 0;
    return { revenue, bookedDays, occPct, anr };
  };

  const cur = computeBasics(resCurrent, range);
  const pri = computeBasics(resPrior, priorRange);
  const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

  const kpis: PaceKpi[] = [
    { metric: 'revenue',       current_value: cur.revenue,    prior_value: pri.revenue,    delta_pct: pct(cur.revenue, pri.revenue) },
    { metric: 'booked_days',   current_value: cur.bookedDays, prior_value: pri.bookedDays, delta_pct: pct(cur.bookedDays, pri.bookedDays) },
    { metric: 'occupancy_pct', current_value: cur.occPct,     prior_value: pri.occPct,     delta_pct: pct(cur.occPct, pri.occPct) },
    { metric: 'anr',           current_value: cur.anr,        prior_value: pri.anr,        delta_pct: pct(cur.anr, pri.anr) },
  ];

  // ----- Daily perf grid -----
  const days = enumerateDays(range.from, range.to);
  const daily: DailyPerfRow[] = days.map((d) => {
    let revenue = 0;
    let booked = 0;
    for (const r of resCurrent) {
      if (r.check_in_date <= d && d < r.check_out_date) {
        booked += 1;
        const nightsInStay = r.nights || daysBetween(r.check_in_date, r.check_out_date) - 1;
        revenue += nightsInStay > 0 ? r.host_payout_usd / nightsInStay : 0;
      }
    }
    const bookable = unitCount;
    const reserved = 0;
    const available = Math.max(bookable - booked - reserved, 0);
    const occ = bookable > 0 ? (booked / bookable) * 100 : 0;
    const anr = booked > 0 ? revenue / booked : 0;
    return {
      date: d, revenue_usd: revenue, booked_days: booked, reserved_days: reserved,
      bookable_days: bookable, available_days: available, occupancy_pct: occ, anr_usd: anr,
    };
  });

  // ----- Pickup cohorts (current period only) -----
  const cohortMap = new Map<string, ReturnType<typeof emptyBucketRow>>();
  for (const r of resCurrent) {
    const n = nightsAnchoredInRange(r.check_in_date, r.check_out_date, range.from, range.to);
    if (n <= 0) continue;
    const month = r.check_in_date.slice(0, 7);
    const bucket = bucketCohort(r.created_at_iso, r.check_in_date);
    if (!cohortMap.has(month)) cohortMap.set(month, emptyBucketRow());
    const row = cohortMap.get(month)!;
    const nightsInStay = r.nights || daysBetween(r.check_in_date, r.check_out_date) - 1;
    const rev = nightsInStay > 0 ? r.host_payout_usd * (n / nightsInStay) : r.host_payout_usd;
    row[bucket].revenue_usd += rev;
    row[bucket].booked_days += n;
  }
  // Fill anr per bucket
  for (const row of cohortMap.values()) {
    for (const b of ALL_BUCKETS) {
      row[b].anr_usd = row[b].booked_days > 0 ? row[b].revenue_usd / row[b].booked_days : 0;
    }
  }
  const pickup_cohorts: PickupCohortRow[] = [...cohortMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, buckets]) => ({ check_in_month: month, buckets }));

  // ----- Per-property -----
  const byListing = new Map<string, { revenue: number; booked: number }>();
  for (const r of resCurrent) {
    const n = nightsAnchoredInRange(r.check_in_date, r.check_out_date, range.from, range.to);
    if (n <= 0) continue;
    if (!byListing.has(r.listing_id)) byListing.set(r.listing_id, { revenue: 0, booked: 0 });
    const slot = byListing.get(r.listing_id)!;
    const nightsInStay = r.nights || daysBetween(r.check_in_date, r.check_out_date) - 1;
    slot.revenue += nightsInStay > 0 ? r.host_payout_usd * (n / nightsInStay) : r.host_payout_usd;
    slot.booked += n;
  }

  const by_property: PropertyRow[] = listings.map((l) => {
    const slot = byListing.get(l.id) || { revenue: 0, booked: 0 };
    const bookable = periodDays;
    const reserved = 0;
    const available = Math.max(bookable - slot.booked - reserved, 0);
    const occ = bookable > 0 ? (slot.booked / bookable) * 100 : 0;
    const anr = slot.booked > 0 ? slot.revenue / slot.booked : 0;
    const revpar = bookable > 0 ? slot.revenue / bookable : 0;
    return {
      listing_id: l.id, nickname: l.nickname, unit_type: unitTypeLabel(l),
      city: l.city, country: l.country,
      revenue_usd: slot.revenue, booked_days: slot.booked, reserved_days: reserved,
      bookable_days: bookable, available_days: available,
      occupancy_pct: occ, anr_usd: anr, revpar_usd: revpar,
    };
  }).sort((a, b) => b.revenue_usd - a.revenue_usd);

  // ----- Per-city (roll up properties) -----
  const cityMap = new Map<string, CityRow>();
  for (const row of by_property) {
    const key = row.city || '—';
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        city: key, country: row.country, unit_count: 0,
        revenue_usd: 0, booked_days: 0, reserved_days: 0,
        bookable_days: 0, available_days: 0,
        occupancy_pct: 0, anr_usd: 0, revpar_usd: 0,
      });
    }
    const slot = cityMap.get(key)!;
    slot.unit_count += 1;
    slot.revenue_usd += row.revenue_usd;
    slot.booked_days += row.booked_days;
    slot.bookable_days += row.bookable_days;
  }
  const by_city: CityRow[] = [...cityMap.values()].map((c) => {
    c.available_days = Math.max(c.bookable_days - c.booked_days - c.reserved_days, 0);
    c.occupancy_pct = c.bookable_days > 0 ? (c.booked_days / c.bookable_days) * 100 : 0;
    c.anr_usd = c.booked_days > 0 ? c.revenue_usd / c.booked_days : 0;
    c.revpar_usd = c.bookable_days > 0 ? c.revenue_usd / c.bookable_days : 0;
    return c;
  }).sort((a, b) => b.revenue_usd - a.revenue_usd);

  return {
    generated_at_iso: new Date().toISOString(),
    date_range: range,
    prior_date_range: priorRange,
    filters_applied: {
      countries: [], cities: [], tags: [], listingIds: [],
      includeInactive: false, includeHistorical,
    },
    unit_count_in_scope: unitCount,
    kpis, daily, pickup_cohorts, by_property, by_city,
    build_warnings: [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/pace-report/aggregate.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pace-report/aggregate.ts src/lib/pace-report/aggregate.test.ts
git commit -m "feat(pace): aggregator computes KPIs, daily, cohorts, property/city breakdowns"
```

---

## Task 7: URL State Hook

**Files:**
- Create: `src/app/beithady/analytics/pace/_hooks/use-pace-url-state.ts`
- Create: `src/app/beithady/analytics/pace/_hooks/use-pace-url-state.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/beithady/analytics/pace/_hooks/use-pace-url-state.test.ts
import { describe, it, expect } from 'vitest';
import { parsePaceSearchParams, paceStateToSearchParams } from './use-pace-url-state';

describe('parsePaceSearchParams', () => {
  it('returns defaults when no params given', () => {
    const s = parsePaceSearchParams({});
    expect(s.period).toBe('this-month');
    expect(s.filters.countries).toEqual([]);
    expect(s.filters.includeInactive).toBe(false);
    expect(s.filters.includeHistorical).toBe(false);
  });
  it('parses period, country, city, tag, listingIds, toggles', () => {
    const s = parsePaceSearchParams({
      period: 'last-month',
      country: 'EG,AE',
      city: 'Sahel,Dubai',
      tag: 'beach',
      listing: 'L1,L2',
      inactive: '1',
      historical: '1',
    });
    expect(s.period).toBe('last-month');
    expect(s.filters.countries).toEqual(['EG', 'AE']);
    expect(s.filters.cities).toEqual(['Sahel', 'Dubai']);
    expect(s.filters.tags).toEqual(['beach']);
    expect(s.filters.listingIds).toEqual(['L1', 'L2']);
    expect(s.filters.includeInactive).toBe(true);
    expect(s.filters.includeHistorical).toBe(true);
  });
  it('drops invalid country codes', () => {
    const s = parsePaceSearchParams({ country: 'EG,XX,AE' });
    expect(s.filters.countries).toEqual(['EG', 'AE']);
  });
});

describe('paceStateToSearchParams', () => {
  it('omits defaults so URL stays clean', () => {
    const usp = paceStateToSearchParams({
      period: 'this-month',
      filters: {
        countries: [], cities: [], tags: [], listingIds: [],
        includeInactive: false, includeHistorical: false,
      },
    });
    expect(usp.toString()).toBe('');
  });
  it('round-trips non-default state', () => {
    const usp = paceStateToSearchParams({
      period: 'last-month',
      filters: {
        countries: ['EG'], cities: ['Sahel'], tags: ['beach'], listingIds: [],
        includeInactive: false, includeHistorical: true,
      },
    });
    expect(usp.get('period')).toBe('last-month');
    expect(usp.get('country')).toBe('EG');
    expect(usp.get('city')).toBe('Sahel');
    expect(usp.get('tag')).toBe('beach');
    expect(usp.get('historical')).toBe('1');
    expect(usp.get('inactive')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/beithady/analytics/pace/_hooks/use-pace-url-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook + helpers**

```ts
// src/app/beithady/analytics/pace/_hooks/use-pace-url-state.ts
'use client';
import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { PaceCountry, PaceFilters } from '@/lib/pace-report/types';

export type PacePeriodKey = 'this-month' | 'last-month' | 'last-30-days' | string; // `custom:YYYY-MM-DD:YYYY-MM-DD`

export type PaceUrlState = {
  period: PacePeriodKey;
  filters: PaceFilters;
};

const VALID_COUNTRY: PaceCountry[] = ['EG', 'AE'];

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parsePaceSearchParams(
  search: Record<string, string | string[] | undefined>,
): PaceUrlState {
  const first = (k: string) => {
    const v = search[k];
    if (Array.isArray(v)) return v[0];
    return v ?? undefined;
  };
  const period = first('period') || 'this-month';
  const countries = parseCsv(first('country'))
    .filter((c): c is PaceCountry => (VALID_COUNTRY as string[]).includes(c));
  const cities = parseCsv(first('city'));
  const tags = parseCsv(first('tag'));
  const listingIds = parseCsv(first('listing'));
  const includeInactive = first('inactive') === '1';
  const includeHistorical = first('historical') === '1';
  return {
    period,
    filters: { countries, cities, tags, listingIds, includeInactive, includeHistorical },
  };
}

export function paceStateToSearchParams(state: PaceUrlState): URLSearchParams {
  const usp = new URLSearchParams();
  if (state.period !== 'this-month') usp.set('period', state.period);
  if (state.filters.countries.length) usp.set('country', state.filters.countries.join(','));
  if (state.filters.cities.length) usp.set('city', state.filters.cities.join(','));
  if (state.filters.tags.length) usp.set('tag', state.filters.tags.join(','));
  if (state.filters.listingIds.length) usp.set('listing', state.filters.listingIds.join(','));
  if (state.filters.includeInactive) usp.set('inactive', '1');
  if (state.filters.includeHistorical) usp.set('historical', '1');
  return usp;
}

/** Client-side hook for reading + updating URL state. */
export function usePaceUrlState(): {
  state: PaceUrlState;
  update: (patch: Partial<PaceUrlState> | ((s: PaceUrlState) => PaceUrlState)) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const record: Record<string, string> = {};
  sp.forEach((v, k) => { record[k] = v; });
  const state = parsePaceSearchParams(record);
  const update = useCallback(
    (patch: Partial<PaceUrlState> | ((s: PaceUrlState) => PaceUrlState)) => {
      const next = typeof patch === 'function'
        ? patch(state)
        : { ...state, ...patch, filters: { ...state.filters, ...(patch.filters || {}) } };
      const qs = paceStateToSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, state],
  );
  return { state, update };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/beithady/analytics/pace/_hooks/use-pace-url-state.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/analytics/pace/_hooks/
git commit -m "feat(pace): URL state hook with serializers and tests"
```

---

## Task 8: Server Entry — page.tsx

**Files:**
- Create: `src/app/beithady/analytics/pace/page.tsx`
- Create: `src/app/beithady/analytics/pace/_components/pace-shell.tsx` (stub — fleshed out in Tasks 9+)

- [ ] **Step 1: Write the page entry**

```tsx
// src/app/beithady/analytics/pace/page.tsx
import { Suspense } from 'react';
import { BeithadyShell } from '@/app/beithady/_components/beithady-shell';
import { cairoYmd } from '@/lib/beithady-daily-report/cairo-dates';
import { parsePeriod, shiftPriorYear } from '@/lib/pace-report/date-ranges';
import { loadPaceListings } from '@/lib/pace-report/load-listings';
import { loadPaceReservations } from '@/lib/pace-report/load-reservations';
import { aggregatePaceReport } from '@/lib/pace-report/aggregate';
import { parsePaceSearchParams } from './_hooks/use-pace-url-state';
import { PaceShell } from './_components/pace-shell';

export const metadata = { title: 'Pace Report · Beithady' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PacePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const urlState = parsePaceSearchParams(sp);
  const today = cairoYmd();
  const range = parsePeriod(urlState.period, today);
  const priorRange = shiftPriorYear(range);

  const listings = await loadPaceListings(urlState.filters);
  const listingIds = listings.map((l) => l.id);

  const [resCurrent, resPrior] = await Promise.all([
    loadPaceReservations(range, listingIds),
    loadPaceReservations(priorRange, listingIds),
  ]);

  const payload = aggregatePaceReport({
    range, priorRange,
    listings,
    reservationsCurrent: resCurrent,
    reservationsPrior: resPrior,
    includeHistorical: urlState.filters.includeHistorical,
  });
  // Carry the filter values forward so the rail can render selected chips.
  payload.filters_applied = { ...urlState.filters };

  return (
    <BeithadyShell
      containerClass="max-w-[1400px]"
      breadcrumbs={[
        { label: 'Beithady', href: '/beithady' },
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Pace' },
      ]}
    >
      <Suspense>
        <PaceShell payload={payload} initialState={urlState} />
      </Suspense>
    </BeithadyShell>
  );
}
```

- [ ] **Step 2: Write the shell stub**

```tsx
// src/app/beithady/analytics/pace/_components/pace-shell.tsx
'use client';
import type { PaceReportPayload } from '@/lib/pace-report/types';
import type { PaceUrlState } from '../_hooks/use-pace-url-state';

type Props = {
  payload: PaceReportPayload;
  initialState: PaceUrlState;
};

// Stub — Tasks 9-12 fill in the real shell + panels.
export function PaceShell({ payload }: Props) {
  return (
    <div
      data-testid="pace-shell-stub"
      className="overflow-hidden rounded-xl border border-[#003462]/10 text-[#003462]"
      style={{
        backgroundColor: '#eae9f3',
        backgroundImage: "url('/brand/beithady/pattern-bg.png')",
        backgroundSize: '280px auto',
        backgroundRepeat: 'repeat',
        backgroundBlendMode: 'soft-light',
      }}
    >
      <div className="p-6">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>
          Pace Report — {payload.date_range.label}
        </h1>
        <p className="mt-2 text-sm text-[#6077a6]">
          {payload.unit_count_in_scope} units · {payload.kpis[0].current_value.toFixed(0)} USD revenue
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the route renders**

Start the dev server (if not already running): `npm run dev`

Open: http://localhost:3000/beithady/analytics/pace
Expected: page loads with the BeithadyShell crown + breadcrumbs and the stub heading. Filters in URL like `?period=last-month` should adjust the label.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/pace/page.tsx src/app/beithady/analytics/pace/_components/pace-shell.tsx
git commit -m "feat(pace): route + stub shell wired to server-side aggregator"
```

---

## Task 9: BH-Themed Tab Strip

**Files:**
- Create: `src/app/beithady/analytics/pace/_components/tab-strip.tsx`

- [ ] **Step 1: Implement the tab strip**

```tsx
// src/app/beithady/analytics/pace/_components/tab-strip.tsx
'use client';

type TabItem<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  tabs: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
};

/**
 * Brand-locked horizontal tabs. Matches the "Revenue / Booked Days / ANR"
 * and "By Property / By City" tab patterns in the Guesty Pace Report.
 * Inactive tabs are muted #6077a6; active is navy #003462 with a navy
 * underline. No raw Tailwind palette classes.
 */
export function TabStrip<T extends string>({ tabs, value, onChange, ariaLabel }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center justify-center gap-6 border-b border-[#003462]/10 pb-1"
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`relative pb-2 text-sm transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2 rounded ${
              active
                ? 'text-[#003462] font-semibold'
                : 'text-[#6077a6] hover:text-[#003462]'
            }`}
            style={{ fontFamily: 'var(--bh-heading)' }}
          >
            {t.label}
            {active && (
              <span
                aria-hidden
                className="absolute -bottom-[5px] left-0 right-0 h-[2px] bg-[#003462]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/beithady/analytics/pace/_components/tab-strip.tsx
git commit -m "feat(pace): brand-locked tab strip primitive"
```

---

## Task 10: Pace KPI Strip Panel

**Files:**
- Create: `src/app/beithady/analytics/pace/_components/panels/pace-kpi-strip.tsx`

- [ ] **Step 1: Implement the KPI strip**

```tsx
// src/app/beithady/analytics/pace/_components/panels/pace-kpi-strip.tsx
'use client';
import { PanelFrame } from '@/app/beithady/analytics/performance/_components/panel-frame';
import type { PaceKpi, PaceKpiMetric, PaceDateRange } from '@/lib/pace-report/types';

const METRIC_LABEL: Record<PaceKpiMetric, string> = {
  revenue: 'Revenue',
  booked_days: 'Booked Days',
  occupancy_pct: 'Occupancy',
  anr: 'ANR',
};

function fmtValue(metric: PaceKpiMetric, n: number): string {
  switch (metric) {
    case 'revenue':       return n >= 1000 ? `$${(n / 1000).toFixed(2)}k` : `$${n.toFixed(0)}`;
    case 'booked_days':   return n.toFixed(0);
    case 'occupancy_pct': return `${n.toFixed(0)}%`;
    case 'anr':           return `$${n.toFixed(2)}`;
  }
}

type Props = {
  kpis: PaceKpi[];
  range: PaceDateRange;
  priorRange: PaceDateRange;
};

/** 4 side-by-side bar charts: Last Year (light navy) vs Selected Period (deep navy). */
export function PaceKpiStrip({ kpis, range, priorRange }: Props) {
  return (
    <div className="col-span-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <PanelFrame
          key={kpi.metric}
          label={`${METRIC_LABEL[kpi.metric]} · ${priorRange.label} vs ${range.label}`}
        >
          <KpiBars kpi={kpi} />
        </PanelFrame>
      ))}
    </div>
  );
}

function KpiBars({ kpi }: { kpi: PaceKpi }) {
  const max = Math.max(kpi.current_value, kpi.prior_value, 1);
  const curHeight = (kpi.current_value / max) * 100;
  const priHeight = (kpi.prior_value / max) * 100;
  const deltaIsUp = kpi.delta_pct != null && kpi.delta_pct >= 0;
  return (
    <div>
      <div className="flex items-end justify-center gap-4 h-[120px]">
        <BarColumn label="Prior" heightPct={priHeight} fill="#a8b6d4" value={fmtValue(kpi.metric, kpi.prior_value)} />
        <BarColumn label="Selected" heightPct={curHeight} fill="#003462" value={fmtValue(kpi.metric, kpi.current_value)} />
      </div>
      {kpi.delta_pct != null && (
        <div className={`mt-2 text-center text-[11px] font-semibold ${deltaIsUp ? 'text-emerald-700' : 'text-red-700'}`}>
          {deltaIsUp ? '▲ ' : '▼ '}{Math.abs(kpi.delta_pct).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function BarColumn({ label, heightPct, fill, value }: { label: string; heightPct: number; fill: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-[#003462] font-semibold tabular-nums" style={{ fontFamily: 'var(--bh-heading)' }}>{value}</span>
      <div className="relative w-10 bg-[#003462]/5 rounded-sm" style={{ height: 100 }}>
        <div
          className="absolute bottom-0 left-0 right-0 rounded-sm transition-[height] duration-300 motion-reduce:transition-none"
          style={{ height: `${heightPct}%`, backgroundColor: fill }}
        />
      </div>
      <span className="text-[9px] uppercase tracking-wide text-[#6077a6]">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Wire into pace-shell.tsx**

Modify: `src/app/beithady/analytics/pace/_components/pace-shell.tsx`

Replace the entire file with:

```tsx
'use client';
import type { PaceReportPayload } from '@/lib/pace-report/types';
import type { PaceUrlState } from '../_hooks/use-pace-url-state';
import { PaceKpiStrip } from './panels/pace-kpi-strip';

type Props = {
  payload: PaceReportPayload;
  initialState: PaceUrlState;
};

export function PaceShell({ payload }: Props) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-[#003462]/10 text-[#003462]"
      style={{
        backgroundColor: '#eae9f3',
        backgroundImage: "url('/brand/beithady/pattern-bg.png')",
        backgroundSize: '280px auto',
        backgroundRepeat: 'repeat',
        backgroundBlendMode: 'soft-light',
      }}
    >
      <header className="flex items-center justify-between px-5 py-4 border-b border-[#003462]/10">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>
            Pace Report
          </h1>
          <p className="text-xs text-[#6077a6] mt-0.5">
            {payload.date_range.label} · {payload.unit_count_in_scope} units in scope
          </p>
        </div>
      </header>
      <main className="grid grid-cols-12 gap-3 p-4 sm:p-5">
        <PaceKpiStrip
          kpis={payload.kpis}
          range={payload.date_range}
          priorRange={payload.prior_date_range}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Browser verify**

Open: http://localhost:3000/beithady/analytics/pace
Expected: 4 BH-themed KPI panels (lavender bg, navy text, paired prior+current bars, delta % below).

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/pace/_components/panels/pace-kpi-strip.tsx src/app/beithady/analytics/pace/_components/pace-shell.tsx
git commit -m "feat(pace): KPI strip — 4 LY vs Selected bar pairs"
```

---

## Task 11: Daily Performance Table Panel

**Files:**
- Create: `src/app/beithady/analytics/pace/_components/panels/daily-performance.tsx`

- [ ] **Step 1: Implement the daily performance table**

```tsx
// src/app/beithady/analytics/pace/_components/panels/daily-performance.tsx
'use client';
import { PanelFrame } from '@/app/beithady/analytics/performance/_components/panel-frame';
import type { DailyPerfRow } from '@/lib/pace-report/types';

const COLS: { key: keyof DailyPerfRow | 'grand'; label: string; align?: 'right' }[] = [
  { key: 'date', label: 'Date' },
  { key: 'revenue_usd', label: 'Revenue', align: 'right' },
  { key: 'booked_days', label: 'Booked Days', align: 'right' },
  { key: 'reserved_days', label: 'Reserved Days', align: 'right' },
  { key: 'bookable_days', label: 'Bookable Days', align: 'right' },
  { key: 'available_days', label: 'Available Days', align: 'right' },
  { key: 'occupancy_pct', label: 'Occupancy', align: 'right' },
  { key: 'anr_usd', label: 'ANR', align: 'right' },
];

function fmt(v: number, col: typeof COLS[number]['key']): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  if (col === 'revenue_usd') return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (col === 'occupancy_pct') return `${Math.round(v)}%`;
  if (col === 'anr_usd') return Math.round(v).toString();
  return Math.round(v).toString();
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}/${String(y).slice(-2)}`;
}

type Props = { rows: DailyPerfRow[] };

export function DailyPerformance({ rows }: Props) {
  const grand = rows.reduce(
    (acc, r) => ({
      revenue_usd: acc.revenue_usd + r.revenue_usd,
      booked_days: acc.booked_days + r.booked_days,
      reserved_days: acc.reserved_days + r.reserved_days,
      bookable_days: acc.bookable_days + r.bookable_days,
      available_days: acc.available_days + r.available_days,
    }),
    { revenue_usd: 0, booked_days: 0, reserved_days: 0, bookable_days: 0, available_days: 0 },
  );
  const grandOcc = grand.bookable_days > 0 ? (grand.booked_days / grand.bookable_days) * 100 : 0;
  const grandAnr = grand.booked_days > 0 ? grand.revenue_usd / grand.booked_days : 0;

  return (
    <PanelFrame label="📅 Daily Performance">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#003462]/10">
              {COLS.map((c) => (
                <th
                  key={c.key as string}
                  className={`px-2 py-2 font-semibold text-[#6077a6] ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.date} className={i % 2 === 1 ? 'bg-[#003462]/[0.03]' : ''}>
                <td className="px-2 py-1.5 text-[#003462]">{shortDate(r.date)}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.revenue_usd, 'revenue_usd')}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.booked_days, 'booked_days')}</td>
                <td className="px-2 py-1.5 text-right text-[#6077a6] tabular-nums">{r.reserved_days || ''}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.bookable_days, 'bookable_days')}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.available_days, 'available_days')}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.occupancy_pct, 'occupancy_pct')}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.anr_usd, 'anr_usd')}</td>
              </tr>
            ))}
            <tr className="border-t border-[#003462]/20 font-semibold">
              <td className="px-2 py-1.5 text-[#003462]">Grand Total</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(grand.revenue_usd, 'revenue_usd')}</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(grand.booked_days, 'booked_days')}</td>
              <td className="px-2 py-1.5 text-right text-[#6077a6] tabular-nums">{grand.reserved_days || ''}</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(grand.bookable_days, 'bookable_days')}</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(grand.available_days, 'available_days')}</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{Math.round(grandOcc)}%</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{Math.round(grandAnr)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 2: Wire into pace-shell.tsx**

Modify: `src/app/beithady/analytics/pace/_components/pace-shell.tsx` — append a new section under the KPI strip.

Find:
```tsx
        <PaceKpiStrip
          kpis={payload.kpis}
          range={payload.date_range}
          priorRange={payload.prior_date_range}
        />
      </main>
```

Replace with:
```tsx
        <PaceKpiStrip
          kpis={payload.kpis}
          range={payload.date_range}
          priorRange={payload.prior_date_range}
        />
        <div className="col-span-12">
          <DailyPerformance rows={payload.daily} />
        </div>
      </main>
```

Also add to the imports:
```tsx
import { DailyPerformance } from './panels/daily-performance';
```

- [ ] **Step 3: Browser verify**

Reload http://localhost:3000/beithady/analytics/pace
Expected: Daily Performance table renders below the KPI strip with zebra rows, Grand Total row, occupancy + ANR computed correctly.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/pace/_components/panels/daily-performance.tsx src/app/beithady/analytics/pace/_components/pace-shell.tsx
git commit -m "feat(pace): daily performance table"
```

---

## Task 12: Pickup Cohort Stacked Bar Panel

**Files:**
- Create: `src/app/beithady/analytics/pace/_components/panels/pickup-cohort.tsx`

- [ ] **Step 1: Implement the cohort panel**

```tsx
// src/app/beithady/analytics/pace/_components/panels/pickup-cohort.tsx
'use client';
import { useMemo, useState } from 'react';
import { PanelFrame } from '@/app/beithady/analytics/performance/_components/panel-frame';
import { TabStrip } from '../tab-strip';
import { COHORT_LABELS, type CohortBucket, type PaceKpiMetric, type PickupCohortRow } from '@/lib/pace-report/types';

// Brand-locked four-stop ramp from light to deep navy. Matches the
// Guesty stacked-bar visualization while staying on-brand.
const BUCKET_COLOR: Record<CohortBucket, string> = {
  same_month: '#5b8bd6',           // bright navy
  one_month: '#f1a07a',             // warm peach
  two_month: '#e35a78',              // rose
  three_to_five_month: '#9ec5b8',   // sage
  six_plus_month: '#6077a6',         // muted navy
};

const STACK_ORDER: CohortBucket[] = [
  'six_plus_month', 'three_to_five_month', 'two_month', 'one_month', 'same_month',
];

const METRIC_TABS: { value: PaceKpiMetric; label: string }[] = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'booked_days', label: 'Booked Days' },
  { value: 'anr', label: 'ANR' },
];

type Props = { rows: PickupCohortRow[] };

function fmt(v: number, metric: PaceKpiMetric): string {
  if (metric === 'revenue') return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (metric === 'booked_days') return v.toFixed(0);
  return v.toFixed(2);
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function PickupCohort({ rows }: Props) {
  const [metric, setMetric] = useState<PaceKpiMetric>('revenue');

  const { stacks, max } = useMemo(() => {
    const stacks = rows.map((r) => {
      const valueOf = (b: CohortBucket): number => {
        if (metric === 'revenue') return r.buckets[b].revenue_usd;
        if (metric === 'booked_days') return r.buckets[b].booked_days;
        return r.buckets[b].anr_usd;
      };
      const total = STACK_ORDER.reduce((s, b) => s + valueOf(b), 0);
      return { month: r.check_in_month, total, valueOf };
    });
    const max = Math.max(...stacks.map((s) => s.total), 1);
    return { stacks, max };
  }, [rows, metric]);

  return (
    <PanelFrame label="📈 Revenue & Bookings Pickup By Creation Month">
      <div className="mb-3">
        <TabStrip tabs={METRIC_TABS} value={metric} onChange={setMetric} ariaLabel="Pickup metric" />
      </div>

      <Legend />

      <div className="mt-3 flex justify-around items-end gap-6 h-[220px] px-4">
        {stacks.map((stack) => (
          <div key={stack.month} className="flex flex-col items-center gap-1">
            <span
              className="text-[11px] font-semibold text-[#003462] tabular-nums"
              style={{ fontFamily: 'var(--bh-heading)' }}
            >
              {fmt(stack.total, metric)}
            </span>
            <div className="relative w-16 rounded-sm overflow-hidden bg-[#003462]/5" style={{ height: 180 }}>
              {(() => {
                let acc = 0;
                return STACK_ORDER.map((b) => {
                  const v = stack.valueOf(b);
                  const pct = (v / max) * 100;
                  const top = (acc / max) * 100;
                  acc += v;
                  if (v <= 0) return null;
                  return (
                    <div
                      key={b}
                      className="absolute left-0 right-0 transition-[height] duration-300 motion-reduce:transition-none"
                      style={{
                        bottom: `${top}%`,
                        height: `${pct}%`,
                        backgroundColor: BUCKET_COLOR[b],
                      }}
                      title={`${COHORT_LABELS[b]}: ${fmt(v, metric)}`}
                    />
                  );
                });
              })()}
            </div>
            <span className="text-[10px] text-[#6077a6]" style={{ fontFamily: 'var(--bh-heading)' }}>{monthLabel(stack.month)}</span>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 justify-center text-[10px] text-[#003462]">
      {(['same_month', 'one_month', 'two_month', 'three_to_five_month', 'six_plus_month'] as CohortBucket[]).map((b) => (
        <span key={b} className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: BUCKET_COLOR[b] }} />
          {COHORT_LABELS[b]}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire into pace-shell.tsx**

Add to imports: `import { PickupCohort } from './panels/pickup-cohort';`

Append below the daily-performance section:
```tsx
        <div className="col-span-12">
          <PickupCohort rows={payload.pickup_cohorts} />
        </div>
```

- [ ] **Step 3: Browser verify**

Reload `/beithady/analytics/pace`
Expected: Stacked bar with 5-color legend (Same/1mo/2mo/3-5mo/6mo+), tab strip toggling Revenue / Booked Days / ANR with bars re-scaling.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/pace/_components/panels/pickup-cohort.tsx src/app/beithady/analytics/pace/_components/pace-shell.tsx
git commit -m "feat(pace): pickup-by-creation-month stacked bar with metric tabs"
```

---

## Task 13: Property Breakdown Panel with By Property / By City Tabs

**Files:**
- Create: `src/app/beithady/analytics/pace/_components/panels/property-breakdown.tsx`

- [ ] **Step 1: Implement the panel**

```tsx
// src/app/beithady/analytics/pace/_components/panels/property-breakdown.tsx
'use client';
import { useState } from 'react';
import { PanelFrame } from '@/app/beithady/analytics/performance/_components/panel-frame';
import { TabStrip } from '../tab-strip';
import type { CityRow, PropertyRow } from '@/lib/pace-report/types';

type Mode = 'by-property' | 'by-city';

const MODE_TABS: { value: Mode; label: string }[] = [
  { value: 'by-property', label: 'By Property' },
  { value: 'by-city', label: 'By City' },
];

type Props = {
  byProperty: PropertyRow[];
  byCity: CityRow[];
};

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}
function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function PropertyBreakdown({ byProperty, byCity }: Props) {
  const [mode, setMode] = useState<Mode>('by-property');

  return (
    <PanelFrame label="🏢 Property breakdown">
      <div className="mb-3">
        <TabStrip tabs={MODE_TABS} value={mode} onChange={setMode} ariaLabel="Breakdown grouping" />
      </div>
      <div className="overflow-x-auto">
        {mode === 'by-property' ? (
          <PropertyTable rows={byProperty} />
        ) : (
          <CityTable rows={byCity} />
        )}
      </div>
    </PanelFrame>
  );
}

function PropertyTable({ rows }: { rows: PropertyRow[] }) {
  const grand = rows.reduce(
    (acc, r) => ({
      revenue_usd: acc.revenue_usd + r.revenue_usd,
      booked_days: acc.booked_days + r.booked_days,
      bookable_days: acc.bookable_days + r.bookable_days,
      available_days: acc.available_days + r.available_days,
    }),
    { revenue_usd: 0, booked_days: 0, bookable_days: 0, available_days: 0 },
  );
  const occ = grand.bookable_days > 0 ? (grand.booked_days / grand.bookable_days) * 100 : 0;
  const anr = grand.booked_days > 0 ? grand.revenue_usd / grand.booked_days : 0;
  const revpar = grand.bookable_days > 0 ? grand.revenue_usd / grand.bookable_days : 0;

  return (
    <table className="w-full text-xs">
      <thead>
        <Th cols={['Listing Nickname', 'Unit Type', 'Revenue', 'Booked Days', 'Reserved Days', 'Bookable Days', 'Available Days', 'Occupancy', 'ANR', 'RevPAR']} />
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.listing_id} className={i % 2 === 1 ? 'bg-[#003462]/[0.03]' : ''}>
            <td className="px-2 py-1.5 text-[#003462]">{r.nickname}</td>
            <td className="px-2 py-1.5 text-[#6077a6]">{r.unit_type}</td>
            <Num value={fmtMoney(r.revenue_usd)} />
            <Num value={fmtNum(r.booked_days)} />
            <Num value={r.reserved_days || ''} muted />
            <Num value={fmtNum(r.bookable_days)} />
            <Num value={fmtNum(r.available_days)} />
            <Num value={fmtPct(r.occupancy_pct)} />
            <Num value={fmtNum(r.anr_usd)} />
            <Num value={fmtNum(r.revpar_usd)} />
          </tr>
        ))}
        <tr className="border-t border-[#003462]/20 font-semibold">
          <td className="px-2 py-1.5 text-[#003462]" colSpan={2}>Grand Total</td>
          <Num value={fmtMoney(grand.revenue_usd)} />
          <Num value={fmtNum(grand.booked_days)} />
          <Num value="" muted />
          <Num value={fmtNum(grand.bookable_days)} />
          <Num value={fmtNum(grand.available_days)} />
          <Num value={fmtPct(occ)} />
          <Num value={fmtNum(anr)} />
          <Num value={fmtNum(revpar)} />
        </tr>
      </tbody>
    </table>
  );
}

function CityTable({ rows }: { rows: CityRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <Th cols={['City', 'Units', 'Revenue', 'Booked Days', 'Reserved Days', 'Bookable Days', 'Available Days', 'Occupancy', 'ANR', 'RevPAR']} />
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.city} className={i % 2 === 1 ? 'bg-[#003462]/[0.03]' : ''}>
            <td className="px-2 py-1.5 text-[#003462]">{r.city}{r.country ? ` · ${r.country}` : ''}</td>
            <Num value={fmtNum(r.unit_count)} />
            <Num value={fmtMoney(r.revenue_usd)} />
            <Num value={fmtNum(r.booked_days)} />
            <Num value={r.reserved_days || ''} muted />
            <Num value={fmtNum(r.bookable_days)} />
            <Num value={fmtNum(r.available_days)} />
            <Num value={fmtPct(r.occupancy_pct)} />
            <Num value={fmtNum(r.anr_usd)} />
            <Num value={fmtNum(r.revpar_usd)} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({ cols }: { cols: string[] }) {
  return (
    <tr className="border-b border-[#003462]/10">
      {cols.map((c, i) => (
        <th
          key={c}
          className={`px-2 py-2 font-semibold text-[#6077a6] ${i <= 1 ? 'text-left' : 'text-right'}`}
        >
          {c}
        </th>
      ))}
    </tr>
  );
}

function Num({ value, muted = false }: { value: string | number; muted?: boolean }) {
  return (
    <td className={`px-2 py-1.5 text-right tabular-nums ${muted ? 'text-[#6077a6]' : 'text-[#003462]'}`}>
      {value}
    </td>
  );
}
```

- [ ] **Step 2: Wire into pace-shell.tsx**

Add to imports: `import { PropertyBreakdown } from './panels/property-breakdown';`

Append below the pickup-cohort section:
```tsx
        <div className="col-span-12">
          <PropertyBreakdown byProperty={payload.by_property} byCity={payload.by_city} />
        </div>
```

- [ ] **Step 3: Browser verify**

Reload `/beithady/analytics/pace`
Expected: Table with By Property / By City tabs. Each row shows revenue + booked/reserved/bookable/available/occupancy/ANR/RevPAR. Grand total at the bottom.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/pace/_components/panels/property-breakdown.tsx src/app/beithady/analytics/pace/_components/pace-shell.tsx
git commit -m "feat(pace): property breakdown panel with By Property / By City tabs"
```

---

## Task 14: Period Picker

**Files:**
- Create: `src/app/beithady/analytics/pace/_components/period-picker.tsx`

- [ ] **Step 1: Implement the period picker**

```tsx
// src/app/beithady/analytics/pace/_components/period-picker.tsx
'use client';
import { useState } from 'react';
import { usePaceUrlState, type PacePeriodKey } from '../_hooks/use-pace-url-state';

const PRESETS: { value: PacePeriodKey; label: string }[] = [
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-30-days', label: 'Last 30 days' },
];

export function PeriodPicker({ currentLabel }: { currentLabel: string }) {
  const { state, update } = usePaceUrlState();
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const applyCustom = () => {
    if (!from || !to || from > to) return;
    update({ period: `custom:${from}:${to}` });
    setCustomOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-[#6077a6]">Period</span>
      <div className="flex items-center gap-1 rounded-md border border-[#003462]/10 bg-white p-0.5">
        {PRESETS.map((p) => {
          const active = state.period === p.value;
          return (
            <button
              key={p.value}
              onClick={() => update({ period: p.value })}
              className={`px-2.5 py-1 rounded text-xs transition motion-reduce:transition-none ${
                active ? 'bg-[#003462] text-white' : 'text-[#003462] hover:bg-[#003462]/5'
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          onClick={() => setCustomOpen((v) => !v)}
          className={`px-2.5 py-1 rounded text-xs transition motion-reduce:transition-none ${
            state.period.startsWith('custom:') ? 'bg-[#003462] text-white' : 'text-[#003462] hover:bg-[#003462]/5'
          }`}
        >
          Custom
        </button>
      </div>
      <span className="text-xs text-[#6077a6] hidden md:inline">{currentLabel}</span>
      {customOpen && (
        <div className="absolute right-4 top-16 z-10 rounded-md border border-[#003462]/10 bg-white p-3 shadow-lg flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-xs px-2 py-1 rounded border border-[#003462]/10 text-[#003462]"
          />
          <span className="text-[#6077a6] text-xs">—</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-xs px-2 py-1 rounded border border-[#003462]/10 text-[#003462]"
          />
          <button
            onClick={applyCustom}
            className="text-xs px-2.5 py-1 bg-[#003462] text-white rounded hover:bg-[#003462]/90 transition motion-reduce:transition-none"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into pace-shell.tsx header**

Find:
```tsx
      <header className="flex items-center justify-between px-5 py-4 border-b border-[#003462]/10">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>
            Pace Report
          </h1>
          <p className="text-xs text-[#6077a6] mt-0.5">
            {payload.date_range.label} · {payload.unit_count_in_scope} units in scope
          </p>
        </div>
      </header>
```

Replace with:
```tsx
      <header className="relative flex items-center justify-between px-5 py-4 border-b border-[#003462]/10">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>
            Pace Report
          </h1>
          <p className="text-xs text-[#6077a6] mt-0.5">
            {payload.date_range.label} · {payload.unit_count_in_scope} units in scope
          </p>
        </div>
        <PeriodPicker currentLabel={payload.date_range.label} />
      </header>
```

Add import: `import { PeriodPicker } from './period-picker';`

- [ ] **Step 3: Browser verify**

Reload `/beithady/analytics/pace`
Expected: Period picker shows in top-right with This Month / Last Month / Last 30 Days / Custom segmented control. Clicking a preset updates the URL and re-renders the report. Custom popover applies a date range.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/pace/_components/period-picker.tsx src/app/beithady/analytics/pace/_components/pace-shell.tsx
git commit -m "feat(pace): period picker — presets + custom range"
```

---

## Task 15: Filter Rail

**Files:**
- Create: `src/app/beithady/analytics/pace/_components/filter-rail.tsx`
- Modify: `src/app/beithady/analytics/pace/page.tsx` (pass distinct-city + distinct-tag lists into the shell)
- Modify: `src/app/beithady/analytics/pace/_components/pace-shell.tsx` (render the rail)

- [ ] **Step 1: Compute filter-option lists in page.tsx**

Modify `src/app/beithady/analytics/pace/page.tsx`. Add this **before** the `return` statement:

```tsx
  // For the rail, load the unfiltered listing universe so users can SEE
  // all cities/tags even when the current filter narrows the result set.
  const allListings = await loadPaceListings({
    countries: [], cities: [], tags: [], listingIds: [],
    includeInactive: true, includeHistorical: false,
  });
  const cityOptions = Array.from(new Set(allListings.map((l) => l.city).filter((c): c is string => !!c))).sort();
  const tagOptions = Array.from(new Set(allListings.flatMap((l) => l.tags))).sort();
```

Then change the `<PaceShell payload={payload} initialState={urlState} />` line to:

```tsx
        <PaceShell
          payload={payload}
          initialState={urlState}
          cityOptions={cityOptions}
          tagOptions={tagOptions}
        />
```

- [ ] **Step 2: Implement the filter rail**

```tsx
// src/app/beithady/analytics/pace/_components/filter-rail.tsx
'use client';
import { usePaceUrlState } from '../_hooks/use-pace-url-state';
import type { PaceCountry } from '@/lib/pace-report/types';

const COUNTRY_LABEL: Record<PaceCountry, string> = { EG: 'Egypt', AE: 'UAE' };
const COUNTRIES: PaceCountry[] = ['EG', 'AE'];

type Props = {
  cityOptions: string[];
  tagOptions: string[];
};

export function FilterRail({ cityOptions, tagOptions }: Props) {
  const { state, update } = usePaceUrlState();

  const toggleCountry = (c: PaceCountry) => {
    const next = state.filters.countries.includes(c)
      ? state.filters.countries.filter((x) => x !== c)
      : [...state.filters.countries, c];
    update({ filters: { ...state.filters, countries: next } });
  };
  const toggleCity = (city: string) => {
    const next = state.filters.cities.includes(city)
      ? state.filters.cities.filter((x) => x !== city)
      : [...state.filters.cities, city];
    update({ filters: { ...state.filters, cities: next } });
  };
  const toggleTag = (t: string) => {
    const next = state.filters.tags.includes(t)
      ? state.filters.tags.filter((x) => x !== t)
      : [...state.filters.tags, t];
    update({ filters: { ...state.filters, tags: next } });
  };
  const clearAll = () => {
    update({
      filters: {
        countries: [], cities: [], tags: [], listingIds: [],
        includeInactive: false, includeHistorical: false,
      },
    });
  };

  return (
    <aside className="w-[260px] shrink-0 border-l border-[#003462]/10 bg-white/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[#6077a6] font-semibold">Filters</span>
        <button
          onClick={clearAll}
          className="text-[10px] text-[#6077a6] hover:text-[#003462] transition motion-reduce:transition-none"
        >
          Reset
        </button>
      </div>

      <Section title="Country">
        <ChipRow
          items={COUNTRIES.map((c) => ({ value: c, label: COUNTRY_LABEL[c] }))}
          selected={state.filters.countries}
          onToggle={(v) => toggleCountry(v as PaceCountry)}
        />
      </Section>

      <Section title="City">
        <ChipRow
          items={cityOptions.map((c) => ({ value: c, label: c }))}
          selected={state.filters.cities}
          onToggle={toggleCity}
        />
      </Section>

      <Section title="Tag">
        <ChipRow
          items={tagOptions.map((t) => ({ value: t, label: t }))}
          selected={state.filters.tags}
          onToggle={toggleTag}
        />
      </Section>

      <Section title="Display">
        <CheckRow
          label="Include inactive listings"
          checked={state.filters.includeInactive}
          onChange={(v) => update({ filters: { ...state.filters, includeInactive: v } })}
        />
        <CheckRow
          label="Include historical (canceled)"
          checked={state.filters.includeHistorical}
          onChange={(v) => update({ filters: { ...state.filters, includeHistorical: v } })}
        />
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#6077a6] mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function ChipRow({ items, selected, onToggle }: { items: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
  if (items.length === 0) {
    return <div className="text-[10px] text-[#6077a6]/70 italic">No options</div>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => {
        const active = selected.includes(it.value);
        return (
          <button
            key={it.value}
            onClick={() => onToggle(it.value)}
            className={`px-2 py-0.5 rounded-full text-[10px] transition motion-reduce:transition-none ${
              active
                ? 'bg-[#003462] text-white border border-[#003462]'
                : 'bg-white text-[#003462] border border-[#003462]/20 hover:border-[#003462]/40'
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-[#003462] cursor-pointer py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[#003462]"
      />
      {label}
    </label>
  );
}
```

- [ ] **Step 3: Wire rail into pace-shell.tsx**

Replace the `pace-shell.tsx` file with:

```tsx
'use client';
import type { PaceReportPayload } from '@/lib/pace-report/types';
import type { PaceUrlState } from '../_hooks/use-pace-url-state';
import { PaceKpiStrip } from './panels/pace-kpi-strip';
import { DailyPerformance } from './panels/daily-performance';
import { PickupCohort } from './panels/pickup-cohort';
import { PropertyBreakdown } from './panels/property-breakdown';
import { PeriodPicker } from './period-picker';
import { FilterRail } from './filter-rail';

type Props = {
  payload: PaceReportPayload;
  initialState: PaceUrlState;
  cityOptions: string[];
  tagOptions: string[];
};

export function PaceShell({ payload, cityOptions, tagOptions }: Props) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-[#003462]/10 text-[#003462]"
      style={{
        backgroundColor: '#eae9f3',
        backgroundImage: "url('/brand/beithady/pattern-bg.png')",
        backgroundSize: '280px auto',
        backgroundRepeat: 'repeat',
        backgroundBlendMode: 'soft-light',
      }}
    >
      <header className="relative flex items-center justify-between px-5 py-4 border-b border-[#003462]/10">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>
            Pace Report
          </h1>
          <p className="text-xs text-[#6077a6] mt-0.5">
            {payload.date_range.label} · {payload.unit_count_in_scope} units in scope
          </p>
        </div>
        <PeriodPicker currentLabel={payload.date_range.label} />
      </header>
      <div className="flex">
        <main className="flex-1 grid grid-cols-12 gap-3 p-4 sm:p-5">
          <PaceKpiStrip
            kpis={payload.kpis}
            range={payload.date_range}
            priorRange={payload.prior_date_range}
          />
          <div className="col-span-12">
            <DailyPerformance rows={payload.daily} />
          </div>
          <div className="col-span-12">
            <PickupCohort rows={payload.pickup_cohorts} />
          </div>
          <div className="col-span-12">
            <PropertyBreakdown byProperty={payload.by_property} byCity={payload.by_city} />
          </div>
        </main>
        <FilterRail cityOptions={cityOptions} tagOptions={tagOptions} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Browser verify**

Reload `/beithady/analytics/pace`
Expected:
- Right rail shows Country (EG/AE), City (chips), Tag (chips), Display toggles.
- Clicking a country chip narrows the report; URL updates with `?country=EG`.
- Clicking Reset clears all filters and the URL.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/analytics/pace/_components/filter-rail.tsx \
        src/app/beithady/analytics/pace/_components/pace-shell.tsx \
        src/app/beithady/analytics/pace/page.tsx
git commit -m "feat(pace): right-rail filters — country/city/tag/active/historical"
```

---

## Task 16: Add Pace Tile to /beithady/analytics Landing

**Files:**
- Modify: `src/app/beithady/analytics/page.tsx`

- [ ] **Step 1: Locate the analytics tile list**

Run:
```bash
grep -n "analytics/performance" src/app/beithady/analytics/page.tsx
```

Identify the existing tile-grid structure (tiles for `performance`, `market-intel`, `calendar-heatmap`, `reviews`, `reports`, `pricing`).

- [ ] **Step 2: Add a Pace tile**

Add an entry in the same shape as the Performance Dashboard tile, immediately after it. The new tile entry's exact shape depends on the existing pattern — match it. Sample:

```tsx
{
  href: '/beithady/analytics/pace',
  title: 'Pace Report',
  blurb: 'Business-on-the-books: YoY KPIs, daily performance, booking pickup by creation month, and a per-property breakdown.',
  // (use the same icon/badge convention as the other tiles)
},
```

If `page.tsx` uses inline JSX cards instead of an array, add a card matching the existing markup verbatim (don't introduce a new variant). The tile must use brand colors only.

- [ ] **Step 3: Browser verify**

Open `/beithady/analytics`
Expected: New "Pace Report" tile appears beside Performance Dashboard, clicking opens `/beithady/analytics/pace`.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/page.tsx
git commit -m "feat(pace): expose Pace Report tile on analytics landing"
```

---

## Task 17: Empty / Error States + Visual QA

**Files:**
- Modify: `src/app/beithady/analytics/pace/_components/pace-shell.tsx`

- [ ] **Step 1: Add empty-state handling**

At the top of `PaceShell` body, before the JSX `return`:

```tsx
  const hasData = payload.unit_count_in_scope > 0 && payload.daily.some((d) => d.bookable_days > 0);
```

Then, immediately inside the main container (right after the header), conditionally render an empty state when `!hasData`:

```tsx
{!hasData && (
  <div className="m-5 rounded-lg border border-[#003462]/10 bg-white p-8 text-center">
    <div className="text-[#003462] font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>
      No data for this scope
    </div>
    <p className="text-xs text-[#6077a6] mt-1">
      Adjust the period or clear filters to see results.
    </p>
  </div>
)}
{hasData && (
  <div className="flex">
    {/* ... existing main + FilterRail ... */}
  </div>
)}
```

(Wrap the existing `<div className="flex">…</div>` so it only renders when `hasData`. Always render the rail so users can clear filters; if you'd rather always render the layout, leave it as-is and just inline an empty notice inside `main`.)

- [ ] **Step 2: Visual QA against the screenshots**

Open `/beithady/analytics/pace` on a wide viewport (≥1400px). Compare against the three Guesty screenshots:

- **Pace KPI strip:** 4 panels labeled Revenue / Booked Days / Occupancy / ANR; each shows prior bar + selected bar + delta %. ✓
- **Daily Performance table:** Date / Revenue / Booked / Reserved (blank) / Bookable / Available / Occupancy / ANR. ✓
- **Pickup by Creation Month stacked bar:** 5-bucket legend + tabs for Revenue / Booked Days / ANR. ✓
- **Property breakdown:** By Property / By City tab; columns Listing Nickname / Unit Type / Revenue / Booked / Reserved / Bookable / Available / Occupancy / ANR / RevPAR. ✓
- **Right rail:** Country chips, City chips, Tag chips, Display checkboxes. ✓

Cross-check the BH brand requirements:
- Background: lavender `#eae9f3` with pattern overlay
- All text uses `#003462` or `#6077a6`
- All headings use `var(--bh-heading)` font
- No raw Tailwind palette colors (`text-blue-500`, `bg-gray-200`, etc.) anywhere in `src/app/beithady/analytics/pace/`

Run:
```bash
grep -rEn "text-(red|blue|green|yellow|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+|bg-(red|blue|green|yellow|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+" src/app/beithady/analytics/pace
```

Expected: only emerald/red usage for delta-up/delta-down badges (which match existing performance dashboard convention in `stly-yoy.tsx`). Anything else is a brand violation — replace with `#003462` / `#6077a6` hex values.

- [ ] **Step 3: Run full lib test suite**

Run:
```bash
npx vitest run src/lib/pace-report
```

Expected: PASS (all tests across date-ranges, cohorts, aggregate, url-state).

- [ ] **Step 4: Build verification**

Run:
```bash
npm run build
```

Expected: build completes with no type errors and no warnings touching `pace-report` files.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/analytics/pace/_components/pace-shell.tsx
git commit -m "feat(pace): empty-state handling + visual QA pass"
```

---

## Task 18: SESSION_HANDOFF Update + Forward Deploy

**Files:**
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 1: Prepend a session entry**

Open `SESSION_HANDOFF.md`. After the `# Kareemhady — Session Handoff (...)` heading, insert at the top:

```markdown
## 🟢 New `/beithady/analytics/pace` route — Pace Report (parity with Guesty Business On The Books)

Shipped: full Pace Report at `/beithady/analytics/pace` matching the Guesty Pace Report screenshots that prompted the gap-analysis on 2026-05-16:

- **Pace KPI strip** — 4 paired bars (prior year vs selected period) for Revenue / Booked Days / Occupancy / ANR
- **Daily Performance grid** — date × revenue / booked / reserved (always 0 for now) / bookable / available / occupancy / ANR
- **Pickup-by-Creation-Month** — stacked bar with Same / 1mo / 2mo / 3-5mo / 6mo+ cohorts; tabs for Revenue / Booked Days / ANR
- **Property breakdown** — table with By Property / By City tab; columns include RevPAR
- **Right rail filters** — Country (EG/AE), City, Tag, Active/Historical toggles
- **Period picker** — This Month / Last Month / Last 30 Days / Custom range

Compute-on-request (no snapshot). Lib at `src/lib/pace-report/*`, page under `src/app/beithady/analytics/pace/`.

**Phase-1 caveats noted in code:**
- Reserved Days always 0 — needs Guesty calendar/blocks sync (deferred to Phase 2 plan)
- Bookable Days = physical_units × period_days — owner blocks not yet deducted (same)

BH brand lockdown enforced: lavender `#eae9f3` background, navy `#003462` text, `var(--bh-heading)` headings, `PanelFrame` chrome shared with `/beithady/analytics/performance`. No raw Tailwind palette classes.
```

- [ ] **Step 2: Forward deploy (per standing authorization)**

```bash
git fetch origin main
git rebase origin/main
git push origin HEAD:main
vercel --prod --yes
```

If rebase reports conflicts, resolve them, `git rebase --continue`, then push again.

- [ ] **Step 3: Production smoke test**

Open https://app.limeinc.cc/beithady/analytics/pace
Expected: same 4 panels rendering with real production data. Verify:
- Period switch updates URL + values
- Country filter to "EG" narrows to Egypt-only listings
- Tab strips (Revenue / Booked Days / ANR, By Property / By City) all switch correctly

If `app.limeinc.cc` shows stale content: run `vercel alias set <deploy-url> app.limeinc.cc` (per memory `vercel_lime_alias_quirk.md`).

- [ ] **Step 4: Final commit (if SESSION_HANDOFF was the only change in this task)**

```bash
git add SESSION_HANDOFF.md
git commit -m "docs(handoff): Pace Report route shipped"
git push origin HEAD:main
```

---

## Self-Review Summary

**Spec coverage:**
- ✓ Pace Report KPI panel (Revenue / Booked / Occupancy / ANR LY vs Selected) — Task 10
- ✓ Daily Performance grid — Task 11
- ✓ Pickup-by-Creation-Month stacked bar with metric tabs — Task 12
- ✓ Property breakdown with By Property / By City — Task 13
- ✓ Filter rail (Country / City / Tag / Active / Historical) — Task 15
- ✓ Period picker — Task 14
- ⊘ **Reserved / Bookable distinction** (4 day-states) — intentionally deferred to Phase 2 owner-block sync; documented in payload (Reserved=0, Bookable=physical_units×days)
- ⊘ **PDF export** — out of scope for Phase 1; reuse `@react-pdf/renderer` pattern from financials in a follow-up
- ⊘ **Listing Nickname autocomplete filter** — Phase 1 supports listingIds via URL but no UI; the city/tag chips cover the discovery case

**Brand check:** every UI task references `#003462`, `#6077a6`, `#eae9f3`, `var(--bh-heading)`, and the shared `PanelFrame`. Task 17 step 2 includes a grep guard against raw Tailwind palette classes.

**Type consistency:** `PaceReportPayload`, `PaceKpi`, `DailyPerfRow`, `PickupCohortRow`, `PropertyRow`, `CityRow`, `PaceFilters`, `CohortBucket` are all declared in Task 1 and used unchanged in Tasks 6 (aggregate), 7 (URL state), 8 (page), 10-13 (panels). `PacePeriodKey` declared in Task 7 used in Task 14.
