# Beithady Dashboard — Month-Oriented KPI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four month-oriented KPI cards (MTD Occupancy, Month-to-End Occupancy, Month Occupancy, true past-only MTD Revenue) to the Beithady dashboard hero strip — on both `/beithady` (Today's Pulse) and `/beithady/analytics/performance` — and correct the PDF/HTML/WhatsApp daily-report renderers so they tell the same revenue story.

**Architecture:** Add two new fields to the daily-report payload (`month_occupancy_pct`, `revenue_mtd_actual_usd`), compute them in `build-buildings.ts`, extend sparkline series IDs, register four new hero panel IDs in the Performance Dashboard panel registry, render the new cards via the existing `HeroKpi` component in both surfaces, and update three renderers (PDF, HTML, WhatsApp/Gmail) to show three revenue lines (MTD actual / Month OTB / Booked) instead of two.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Vitest · Tailwind v4 · Supabase Postgres (snapshot storage). No new dependencies.

**Source spec:** [docs/superpowers/specs/2026-05-12-beithady-dashboard-month-kpis-design.md](../specs/2026-05-12-beithady-dashboard-month-kpis-design.md)

---

## File Structure

**Modified:**
- `src/lib/beithady-daily-report/types.ts` — add 2 fields to `BuildingBucket`, extend `HeroKpiId`
- `src/lib/beithady-daily-report/build-buildings.ts` — accumulator + materialization logic for new fields
- `src/lib/beithady-daily-report/build-sparklines.ts` — emit 4 new series
- `src/lib/beithady-daily-report/build-sparklines.test.ts` — assertion update
- `src/lib/beithady-daily-report/build-insights.ts` — rename compact field for AI clarity
- `src/lib/beithady-daily-report/render-pdf.tsx` — 3-line revenue layout
- `src/lib/beithady-daily-report/render-html.tsx` — 3-line revenue layout
- `src/lib/beithady-daily-report/distribute.ts` — WhatsApp + Gmail body revenue lines
- `src/lib/beithady-daily-report/build.ts` — digest one-liner + payload struct for digest
- `src/app/beithady/analytics/performance/_lib/panel-registry.ts` — 4 new hero panel IDs
- `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx` — 4 new HeroKpi calls, relabel, reorder, grid
- `src/app/beithady/_components/landing-pulse.tsx` — same 4 cards, relabel, reorder, grid

**Created:**
- `src/lib/beithady-daily-report/build-buildings.test.ts` — new test covering the two new fields

**Verification:**
- `npm run test` — full vitest suite (target: existing 326 pass + the new assertions pass; ≤22 pre-existing skipped)
- `npx tsc --noEmit` — clean (modulo the 2 pre-existing unrelated errors documented in handoff)

---

## Task 1: Add new payload fields to BuildingBucket

**Files:**
- Modify: `src/lib/beithady-daily-report/types.ts:25-58`

- [ ] **Step 1: Edit `types.ts` — add `month_occupancy_pct` and `revenue_mtd_actual_usd` fields**

Replace the existing comment block + field definitions in `BuildingBucket` (lines 33-49) with the version below. Specifically insert `revenue_mtd_actual_usd` directly after `revenue_created_mtd_usd`, and `month_occupancy_pct` directly after `backward_occupancy_pct`:

```ts
  // ---- MTD performance ----
  // Three revenue lines now:
  //   revenue_mtd_actual_usd = host_payout for reservations whose CHECK-IN
  //                            is in [start_of_month, today] — TRUE past-only
  //                            MTD revenue (no future check-ins).
  //   revenue_mtd_usd        = host_payout for reservations whose CHECK-IN
  //                            is anywhere in this calendar month (incl.
  //                            future). This IS the "Month Revenue (OTB)"
  //                            number — name kept for backward compat with
  //                            historical snapshots; UI labels it as such.
  //   revenue_created_mtd_usd = host_payout for reservations CREATED in this
  //                            calendar month (Guesty Analytics parity).
  // All three shown side-by-side in the daily report so methodology is
  // explicit and the operator can cross-check Guesty UI.
  revenue_mtd_usd: number;
  revenue_mtd_actual_usd: number;
  revenue_created_mtd_usd: number;
  forward_occupancy_pct: number;   // today → end of month, on-the-books
  backward_occupancy_pct: number;  // start-of-month → today, classic %
  month_occupancy_pct: number;     // whole-month OTB = (nights_mtd + forward_nights_booked) / (days_total × total_units) × 100
  backward_avg_units_per_day: number; // user's literal formula: nights/days_elapsed
```

- [ ] **Step 2: Run typecheck — expect failures in build-buildings.ts**

Run: `npx tsc --noEmit 2>&1 | grep -E "build-buildings|types\.ts" | head -20`
Expected: errors in `build-buildings.ts` about missing properties `revenue_mtd_actual_usd` and `month_occupancy_pct` in returned bucket literals. These are the gaps Task 2 fills.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady-daily-report/types.ts
git commit -m "feat(beithady-daily-report): add month_occupancy_pct + revenue_mtd_actual_usd to BuildingBucket"
```

---

## Task 2: Compute the new fields in build-buildings.ts

**Files:**
- Modify: `src/lib/beithady-daily-report/build-buildings.ts:21-86, 189-300, 340-370`

- [ ] **Step 1: Add zero defaults to `emptyBucket()` (line 22-41)**

Replace the function body so it includes the two new zeros (slot them in the same order as the type):

```ts
function emptyBucket(total_units: number): BuildingBucket {
  return {
    total_units,
    occupied_today: 0,
    occupancy_today_pct: 0,
    check_ins_today: 0,
    check_outs_today: 0,
    turnovers_today: 0,
    revenue_mtd_usd: 0,
    revenue_mtd_actual_usd: 0,
    revenue_created_mtd_usd: 0,
    forward_occupancy_pct: 0,
    backward_occupancy_pct: 0,
    month_occupancy_pct: 0,
    backward_avg_units_per_day: 0,
    adr_mtd_usd: 0,
    opportunity_nights: 0,
    opportunity_value_usd: 0,
    bookings_per_day_mtd: 0,
    avg_lead_time_days: 0,
    pickup_vs_prior_month_pct: 0,
    avg_los_nights: 0,
  };
}
```

- [ ] **Step 2: Add `revenue_actual_usd` to the Accumulator type (line 44-65)**

Insert a new field after `revenue_usd` in the type definition and after `revenue_usd: 0` in `emptyAcc()`:

```ts
type Accumulator = {
  // Today
  occupied_listings: Set<string>;
  check_ins: number;
  check_outs: number;
  checkin_listings: Set<string>;
  checkout_listings: Set<string>;
  // MTD
  revenue_usd: number;                      // host_payout, check-in attribution — month OTB (incl. future)
  revenue_actual_usd: number;               // host_payout, check-in attribution — past only ([start, today])
  revenue_created_mtd_usd: number;
  nights_mtd: number;
  forward_nights_booked: number;
  backward_nights_started_in_month: number;
  // Pace
  bookings_created_mtd: number;
  lead_time_sum: number;
  lead_time_n: number;
  bookings_created_prior_mtd: number;
  // LoS
  los_sum: number;
  los_n: number;
};

function emptyAcc(): Accumulator {
  return {
    occupied_listings: new Set(),
    check_ins: 0,
    check_outs: 0,
    checkin_listings: new Set(),
    checkout_listings: new Set(),
    revenue_usd: 0,
    revenue_actual_usd: 0,
    revenue_created_mtd_usd: 0,
    nights_mtd: 0,
    forward_nights_booked: 0,
    backward_nights_started_in_month: 0,
    bookings_created_mtd: 0,
    lead_time_sum: 0,
    lead_time_n: 0,
    bookings_created_prior_mtd: 0,
    los_sum: 0,
    los_n: 0,
  };
}
```

- [ ] **Step 3: Accumulate `revenue_actual_usd` in the per-reservation loop (line 202-208)**

Find the existing block:

```ts
    const usd = r.host_payout_usd || 0;
    const totalNights = r.nights || 0;
    const nightsThisMonth = nightsInRange(r, monthStart, monthEnd);
    if (r.check_in_date && r.check_in_date >= monthStart && r.check_in_date <= monthEnd) {
      acc.revenue_usd += usd;
      accAll.revenue_usd += usd;
    }
```

Append the new accumulator block immediately after it (before the `const nightsMtdElapsed = …` line):

```ts
    if (r.check_in_date && r.check_in_date >= monthStart && r.check_in_date <= today) {
      acc.revenue_actual_usd += usd;
      accAll.revenue_actual_usd += usd;
    }
```

- [ ] **Step 4: Emit `revenue_mtd_actual_usd` + `month_occupancy_pct` in the per_building materialization (around line 294)**

Find the per-building bucket literal (it currently includes `revenue_mtd_usd: round2(acc.revenue_usd)` and `forward_occupancy_pct` and `backward_occupancy_pct`). Add two new key/value lines so the literal reads:

```ts
      revenue_mtd_usd: round2(acc.revenue_usd),
      revenue_mtd_actual_usd: round2(acc.revenue_actual_usd),
      revenue_created_mtd_usd: round2(acc.revenue_created_mtd_usd),
      forward_occupancy_pct: pct(acc.forward_nights_booked, fwd_avail),
      backward_occupancy_pct: pct(acc.nights_mtd, ctx.days_elapsed * units),
      month_occupancy_pct: pct(
        acc.nights_mtd + acc.forward_nights_booked,
        ctx.days_total * units
      ),
```

- [ ] **Step 5: Emit the same two fields in the `all` materialization (around line 361)**

Find the `all` bucket literal at the end of the function. Apply the same edits but using `accAll` and `totalUnits`:

```ts
    revenue_mtd_usd: round2(accAll.revenue_usd),
    revenue_mtd_actual_usd: round2(accAll.revenue_actual_usd),
    revenue_created_mtd_usd: round2(accAll.revenue_created_mtd_usd),
    forward_occupancy_pct: pct(accAll.forward_nights_booked, fwd_avail_all),
    backward_occupancy_pct: pct(accAll.nights_mtd, ctx.days_elapsed * totalUnits),
    month_occupancy_pct: pct(
      accAll.nights_mtd + accAll.forward_nights_booked,
      ctx.days_total * totalUnits
    ),
```

- [ ] **Step 6: Run typecheck — expect clean**

Run: `npx tsc --noEmit 2>&1 | grep -E "build-buildings|types\.ts"`
Expected: zero matching errors (the 2 pre-existing unrelated `qrcode` / `@testing-library/react` errors are unchanged and acceptable).

- [ ] **Step 7: Commit**

```bash
git add src/lib/beithady-daily-report/build-buildings.ts
git commit -m "feat(beithady-daily-report): compute month_occupancy_pct + revenue_mtd_actual_usd"
```

---

## Task 3: Add unit tests for the new build-buildings fields

**Files:**
- Create: `src/lib/beithady-daily-report/build-buildings.test.ts`

- [ ] **Step 1: Write the failing test**

Create the new test file with this exact content:

```ts
import { describe, it, expect } from 'vitest';
import { buildBuildingsTable } from './build-buildings';
import type { ReservationRow } from './reservations';
import type { AllInventories } from './units';
import type { MonthRange } from './cairo-dates';

// Minimal fixtures — May 2026 (31 days). "Today" = May 12 (12 days elapsed, 19 remaining).
const ctx: MonthRange = {
  today: '2026-05-12',
  start: '2026-05-01',
  end: '2026-05-31',
  days_total: 31,
  days_elapsed: 12,
  days_remaining: 19,
} as MonthRange;

// 5 total units across BH-26 only — keep fixture small so the math is hand-checkable.
const inventories: AllInventories = {
  'BH-26': { total_units: 5, listings: new Map() },
  'BH-73': { total_units: 0, listings: new Map() },
  'BH-435': { total_units: 0, listings: new Map() },
  'BH-OK': { total_units: 0, listings: new Map() },
  OTHER: { total_units: 0, listings: new Map() },
} as unknown as AllInventories;

function res(opts: {
  id: string;
  check_in: string;
  check_out: string;
  nights: number;
  host_payout: number;
  building?: 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';
}): ReservationRow {
  return {
    id: opts.id,
    listing_id: 'L-' + opts.id,
    building: opts.building ?? 'BH-26',
    check_in_date: opts.check_in,
    check_out_date: opts.check_out,
    nights: opts.nights,
    host_payout_usd: opts.host_payout,
    status: 'confirmed',
    created_at_iso: opts.check_in + 'T00:00:00Z',
    channel: 'Airbnb',
  } as unknown as ReservationRow;
}

describe('buildBuildingsTable — new month-oriented fields', () => {
  it('revenue_mtd_actual_usd includes past check-ins and excludes future ones', () => {
    const reservations: ReservationRow[] = [
      // Past check-in (May 5) — counts toward both fields
      res({ id: 'A', check_in: '2026-05-05', check_out: '2026-05-08', nights: 3, host_payout: 1000 }),
      // Today's check-in (May 12) — counts toward both fields (today is inclusive in actual)
      res({ id: 'B', check_in: '2026-05-12', check_out: '2026-05-15', nights: 3, host_payout: 600 }),
      // Future check-in (May 20) — counts toward revenue_mtd_usd (whole-month OTB) only
      res({ id: 'C', check_in: '2026-05-20', check_out: '2026-05-23', nights: 3, host_payout: 800 }),
    ];

    const out = buildBuildingsTable(reservations, inventories, ctx);

    expect(out.all.revenue_mtd_actual_usd).toBe(1600);     // A + B
    expect(out.all.revenue_mtd_usd).toBe(2400);             // A + B + C
    expect(out.per_building['BH-26'].revenue_mtd_actual_usd).toBe(1600);
    expect(out.per_building['BH-26'].revenue_mtd_usd).toBe(2400);
  });

  it('month_occupancy_pct blends past nights sold + forward nights booked over total month unit-nights', () => {
    // 1 reservation: May 8 → May 22 (14 nights total).
    // 5 units × 31 days = 155 total unit-nights for the month.
    // nights_mtd ([May 1, May 12]) covers May 8-12 = 5 nights.
    // forward_nights_booked ((May 12, May 31]) covers May 13-22 = 9 nights.
    // month_occupancy = (5 + 9) / 155 × 100 = 9.03%
    const reservations: ReservationRow[] = [
      res({ id: 'A', check_in: '2026-05-08', check_out: '2026-05-22', nights: 14, host_payout: 1400 }),
    ];

    const out = buildBuildingsTable(reservations, inventories, ctx);

    expect(out.all.month_occupancy_pct).toBeCloseTo(9.0, 1);
    expect(out.per_building['BH-26'].month_occupancy_pct).toBeCloseTo(9.0, 1);
  });

  it('month_occupancy_pct = 0 when no reservations', () => {
    const out = buildBuildingsTable([], inventories, ctx);
    expect(out.all.month_occupancy_pct).toBe(0);
    expect(out.all.revenue_mtd_actual_usd).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/lib/beithady-daily-report/build-buildings.test.ts`
Expected: 3 tests pass, 0 fail.

If any test fails, recheck the fixture math by hand against the `pct()` helper (which is `Math.round((num/den) × 1000) / 10`) — `pct(14, 155) = 9.0`.

- [ ] **Step 3: Run the full suite to check nothing regressed**

Run: `npm run test`
Expected: 329 pass (326 prior + 3 new), 22 skipped, 1 pre-existing module-load failure on `fmplus-logo.test.tsx` unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady-daily-report/build-buildings.test.ts
git commit -m "test(beithady-daily-report): cover month_occupancy_pct + revenue_mtd_actual_usd"
```

---

## Task 4: Extend HeroKpiId + SparklinesSection

**Files:**
- Modify: `src/lib/beithady-daily-report/types.ts:447-448`

- [ ] **Step 1: Add 4 new IDs to the `HeroKpiId` union**

Replace the existing two-line definition with:

```ts
export type HeroKpiId =
  | 'occupancy'
  | 'mtd_occupancy'
  | 'month_to_end_occupancy'
  | 'month_occupancy'
  | 'mtd_revenue'              // historical: now represents Month Revenue (OTB)
  | 'mtd_revenue_actual'
  | 'revpar'
  | 'pace'
  | 'reviews_avg'
  | 'response_time';
export type SparklinesSection = Record<HeroKpiId, number[]>;
```

`SparklinesSection` automatically picks up the new IDs because it's a `Record<HeroKpiId, …>`.

- [ ] **Step 2: Run typecheck — expect failures in build-sparklines.ts**

Run: `npx tsc --noEmit 2>&1 | grep -E "build-sparklines" | head -10`
Expected: errors about `Property 'mtd_occupancy' is missing in type` (and the other three new IDs) when constructing the `series` object. Task 5 closes these gaps.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady-daily-report/types.ts
git commit -m "feat(beithady-daily-report): extend HeroKpiId with 4 month-oriented IDs"
```

---

## Task 5: Populate new sparkline series in build-sparklines.ts

**Files:**
- Modify: `src/lib/beithady-daily-report/build-sparklines.ts:29-47`

- [ ] **Step 1: Initialize empty arrays for the new IDs**

Replace the `series` initializer (line 29-36) with:

```ts
    const series: SparklinesSection = {
      occupancy: [],
      mtd_occupancy: [],
      month_to_end_occupancy: [],
      month_occupancy: [],
      mtd_revenue: [],
      mtd_revenue_actual: [],
      revpar: [],
      pace: [],
      reviews_avg: [],
      response_time: [],
    };
```

- [ ] **Step 2: Push the new fields from each snapshot row**

Replace the `for (const row …)` loop body (line 38-47) with:

```ts
    for (const row of data as Array<{ report_date: string; payload: unknown }>) {
      const p = row.payload as DailyReportPayload;
      series.occupancy.push(p.all?.occupancy_today_pct ?? 0);
      series.mtd_occupancy.push(p.all?.backward_occupancy_pct ?? 0);
      series.month_to_end_occupancy.push(p.all?.forward_occupancy_pct ?? 0);
      series.month_occupancy.push(p.all?.month_occupancy_pct ?? 0);
      series.mtd_revenue.push(p.all?.revenue_mtd_usd ?? 0);
      series.mtd_revenue_actual.push(p.all?.revenue_mtd_actual_usd ?? 0);
      // revpar is a v4 field — may be absent in older snapshots
      series.revpar.push((p as { revpar?: { all?: number } | null }).revpar?.all ?? 0);
      series.pace.push(p.all?.pickup_vs_prior_month_pct ?? 0);
      series.reviews_avg.push(p.reviews?.avg_rating_mtd ?? 0);
      series.response_time.push(p.conversations?.yesterday?.avg_response_minutes ?? 0);
    }
```

The `?? 0` fallback keeps old snapshots (pre-deploy) from crashing — they'll show flat-zero sparklines for the new IDs until enough new snapshots accumulate.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "build-sparklines"`
Expected: zero matches.

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady-daily-report/build-sparklines.ts
git commit -m "feat(beithady-daily-report): emit 4 new sparkline series"
```

---

## Task 6: Update build-sparklines.test.ts assertions

**Files:**
- Modify: `src/lib/beithady-daily-report/build-sparklines.test.ts:7-15, 37-46`

- [ ] **Step 1: Extend the fake payloads with the new fields**

Replace the `fakeRows` constant (line 3-20) with:

```ts
const fakeRows = [
  {
    report_date: '2026-04-29',
    payload: {
      all: {
        occupancy_today_pct: 38,
        backward_occupancy_pct: 35,
        forward_occupancy_pct: 60,
        month_occupancy_pct: 50,
        revenue_mtd_usd: 4000,
        revenue_mtd_actual_usd: 2400,
        pickup_vs_prior_month_pct: 50,
      },
      reviews: { avg_rating_mtd: 4.7 },
      conversations: { yesterday: { avg_response_minutes: 50 } },
    },
  },
  {
    report_date: '2026-04-30',
    payload: {
      all: {
        occupancy_today_pct: 42,
        backward_occupancy_pct: 38,
        forward_occupancy_pct: 65,
        month_occupancy_pct: 55,
        revenue_mtd_usd: 9000,
        revenue_mtd_actual_usd: 5400,
        pickup_vs_prior_month_pct: 55,
      },
      reviews: { avg_rating_mtd: 4.8 },
      conversations: { yesterday: { avg_response_minutes: 45 } },
    },
  },
];
```

- [ ] **Step 2: Add assertions for the 4 new series in the existing "returns chronological series" test**

Replace the existing `it('returns chronological series per hero KPI', …)` body with:

```ts
  it('returns chronological series per hero KPI', async () => {
    const { buildSparklines } = await import('./build-sparklines');
    const out = await buildSparklines('2026-04-30');
    expect(out).not.toBeNull();
    expect(out!.occupancy).toEqual([38, 42]);
    expect(out!.mtd_occupancy).toEqual([35, 38]);
    expect(out!.month_to_end_occupancy).toEqual([60, 65]);
    expect(out!.month_occupancy).toEqual([50, 55]);
    expect(out!.mtd_revenue).toEqual([4000, 9000]);
    expect(out!.mtd_revenue_actual).toEqual([2400, 5400]);
    expect(out!.reviews_avg).toEqual([4.7, 4.8]);
    expect(out!.response_time).toEqual([50, 45]);
    expect(out!.pace).toEqual([50, 55]);
  });
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/lib/beithady-daily-report/build-sparklines.test.ts`
Expected: 3 tests pass (the existing 3 in this file — extended, still 3 cases).

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady-daily-report/build-sparklines.test.ts
git commit -m "test(beithady-daily-report): cover new sparkline series"
```

---

## Task 7: Update render-pdf.tsx — three revenue lines

**Files:**
- Modify: `src/lib/beithady-daily-report/render-pdf.tsx:245-253`

- [ ] **Step 1: Replace the two-line revenue block in the buildings table column definition**

Find the existing block (line 245-253):

```tsx
    {
      section: 'MONTH-TO-DATE',
      label: 'Revenue (check-in this month)',
      val: b => ({ text: fmtUsd(b.revenue_mtd_usd), bold: true }),
    },
    {
      label: 'Revenue (booked this month)',
      val: b => ({ text: fmtUsd(b.revenue_created_mtd_usd), bold: true }),
    },
```

Replace with:

```tsx
    {
      section: 'MONTH-TO-DATE',
      label: 'MTD Revenue (check-ins so far)',
      val: b => ({ text: fmtUsd(b.revenue_mtd_actual_usd), bold: true }),
    },
    {
      label: 'Month Revenue (incl. confirmed → EOM)',
      val: b => ({ text: fmtUsd(b.revenue_mtd_usd), bold: true }),
    },
    {
      label: 'Revenue (booked this month)',
      val: b => ({ text: fmtUsd(b.revenue_created_mtd_usd), bold: true }),
    },
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep render-pdf`
Expected: zero matches.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady-daily-report/render-pdf.tsx
git commit -m "feat(beithady-daily-report): PDF — three-line revenue layout"
```

---

## Task 8: Update render-html.tsx — three revenue lines

**Files:**
- Modify: `src/lib/beithady-daily-report/render-html.tsx:157-166`

- [ ] **Step 1: Replace the two-line revenue block**

Find the existing block:

```tsx
    {
      label: 'Revenue (check-in this month)',
      val: b => <strong>{fmtUsd1(b.revenue_mtd_usd)}</strong>,
      section: 'mtd',
      sectionLabel: 'MONTH-TO-DATE',
    },
    {
      label: 'Revenue (booked this month)',
      val: b => <strong>{fmtUsd1(b.revenue_created_mtd_usd)}</strong>,
    },
```

Replace with:

```tsx
    {
      label: 'MTD Revenue (check-ins so far)',
      val: b => <strong>{fmtUsd1(b.revenue_mtd_actual_usd)}</strong>,
      section: 'mtd',
      sectionLabel: 'MONTH-TO-DATE',
    },
    {
      label: 'Month Revenue (incl. confirmed → EOM)',
      val: b => <strong>{fmtUsd1(b.revenue_mtd_usd)}</strong>,
    },
    {
      label: 'Revenue (booked this month)',
      val: b => <strong>{fmtUsd1(b.revenue_created_mtd_usd)}</strong>,
    },
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep render-html`
Expected: zero matches.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady-daily-report/render-html.tsx
git commit -m "feat(beithady-daily-report): HTML preview — three-line revenue layout"
```

---

## Task 9: Update distribute.ts — WhatsApp + Gmail body revenue lines

**Files:**
- Modify: `src/lib/beithady-daily-report/distribute.ts:66-68, 116-119`

- [ ] **Step 1: Replace the WhatsApp text revenue lines (line 66-68)**

Find:

```ts
    `💰 *Revenue (check-in this month)*: ${fmtUsd1(all.revenue_mtd_usd)}` +
      (pickup !== 0 ? ` (${arrow}${pickup.toFixed(1)}% vs prior month)` : ''),
    `📒 *Revenue (booked this month)*: ${fmtUsd1(all.revenue_created_mtd_usd)} _(Guesty Analytics parity)_`,
```

Replace with:

```ts
    `💰 *MTD Revenue (check-ins so far)*: ${fmtUsd1(all.revenue_mtd_actual_usd)}`,
    `📈 *Month Revenue (incl. confirmed → EOM)*: ${fmtUsd1(all.revenue_mtd_usd)}` +
      (pickup !== 0 ? ` (${arrow}${pickup.toFixed(1)}% vs prior month)` : ''),
    `📒 *Revenue (booked this month)*: ${fmtUsd1(all.revenue_created_mtd_usd)} _(Guesty Analytics parity)_`,
```

- [ ] **Step 2: Replace the Gmail HTML body revenue rows (line 116-119)**

Find:

```ts
            <tr><td style="padding:5px 0;color:#374b6b;">Revenue <span style="color:#7a8aa3;font-size:10px;">(check-in this month)</span></td>
                <td style="padding:5px 0;text-align:right;font-weight:600;color:#1a2c47;">${fmtUsd(all.revenue_mtd_usd)} ${pickupStr}</td></tr>
            <tr><td style="padding:5px 0;color:#374b6b;">Revenue <span style="color:#7a8aa3;font-size:10px;">(booked this month · Guesty Analytics parity)</span></td>
                <td style="padding:5px 0;text-align:right;font-weight:600;color:#1a2c47;">${fmtUsd(all.revenue_created_mtd_usd)}</td></tr>
```

Replace with:

```ts
            <tr><td style="padding:5px 0;color:#374b6b;">MTD Revenue <span style="color:#7a8aa3;font-size:10px;">(check-ins so far)</span></td>
                <td style="padding:5px 0;text-align:right;font-weight:600;color:#1a2c47;">${fmtUsd(all.revenue_mtd_actual_usd)}</td></tr>
            <tr><td style="padding:5px 0;color:#374b6b;">Month Revenue <span style="color:#7a8aa3;font-size:10px;">(incl. confirmed → EOM)</span></td>
                <td style="padding:5px 0;text-align:right;font-weight:600;color:#1a2c47;">${fmtUsd(all.revenue_mtd_usd)} ${pickupStr}</td></tr>
            <tr><td style="padding:5px 0;color:#374b6b;">Revenue <span style="color:#7a8aa3;font-size:10px;">(booked this month · Guesty Analytics parity)</span></td>
                <td style="padding:5px 0;text-align:right;font-weight:600;color:#1a2c47;">${fmtUsd(all.revenue_created_mtd_usd)}</td></tr>
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep distribute`
Expected: zero matches.

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady-daily-report/distribute.ts
git commit -m "feat(beithady-daily-report): WhatsApp + Gmail — three-line revenue layout"
```

---

## Task 10: Update build.ts digest one-liner

**Files:**
- Modify: `src/lib/beithady-daily-report/build.ts:248-260, 333-346, 354-363`

- [ ] **Step 1: Add `revenueMtdActual` to the digest payload (line 248-260)**

Find the digest input object (look for `revenueMtd: buildings.all.revenue_mtd_usd`). Insert a `revenueMtdActual` field next to it:

```ts
    revenueMtd: buildings.all.revenue_mtd_usd,
    revenueMtdActual: buildings.all.revenue_mtd_actual_usd,
    revenueCreatedMtd: buildings.all.revenue_created_mtd_usd,
```

- [ ] **Step 2: Extend the digest-payload type (line 335-346)**

Find the type definition with `revenueMtd: number; revenueCreatedMtd: number;` and add the new field between them:

```ts
  revenueMtd: number;
  revenueMtdActual: number;
  revenueCreatedMtd: number;
```

- [ ] **Step 3: Update the digest one-liner template (line 358-363)**

Find:

```ts
    `${p.monthLabelStr} revenue ${fmtUsd(p.revenueMtd)} (check-in)${pickup} · ` +
    `${fmtUsd(p.revenueCreatedMtd)} (booked, Guesty Analytics parity). ` +
```

Replace with:

```ts
    `${p.monthLabelStr} revenue ${fmtUsd(p.revenueMtd)} (month, OTB)${pickup} · ` +
    `${fmtUsd(p.revenueMtdActual)} MTD actual · ` +
    `${fmtUsd(p.revenueCreatedMtd)} (booked, Guesty Analytics parity). ` +
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "build\.ts"`
Expected: zero matches.

- [ ] **Step 5: Run full suite to confirm no test regressed**

Run: `npm run test`
Expected: 329 pass, 22 skipped, 1 pre-existing failure.

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady-daily-report/build.ts
git commit -m "feat(beithady-daily-report): digest one-liner — three-line revenue"
```

---

## Task 11: Rename `mtd_revenue_usd` to `month_revenue_otb_usd` in AI insights compact payload

**Files:**
- Modify: `src/lib/beithady-daily-report/build-insights.ts:18`

- [ ] **Step 1: Rename the field**

Find line 18:

```ts
      mtd_revenue_usd: payload.all?.revenue_mtd_usd ?? null,
```

Replace with:

```ts
      month_revenue_otb_usd: payload.all?.revenue_mtd_usd ?? null,
      mtd_revenue_actual_usd: payload.all?.revenue_mtd_actual_usd ?? null,
```

This adds both fields to the compact payload the AI sees so its bullets can reason about the past-vs-OTB distinction.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep build-insights`
Expected: zero matches.

- [ ] **Step 3: Run full suite**

Run: `npm run test`
Expected: 329 pass, 22 skipped, 1 pre-existing failure. `build-insights.test.ts` is mocked at the Anthropic level so doesn't care about field names.

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady-daily-report/build-insights.ts
git commit -m "feat(beithady-daily-report): expose month_revenue_otb + mtd_revenue_actual to AI insights"
```

---

## Task 12: Register 4 new hero panel IDs in panel-registry.ts

**Files:**
- Modify: `src/app/beithady/analytics/performance/_lib/panel-registry.ts:5-30, 53-90`

- [ ] **Step 1: Extend `PanelId` with 4 new hero IDs**

Find the existing `PanelId` union (line 5-30) and add the new ones in the hero group:

```ts
export type PanelId =
  | 'ai-insights'
  | 'daily-activity'
  | 'top-movers'
  | 'hero-occupancy'
  | 'hero-mtd-occupancy'
  | 'hero-month-to-end-occupancy'
  | 'hero-month-occupancy'
  | 'hero-mtd-revenue'
  | 'hero-mtd-revenue-actual'
  | 'hero-revpar'
  | 'hero-pace'
  | 'hero-reviews-avg'
  | 'hero-response-time'
  | 'buildings-table'
  | 'channel-mix'
  | 'payouts'
  | 'reviews-block'
  | 'cleaning-turnovers'
  | 'inquiry-sla'
  | 'check-ins-payment'
  | 'cancellations'
  | 'forward-occupancy'
  | 'cancel-risk'
  | 'monthly-goal'
  | 'revenue-concentration'
  | 'occupancy-gap-finder'
  | 'revenue-waterfall'
  | 'stly-yoy'
  | 'snapshot-scrubber';
```

- [ ] **Step 2: Add the new descriptors to the `PANELS` array hero block (line 57-63)**

Replace the existing 6-line hero block with the 10-line version below, in the final display order from the spec:

```ts
  // Hero (always-on by default — these are the morning glance)
  { id: 'hero-occupancy', label: 'Occupancy today', group: 'hero', defaultVisible: true },
  { id: 'hero-mtd-occupancy', label: 'MTD Occupancy', group: 'hero', defaultVisible: true },
  { id: 'hero-month-to-end-occupancy', label: 'Month-to-End Occupancy', group: 'hero', defaultVisible: true },
  { id: 'hero-month-occupancy', label: 'Month Occupancy', group: 'hero', defaultVisible: true },
  { id: 'hero-pace', label: 'Pace', group: 'hero', defaultVisible: true },
  { id: 'hero-mtd-revenue-actual', label: 'MTD Revenue (actual)', group: 'hero', defaultVisible: true },
  { id: 'hero-mtd-revenue', label: 'Month Revenue (OTB)', group: 'hero', defaultVisible: true },
  { id: 'hero-revpar', label: 'RevPAR', group: 'hero', defaultVisible: true },
  { id: 'hero-reviews-avg', label: 'Reviews avg', group: 'hero', defaultVisible: true },
  { id: 'hero-response-time', label: 'Response time', group: 'hero', defaultVisible: true },
```

- [ ] **Step 3: Run typecheck — expect failures in dashboard-shell.tsx**

Run: `npx tsc --noEmit 2>&1 | grep -E "panel-registry|dashboard-shell" | head -10`
Expected: dashboard-shell.tsx errors about missing `visibility['hero-mtd-occupancy']` etc. — those resolve in Task 13.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/performance/_lib/panel-registry.ts
git commit -m "feat(beithady/perf): register 4 new hero panel IDs"
```

---

## Task 13: Update dashboard-shell.tsx hero strip (10 cards, 2 rows of 5)

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx:107-174`

- [ ] **Step 1: Replace the hero strip block**

Find the existing block bounded by the comment `{/* Hero KPI strip — wraps 2-up → 3-up → 6-up by viewport */}` and the closing `</div>` that ends with `setPanel('hero-response-time', false)`. Replace it entirely with:

```tsx
          {/* Hero KPI strip — 10 cards, 2 rows of 5 on xl, responsive down */}
          <div className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5">
            {visibility['hero-occupancy'] && (
              <HeroKpi
                label="Occupancy today"
                value={`${payload.all.occupancy_today_pct.toFixed(1)}%`}
                delta={{ direction: 'flat', text: 'today' }}
                spark={payload.sparklines?.occupancy}
                drillTo="/beithady/analytics/performance"
                accent="ink"
                onHide={() => setPanel('hero-occupancy', false)}
              />
            )}
            {visibility['hero-mtd-occupancy'] && (
              <HeroKpi
                label="MTD Occupancy"
                value={`${payload.all.backward_occupancy_pct.toFixed(1)}%`}
                delta={{ direction: 'flat', text: '1st → today' }}
                spark={payload.sparklines?.mtd_occupancy}
                drillTo="/beithady/analytics/performance?metric=backward-occupancy"
                accent="steel"
                onHide={() => setPanel('hero-mtd-occupancy', false)}
              />
            )}
            {visibility['hero-month-to-end-occupancy'] && (
              <HeroKpi
                label="Month-to-End Occupancy"
                value={`${payload.all.forward_occupancy_pct.toFixed(1)}%`}
                delta={{ direction: 'flat', text: 'today → EOM, OTB' }}
                spark={payload.sparklines?.month_to_end_occupancy}
                drillTo="/beithady/analytics/performance?metric=forward-occupancy"
                accent="steel"
                onHide={() => setPanel('hero-month-to-end-occupancy', false)}
              />
            )}
            {visibility['hero-month-occupancy'] && (
              <HeroKpi
                label="Month Occupancy"
                value={`${(payload.all.month_occupancy_pct ?? 0).toFixed(1)}%`}
                delta={{ direction: 'flat', text: 'whole month, OTB' }}
                spark={payload.sparklines?.month_occupancy}
                drillTo="/beithady/analytics/performance?metric=month-occupancy"
                accent="gold"
                onHide={() => setPanel('hero-month-occupancy', false)}
              />
            )}
            {visibility['hero-pace'] && (
              <HeroKpi
                label="Pace"
                value={`${payload.all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${payload.all.pickup_vs_prior_month_pct.toFixed(1)}%`}
                delta={{ direction: payload.all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: 'vs prior month' }}
                spark={payload.sparklines?.pace}
                drillTo={`/beithady/analytics/performance?date=${snapshotDate}&compare=last-month`}
                accent={paceAccent as 'green' | 'red'}
                onHide={() => setPanel('hero-pace', false)}
              />
            )}
            {visibility['hero-mtd-revenue-actual'] && (
              <HeroKpi
                label="MTD Revenue"
                value={`$${((payload.all.revenue_mtd_actual_usd ?? 0) / 1000).toFixed(1)}k`}
                delta={{ direction: 'flat', text: 'check-ins so far' }}
                spark={payload.sparklines?.mtd_revenue_actual}
                drillTo="/beithady/financials?period=mtd-actual"
                accent="gold"
                onHide={() => setPanel('hero-mtd-revenue-actual', false)}
              />
            )}
            {visibility['hero-mtd-revenue'] && (
              <HeroKpi
                label="Month Revenue (OTB)"
                value={`$${(payload.all.revenue_mtd_usd / 1000).toFixed(1)}k`}
                delta={{ direction: payload.all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: 'incl. confirmed → EOM' }}
                spark={payload.sparklines?.mtd_revenue}
                drillTo="/beithady/financials?period=month-otb"
                accent="gold"
                onHide={() => setPanel('hero-mtd-revenue', false)}
              />
            )}
            {visibility['hero-revpar'] && (
              <HeroKpi
                label="RevPAR"
                value={payload.revpar?.all != null ? `$${payload.revpar.all.toFixed(2)}` : `$${payload.all.adr_mtd_usd.toFixed(0)}`}
                delta={payload.revpar?.all != null ? { direction: 'flat', text: 'rev / available night' } : { direction: 'flat', text: 'ADR (RevPAR pending)' }}
                spark={payload.sparklines?.revpar}
                drillTo="/beithady/financials?metric=revpar"
                accent="steel"
                onHide={() => setPanel('hero-revpar', false)}
              />
            )}
            {visibility['hero-reviews-avg'] && (
              <HeroKpi
                label="Reviews avg"
                value={`${payload.reviews.avg_rating_mtd.toFixed(1)}★`}
                delta={{ direction: 'flat', text: `${payload.reviews.count_mtd} reviews · ${payload.reviews.last_24h.filter((r) => r.flagged).length} flagged` }}
                spark={payload.sparklines?.reviews_avg}
                drillTo="/beithady/analytics/reviews?period=mtd"
                accent="amber"
                onHide={() => setPanel('hero-reviews-avg', false)}
              />
            )}
            {visibility['hero-response-time'] && (
              <HeroKpi
                label="Response time"
                value={payload.conversations ? `${payload.conversations.yesterday.avg_response_minutes.toFixed(0)}m` : '—'}
                delta={payload.conversations ? { direction: 'flat', text: `first ${payload.conversations.yesterday.first_response_avg_minutes.toFixed(0)}m` } : undefined}
                spark={payload.sparklines?.response_time}
                drillTo="/beithady/communication/unified?metric=response-time"
                accent="steel"
                onHide={() => setPanel('hero-response-time', false)}
              />
            )}
          </div>
```

The `?? 0` fallback on `month_occupancy_pct` and `revenue_mtd_actual_usd` covers the brief window before today's snapshot rebuilds.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep dashboard-shell`
Expected: zero matches.

- [ ] **Step 3: Run full suite**

Run: `npm run test`
Expected: 329 pass, 22 skipped, 1 pre-existing failure.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): hero strip — 10 cards (4 new month KPIs), 2 rows of 5"
```

---

## Task 14: Update landing-pulse.tsx (Today's Pulse hero strip)

**Files:**
- Modify: `src/app/beithady/_components/landing-pulse.tsx:124-204`

- [ ] **Step 1: Replace the hero KPI block**

Find the existing `<div className="grid grid-cols-2 gap-3 px-3 pb-4 sm:grid-cols-3 xl:grid-cols-6" aria-label="Hero KPIs">` and its 6 `<HeroKpi>` children. Replace the whole `<div>…</div>` block with:

```tsx
      <div
        className="grid grid-cols-2 gap-3 px-3 pb-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5"
        aria-label="Hero KPIs"
      >
        <HeroKpi
          label="Occupancy today"
          value={`${all.occupancy_today_pct.toFixed(1)}%`}
          delta={{ direction: 'flat', text: 'today' }}
          spark={payload.sparklines?.occupancy}
          drillTo="/beithady/analytics/performance"
          accent="ink"
        />
        <HeroKpi
          label="MTD Occupancy"
          value={`${all.backward_occupancy_pct.toFixed(1)}%`}
          delta={{ direction: 'flat', text: '1st → today' }}
          spark={payload.sparklines?.mtd_occupancy}
          drillTo="/beithady/analytics/performance?metric=backward-occupancy"
          accent="steel"
        />
        <HeroKpi
          label="Month-to-End Occupancy"
          value={`${all.forward_occupancy_pct.toFixed(1)}%`}
          delta={{ direction: 'flat', text: 'today → EOM, OTB' }}
          spark={payload.sparklines?.month_to_end_occupancy}
          drillTo="/beithady/analytics/performance?metric=forward-occupancy"
          accent="steel"
        />
        <HeroKpi
          label="Month Occupancy"
          value={`${(all.month_occupancy_pct ?? 0).toFixed(1)}%`}
          delta={{ direction: 'flat', text: 'whole month, OTB' }}
          spark={payload.sparklines?.month_occupancy}
          drillTo="/beithady/analytics/performance?metric=month-occupancy"
          accent="gold"
        />
        <HeroKpi
          label="Pace"
          value={`${all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${all.pickup_vs_prior_month_pct.toFixed(1)}%`}
          delta={{
            direction: all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down',
            text: 'vs prior month',
          }}
          spark={payload.sparklines?.pace}
          drillTo={`/beithady/analytics/performance?date=${snapshotDate}&compare=last-month`}
          accent={paceAccent}
        />
        <HeroKpi
          label="MTD Revenue"
          value={`$${((all.revenue_mtd_actual_usd ?? 0) / 1000).toFixed(1)}k`}
          delta={{ direction: 'flat', text: 'check-ins so far' }}
          spark={payload.sparklines?.mtd_revenue_actual}
          drillTo="/beithady/financials?period=mtd-actual"
          accent="gold"
        />
        <HeroKpi
          label="Month Revenue (OTB)"
          value={`$${(all.revenue_mtd_usd / 1000).toFixed(1)}k`}
          delta={{
            direction: all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down',
            text: 'incl. confirmed → EOM',
          }}
          spark={payload.sparklines?.mtd_revenue}
          drillTo="/beithady/financials?period=month-otb"
          accent="gold"
        />
        <HeroKpi
          label="RevPAR"
          value={
            payload.revpar?.all != null
              ? `$${payload.revpar.all.toFixed(2)}`
              : `$${all.adr_mtd_usd.toFixed(0)}`
          }
          delta={
            payload.revpar?.all != null
              ? { direction: 'flat', text: 'rev / available night' }
              : { direction: 'flat', text: 'ADR (RevPAR pending)' }
          }
          spark={payload.sparklines?.revpar}
          drillTo="/beithady/financials?metric=revpar"
          accent="steel"
        />
        <HeroKpi
          label="Reviews avg"
          value={`${payload.reviews.avg_rating_mtd.toFixed(1)}★`}
          delta={{
            direction: 'flat',
            text: `${payload.reviews.count_mtd} reviews · ${payload.reviews.last_24h.filter((r) => r.flagged).length} flagged`,
          }}
          spark={payload.sparklines?.reviews_avg}
          drillTo="/beithady/analytics/reviews?period=mtd"
          accent="amber"
        />
        <HeroKpi
          label="Response time"
          value={
            payload.conversations
              ? `${payload.conversations.yesterday.avg_response_minutes.toFixed(0)}m`
              : '—'
          }
          delta={
            payload.conversations
              ? {
                  direction: 'flat',
                  text: `first ${payload.conversations.yesterday.first_response_avg_minutes.toFixed(0)}m`,
                }
              : undefined
          }
          spark={payload.sparklines?.response_time}
          drillTo="/beithady/communication/unified?metric=response-time"
          accent="steel"
        />
      </div>
```

Note the **first card is renamed to "Occupancy today"** (was "Occupancy") for parity with the dashboard and to distinguish from the new MTD/Month variants.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep landing-pulse`
Expected: zero matches.

- [ ] **Step 3: Run full suite**

Run: `npm run test`
Expected: 329 pass, 22 skipped, 1 pre-existing failure.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/_components/landing-pulse.tsx
git commit -m "feat(beithady): landing pulse — 10 cards (4 new month KPIs), 2 rows of 5"
```

---

## Task 15: Push, deploy, force-trigger cron, smoke test

- [ ] **Step 1: Push to main**

```bash
git fetch origin main
git rebase origin/main
git push origin HEAD:main
```

If rebase has conflicts, resolve them in favor of the worktree changes for source files and in favor of remote for `SESSION_HANDOFF.md`.

- [ ] **Step 2: Wait for Vercel auto-deploy to settle**

The GitHub → Vercel integration deploys on every push to main. Watch the limeinc.vercel.app deploy logs. Skip this step if you used `vercel --prod --yes` as well (worktree-scoped deploys won't reach prod env vars; rely on the integration).

- [ ] **Step 3: Force-rebuild today's snapshot so the new fields populate immediately**

Use cURL (substitute `$CRON_SECRET` from Vercel env):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://limeinc.vercel.app/api/cron/beithady-daily-report?force=1" \
  | head -200
```

Expected: 200 OK with the build summary (~200 lines of JSON). Look for `"month_occupancy_pct"` and `"revenue_mtd_actual_usd"` in the response — they must be present and numeric.

- [ ] **Step 4: Visual smoke test — landing pulse**

Open `https://limeinc.vercel.app/beithady`. Confirm:
- Today's Pulse banner is present.
- The KPI strip shows **10 cards** in two rows of 5.
- Row 1: Occupancy today · MTD Occupancy · Month-to-End · Month Occupancy · Pace.
- Row 2: MTD Revenue · Month Revenue (OTB) · RevPAR · Reviews · Response time.
- The two revenue numbers differ (MTD < Month OTB if any future check-ins are confirmed for the month).

- [ ] **Step 5: Visual smoke test — performance dashboard**

Open `https://limeinc.vercel.app/beithady/analytics/performance`. Confirm the hero strip matches the same 10-card layout and the Customize drawer lists the 4 new entries under "Hero KPIs".

- [ ] **Step 6: Trigger one daily-report distribute run and confirm WhatsApp + Gmail show three revenue lines**

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://limeinc.vercel.app/api/cron/beithady-daily-report?force=1&distribute=1"
```

Check the recipient WhatsApp + email — confirm three revenue lines:
- `MTD Revenue (check-ins so far): $X`
- `Month Revenue (incl. confirmed → EOM): $Y`
- `Revenue (booked this month): $Z (Guesty Analytics parity)`

Open the attached PDF — confirm the per-building table shows the same three lines under MONTH-TO-DATE.

- [ ] **Step 7: Update SESSION_HANDOFF.md**

Append a turn-close note summarizing what shipped, the commits, and the verification results.

```bash
git add SESSION_HANDOFF.md
git commit -m "docs(handoff): Beithady dashboard month-oriented KPI redesign shipped"
git push origin HEAD:main
```

---

## Self-Review

**Spec coverage:**
- Final 10-card set, in display order → Tasks 12, 13, 14 ✓
- Layout grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5` → Tasks 13, 14 ✓
- New payload fields `month_occupancy_pct` + `revenue_mtd_actual_usd` → Tasks 1, 2 ✓
- Builder accumulator + materialization → Task 2 ✓
- Sparkline ID extension + emission → Tasks 4, 5 ✓
- Sparkline tests → Task 6 ✓
- Build-buildings tests → Task 3 ✓
- PDF renderer 3-line revenue → Task 7 ✓
- HTML renderer 3-line revenue → Task 8 ✓
- WhatsApp + Gmail body 3-line revenue → Task 9 ✓
- Digest one-liner correction → Task 10 ✓
- AI insights compact field rename → Task 11 ✓
- Panel registry 4 new IDs → Task 12 ✓
- No backfill needed; cron force trigger → Task 15 step 3 ✓

**Placeholder scan:** No "TBD", "TODO", "appropriate error handling", or "similar to Task N". Each code block is concrete. ✓

**Type consistency:**
- `month_occupancy_pct` used as field name across Tasks 1, 2, 5, 6, 13, 14 ✓
- `revenue_mtd_actual_usd` used across Tasks 1, 2, 5, 6, 9, 10, 13, 14 ✓
- `mtd_revenue_actual` (sparkline ID) used across Tasks 4, 5, 6, 13, 14 ✓
- Panel IDs `hero-mtd-occupancy`, `hero-month-to-end-occupancy`, `hero-month-occupancy`, `hero-mtd-revenue-actual` consistent across Tasks 12, 13 ✓
- `revenueMtdActual` (digest payload key) consistent in Task 10 ✓
