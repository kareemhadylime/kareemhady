# Beithady Dashboard — Month-Oriented KPI Redesign

**Date:** 2026-05-12
**Surfaces:** `/beithady` (Today's Pulse) + `/beithady/analytics/performance` (Hero strip)
**Status:** Brainstorming → spec → implementation

## Goal

Add four month-oriented KPIs to the Beithady hero card strip so the operator
can see at a glance, alongside today's snapshot:

- How the month has gone so far (MTD Occupancy)
- What is already booked for the rest of the month (Month-to-End Occupancy)
- Where the month will land if no further bookings come in (Month Occupancy)
- The whole-month on-the-books revenue (Month Revenue incl. confirmed)

These join — they do not replace — the existing six cards (Occupancy today,
MTD Revenue, RevPAR, Pace, Reviews avg, Response time). Final card count: **10**.

## Final card set (in display order)

| # | Card label                  | Value source                                        | Sub-line                                  | Accent |
|---|-----------------------------|-----------------------------------------------------|-------------------------------------------|--------|
| 1 | Occupancy today             | `all.occupancy_today_pct`                            | "today"                                   | ink    |
| 2 | MTD Occupancy               | `all.backward_occupancy_pct`                         | "1st → today"                             | steel  |
| 3 | Month-to-End Occupancy      | `all.forward_occupancy_pct`                          | "today → EOM, OTB"                        | steel  |
| 4 | Month Occupancy             | `all.month_occupancy_pct` *(new)*                    | "whole month, OTB"                        | gold   |
| 5 | Pace                        | `all.pickup_vs_prior_month_pct`                      | "vs prior month"                          | green/red |
| 6 | MTD Revenue                 | `all.revenue_mtd_actual_usd` *(new)*                 | "check-ins so far"                        | gold   |
| 7 | Month Revenue (OTB)         | `all.revenue_mtd_usd` *(existing, **relabelled**)*   | "incl. confirmed → EOM"                   | gold   |
| 8 | RevPAR                      | `revpar.all`                                          | "rev / available night"                   | steel  |
| 9 | Reviews avg                 | `reviews.avg_rating_mtd`                              | "N reviews · M flagged"                   | amber  |
| 10 | Response time              | `conversations.yesterday.avg_response_minutes`        | "first Xm"                                | steel  |

## Layout

```
Row 1 (occupancy + pace — 5 cards):
[Occupancy today] [MTD Occupancy] [Month-to-End] [Month Occupancy] [Pace]

Row 2 (revenue + engagement — 5 cards):
[MTD Revenue] [Month Revenue OTB] [RevPAR] [Reviews avg] [Response time]
```

**Responsive grid:** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5`

- Mobile (2-col): 5 rows of 2 — vertical scroll, acceptable on the launcher page.
- Tablet (3-col): 4 rows (3+3+3+1) — last row short, acceptable.
- Desktop (5-col): clean 2 rows of 5.

**Logical grouping by row** is the key: occupancy + pace in row 1 (the
"how full are we" story), revenue + engagement in row 2 (the "what did
that produce + how are guests treated" story). On 2/3-col viewports the
visual grouping degrades gracefully because the order is preserved.

## Data layer changes

### New payload fields (in `BuildingBucket` + `AllBucket`)

```ts
// types.ts — add after backward_occupancy_pct
month_occupancy_pct: number;       // 0..100 — blended whole-month OTB
                                   // = (nights_mtd + forward_nights_booked) /
                                   //   (days_total × total_units) × 100

// types.ts — add after revenue_mtd_usd / revenue_created_mtd_usd
revenue_mtd_actual_usd: number;    // host_payout for reservations whose
                                   // CHECK-IN is in [start_of_month, today]
                                   // i.e. past + today only, no future
```

**Naming rationale.** The existing `revenue_mtd_usd` field is historically
named but semantically already covers the whole calendar month (start →
end), including future check-ins. We keep its name to avoid touching the
PDF/HTML renderer + all historical snapshots, and **introduce
`revenue_mtd_actual_usd` as the true past-only number**. The hero strip
labels the existing field "Month Revenue (OTB)" and the new field
"MTD Revenue" — copy diverges from field names but matches the user's
mental model.

### Builder change in `src/lib/beithady-daily-report/build-buildings.ts`

Add one accumulator + one derived metric:

```ts
// in the per-reservation loop, alongside the existing revenue_usd
// accumulator (line ~205):
if (r.check_in_date && r.check_in_date >= monthStart && r.check_in_date <= today) {
  acc.revenue_actual_usd += usd;
  accAll.revenue_actual_usd += usd;
}
```

```ts
// when materializing per_building + all (lines ~294 and ~361):
month_occupancy_pct: pct(
  acc.nights_mtd + acc.forward_nights_booked,
  ctx.days_total * units
),
revenue_mtd_actual_usd: round2(acc.revenue_actual_usd),
```

`emptyBucket()` gets two new zero defaults.

### Sparklines

Extend `SparklinesSection` with four new IDs to cover the new cards.
Existing series stay so old code keeps working:

```ts
// types.ts
export type HeroKpiId =
  | 'occupancy'
  | 'mtd_occupancy'           // new — series of backward_occupancy_pct
  | 'month_to_end_occupancy'  // new — series of forward_occupancy_pct
  | 'month_occupancy'         // new — series of month_occupancy_pct
  | 'pace'
  | 'mtd_revenue_actual'      // new — series of revenue_mtd_actual_usd
  | 'mtd_revenue'             // EXISTING — now represents Month Revenue OTB
  | 'revpar'
  | 'reviews_avg'
  | 'response_time';
```

`build-sparklines.ts` reads each new field from the snapshot history.
Snapshots older than the field's introduction date get a 0 entry (the
HeroKpi component already handles the all-zero case by hiding the
sparkline).

### Backfill

No retroactive backfill is needed for the new card display — the
09:00 Cairo cron rebuilds the snapshot daily, so the first run after
deploy populates `month_occupancy_pct` + `revenue_mtd_actual_usd`. The
sparklines for the four new IDs will be short (1 day) on day 1 and grow
naturally over a week.

For sanity, **trigger a manual `/api/cron/beithady-daily-report?force=1`**
after deploy so today's snapshot has the new fields without waiting for
tomorrow.

## UI layer changes

### `src/app/beithady/_components/landing-pulse.tsx`

- Grid class: `grid-cols-2 gap-3 px-3 pb-4 sm:grid-cols-3 xl:grid-cols-6` →
  `grid-cols-2 gap-3 px-3 pb-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5`
- Render order: 10 `<HeroKpi>` calls in the order listed in the card table above.
- The existing "Occupancy" card stays first (today's number). The four new cards slot in.
- The existing "MTD Revenue" card is **renamed** in the label prop only (the
  field reference stays `all.revenue_mtd_usd` but the label becomes
  "Month Revenue (OTB)" and the sub-line becomes "incl. confirmed → EOM").
- A new card uses `all.revenue_mtd_actual_usd` with the label "MTD Revenue".

### `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`

Same grid + ordering change applied to lines 107-174. Each new card gets a
matching `HeroKpiId` registered in:

- `_lib/panel-registry.ts` — visibility toggles
- `_hooks/use-visibility.ts` — defaults to visible

So the Customize drawer can hide/show the four new cards the same way it
handles existing ones.

### `src/app/beithady/analytics/performance/_components/panels/hero-kpi.tsx`

No prop changes needed — already supports `label` / `value` / `delta` /
`spark` / `drillTo` / `accent`. New cards drill to:

- MTD Occupancy → `/beithady/analytics/performance?metric=backward-occupancy`
- Month-to-End Occupancy → `/beithady/analytics/performance?metric=forward-occupancy`
- Month Occupancy → `/beithady/analytics/performance?metric=month-occupancy`
- MTD Revenue → `/beithady/financials?period=mtd-actual`
- Month Revenue (OTB) → `/beithady/financials?period=month-otb`

The drill-target pages don't need to handle these query params yet — they
fall back to default views — but reserving the namespace now avoids URL
churn when those drilldowns ship.

## Tests

Vitest unit tests, colocated with builders.

- `build-buildings.test.ts` — extend the existing fixture-based test:
  - Given a reservation set with mixed past + future check-ins,
    `revenue_mtd_actual_usd` excludes future and `revenue_mtd_usd` includes them.
  - `month_occupancy_pct = (nights_mtd + forward_nights_booked) /
    (days_total × total_units) × 100`, validated to ±0.1 pp.
- `build-sparklines.test.ts` — extend to assert all four new series are
  present and pull from the right snapshot fields.

No new UI tests — `landing-pulse.tsx` and `dashboard-shell.tsx` are not
under test today, and the change is purely additive layout.

## Out of scope

- Drilldown destination pages for the new metrics (the params are
  reserved but unhandled — that's a follow-up).
- Channel-mix breakdown of Month Revenue OTB.
- Goal/target setting per occupancy variant.
- Mobile redesign of the strip beyond the current 2-col stack.

## Risk & rollback

- Adding two new fields to the payload type is non-breaking — older
  consumers ignore unknown fields, and the new fields default to 0 in
  `emptyBucket()` if the builder hasn't run yet.
- The relabel of `revenue_mtd_usd` (display only — name unchanged in code)
  is a pure copy change. PDF/HTML renderers keep showing the same
  number under the old "MTD Revenue" label, which is technically wrong
  but matches existing behavior. **Follow-up: separate ticket to rename
  the PDF/HTML labels to match** (not in scope here — the user asked
  only for the dashboard).
- If the new month_occupancy computation produces unexpected values
  (e.g. > 100% from data quality issues), the HeroKpi card just shows
  the number with a `.toFixed(1)%` — no crash. The drift-warning channel
  in the payload would surface it.
- Rollback: revert the page.tsx + dashboard-shell.tsx changes; the
  payload fields can stay (unused).
