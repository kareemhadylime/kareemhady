# Daily Report v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the Beithady daily-report 09:00 Cairo briefing from "yesterday completed" to "today live, with yesterday closing one-liner + DXB suffix + expected-payouts-next-3-days," and tighten the Guesty sync window so the data is ≤15 min stale at send time.

**Architecture:** New partitioned data-loader functions return `{ egypt, dxb }` so the Egypt-only path stays untouched for other callers (e.g. `daily-activity-live.ts`). Two new tiny builders (`buildYesterdaySummary`, `buildDxbSection`) feed two new payload fields. The orchestrator's `today = yesterday` alias is removed, restoring genuine today-anchored math. Renderers (`distribute.ts`, `render-html.tsx`, `render-pdf.tsx`) rewrite the headline block per the agreed body shape. `vercel.json` adds a `*/15 6-10 * * *` Guesty cron alongside the existing 4-hour cadence.

**Tech Stack:** Next.js 16 / App Router · TypeScript strict · Vitest · Supabase Postgres (`bpjproljatbrbmszwbov`) · Vercel cron · existing daily-report module.

**Source spec:** `docs/superpowers/specs/2026-05-12-daily-report-v3-today-live-dxb-design.md`.

---

## Pre-flight

- [ ] **Step 0.1: Read the spec end-to-end.** All design decisions live there. Anything in this plan that contradicts the spec is a plan bug — fix the plan, don't drift.
- [ ] **Step 0.2: Read the affected modules before starting.** `src/lib/beithady-daily-report/{types.ts, build.ts, build-buildings.ts, build-payouts.ts, reservations.ts, units.ts, distribute.ts, render-html.tsx, render-pdf.tsx}` — at minimum the headline-rendering portions and any sections touching `ctx.today`.
- [ ] **Step 0.3: Verify dev environment.** `npm run test` should pass on `main` before you start. If anything is broken first, fix or report — don't pile on top of red.

---

## Task 1: Add payload type definitions

**Files:**
- Modify: `src/lib/beithady-daily-report/types.ts`

- [ ] **Step 1.1: Read `types.ts` end-to-end** to locate `DailyReportPayload` and `PayoutsSection` definitions.

- [ ] **Step 1.2: Add new types near the bottom of `types.ts`, just before `DailyReportPayload`:**

```ts
// v3 (2026-05-12): yesterday-closing one-liner. Renewal-excluded counts
// matching the same `snapRenewedListings` logic used in build-buildings.ts
// for the today/yesterday turnover detection.
export type YesterdaySummary = {
  occupied: number;          // units occupied at yesterday 23:59 Cairo
  total_units: number;
  check_ins: number;         // same-guest renewals excluded
  check_outs: number;        // same-guest renewals excluded
  turnovers: number;         // different-guest check-out + check-in same day
  revenue_usd: number;       // host_payout_usd summed for yesterday's check-ins
};

// v3 (2026-05-12): DXB partition. Egypt aggregates stay untouched; this is
// a parallel mini-aggregate computed from a DXB-only corpus + inventory.
// `next_3d_total_usd` is Airbnb-only for DXB since Stripe payouts can't
// be partitioned by market (see spec).
export type DxbSection = {
  today: {
    occupied: number;
    total_units: number;
    check_ins: number;
    check_outs: number;
    turnovers: number;
  };
  yesterday: {
    occupied: number;
    total_units: number;
    check_ins: number;
    check_outs: number;
    revenue_usd: number;
  };
  revenue_mtd: {
    check_in_attribution_usd: number;
    booked_attribution_usd: number;
  };
  next_3d_total_usd: number;     // Airbnb-only (DXB-specific limitation)
};
```

- [ ] **Step 1.3: Extend `PayoutsSection` (find the existing type, add the three new fields adjacent to the existing `next_7d_*` fields):**

```ts
// In PayoutsSection — add alongside next_7d_*:
next_3d_airbnb_usd: number;
next_3d_stripe_usd: number;
next_3d_total_usd: number;
```

- [ ] **Step 1.4: Extend `DailyReportPayload` — add three new top-level fields:**

```ts
// Inside the DailyReportPayload type, add:
yesterday_summary: YesterdaySummary;
dxb: DxbSection;
data_fresh_to_iso: string | null;     // max(synced_at) from guesty_reservations
```

- [ ] **Step 1.5: Type-check.**

```bash
npx tsc --noEmit
```

Expected: passes. (Existing code that constructs `DailyReportPayload` will now fail to compile because the new fields are required — that's the next task. For now, type-check only the types file:)

```bash
npx tsc --noEmit src/lib/beithady-daily-report/types.ts
```

Expected: passes.

- [ ] **Step 1.6: Commit.**

```bash
git add src/lib/beithady-daily-report/types.ts
git commit -m "feat(types): add v3 daily-report fields (yesterday_summary, dxb, next_3d_*)"
```

---

## Task 2: Add partitioned data loaders (additive — existing callers untouched)

**Files:**
- Modify: `src/lib/beithady-daily-report/units.ts`
- Modify: `src/lib/beithady-daily-report/reservations.ts`

The existing `loadBuildingInventories()` and `loadReservationCorpus()` keep their signatures (Egypt-only). New sibling functions return `{ egypt, dxb }`. The orchestrator switches over in Task 8; other callers (`daily-activity-live.ts`) keep using the old functions.

- [ ] **Step 2.1: Add `DxbInventory` type + `loadAllInventoriesWithDxb` to `units.ts`.** Append after `loadBuildingInventories`:

```ts
export type DxbInventory = {
  total_units: number;
  physical_listing_ids: string[];
};

export type AllInventoriesWithDxb = {
  egypt: AllInventories;
  dxb: DxbInventory;
};

/**
 * v3 (2026-05-12): partitioned inventory loader. Egypt half is identical
 * to `loadBuildingInventories()` (same filter logic, same physical-unit
 * detection, same fallback). DXB half is a single flat bucket containing
 * all active DXB listings.
 *
 * Reuses the same query — no extra DB round-trip.
 */
export async function loadAllInventoriesWithDxb(): Promise<AllInventoriesWithDxb> {
  const sb = supabaseAdmin();
  const [{ data }, mtlParentIds] = await Promise.all([
    sb
      .from('guesty_listings')
      .select('id, building_code, listing_type, master_listing_id, active, nickname'),
    fetchMtlParentIds(),
  ]);
  const rows = (data || []) as Array<{
    id: string;
    building_code: string | null;
    listing_type: string | null;
    master_listing_id: string | null;
    active: boolean | null;
    nickname: string | null;
  }>;

  const egypt: AllInventories = {
    'BH-26': { total_units: 0, physical_listing_ids: [] },
    'BH-73': { total_units: 0, physical_listing_ids: [] },
    'BH-435': { total_units: 0, physical_listing_ids: [] },
    'BH-OK': { total_units: 0, physical_listing_ids: [] },
    OTHER: { total_units: 0, physical_listing_ids: [] },
    total_all: 0,
    physical_listing_ids_all: [],
  };
  const dxb: DxbInventory = {
    total_units: 0,
    physical_listing_ids: [],
  };

  if (rows.length === 0) {
    // Catalog fallback. DXB catalog rows are tagged so check there too.
    for (const l of BEITHADY_LISTINGS) {
      if (l.unit_type === 'MULTI-UNIT') continue;
      const bcRaw = l.building_tag;
      if (isExcludedFromReport(bcRaw)) {
        dxb.total_units += 1;
        dxb.physical_listing_ids.push(l.guesty_listing_id);
        continue;
      }
      const bucket = bucketBuildingHelper(bcRaw); // see step 2.2
      egypt[bucket].total_units += 1;
      egypt[bucket].physical_listing_ids.push(l.guesty_listing_id);
      egypt.total_all += 1;
      egypt.physical_listing_ids_all.push(l.guesty_listing_id);
    }
    return { egypt, dxb };
  }

  for (const r of rows) {
    if (!isPhysicalUnit({
      id: r.id,
      listing_type: r.listing_type,
      active: r.active,
      nickname: r.nickname,
      master_listing_id: r.master_listing_id,
    }, mtlParentIds)) continue;
    const bcRaw =
      r.building_code ||
      getListingByGuestyId(r.id)?.building_tag ||
      null;
    if (isExcludedFromReport(bcRaw)) {
      dxb.total_units += 1;
      dxb.physical_listing_ids.push(r.id);
      continue;
    }
    const bucket = bucketBuildingHelper(bcRaw);
    egypt[bucket].total_units += 1;
    egypt[bucket].physical_listing_ids.push(r.id);
    egypt.total_all += 1;
    egypt.physical_listing_ids_all.push(r.id);
  }

  return { egypt, dxb };
}
```

- [ ] **Step 2.2: Export `bucketBuilding` so the new loader can reuse it.** Currently it's module-private (line 34 of `units.ts`). Either export it as `bucketBuildingHelper` or inline the logic. Simplest: change `function bucketBuilding(...)` to `export function bucketBuildingHelper(...)` and update the existing single in-file caller. Verify no name conflicts.

- [ ] **Step 2.3: Type-check + run existing tests.**

```bash
npx tsc --noEmit
npm run test
```

Expected: passes. No existing test exercises the new function yet; the modification should be invisible to current behaviour.

- [ ] **Step 2.4: Refactor `reservations.ts` to extract a shared row-loader, then add the partitioned variant.**

To avoid duplicating ~150 lines of query + FX + row-construction code, refactor existing `loadReservationCorpus` into two pieces:

(a) **A new private helper `_loadAllRowsRaw()`** that does the full DB query + dedupe + FX conversion + `ReservationRow` construction — but does NOT apply `isExcludedFromReport`. Each row carries its `building_code_raw` so callers can decide.

(b) **Existing `loadReservationCorpus()` becomes a thin wrapper** that calls `_loadAllRowsRaw()` and filters out DXB (preserving today's behaviour exactly).

(c) **New `loadReservationCorpusWithDxb()`** calls `_loadAllRowsRaw()` and partitions into `{ egypt, dxb }`.

Concretely:

```ts
// 1. Extract _loadAllRowsRaw: the existing body of loadReservationCorpus
//    from `const sb = supabaseAdmin();` through to the final
//    `for (const r of collected)` row-construction loop. Instead of
//    skipping DXB rows at the `isExcludedFromReport` check, attach
//    the building_code_raw to the returned row and let callers filter.

type RawRow = ReservationRow & { _building_code_raw: string | null };

async function _loadAllRowsRaw(
  windowFromYmd: string,
  windowToYmd: string,
  fxDate: Date,
): Promise<RawRow[]> {
  // [Implementer: move the existing body of loadReservationCorpus here,
  //  changing two things:
  //   1. Remove the `if (isExcludedFromReport(listing?.building_code || null)) continue;`
  //      check at line ~180 — keep ALL rows.
  //   2. In the row-construction (lines 181-235), include the raw
  //      building_code as `_building_code_raw: listing?.building_code || null`
  //      so callers can partition.
  //  Return RawRow[] instead of the final {rows, active, canceled} shape.]
}

// 2. loadReservationCorpus becomes a thin wrapper that preserves
//    existing Egypt-only behaviour:

export async function loadReservationCorpus(
  windowFromYmd: string,
  windowToYmd: string,
  fxDate: Date = new Date()
): Promise<ReservationCorpus> {
  const raw = await _loadAllRowsRaw(windowFromYmd, windowToYmd, fxDate);
  const rows: ReservationRow[] = raw
    .filter(r => !isExcludedFromReport(r._building_code_raw))
    .map(({ _building_code_raw, ...rest }) => rest);
  const ACTIVE = new Set(['confirmed', 'checked_in', 'checked_out']);
  return {
    rows,
    active: rows.filter(r => r.status && ACTIVE.has(r.status)),
    canceled: rows.filter(r => r.status === 'canceled'),
  };
}

// 3. New partitioned variant:

export type ReservationCorpusWithDxb = {
  egypt: ReservationCorpus;
  dxb: ReservationCorpus;
};

export async function loadReservationCorpusWithDxb(
  windowFromYmd: string,
  windowToYmd: string,
  fxDate: Date = new Date()
): Promise<ReservationCorpusWithDxb> {
  const raw = await _loadAllRowsRaw(windowFromYmd, windowToYmd, fxDate);
  const egyptRows: ReservationRow[] = [];
  const dxbRows: ReservationRow[] = [];
  for (const r of raw) {
    const { _building_code_raw, ...row } = r;
    if (isExcludedFromReport(_building_code_raw)) dxbRows.push(row);
    else egyptRows.push(row);
  }
  const ACTIVE = new Set(['confirmed', 'checked_in', 'checked_out']);
  const partition = (rows: ReservationRow[]): ReservationCorpus => ({
    rows,
    active: rows.filter(r => r.status && ACTIVE.has(r.status)),
    canceled: rows.filter(r => r.status === 'canceled'),
  });
  return { egypt: partition(egyptRows), dxb: partition(dxbRows) };
}
```

**The refactor must be byte-identical for the Egypt path.** Verify by:
1. Running existing daily-report tests before AND after the refactor (`npm run test`).
2. Spot-checking a recent snapshot's payload before-vs-after a force-rebuild — Egypt aggregates must be unchanged.

- [ ] **Step 2.5: Type-check + tests.**

```bash
npx tsc --noEmit
npm run test
```

Expected: passes. No new tests exercise the partitioned loader yet — it's tested transitively by Task 4 (`buildDxbSection`).

- [ ] **Step 2.6: Commit.**

```bash
git add src/lib/beithady-daily-report/units.ts src/lib/beithady-daily-report/reservations.ts
git commit -m "feat(loaders): add partitioned {egypt,dxb} loaders alongside existing Egypt-only ones"
```

---

## Task 3: New builder — `buildYesterdaySummary` (TDD)

**Files:**
- Create: `src/lib/beithady-daily-report/build-yesterday-summary.ts`
- Create: `src/lib/beithady-daily-report/build-yesterday-summary.test.ts`

- [ ] **Step 3.1: Write the failing test first.**

Create `src/lib/beithady-daily-report/build-yesterday-summary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildYesterdaySummary } from './build-yesterday-summary';
import type { ReservationRow } from './reservations';
import type { AllInventories } from './units';

const Y = '2026-05-11'; // yesterday-of-report

const baseInventory: AllInventories = {
  'BH-26': { total_units: 30, physical_listing_ids: [] },
  'BH-73': { total_units: 29, physical_listing_ids: [] },
  'BH-435': { total_units: 14, physical_listing_ids: [] },
  'BH-OK': { total_units: 4, physical_listing_ids: [] },
  OTHER: { total_units: 0, physical_listing_ids: [] },
  total_all: 77,
  physical_listing_ids_all: [],
};

function mkRow(p: Partial<ReservationRow>): ReservationRow {
  return {
    id: p.id || crypto.randomUUID(),
    confirmation_code: null,
    status: 'confirmed',
    source: 'Airbnb',
    listing_id: p.listing_id || 'L1',
    listing_nickname: null,
    guest_name: p.guest_name ?? 'Guest A',
    guest_email: null,
    check_in_date: p.check_in_date ?? null,
    check_out_date: p.check_out_date ?? null,
    nights: 1,
    currency: 'USD',
    host_payout_usd: p.host_payout_usd ?? 0,
    host_payout_raw: p.host_payout_usd ?? 0,
    guest_paid_usd: null,
    created_at_iso: null,
    updated_at_iso: null,
    cancelled_at_iso: null,
    effective_cancel_at_iso: null,
    building: 'BH-26',
  };
}

describe('buildYesterdaySummary', () => {
  it('counts check_ins, check_outs, and revenue on yesterday', () => {
    const active: ReservationRow[] = [
      mkRow({ check_in_date: Y, check_out_date: '2026-05-13', host_payout_usd: 300 }),
      mkRow({ check_in_date: Y, check_out_date: '2026-05-14', host_payout_usd: 200 }),
      mkRow({ check_in_date: '2026-05-09', check_out_date: Y, host_payout_usd: 999 }),
    ];
    const out = buildYesterdaySummary(active, baseInventory, Y);
    expect(out.check_ins).toBe(2);
    expect(out.check_outs).toBe(1);
    expect(out.revenue_usd).toBe(500); // host_payout_usd of yesterday check-ins
    expect(out.total_units).toBe(77);
  });

  it('excludes same-guest renewals from both check_ins and check_outs', () => {
    const active: ReservationRow[] = [
      // Same listing, same guest, checkout+checkin both = yesterday → renewal
      mkRow({ listing_id: 'L1', guest_name: 'A. Smith', check_in_date: '2026-05-09', check_out_date: Y }),
      mkRow({ listing_id: 'L1', guest_name: 'A. Smith', check_in_date: Y, check_out_date: '2026-05-13', host_payout_usd: 400 }),
      // Different listing, normal check-in
      mkRow({ listing_id: 'L2', guest_name: 'B. Jones', check_in_date: Y, check_out_date: '2026-05-14', host_payout_usd: 250 }),
    ];
    const out = buildYesterdaySummary(active, baseInventory, Y);
    expect(out.check_ins).toBe(1);  // only L2, L1 is a renewal
    expect(out.check_outs).toBe(0); // L1 checkout is part of the renewal
    expect(out.revenue_usd).toBe(250); // only non-renewal check-ins count toward revenue
  });

  it('counts turnovers as different-guest checkout+checkin on yesterday', () => {
    const active: ReservationRow[] = [
      mkRow({ listing_id: 'L1', guest_name: 'A', check_in_date: '2026-05-09', check_out_date: Y }),
      mkRow({ listing_id: 'L1', guest_name: 'B', check_in_date: Y, check_out_date: '2026-05-13' }),
      mkRow({ listing_id: 'L2', guest_name: 'C', check_in_date: '2026-05-08', check_out_date: Y }),
    ];
    const out = buildYesterdaySummary(active, baseInventory, Y);
    expect(out.turnovers).toBe(1);
  });

  it('counts occupied as listings whose stay straddles yesterday 23:59 (check_in <= Y AND check_out > Y)', () => {
    const active: ReservationRow[] = [
      mkRow({ listing_id: 'L1', check_in_date: '2026-05-10', check_out_date: '2026-05-12' }), // straddles
      mkRow({ listing_id: 'L2', check_in_date: Y, check_out_date: Y }), // checkin and checkout same day → NOT occupied at 23:59
      mkRow({ listing_id: 'L3', check_in_date: Y, check_out_date: '2026-05-13' }), // checkin yesterday, still there → occupied
    ];
    const out = buildYesterdaySummary(active, baseInventory, Y);
    expect(out.occupied).toBe(2);
  });
});
```

- [ ] **Step 3.2: Run test, verify failure.**

```bash
npm run test -- build-yesterday-summary
```

Expected: FAIL — `Cannot find module './build-yesterday-summary'`.

- [ ] **Step 3.3: Implement `build-yesterday-summary.ts`:**

```ts
import type { ReservationRow } from './reservations';
import type { AllInventories } from './units';
import type { YesterdaySummary } from './types';

/**
 * v3 (2026-05-12): summarize yesterday's closing snapshot for Egypt.
 * Renewal exclusion mirrors build-buildings.ts:141-187 — a listing with
 * a same-day checkout AND checkin where guest_name matches is treated
 * as a stay extension, not a real transition.
 *
 * `inventories.total_all` is the report's Egypt-only total. We do not
 * filter on inventories.physical_listing_ids_all here — the caller is
 * expected to pass an `active` slice that's already scoped to Egypt
 * (e.g. via loadReservationCorpusWithDxb().egypt.active).
 */
export function buildYesterdaySummary(
  active: ReservationRow[],
  inventories: AllInventories,
  yesterdayYmd: string,
): YesterdaySummary {
  // Pre-compute renewal listings: same listing has both a yesterday
  // checkout and a yesterday checkin for the same guest.
  const yCoGuests = new Map<string, string | null>();
  for (const r of active) {
    if (r.check_out_date === yesterdayYmd && r.listing_id) {
      yCoGuests.set(r.listing_id, r.guest_name ?? null);
    }
  }
  const renewedListings = new Set<string>();
  for (const r of active) {
    if (r.check_in_date === yesterdayYmd && r.listing_id) {
      const outGuest = yCoGuests.get(r.listing_id);
      if (outGuest != null && outGuest === (r.guest_name ?? null)) {
        renewedListings.add(r.listing_id);
      }
    }
  }

  let check_ins = 0;
  let check_outs = 0;
  let turnovers = 0;
  let revenue_usd = 0;
  const occupiedListings = new Set<string>();

  for (const r of active) {
    const isRenewal = Boolean(r.listing_id && renewedListings.has(r.listing_id));
    // Occupied at yesterday 23:59 = stay straddles yesterday.
    if (
      r.check_in_date &&
      r.check_out_date &&
      r.check_in_date <= yesterdayYmd &&
      r.check_out_date > yesterdayYmd
    ) {
      if (r.listing_id) occupiedListings.add(r.listing_id);
    }
    if (r.check_in_date === yesterdayYmd && !isRenewal) {
      check_ins += 1;
      revenue_usd += r.host_payout_usd || 0;
    }
    if (r.check_out_date === yesterdayYmd && !isRenewal) {
      check_outs += 1;
    }
  }

  // Turnover = different-guest checkout + checkin on yesterday, same listing.
  const yCheckins = new Map<string, string | null>();
  for (const r of active) {
    if (r.check_in_date === yesterdayYmd && r.listing_id) {
      yCheckins.set(r.listing_id, r.guest_name ?? null);
    }
  }
  for (const [listingId, outGuest] of yCoGuests) {
    const inGuest = yCheckins.get(listingId);
    if (inGuest != null && inGuest !== outGuest) turnovers += 1;
  }

  return {
    occupied: occupiedListings.size,
    total_units: inventories.total_all,
    check_ins,
    check_outs,
    turnovers,
    revenue_usd: Math.round(revenue_usd * 100) / 100,
  };
}
```

- [ ] **Step 3.4: Run test, verify pass.**

```bash
npm run test -- build-yesterday-summary
```

Expected: PASS (4 tests).

- [ ] **Step 3.5: Commit.**

```bash
git add src/lib/beithady-daily-report/build-yesterday-summary.ts src/lib/beithady-daily-report/build-yesterday-summary.test.ts
git commit -m "feat(daily-report): add buildYesterdaySummary for v3 closing one-liner"
```

---

## Task 4: New builder — `buildDxbSection` (TDD)

**Files:**
- Create: `src/lib/beithady-daily-report/build-dxb-section.ts`
- Create: `src/lib/beithady-daily-report/build-dxb-section.test.ts`

- [ ] **Step 4.1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { buildDxbSection } from './build-dxb-section';
import type { ReservationRow } from './reservations';
import type { DxbInventory } from './units';

const T = '2026-05-12'; // today
const Y = '2026-05-11'; // yesterday

const dxbInventory: DxbInventory = {
  total_units: 8,
  physical_listing_ids: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'],
};

function mkDxb(p: Partial<ReservationRow>): ReservationRow {
  return {
    id: p.id || crypto.randomUUID(),
    confirmation_code: null,
    status: 'confirmed',
    source: p.source ?? 'Airbnb',
    listing_id: p.listing_id || 'D1',
    listing_nickname: null,
    guest_name: p.guest_name ?? 'DXB Guest',
    guest_email: null,
    check_in_date: p.check_in_date ?? null,
    check_out_date: p.check_out_date ?? null,
    nights: 1,
    currency: 'USD',
    host_payout_usd: p.host_payout_usd ?? 0,
    host_payout_raw: p.host_payout_usd ?? 0,
    guest_paid_usd: null,
    created_at_iso: null,
    updated_at_iso: null,
    cancelled_at_iso: null,
    effective_cancel_at_iso: null,
    building: 'OTHER',
  };
}

describe('buildDxbSection', () => {
  it('counts today + yesterday + MTD for DXB-only corpus', () => {
    const active: ReservationRow[] = [
      // Today checkin
      mkDxb({ listing_id: 'D1', check_in_date: T, check_out_date: '2026-05-14', host_payout_usd: 600 }),
      // Today checkout
      mkDxb({ listing_id: 'D2', check_in_date: '2026-05-10', check_out_date: T, host_payout_usd: 700 }),
      // Yesterday checkin
      mkDxb({ listing_id: 'D3', check_in_date: Y, check_out_date: '2026-05-13', host_payout_usd: 500 }),
      // MTD check-in attribution (this month)
      mkDxb({ listing_id: 'D4', check_in_date: '2026-05-05', check_out_date: '2026-05-08', host_payout_usd: 400 }),
    ];
    const out = buildDxbSection(active, dxbInventory, T, Y, '2026-05-01', '2026-05-31');
    expect(out.today.check_ins).toBe(1);
    expect(out.today.check_outs).toBe(1);
    expect(out.yesterday.check_ins).toBe(1);
    expect(out.revenue_mtd.check_in_attribution_usd).toBe(600 + 500 + 400);
  });

  it('computes next_3d_total_usd as Airbnb-only sum of check-ins in [today, today+2]', () => {
    const active: ReservationRow[] = [
      mkDxb({ source: 'Airbnb', check_in_date: T, host_payout_usd: 100 }),
      mkDxb({ source: 'Airbnb', check_in_date: '2026-05-13', host_payout_usd: 200 }),
      mkDxb({ source: 'Airbnb', check_in_date: '2026-05-14', host_payout_usd: 300 }),
      mkDxb({ source: 'Airbnb', check_in_date: '2026-05-15', host_payout_usd: 999 }), // out of window
      mkDxb({ source: 'Booking.com', check_in_date: T, host_payout_usd: 555 }),       // non-Airbnb
    ];
    const out = buildDxbSection(active, dxbInventory, T, Y, '2026-05-01', '2026-05-31');
    expect(out.next_3d_total_usd).toBe(600); // 100+200+300, Airbnb only
  });

  it('returns zeroed fields when inventory is empty', () => {
    const out = buildDxbSection([], { total_units: 0, physical_listing_ids: [] }, T, Y, '2026-05-01', '2026-05-31');
    expect(out.today.total_units).toBe(0);
    expect(out.yesterday.total_units).toBe(0);
    expect(out.next_3d_total_usd).toBe(0);
    expect(out.revenue_mtd.check_in_attribution_usd).toBe(0);
  });
});
```

- [ ] **Step 4.2: Run, verify fail.**

```bash
npm run test -- build-dxb-section
```

Expected: FAIL (module not found).

- [ ] **Step 4.3: Implement `build-dxb-section.ts`:**

```ts
import { addDays } from './cairo-dates';
import { normalizeChannel, type ReservationRow } from './reservations';
import type { DxbInventory } from './units';
import type { DxbSection } from './types';

/**
 * v3 (2026-05-12): DXB mini-aggregate. Caller passes a DXB-only `active`
 * slice (from loadReservationCorpusWithDxb().dxb.active) plus a DXB-only
 * inventory. We do not call isExcludedFromReport here — the corpus is
 * already partitioned to DXB.
 *
 * `next_3d_total_usd` is Airbnb-only because Stripe payouts can't be
 * partitioned by market (see spec).
 */
export function buildDxbSection(
  active: ReservationRow[],
  inventory: DxbInventory,
  today: string,
  yesterdayYmd: string,
  monthStart: string,
  monthEnd: string,
): DxbSection {
  if (inventory.total_units === 0) {
    return {
      today: { occupied: 0, total_units: 0, check_ins: 0, check_outs: 0, turnovers: 0 },
      yesterday: { occupied: 0, total_units: 0, check_ins: 0, check_outs: 0, revenue_usd: 0 },
      revenue_mtd: { check_in_attribution_usd: 0, booked_attribution_usd: 0 },
      next_3d_total_usd: 0,
    };
  }

  // ---- Today renewal exclusion ----
  const tCoGuests = new Map<string, string | null>();
  for (const r of active) {
    if (r.check_out_date === today && r.listing_id) {
      tCoGuests.set(r.listing_id, r.guest_name ?? null);
    }
  }
  const todayRenewed = new Set<string>();
  for (const r of active) {
    if (r.check_in_date === today && r.listing_id) {
      const outGuest = tCoGuests.get(r.listing_id);
      if (outGuest != null && outGuest === (r.guest_name ?? null)) {
        todayRenewed.add(r.listing_id);
      }
    }
  }

  // ---- Yesterday renewal exclusion ----
  const yCoGuests = new Map<string, string | null>();
  for (const r of active) {
    if (r.check_out_date === yesterdayYmd && r.listing_id) {
      yCoGuests.set(r.listing_id, r.guest_name ?? null);
    }
  }
  const yesterdayRenewed = new Set<string>();
  for (const r of active) {
    if (r.check_in_date === yesterdayYmd && r.listing_id) {
      const outGuest = yCoGuests.get(r.listing_id);
      if (outGuest != null && outGuest === (r.guest_name ?? null)) {
        yesterdayRenewed.add(r.listing_id);
      }
    }
  }

  // ---- Accumulators ----
  const tOccupied = new Set<string>();
  const yOccupied = new Set<string>();
  let tCheckIns = 0, tCheckOuts = 0, tTurnovers = 0;
  let yCheckIns = 0, yCheckOuts = 0, yRevenue = 0;
  let mtdCheckIn = 0;
  let mtdBooked = 0;
  let next3d = 0;
  const next3dStart = today;
  const next3dEnd = addDays(today, 2);

  // Helper for today turnover detection
  const tCheckins = new Map<string, string | null>();
  for (const r of active) {
    if (r.check_in_date === today && r.listing_id) {
      tCheckins.set(r.listing_id, r.guest_name ?? null);
    }
  }

  for (const r of active) {
    const usd = r.host_payout_usd || 0;
    const isTRenewal = Boolean(r.listing_id && todayRenewed.has(r.listing_id));
    const isYRenewal = Boolean(r.listing_id && yesterdayRenewed.has(r.listing_id));

    // Today occupied
    if (
      r.check_in_date && r.check_out_date &&
      r.check_in_date <= today && r.check_out_date > today
    ) {
      if (r.listing_id) tOccupied.add(r.listing_id);
    }
    // Yesterday occupied
    if (
      r.check_in_date && r.check_out_date &&
      r.check_in_date <= yesterdayYmd && r.check_out_date > yesterdayYmd
    ) {
      if (r.listing_id) yOccupied.add(r.listing_id);
    }
    // Today check-ins / outs
    if (r.check_in_date === today && !isTRenewal) tCheckIns += 1;
    if (r.check_out_date === today && !isTRenewal) tCheckOuts += 1;
    // Yesterday check-ins / outs / revenue
    if (r.check_in_date === yesterdayYmd && !isYRenewal) {
      yCheckIns += 1;
      yRevenue += usd;
    }
    if (r.check_out_date === yesterdayYmd && !isYRenewal) yCheckOuts += 1;
    // MTD check-in attribution
    if (r.check_in_date && r.check_in_date >= monthStart && r.check_in_date <= monthEnd) {
      mtdCheckIn += usd;
    }
    // MTD booked attribution (created_at in month)
    if (r.created_at_iso) {
      const created = r.created_at_iso.slice(0, 10);
      if (created >= monthStart && created <= monthEnd) mtdBooked += usd;
    }
    // Next 3-day Airbnb projection
    if (
      r.check_in_date &&
      r.check_in_date >= next3dStart &&
      r.check_in_date <= next3dEnd &&
      normalizeChannel(r.source) === 'Airbnb'
    ) {
      next3d += usd;
    }
  }

  // Today turnover count
  for (const [listingId, outGuest] of tCoGuests) {
    const inGuest = tCheckins.get(listingId);
    if (inGuest != null && inGuest !== outGuest) tTurnovers += 1;
  }

  const r0 = (n: number) => Math.round(n * 100) / 100;
  return {
    today: {
      occupied: tOccupied.size,
      total_units: inventory.total_units,
      check_ins: tCheckIns,
      check_outs: tCheckOuts,
      turnovers: tTurnovers,
    },
    yesterday: {
      occupied: yOccupied.size,
      total_units: inventory.total_units,
      check_ins: yCheckIns,
      check_outs: yCheckOuts,
      revenue_usd: r0(yRevenue),
    },
    revenue_mtd: {
      check_in_attribution_usd: r0(mtdCheckIn),
      booked_attribution_usd: r0(mtdBooked),
    },
    next_3d_total_usd: r0(next3d),
  };
}
```

- [ ] **Step 4.4: Run test, verify pass.**

```bash
npm run test -- build-dxb-section
```

Expected: PASS (3 tests).

- [ ] **Step 4.5: Commit.**

```bash
git add src/lib/beithady-daily-report/build-dxb-section.ts src/lib/beithady-daily-report/build-dxb-section.test.ts
git commit -m "feat(daily-report): add buildDxbSection — DXB mini-aggregate for v3"
```

---

## Task 5: Extend `buildPayoutsSection` with `next_3d_*`

**Files:**
- Modify: `src/lib/beithady-daily-report/build-payouts.ts`

- [ ] **Step 5.1: Read `build-payouts.ts` end-to-end** (it's ~300 lines). Find where `next_7d_airbnb_usd` is accumulated and where `next_7d_stripe_usd` is built from Stripe API rows.

- [ ] **Step 5.2: Add accumulators alongside the existing 7-day ones.** In the Airbnb loop (around line 91 onward), find the `next_7d_airbnb_usd` accumulator and add a parallel:

```ts
// Existing:
//   if (r.check_in_date >= today && r.check_in_date <= next7End) {
//     next_7d_airbnb_usd += r.host_payout_usd;
//   }
// Add immediately after:
const next3dEnd = addDays(today, 2);
if (r.check_in_date >= today && r.check_in_date <= next3dEnd) {
  next_3d_airbnb_usd += r.host_payout_usd;
}
```

Declare `let next_3d_airbnb_usd = 0;` near the existing `let next_7d_airbnb_usd = 0;` declaration.

- [ ] **Step 5.3: Add `next_3d_stripe_usd` from the Stripe payouts loop.** Find where `next_7d_stripe_usd` is summed (Stripe arrivals in `[today+1, today+7]`). Add parallel:

```ts
const next3dStripeStart = addDays(today, 1);
const next3dStripeEnd = addDays(today, 3);
// in the loop over Stripe payouts:
if (
  p.arrival_date_ymd &&
  p.arrival_date_ymd >= next3dStripeStart &&
  p.arrival_date_ymd <= next3dStripeEnd
) {
  next_3d_stripe_usd += p.amount_usd;
}
```

- [ ] **Step 5.4: Populate the returned `section` with the new fields.** Find the `return { section: { ... }, warnings }` block at the bottom and add:

```ts
next_3d_airbnb_usd,
next_3d_stripe_usd,
next_3d_total_usd: next_3d_airbnb_usd + next_3d_stripe_usd,
```

- [ ] **Step 5.5: Quick smoke test.** No existing `build-payouts.test.ts` to extend — write one minimally:

Create `src/lib/beithady-daily-report/build-payouts-next-3d.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
// Validate via direct call. If buildPayoutsSection requires Supabase or Stripe,
// extract a pure inner function for the 3-day Airbnb math instead, or rely on
// integration test in Task 13.
import { buildPayoutsSection } from './build-payouts';

// If the function pulls Stripe live, this test is hard to run hermetically.
// Skeleton only — implementer to either inject mocks or split a pure helper.
describe.skip('buildPayoutsSection next_3d', () => {
  it('sums Airbnb check-ins in [today, today+2]', async () => {
    // ... fill in once a pure helper is extracted
  });
});
```

(If extracting a pure helper feels heavy for v3, the math is covered by Task 4's `next_3d_total_usd` tests + Task 13 end-to-end verification. Document with a code comment that the 3-day Stripe math is intentionally untested in unit tests and validated manually.)

- [ ] **Step 5.6: Type-check.**

```bash
npx tsc --noEmit
```

Expected: passes (PayoutsSection type already extended in Task 1).

- [ ] **Step 5.7: Commit.**

```bash
git add src/lib/beithady-daily-report/build-payouts.ts src/lib/beithady-daily-report/build-payouts-next-3d.test.ts
git commit -m "feat(payouts): add next_3d_{airbnb,stripe,total}_usd alongside next_7d_*"
```

---

## Task 6: `data_fresh_to_iso` query helper

**Files:**
- Modify: `src/lib/beithady-daily-report/build.ts` (one new helper + one call site)

- [ ] **Step 6.1: Add helper at the top of `build.ts`** (near the imports):

```ts
async function loadDataFreshToIso(): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('guesty_reservations')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { synced_at: string | null }).synced_at;
}
```

- [ ] **Step 6.2: Call it inside `buildDailyReport`** alongside the other parallel loads (around line 65-71). Add to the parallel-fetch block where appropriate:

```ts
const [inventories, corpusWithDxb, dataFreshToIso] = await Promise.all([
  loadAllInventoriesWithDxb(),
  loadReservationCorpusWithDxb(windowFrom, windowTo, fxDate),
  loadDataFreshToIso(),
]);
```

(Existing code currently awaits `loadBuildingInventories()` then `loadReservationCorpus()` sequentially. This step also switches them to the partitioned variants — see Task 8 for the full wiring change.)

- [ ] **Step 6.3: Commit.** This task's commit is rolled into Task 8 (the orchestrator wiring change) — don't commit standalone.

---

## Task 7: Remove `today = yesterday` alias + audit downstream builders

**Files:**
- Modify: `src/lib/beithady-daily-report/build.ts` (line 56-58)
- Audit (and possibly modify): every builder that consumes `ctx.today`

- [ ] **Step 7.1: Find all sites that consume `ctx.today` or are passed `today` as a parameter.**

```bash
```

Use Grep tool:
- Pattern: `ctx\.today|today:\s*string|today:\s*ctx`
- Path: `src/lib/beithady-daily-report`
- Mode: `content`

Catalogue every match. Each builder is one of three categories:
- **A. Intends "today" (= the day the report describes).** With v3 this means actual today. No change needed once the alias is removed.
- **B. Intends "yesterday" (= the day just closed).** Must be rewired to read `yesterdayDate` explicitly instead of `today`.
- **C. Intends "the generation date" (rare).** Unchanged.

- [ ] **Step 7.2: For each match, classify and document inline as a code comment.** Example:

```ts
// v3 (2026-05-12): this builder describes yesterday's no-shows.
// Wired to `yesterdayDate` after the alias removal in build.ts.
export function buildNoShowSection(active: ReservationRow[], period: ReportPeriodWindow): NoShowSection {
  // ...
}
```

- [ ] **Step 7.3: Update `build.ts` to remove the alias.** Replace lines 56-58:

```ts
// BEFORE:
const generationDate = reportDateYmd || cairoYmd();
const yesterdayDate = yesterdayOf(generationDate);
const today = yesterdayDate; // alias for clarity in this scope

// AFTER:
const today = reportDateYmd || cairoYmd();
const yesterdayDate = yesterdayOf(today);
```

- [ ] **Step 7.4: Rewire any Category-B builders.** Most likely needs:
- `build-no-show.ts` — `today` parameter usages → `yesterdayDate`. Verify by reading the file.
- Anywhere else the audit in 7.1 flagged.

For each rewired builder, update its call site in `build.ts` to pass `yesterdayDate` instead of `today` or `ctx.today`.

- [ ] **Step 7.5: Run all daily-report tests.**

```bash
npm run test -- daily-report
```

Expected: passes. Failures here mean a Category-B builder wasn't rewired correctly. Don't proceed to Task 8 with red tests.

- [ ] **Step 7.6: Commit.**

```bash
git add src/lib/beithady-daily-report/
git commit -m "refactor(daily-report): remove today=yesterday alias; rewire yesterday-anchored builders explicitly"
```

---

## Task 8: Wire new builders into orchestrator

**Files:**
- Modify: `src/lib/beithady-daily-report/build.ts`

- [ ] **Step 8.1: Switch inventory + corpus loaders to the partitioned variants.** Find the existing calls (~line 65, 71):

```ts
// BEFORE:
const inventories = await loadBuildingInventories();
// ...
const corpus = await loadReservationCorpus(windowFrom, windowTo, fxDate);

// AFTER:
const [inventories, corpusWithDxb, dataFreshToIso] = await Promise.all([
  loadAllInventoriesWithDxb(),
  loadReservationCorpusWithDxb(windowFrom, windowTo, fxDate),
  loadDataFreshToIso(),
]);
const corpus = corpusWithDxb.egypt;          // existing builders see Egypt-only
const dxbCorpus = corpusWithDxb.dxb;
const egyptInventory = inventories.egypt;
const dxbInventory = inventories.dxb;
```

Update all downstream calls that referenced `inventories` to use `egyptInventory` (or rename for minimal blast radius). Verify all old call sites still compile.

- [ ] **Step 8.2: Add `buildYesterdaySummary` call.** Add near the other sync builder calls (~line 75-83):

```ts
const yesterday_summary = buildYesterdaySummary(corpus.active, egyptInventory, yesterdayDate);
```

- [ ] **Step 8.3: Add `buildDxbSection` call.** Same area:

```ts
const dxb = buildDxbSection(
  dxbCorpus.active,
  dxbInventory,
  today,
  yesterdayDate,
  ctx.start,
  ctx.end,
);
```

- [ ] **Step 8.4: Include `yesterday_summary`, `dxb`, and `data_fresh_to_iso` in the final returned payload.** Find the return statement and add the three fields:

```ts
return {
  // ... existing fields ...
  yesterday_summary,
  dxb,
  data_fresh_to_iso: dataFreshToIso,
};
```

- [ ] **Step 8.5: Type-check + tests.**

```bash
npx tsc --noEmit
npm run test
```

Expected: passes.

- [ ] **Step 8.6: Commit.**

```bash
git add src/lib/beithady-daily-report/build.ts
git commit -m "feat(daily-report): wire yesterday_summary + dxb + data_fresh_to into payload"
```

---

## Task 9: Rewrite WhatsApp message body

**Files:**
- Modify: `src/lib/beithady-daily-report/distribute.ts:49-75` (`buildWhatsAppText`)

- [ ] **Step 9.1: Rewrite `buildWhatsAppText`** to match the spec's body. Replace the function entirely:

```ts
function buildWhatsAppText(payload: DailyReportPayload, link: string): string {
  const all = payload.all;
  const y = payload.yesterday_summary;
  const dxb = payload.dxb;
  const reviews = payload.reviews;
  const flagged = reviews.last_24h.filter(r => r.flagged).length;
  const pickup = all.pickup_vs_prior_month_pct;
  const arrow = pickup > 0 ? '▲ +' : pickup < 0 ? '▼ ' : '';
  const fmtUsd1 = (n: number): string => {
    if (Math.abs(n) >= 1000) return '$' + Math.round(n / 1000) + 'k';
    return '$' + Math.round(n);
  };
  // Render the data-fresh stamp in Cairo local hour:minute.
  const freshStamp = payload.data_fresh_to_iso
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(payload.data_fresh_to_iso))
    : null;

  // Suppress DXB suffix entirely when inventory is empty.
  const dxbToday = dxb.today.total_units > 0
    ? ` · DXB ${dxb.today.occupied}/${dxb.today.total_units} · ${dxb.today.check_ins} in · ${dxb.today.check_outs} out`
    : '';
  const dxbYesterday = dxb.yesterday.total_units > 0
    ? ` · DXB ${dxb.yesterday.occupied}/${dxb.yesterday.total_units} · ${dxb.yesterday.check_ins} in · ${dxb.yesterday.check_outs} out · ${fmtUsd1(dxb.yesterday.revenue_usd)}`
    : '';
  const dxbMtd = dxb.today.total_units > 0
    ? ` · DXB ${fmtUsd1(dxb.revenue_mtd.check_in_attribution_usd)} / ${fmtUsd1(dxb.revenue_mtd.booked_attribution_usd)}`
    : '';
  const dxbPayouts = dxb.today.total_units > 0
    ? ` · DXB ${fmtUsd1(dxb.next_3d_total_usd)}`
    : '';

  const lines = [
    `🏛️ *Beit Hady · Daily Performance*`,
    `${payload.generated_at_cairo}${freshStamp ? ` (data fresh to ${freshStamp})` : ''}`,
    ``,
    `📊 *Today*: ${all.occupied_today}/${all.total_units} occupied (${all.occupancy_today_pct.toFixed(1)}%) · ${all.check_ins_today} in · ${all.check_outs_today} out · ${all.turnovers_today} turnovers${dxbToday}`,
    `📅 *Yesterday*: ${y.occupied}/${y.total_units} occ · ${y.check_ins} in · ${y.check_outs} out · ${fmtUsd1(y.revenue_usd)}${dxbYesterday}`,
    ``,
    `💰 *Revenue MTD*: ${fmtUsd1(all.revenue_mtd_usd)} check-in · ${fmtUsd1(all.revenue_created_mtd_usd)} booked` +
      (pickup !== 0 ? ` (${arrow}${pickup.toFixed(1)}% vs prior)` : '') +
      dxbMtd,
    `💵 *Expected payouts (next 3 days)*: ${fmtUsd1(payload.payouts.next_3d_total_usd)}${dxbPayouts}`,
    `⭐ ${reviews.count_mtd} reviews · ${reviews.avg_rating_mtd.toFixed(1)}★ avg` +
      (flagged > 0 ? ` · ${flagged} flagged 🚩` : ''),
    ``,
    `📋 Full report (expires 48h):`,
    link,
  ];
  return lines.join('\n');
}
```

- [ ] **Step 9.2: Type-check.**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 9.3: Manually preview the WhatsApp body** (no automated test — copy a sample payload locally or stub one in a temp file, run `node` with `buildWhatsAppText`, eyeball the output). Compare to the spec's target body.

- [ ] **Step 9.4: Commit.**

```bash
git add src/lib/beithady-daily-report/distribute.ts
git commit -m "feat(distribute): v3 WhatsApp body — today live + yesterday closing + DXB suffix + next-3d payouts"
```

---

## Task 10: Mirror layout in HTML email renderer

**Files:**
- Modify: `src/lib/beithady-daily-report/render-html.tsx`

- [ ] **Step 10.1: Read `render-html.tsx` end-to-end** to locate the headline-rendering block (search for `occupied_today` or the Today/Yesterday text).

- [ ] **Step 10.2: Replace the headline section** with the same layout shape as the WhatsApp body. The HTML can use a `<table>` for the inline DXB suffix or just inline text — match the spec's reading order:

```
Today: 44/77 occupied (57.1%) · 5 in · 10 out · 3 turnovers · DXB 6/8 · 1 in · 0 out
Yesterday: 44/77 occ · 7 in · 5 out · $4.2k · DXB 5/8 · 0 in · 1 out · $D
Revenue MTD: $38k check-in · $28k booked (▲ +112.8%) · DXB $X / $Y
Expected payouts (next 3 days): $A · DXB $B
35 reviews · 4.6★ avg · 1 flagged
```

Keep all lower sections (channel mix, RevPAR, weekly digest, etc.) unchanged — they stay Egypt-only per the spec's non-goals.

- [ ] **Step 10.3: Type-check + preview.**

```bash
npx tsc --noEmit
```

Spin up the dev server (`npm run dev`) and open the report preview route (`/r/beithady/<a-known-token>`) against a recent snapshot. Eyeball the headline.

- [ ] **Step 10.4: Commit.**

```bash
git add src/lib/beithady-daily-report/render-html.tsx
git commit -m "feat(render-html): v3 email headline — today live + yesterday + DXB + next-3d payouts"
```

---

## Task 11: Mirror layout in PDF renderer

**Files:**
- Modify: `src/lib/beithady-daily-report/render-pdf.tsx`

- [ ] **Step 11.1: Read `render-pdf.tsx` end-to-end** to locate the cover-page / headline block (uses `@react-pdf/renderer` `<Text>` components).

- [ ] **Step 11.2: Replace the headline block** with the same layout. PDF supports more vertical space than WhatsApp, so you can show the next-3d payouts BREAKDOWN (Airbnb / Stripe components) underneath the total — but keep the headline single-line for parity:

```
Today (Egypt + DXB)
  Egypt: 44/77 occupied (57.1%) · 5 in · 10 out · 3 turnovers
  DXB:   6/8 occupied · 1 in · 0 out

Yesterday closed
  Egypt: 44/77 occ · 7 in · 5 out · 0 turnovers · $4,200
  DXB:   5/8 occ · 0 in · 1 out · $D

Revenue MTD
  Egypt: $38,400 check-in · $28,100 booked (▲ +112.8% vs prior month)
  DXB:   $X check-in · $Y booked

Expected payouts (next 3 days)
  Egypt total: $A   (Airbnb $A1 + Stripe $A2)
  DXB:         $B   (Airbnb-only — Stripe not partitioned by market)
```

This is the one place we let DXB get a tiny bit of vertical space (the PDF has room). The footnote about Stripe is rendered in the PDF only — not in WhatsApp.

- [ ] **Step 11.3: Type-check + render-PDF preview.**

```bash
npx tsc --noEmit
```

PDF render is run by the cron path; quickest manual check is to trigger a force-rebuild on a test snapshot and download the PDF.

- [ ] **Step 11.4: Commit.**

```bash
git add src/lib/beithady-daily-report/render-pdf.tsx
git commit -m "feat(render-pdf): v3 PDF cover page — today + yesterday + DXB + next-3d payouts (with Stripe footnote)"
```

---

## Task 12: Tighten Guesty cron in `vercel.json`

**Files:**
- Modify: `vercel.json` (line 15)

- [ ] **Step 12.1: Edit `vercel.json`.** Find the line:

```jsonc
{ "path": "/api/cron/guesty", "schedule": "40 */4 * * *" },
```

Add immediately after it:

```jsonc
{ "path": "/api/cron/guesty", "schedule": "*/15 6-10 * * *" },
```

Both lines stay in the file — the 4-hour cadence covers afternoon/evening/overnight, the 15-min cadence covers the morning brief window.

- [ ] **Step 12.2: Validate JSON syntax.**

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"
```

Expected: no output (parse succeeds).

- [ ] **Step 12.3: Commit.**

```bash
git add vercel.json
git commit -m "chore(cron): tighten Guesty sync to */15 6-10 UTC for fresh daily-report data"
```

---

## Task 13: End-to-end verification + ship

**Files:** none (verification only).

- [ ] **Step 13.1: Rebase on latest main + push.**

```bash
git fetch origin main
git rebase origin/main
git push origin HEAD:main
```

- [ ] **Step 13.2: Wait for the GitHub→Vercel auto-deploy.**

Check Vercel dashboard (or run `vercel inspect` against the deployment URL) until status is READY. The runtime URL is `limeinc.vercel.app` / `app.limeinc.cc`.

- [ ] **Step 13.3: Force-rebuild today's snapshot.** Even after the new code lands, the existing `daily_report_snapshots` row for today still has the v2 payload. Trigger a forceRebuild via the admin "Rebuild snapshot" button on `/beithady/setup` (or call `runDailyReport({ forceRebuild: true })` via the manual-test surface).

- [ ] **Step 13.4: Open the rebuilt snapshot.** Verify:
- WhatsApp text (preview in `daily_report_snapshots.payload` or via `/r/beithady/<token>` page) matches the spec's body exactly.
- `data_fresh_to_iso` is recent (within last 30 min on a healthy cron schedule).
- `yesterday_summary` numbers are non-zero (yesterday wasn't empty) and pass eye-test against Guesty's "yesterday" view.
- `dxb` numbers are non-zero (if DXB inventory is active) and pass eye-test against Guesty's DXB unit list.
- `payouts.next_3d_total_usd` is positive and aligns with Airbnb arrivals expected in the next 3 days.
- HTML email render and PDF render show the same layout.

- [ ] **Step 13.5: Send a test recipient.** Use the admin "Send Test Now" button to deliver the rebuilt snapshot to a single test recipient. Inspect on phone (WhatsApp) + email client.

- [ ] **Step 13.6: Update SESSION_HANDOFF.md** with a v3 SHIPPED entry summarizing what landed and which commit(s) deployed it.

- [ ] **Step 13.7: Watch the next natural 09:00 Cairo cron tick.** Confirm:
- Guesty sync ran in the `*/15 6-10 * * *` window before the brief.
- `data_fresh_to_iso` on the auto-built snapshot is < 15 min stale.
- WhatsApp delivered to all production recipients (not just the test recipient).

---

## Out-of-scope reminders

The spec explicitly EXCLUDES these from v3 — do not pull them in without a new brainstorm:

- DXB rows in lower PDF sections (channel mix per market, RevPAR per market, weekly digest per market).
- Reviews split by market.
- AED display alongside USD on DXB revenue.
- Real-time refresh button in the web view.
- Per-market same-day alerts.
- Changes to the `beithady-morning-brief` cron (separate concern).

If a task here is tempted to creep into one of these, stop and flag instead.
