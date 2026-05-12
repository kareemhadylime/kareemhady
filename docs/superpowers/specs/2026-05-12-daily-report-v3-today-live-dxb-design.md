# Beithady Daily Report v3 — Design

**Date:** 2026-05-12
**Status:** Brainstorm complete, awaiting user spec review before implementation planning.
**Author:** Claude (sonnet 4.6) in collaboration with kareem.hady@gmail.com

## Problem

At 09:00 Cairo the daily-performance WhatsApp / email / PDF says it's a
"Daily Performance" briefing, but the headline numbers actually describe
**yesterday's closed day**, not the day the team is about to operate. This
is the v2 "yesterday completed" semantics shipped in commit `51265a7` and
hard-coded as a one-line alias at `src/lib/beithady-daily-report/build.ts:58`
(`const today = yesterdayDate;`). The result:

- The operator opens the brief at 09:00 expecting to see what's happening
  today and instead sees yesterday's numbers labeled "Today".
- Comparison against the Guesty homepage Daily-activity tile (which shows
  *today*'s live counts) looks like a bug — the screens disagree because
  they're describing different days.
- DXB units are silently excluded from every aggregation
  (`isExcludedFromReport` in `units.ts:53`), so operators have no signal at
  all on the Dubai portfolio in the morning brief.
- Data the brief reads is up to ~3 hours stale at send time because
  `/api/cron/guesty` only runs every 4 hours at `:40` UTC, and the most
  recent pull before the 06:00 UTC (= 09:00 Cairo summer) brief is at
  04:40 UTC.

## Goal

Make the 09:00 Cairo briefing report **today live, with yesterday as a
one-line closing summary**, with **fresh Guesty data**, and **DXB
appended on every relevant headline line** as a compact suffix.

Egypt remains the headline market. DXB is a secondary suffix, not a
parallel section. "Egypt" here is the set of buildings BH-26, BH-73,
BH-435, BH-OK plus the OTHER bucket — i.e. everything that
`isExcludedFromReport()` returns `false` for today. "DXB" is the set
of listings where `isExcludedFromReport()` returns `true` (codes DXB,
BH-DXB, AE, UAE per `units.ts:56`).

## Non-goals

The following are intentionally out of scope for v3 and may be revisited
in a future brainstorm:

- DXB rows in every detail section of the PDF (channel mix per market,
  RevPAR per market, weekly digest per market, etc.). Detail sections
  stay Egypt-only.
- Splitting reviews by market. The reviews line stays combined.
- Showing AED alongside USD on DXB revenue. USD-only via the existing FX
  layer.
- The separate `beithady-morning-brief` cron at 05:00/06:00 UTC. This
  spec only changes `beithady-daily-report`.
- Adding new builders for forward-looking metrics. We reuse what's
  there.

## Final WhatsApp body

```
🏛️ Beit Hady · Daily Performance
Tue, May 12, 2026 · 09:00 Cairo (data fresh to 08:58)

📊 Today: 44/77 occupied (57.1%) · 5 in · 10 out · 3 turnovers · DXB 6/8 · 1 in · 0 out
   🧹 5 cleanings · ⏰ 1 late check-in (Isac Omar 23:30)
📅 Yesterday: 44/77 occ · 7 in · 5 out · $4.2k · DXB 5/8 · 0 in · 1 out · $D

💰 Revenue MTD: $38k check-in · $28k booked (▲ +112.8% vs prior) · DXB $X / $Y
💵 Expected payouts (next 3 days): $A · DXB $B
⭐ 35 reviews · 4.6★ avg · 1 flagged 🚩

📋 Full report (expires 48h): https://app.limeinc.cc/r/beithady/...
```

Layout rules:

- Egypt headline metrics first on each line, DXB appended as `· DXB
  <same fields, compact>`.
- Each line is a single physical line (no soft-wrapped indents) so it
  reads consistently on WhatsApp mobile.
- Cleaning + late-check-in operational nuggets stay an indented
  Egypt-only sub-line (DXB ops are out of scope for v3).
- The header gets a `data fresh to HH:MM` timestamp reflecting the
  maximum `synced_at` value across the rows in `guesty_reservations`
  (the most recent ingest time). Rendered in Cairo local hour.
- Reviews stay combined (Egypt + DXB) — not split by market.

## Components

### Data freshness — `vercel.json` cron change

The Guesty sync cron schedule moves from a single 4-hour cadence to a
combined cadence that tightens around the morning brief window:

```jsonc
// Before
{ "path": "/api/cron/guesty", "schedule": "40 */4 * * *" },

// After
{ "path": "/api/cron/guesty", "schedule": "40 */4 * * *" },
{ "path": "/api/cron/guesty", "schedule": "*/15 6-10 * * *" },
```

Effect: between 06:00 and 10:00 UTC, Guesty pulls every 15 minutes; the
rest of the day runs the existing 4-hour cadence. At the 06:00–07:00
UTC brief tick (= 09:00 Cairo summer / winter), the most recent pull is
≤15 min old.

Cost impact: ~16 extra Guesty pulls/day, all in the morning window.
Existing sync code is unchanged — just more frequent during the relevant
window.

### Semantics flip — `build.ts:58`

Remove the alias:

```ts
// Before
const generationDate = reportDateYmd || cairoYmd();
const yesterdayDate = yesterdayOf(generationDate);
const today = yesterdayDate; // alias for clarity in this scope

// After
const today = reportDateYmd || cairoYmd();
const yesterdayDate = yesterdayOf(today);
```

This is load-bearing — `today` flows into ~15 downstream builders that
use it as the anchor for "what counts as today's check-in / check-out /
turnover / occupancy". The implementation plan will audit each builder
to verify the new "today = actual today" reading doesn't break the
metric's intent. Known callers (non-exhaustive):

- `build-buildings.ts` — check-ins/check-outs/turnovers on today's date.
- `build-extras.ts` — cleaning ops, cancellations.
- `build-payment-checkins.ts` — payment on check-in.
- `build-no-show.ts` — no-shows (this one is INHERENTLY a "yesterday"
  metric and will need to be rewired to read `yesterdayDate` explicitly).
- `build-payouts.ts` — payout windows are already explicit relative to
  `today`; their math is correct under either reading.
- `build-weekly-digest.ts` — week-anchored, today-as-cursor; verify.
- `build-cancel-risk.ts`, `build-forward-occupancy.ts`,
  `build-occupancy-gaps.ts`, `build-cleaning-ops.ts`,
  `build-sparklines.ts`, `build-stly.ts`, `build-top-movers.ts` — all
  forward / multi-day, low risk.

The plan will list every site that references `ctx.today` and decide:
keeps reading it (now = today, correct), or rewires to `yesterdayDate`
(inherently yesterday-anchored).

### New builder — `build-yesterday-summary.ts`

A flat object summarizing yesterday's closing snapshot for Egypt:

```ts
export type YesterdaySummary = {
  occupied: number;       // units occupied at yesterday 23:59 Cairo
  total_units: number;
  check_ins: number;      // same-guest renewals excluded (snapRenewedListings logic)
  check_outs: number;     // same-guest renewals excluded
  turnovers: number;      // different-guest checkout+checkin same day
  revenue_usd: number;    // host_payout_usd for yesterday's check-ins
};

export function buildYesterdaySummary(
  active: ReservationRow[],
  inventories: AllInventories,
  yesterdayYmd: string,
): YesterdaySummary;
```

The implementation reuses the same renewal-exclusion logic from
`build-buildings.ts:141-187`: for each listing, if a same-day
check-out and check-in exist on `yesterdayYmd` for the same
`guest_name`, both legs are excluded from `check_ins` and `check_outs`
(it's a stay extension, not a real transition). Returns flat numbers
— the renderer assembles the `"44/77 occ · 7 in · 5 out · 0 turnovers
· $4.2k"` string.

### New builder — `build-dxb-section.ts`

Parallel mini-aggregate for DXB units. Does NOT call
`isExcludedFromReport` — uses an inclusion filter for DXB instead.

```ts
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
  next_3d_total_usd: number; // combined Airbnb + Stripe, DXB partition
};

export function buildDxbSection(
  corpus: ReservationCorpus,   // partitioned (see below)
  inventories: DxbInventory,
  today: string,
  yesterdayYmd: string,
): DxbSection;
```

Renewal exclusion rules mirror Egypt. Same FX normalization (host_payout
is already USD-converted in the corpus loader).

### Inventory + corpus partitioning — `units.ts` + `reservations.ts`

The cleanest path is to return a partitioned shape so the data is
loaded once but the Egypt vs DXB aggregations see only their share.

**`loadBuildingInventories` → returns `{ egypt: AllInventories, dxb: DxbInventory }`**

Today: drops DXB entirely at `units.ts:174`. New behaviour: keep two
accumulators, one for Egypt (preserves existing Egypt-only
`physical_listing_ids_all` filter) and one for DXB (single-bucket flat
inventory). Existing callers receive `.egypt` and continue to work
unchanged; new builder receives `.dxb`.

**`loadReservationCorpus` → returns `{ egypt: ReservationCorpus, dxb: ReservationCorpus }`**

Today: drops DXB at the ingest layer (`reservations.ts:180`). New
behaviour: load once, partition into Egypt and DXB during the
post-fetch loop. Egypt corpus excludes DXB exactly as today; DXB
corpus contains only DXB rows. No second query.

This is the largest mechanical change in the spec — every existing
caller of `loadReservationCorpus()` (currently ~1 site, the
orchestrator) needs to be updated to read `.egypt` instead of the
flat shape.

### Payouts — extend `build-payouts.ts`

Add a 3-day window alongside the existing 7-day window:

```ts
// Existing:
//   next_7d_airbnb_usd, next_7d_stripe_usd

// New:
//   next_3d_airbnb_usd: check_in_date ∈ [today, today + 2]
//   next_3d_stripe_usd: arrival_date ∈ [today + 1, today + 3]
//   next_3d_total_usd:  next_3d_airbnb_usd + next_3d_stripe_usd
```

Same iteration loop, extra accumulator. Combined total is the only
field rendered in WhatsApp; the breakdown is available in the PDF if
desired.

DXB equivalent computed inside `build-dxb-section.ts` from the DXB
corpus only. Stripe payouts cannot be reliably split by market
without metadata tagging, which doesn't exist in the current Stripe
account setup. **Decision for v3:** `dxb.next_3d_total_usd` =
Airbnb-only (DXB reservations checking in within `[today, today + 2]`,
summed in USD). The WhatsApp `DXB $B` figure is therefore Airbnb-only
for Dubai; the PDF will note this in a footnote.

### Payload type — `types.ts`

Add two fields to `DailyReportPayload`:

```ts
export type DailyReportPayload = {
  // ... existing fields ...
  yesterday_summary: YesterdaySummary;
  dxb: DxbSection;
};
```

Extend `PayoutsSection` with the `next_3d_*` fields.

### WhatsApp + email + PDF rendering

**WhatsApp** — `distribute.ts:49-75` (`buildWhatsAppText`). Full
rewrite to match the body shown above. Reads from `payload.all` (Egypt
today), `payload.yesterday_summary` (Egypt yesterday closing), and
`payload.dxb` (Dubai). The cleaning/late-check-in sub-line reads from
`payload.cleaning_ops_today` + `payload.same_day_alerts` (already
populated by existing builders).

**HTML email body** — `render-html.tsx`. Mirrors the WhatsApp layout in
the headline block; lower sections (channel mix, RevPAR, etc.) stay
Egypt-only.

**PDF cover page** — `render-pdf.tsx`. Same headline restructure on
page 1; subsequent detail pages stay Egypt-only.

## Architecture diagram

```
                    /api/cron/guesty (*/15 6-10 + 40 */4)
                                  │
                                  ▼
                       guesty_reservations table
                                  │
                                  ▼
       /api/cron/beithady-daily-report (*/30 6-21)
                                  │
                                  ▼
                     run.ts → buildDailyReport(today)
                                  │
        ┌─────────────────────────┼─────────────────────────────┐
        ▼                         ▼                             ▼
loadBuildingInventories   loadReservationCorpus        cairoMonthContext(today)
  → { egypt, dxb }          → { egypt, dxb }
        │                         │
        └─────┬───────────────────┘
              ▼
      [parallel builders]
              │
   ┌──────────┼──────────┬──────────────┬─────────────────┐
   ▼          ▼          ▼              ▼                 ▼
buildBuildings  buildYesterdaySummary  buildDxbSection  build-payouts
 (Egypt today)   (Egypt yesterday)    (DXB today+yest)  (+ next_3d_*)
   │              │                      │                 │
   └──────────────┴──────────┬───────────┴─────────────────┘
                             ▼
                   DailyReportPayload {
                     all,
                     yesterday_summary,  ← NEW
                     dxb,                ← NEW
                     payouts: { ..., next_3d_total_usd },  ← extended
                     ...
                   }
                             │
                             ▼
                       distribute.ts
                  (WhatsApp + email + PDF)
```

## Error handling

- If `loadReservationCorpus` fails, the whole build fails (existing
  behaviour, unchanged).
- If DXB partition is empty (no DXB listings active), `buildDxbSection`
  returns zeroed fields. WhatsApp renderer suppresses the `· DXB …`
  suffix when `dxb.today.total_units === 0` so the line stays clean.
- If the Stripe payout API call fails, `next_3d_stripe_usd` falls back
  to 0 and a warning is appended (existing behaviour from
  `build-payouts.ts`).
- If the tightened Guesty cron occasionally fails between 06:00–10:00
  UTC, the next 15-min tick retries. The brief itself runs every 30
  min on its own cron, so a missed Guesty pull at one tick still has a
  retry window before the next brief opportunity.

## Testing

- **Unit tests:**
  - `build-yesterday-summary.test.ts` — renewal exclusion, edge cases
    (no reservations, all renewals, partial-month yesterday).
  - `build-dxb-section.test.ts` — empty DXB inventory, single DXB
    reservation, mixed Egypt+DXB rows (verify partitioning).
  - `build-payouts.test.ts` (extend) — 3-day window math, boundary
    conditions.
- **Manual verification before ship:**
  - Trigger a manual report build via the existing
    `/api/run-now` route on a worktree-scoped preview deploy.
  - Compare the rendered WhatsApp body against Guesty's homepage
    Daily-activity panel for the same Cairo date. Egypt headline should
    match Guesty's today counts exactly (modulo the renewal exclusion).
  - Cross-check yesterday-summary fields against the previous-day
    snapshot stored in `daily_report_snapshots`.
- **Regression check:** existing `build-buildings.test.ts` + 15+
  builder tests must continue to pass with `today = today` (no
  yesterday alias). Failures here would surface builders that
  implicitly relied on the alias.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Removing the `today = yesterday` alias silently breaks builders that relied on it | Per-builder audit pass in the implementation plan. Tests should catch mismatches, and the existing test coverage is good across builders. |
| Cron retry produces different "live" numbers each attempt | Acceptable. Later retry = later snapshot. The 30-min retry cadence in `run.ts` already handles partial failures gracefully. |
| Guesty rate-limits at 15-min cadence | Existing sync code respects rate limits and partial-page retries. Worst case: occasional missed pull, recovered on the next tick. |
| DXB Stripe filtering not feasible for next_3d_stripe_usd | Render DXB `next_3d` as Airbnb-only with a footnote if Stripe partition isn't possible. Implementation plan will probe Stripe metadata first. |
| The new partitioned `loadReservationCorpus` shape breaks callers | The orchestrator is the only known caller. Implementation plan grep + update. |
| WhatsApp line length wraps awkwardly on small phones with the DXB suffix | The DXB suffix is intentionally compact (`DXB 6/8 · 1 in · 0 out`); preview against an actual Android WhatsApp client before ship. |

## Implementation order (high-level)

The detailed implementation plan will be drafted in the next step
(writing-plans skill). High-level sequence:

1. Partition data loaders (`units.ts`, `reservations.ts`) — foundation
   for everything else. Tests first.
2. Build new sections (`build-yesterday-summary.ts`,
   `build-dxb-section.ts`) — pure functions over the partitioned data.
3. Extend `build-payouts.ts` with `next_3d_*` fields.
4. Update `types.ts` with new payload fields.
5. Remove the `today = yesterday` alias in `build.ts`; audit each
   downstream builder for correctness; fix the inherently-yesterday
   ones (no-show etc.) to read `yesterdayDate` explicitly.
6. Update renderers (`distribute.ts`, `render-html.tsx`,
   `render-pdf.tsx`) with the new layout.
7. Cron change in `vercel.json`.
8. Manual end-to-end verification on preview deploy.
9. Ship to main.

## Out-of-scope follow-ups noted for later

- DXB detail sections in PDF (per-market channel mix, RevPAR, weekly
  digest).
- Reviews split by market.
- AED display alongside USD for DXB revenue.
- Real-time refresh button in the web view of the report (currently the
  payload is snapshotted at build time).
- Per-market same-day alerts (the late check-in nugget is currently
  Egypt-only).
