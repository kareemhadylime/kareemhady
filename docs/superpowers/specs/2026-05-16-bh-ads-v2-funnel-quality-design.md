# BH Ads Insights — V2 (Funnel + Quality) — Design Spec

**Date:** 2026-05-16
**Author:** kareemhady + Claude
**Status:** Draft, awaiting user review
**Prior phase:** V1 (date filter + audience breakdowns) — [shipped 25 tasks, commit `2d08c1c`](2026-05-16-bh-ads-v1-filter-audience-design.md).

## Goal

Transform `/beithady/ads/` from "where is response coming from?" (V1) into "is the response actually any good?" by surfacing:

1. **Visual conversion funnel** — operators see drop-off between impressions → reach → clicks → leads → bookings at a glance.
2. **Lead quality %** per campaign — booked-to-leads ratio so the operator can rank campaigns by what actually converts.
3. **WhatsApp first-response time (FRT)** — median, p95, % over 1h SLA. Slow replies = lost bookings; surface the lever.
4. **Per-building breakdown** — which BH-* property is each campaign actually driving leads for. Filter every existing surface by `BH-26 / BH-73 / BH-435 / BH-OK / BH-34 / Unattributed`.
5. **Lead → booking cohort attribution** — weekly cohort × lag-week matrix so the "ROAS looks bad because bookings lag leads by 2-3 weeks" problem becomes visible.

V2 is the second of four phases (V1–V4) in the [BH Ads Insights Roadmap](2026-05-16-bh-ads-insights-roadmap.md).

## Non-goals (V2)

- ❌ Day-of-week × hour-of-day heatmap (V3's D1)
- ❌ Spend pacing chart (V3's D2)
- ❌ Period-over-period KPI deltas as standalone feature (V3's D3 — V1 already partially has this via `<PeriodDeltaBadge />`)
- ❌ Top-performing ad ranking (V3's E1)
- ❌ Top creative-asset ranking (V3's E2)
- ❌ Anomaly detection (V3's E3)
- ❌ AI narrative summary (V3's E4)
- ❌ PDF export / shareable token link (V4)
- ❌ Choropleth map for geo (V1.5 follow-up — table-only ships in V1)

## Locked product decisions

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Extend `/beithady/ads/audience/` with 3 new sub-tabs (Funnel / Quality / Cohort)** | Audience page is already the insights hub; adding tabs keeps everything one navigation hop away. FRT lives on `/beithady/ads` main as a small card so it's visible without clicking. Per-building filter chip lives on main + audience pages so every drill respects it. |
| Q2 | **Per-building attribution rule:** booked → `matched_reservation.building_code`; unbooked → `lead.building_interest`; else `'Unattributed'` | Ground-truth wins. Bookings get attributed to the building the guest actually stayed at. Unbooked leads get attributed to what they said they wanted. Honest about the unknown bucket. |
| Q3 | **FRT surfaces:** median + p95 + `% over 1h SLA` on main dashboard card; per-campaign breakdown in Quality tab | One number for "react now" plus tail-latency signal. p95 is where booking-loss risk hides. SLA threshold = 60 minutes (informal house standard). |
| Q4 | **Cohort granularity:** weekly buckets (Cairo-local ISO week), 6 rolling cohorts × 5 lag columns (W+1 through W+5plus) | Matches the typical 1-4 week lag between BH lead arrival and check-in date. Six cohorts = ~6 weeks of trailing data visible at a time. |

## Architecture chosen — Approach 2 (pure TS aggregators per feature)

Each feature gets a focused lib file (`funnel.ts`, `lead-quality.ts`, `frt.ts`, `per-building.ts`, `cohort.ts`) that pulls raw rows from existing tables and aggregates in-process. Mirrors V1's `insights-{geo,demo,device}.ts` pattern. No new DB views, no new tables, no new crons. Plenty fast at BH's scale (low-thousands of leads/bookings).

Alternatives considered:
- **Approach 1 — Materialized SQL views per dimension:** faster lookup, but every UI tweak needs a migration. Overkill for this dataset size.
- **Approach 3 — One big `analytics.ts` god-module:** smaller import surface but violates one-responsibility-per-file and would grow unmaintainable by V3.

## High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Operator browser                                            │
│                                                             │
│ /beithady/ads (main)                                        │
│   + <FrtCard /> (NEW V2 — C3)                               │
│   + <PerBuildingFilter /> chip row (NEW V2 — C4)            │
│                                                             │
│ /beithady/ads/audience                                      │
│   ?tab=geo|demo|device   (V1)                               │
│   ?tab=funnel  → <FunnelTab />   (NEW V2 — C1)              │
│   ?tab=quality → <QualityTab />  (NEW V2 — C2 + C3 detail)  │
│   ?tab=cohort  → <CohortTab />   (NEW V2 — C5)              │
│   + <PerBuildingFilter /> (V2 — C4 honored on every tab)    │
└────────────────────────────┬────────────────────────────────┘
                             ▼
              ┌─────────────────────────────────┐
              │ Server (Next.js server comps)   │
              │                                 │
              │  funnel.ts        (NEW)         │
              │  lead-quality.ts  (NEW)         │
              │  frt.ts           (NEW)         │
              │  per-building.ts  (NEW)         │
              │  cohort.ts        (NEW)         │
              │  buildings.ts     (NEW, shared) │
              │  insights-utils.ts (NEW shared) │  ← asInt/asMicros extracted
              └────────────┬────────────────────┘
                           ▼
              ┌─────────────────────────────────┐
              │ Supabase (NO new tables)        │
              │                                 │
              │  ads_daily_metrics (V1)         │
              │  ads_leads (V1; first_response_at)│
              │  ads_lead_funnel view (V1)      │
              │  ads_campaigns (V1)             │
              │  bh_reservations (existing)     │
              └─────────────────────────────────┘
```

### New files (~13 source files + colocated tests)

| File | Purpose |
|---|---|
| `src/lib/beithady/ads/funnel.ts` | `getFunnelStages({from,to,campaignId?,buildingCode?})` → 5 stages with conversion-pct between |
| `src/lib/beithady/ads/lead-quality.ts` | `getLeadQualityPerCampaign({from,to,buildingCode?})` → per-campaign quality % sorted by leads desc |
| `src/lib/beithady/ads/frt.ts` | `getFrtSummary({from,to,campaignId?,buildingCode?})` + `getFrtPerCampaign(...)` |
| `src/lib/beithady/ads/per-building.ts` | `attributeLeadToBuilding(lead)` + `getBuildingBreakdown({from,to,campaignId?})` |
| `src/lib/beithady/ads/cohort.ts` | `getCohortMatrix({weeksBack=6})` → rolling weekly cohort × lag matrix |
| `src/lib/beithady/ads/insights-utils.ts` | Shared `asInt`/`asMicros` (closes V1 final-review MIN-1) |
| `src/lib/beithady/buildings.ts` | Single source of truth for BH-* code list + display names |
| `src/app/beithady/ads/_components/frt-card.tsx` | Compact FRT card for main dashboard |
| `src/app/beithady/ads/_components/per-building-filter.tsx` | Building chip row (URL `?building=BH-26`) |
| `src/app/beithady/ads/audience/_components/funnel-tab.tsx` | SVG horizontal-bar funnel + summary table |
| `src/app/beithady/ads/audience/_components/quality-tab.tsx` | C2 quality % table + C3 FRT-per-campaign table |
| `src/app/beithady/ads/audience/_components/cohort-tab.tsx` | 6×5 cohort matrix with tinted cells |
| **(colocated `*.test.ts(x)` for each above)** | ~30 new tests total |

### Modified files (~6)

| File | Change |
|---|---|
| `src/app/beithady/ads/audience/page.tsx` | Add 3 tabs to `TABS` array; conditional renders for new sub-tabs; read `?building=` and thread through |
| `src/app/beithady/ads/page.tsx` | Render `<PerBuildingFilter />` + `<FrtCard />`; read `?building=` and thread through `<AudienceSummaryWidget />` |
| `src/app/beithady/ads/audience/_components/{geo,demo,device}-tab.tsx` | Accept optional `buildingCode?` prop; pass to `query*Rollup` (which already accepts the prop because rollups will be extended to honor it) |
| `src/lib/beithady/ads/insights-{geo,demo,device}.ts` | Import `asInt`/`asMicros` from new shared `insights-utils.ts` instead of inline; extend `query*Rollup` to accept `buildingCode?` filter |
| `src/lib/beithady/ads/reporting.ts` | (Optional) extend `getDashboardKpis` to also accept `buildingCode?` — V2 polish |
| `src/app/admin/integrations/backfill-ads-breakdowns-action.ts` | Check `res.ok` and surface error (closes V1 MIN-2) |

## Per-feature design

### C1 — Funnel (`funnel.ts`)

```ts
export async function getFunnelStages(opts: {
  from: string; to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<FunnelStages>;

export type FunnelStages = {
  stages: Array<{
    key: 'impressions' | 'reach' | 'clicks' | 'leads' | 'bookings';
    label: string;
    count: number;
    conversion_pct_from_prev: number | null;   // null for first stage
    conversion_pct_from_top: number | null;    // null for first stage
  }>;
};
```

**Source queries:**

- **Impressions / Reach / Clicks:** sum from `ads_daily_metrics` filtered by `metric_date BETWEEN from AND to` (+ optional `campaign_id` if `campaignId` set, + ad_id IS NULL + ad_set_id IS NULL to match V1's pattern of campaign-level rollups).
- **Leads:** count from `ads_leads` filtered by `created_at BETWEEN from AND to`, + optional `campaign_id`. If `buildingCode` is set, apply the per-building attribution helper in-process (JOIN to `ads_lead_funnel` to get matched_reservation.building_code, fall back to lead.building_interest).
- **Bookings:** subset of leads where `matched_reservation_id IS NOT NULL`.

**Note:** Impressions/Reach/Clicks have no per-building dimension at the metric level. When `buildingCode` is set, those 3 stages still show the campaign-aggregate counts (they're shared across buildings); leads/bookings get the per-building filter applied. We surface a small "shared across buildings" hint in the UI for impressions/reach/clicks when a building filter is active.

### C2 — Lead quality % (`lead-quality.ts`)

```ts
export async function getLeadQualityPerCampaign(opts: {
  from: string; to: string;
  buildingCode?: string;
}): Promise<Array<{
  campaign_id: number;
  campaign_name: string;
  platform: 'meta' | 'google' | 'tiktok';
  leads: number;
  booked: number;
  quality_pct: number;     // booked/leads * 100, 1 decimal
}>>;
```

**Source query:** Pull `ads_lead_funnel` rows in window, group by `campaign_id`. Join `ads_campaigns` for the name + platform. Filter through per-building attribution if `buildingCode` set. Filter out campaigns with 0 leads. Sort by `leads` desc.

### C3 — FRT (`frt.ts`)

```ts
export async function getFrtSummary(opts: {
  from: string; to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<FrtSummary>;

export type FrtSummary = {
  total_leads: number;
  responded_leads: number;
  unresponded_count: number;        // first_response_at IS NULL
  median_minutes: number | null;    // null if no responded leads
  p95_minutes: number | null;
  over_1h_count: number;            // first_response_at exists AND delta > 60min
  over_1h_pct: number;              // over_1h_count / responded_leads * 100
};

export async function getFrtPerCampaign(opts: {
  from: string; to: string;
  buildingCode?: string;
}): Promise<Array<FrtSummary & {
  campaign_id: number;
  campaign_name: string;
}>>;
```

**Source query:** Pull `ads_leads.{id, created_at, first_response_at, campaign_id}` in window. Compute `delta_minutes = (first_response_at - created_at) / 60_000` per responded lead. Compute median (sort + middle), p95 (sort + index = floor(n*0.95)), over_1h_count (delta > 60). Per-campaign variant groups and computes per group.

**SLA threshold:** 60 minutes hardcoded. The number can move to settings in V3 if operators want it tunable; YAGNI for V2.

### C4 — Per-building (`per-building.ts`)

**The attribution helper** (the single source of truth for "which building does this lead belong to"):

```ts
export type LeadAttributionInput = {
  matched_reservation_building?: string | null;
  building_interest?: string | null;
};

export function attributeLeadToBuilding(lead: LeadAttributionInput): string {
  return lead.matched_reservation_building
       ?? lead.building_interest
       ?? 'Unattributed';
}
```

**`bh_reservations`** rows referenced by `ads_lead_funnel.matched_reservation_id` carry a `building_code` field; the funnel view exposes the lead's `matched_reservation_id` but not the building. So `getBuildingBreakdown` issues a second query to enrich.

```ts
export async function getBuildingBreakdown(opts: {
  from: string; to: string;
  campaignId?: number;
}): Promise<Array<{
  building_code: string;            // 'BH-26' | 'BH-73' | ... | 'Unattributed'
  leads: number;
  booked: number;
  quality_pct: number;
  spend_share_egp: number;          // proportional split (see below)
  spend_share_pct: number;          // share of total spend, derived
}>>;
```

**Spend share rule:** the ONE place where we use proportional split. For each campaign in the window, divide its spend equally across its `building_codes` array. A campaign with `building_codes=['BH-26','BH-73']` → 50% of its spend to each. Sum across campaigns to get per-building spend. Display in EGP (converted via `convertManyToEgp` from V1).

**`<PerBuildingFilter />`** chip row reads `?building=` from URL and:
- If `building=BH-26`, every server query in the page filters leads/bookings through `attributeLeadToBuilding(...) === 'BH-26'`.
- If absent, no filter.
- Chips: `[ All ] [ BH-26 ] [ BH-73 ] [ BH-435 ] [ BH-OK ] [ BH-34 ] [ Unattributed ]`.
- "All" = no `?building=` param.

### C5 — Cohort matrix (`cohort.ts`)

```ts
export async function getCohortMatrix(opts: {
  weeksBack?: number;               // default 6
  buildingCode?: string;
}): Promise<{
  cohorts: Array<{
    week_label: string;             // 'W19 (May 5)'
    week_start: string;             // ISO date — Monday in Cairo TZ
    leads: number;
    bookings_by_lag: [number, number, number, number, number];        // W+1..W+5plus
    conversion_pcts_by_lag: [number, number, number, number, number]; // same shape
  }>;
}>;
```

**Algorithm:**

1. Compute Cairo-local Monday of current week (week start).
2. For each `n` in `[1..weeksBack]`, compute that cohort's week start = `currentMonday - n weeks`. Skip current partial week.
3. Pull all leads with `created_at >= oldestCohortStart` AND `created_at < currentMonday`.
4. Bucket each lead into its cohort by Cairo-local ISO week of `created_at`.
5. For each lead that booked: find its `matched_reservation.created_at` (booking timestamp), compute lag in whole weeks: `floor((booking_date - cohort_start) / 7d)`. Buckets: lag 1, 2, 3, 4, 5+.
6. Per cohort: `conversion_pcts_by_lag[i] = bookings_by_lag[i] / leads * 100`.

**Cell color buckets** (slate → emerald, no new palette colors):
- `0%` → `bg-slate-100 dark:bg-slate-800`
- `0 < pct ≤ 5%` → `bg-emerald-50 dark:bg-emerald-950`
- `5 < pct ≤ 10%` → `bg-emerald-200/40 dark:bg-emerald-700/40`
- `10 < pct ≤ 20%` → `bg-emerald-400/40 dark:bg-emerald-500/40`
- `> 20%` → `bg-emerald-500/40 dark:bg-emerald-400/40`

**Cairo DST:** Use `Africa/Cairo` timezone for week boundary computation. Pattern lifted from KIKA Picker Report's `resolveScope` helper. Lead `created_at` is `timestamptz`, so conversion to Cairo local is a one-liner.

### `buildings.ts` — Single source of truth

```ts
export const BH_BUILDINGS = [
  { code: 'BH-26',  name: 'Beit Hady 26' },
  { code: 'BH-73',  name: 'Beit Hady 73' },
  { code: 'BH-435', name: 'Beit Hady 435' },
  { code: 'BH-OK',  name: 'Beit Hady OK' },
  { code: 'BH-34',  name: 'Beit Hady 34' },
] as const;

export type BhBuildingCode = (typeof BH_BUILDINGS)[number]['code'];

export const UNATTRIBUTED = 'Unattributed';
```

Used by `<PerBuildingFilter />`, `getBuildingBreakdown`, and any future surface that needs the canonical list.

## UI structure

### `<FrtCard />` on /beithady/ads main

`ix-card p-5` between platform-status row and audience-snapshot widget. Renders 3 stats (Median / p95 / Over 1h SLA) + worst-campaign link. Hidden when `total_leads === 0` in the date window. Tone tokens: emerald if `over_1h_pct < 10`, slate if 10-20, rose if `>20`.

### `<PerBuildingFilter />`

`ix-card p-3 flex flex-wrap items-center gap-3 text-xs`. Chips with emerald-active / slate-inactive pattern (same as `<DateRangeFilter />`). URL: `?building=BH-26`. Renders on `/beithady/ads` main AND `/beithady/ads/audience` (between `<AudienceFilters />` and the sub-tab strip).

### Funnel tab

Header: 5-stage horizontal SVG bar chart (bar width = stage count / max stage). Between each stage, render `↓ N%` conversion. Below: summary table with stage / count / pct_from_prev / pct_from_top columns. When `?building=` is active, render hint: `*Impressions/reach/clicks are campaign-aggregate (not per-building)`.

### Quality tab

Two stacked `ix-card p-5` blocks:
1. **Lead quality % per campaign** — table with `Campaign | Leads | Booked | Quality % | Δ (compare)` columns. Uses `<PeriodDeltaBadge />` (no `reverseColor` — higher quality is better). Sorted by leads desc.
2. **Response speed per campaign** — table with `Campaign | Leads | Median | p95 | % over 1h SLA` columns. SLA cell uses the FrtCard tone palette.

### Cohort tab

6 rows × 5 cols matrix. Header row: `+1w / +2w / +3w / +4w / +5w+`. Each row: `Wnn (Mmm dd)` label + 5 percent cells. Footer row: `Lead totals` summing each lag column across cohorts (effectively useless for lag but useful as a sanity check on cohort sizes). Cells tint by bucket. Tooltip on hover: `{bookings} bookings of {leads} leads`.

### Tab nav

```
[ Geo ] [ Demographics ] [ Device & Placement ] [ Funnel ] [ Quality ] [ Cohort ]
```

Same emerald-active / slate-inactive pattern. Active determined by `?tab=` searchParam (default `geo`).

### Permissions

All new pages/components remain under `requireBeithadyPermission('ads', 'read')`. The 3 new sub-tabs and the FRT card inherit the existing audience-page / main-page gate.

## Error handling

### Query-side errors

| Error | Handling | Operator action |
|---|---|---|
| `bh_reservations` join missing | Treat that lead's building as Unattributed; log to console | None — investigate if Unattributed grows abnormally |
| Lead has no `building_interest` AND no booking | Bucket as Unattributed | Train form to require building selection |
| Cohort tab — current partial week | Excluded entirely (only complete cohorts shown) | None |
| Supabase query throws | Catch in calling tab/card → render empty state | Refresh; check `/admin/integrations` health |

### Component-side

- `<FrtCard />` returns `null` when `total_leads === 0` (no card rendered, no broken numbers).
- `<FunnelTab />` shows all-zero stages when no impressions data in the window (rather than crashing on division-by-zero).
- `<CohortTab />` shows an empty grid with hint "Not enough lead history yet for cohort analysis" when fewer than `weeksBack` complete weeks of leads exist.
- All tab queries wrap their `await Promise.all(...)` calls in try/catch and render a slate "Data temporarily unavailable" card if the DB throws. Closes V1 MIN-3.

### Per-building filter edge cases

- If `?building=BH-XX` (invalid code), fall back to "All" silently. UI doesn't crash; URL chip not visually highlighted.
- If `?building=Unattributed`, every query filters to leads where attribution returns the literal string `'Unattributed'`.

## Testing strategy

### Unit tests (colocated `*.test.ts`)

| File | Coverage |
|---|---|
| `funnel.test.ts` | 5-stage shape always present, conversion math, empty data, buildingCode filter applies to leads+bookings only |
| `lead-quality.test.ts` | Per-campaign rollup, `quality_pct = booked/leads*100` rounding to 1 dp, 0-leads campaign excluded, sort order |
| `frt.test.ts` | Median (even+odd length), p95, over_1h boundary at exactly 60min, unresponded_count for null first_response, all-unresponded edge case |
| `per-building.test.ts` | `attributeLeadToBuilding` precedence chain, `getBuildingBreakdown` rollup, spend-share proportional split |
| `cohort.test.ts` | ISO-week bucketing (Cairo TZ DST-safe), lag-week computation, partial-current-week excluded, weeksBack honored, cell-color bucket math |
| `frt-card.test.tsx` | 3 numbers + tone classes per SLA%, hides when total_leads=0, worst-campaign link |
| `per-building-filter.test.tsx` | Renders all chips, click pushes `?building=`, active chip class |
| `funnel-tab.test.tsx` | Bars in correct order, drop-off labels, empty state, hint when buildingCode active |
| `quality-tab.test.tsx` | Both tables render, sorted by leads desc, period-delta badge when compare=1, SLA cell tone |
| `cohort-tab.test.tsx` | 6×5 grid, footer totals, cell color buckets, empty-state hint |
| `insights-utils.test.ts` | `asInt`/`asMicros` (extracted from V1) — keeps existing 16 normalizer assertions green |
| (smoke updates to V1 tab tests) | New `buildingCode?` prop threaded through `query*Rollup` |

All use mocked Supabase via `vi.mock('@/lib/beithady/ads/...')` patterns lifted from V1.

### Manual smoke (documented for ship phase)

1. Visit `/beithady/ads?preset=7d` — FRT card renders 3 numbers when leads exist; hides when range empty.
2. Click building chip `BH-26` — URL updates `?building=BH-26`. Audience widget rows reflect only BH-26 leads.
3. Visit `/beithady/ads/audience?tab=funnel` — funnel renders 5 bars descending. Set `?building=BH-26` — leads/bookings shrink, impressions/reach/clicks stay constant with hint.
4. Switch to `?tab=quality` — both tables render. Toggle `?compare=1` — Δ badges appear on quality column.
5. Switch to `?tab=cohort` — 6×5 matrix with tinted cells; partial current week not shown.
6. Verify `<FrtCard />` worst-campaign link → `/audience?tab=quality&campaign=<id>` and the row is visible.

### Test target

V1 final: ~795 passing / 22 skipped.
V2 estimate: **+30 new tests** → target **~825 passing**, zero regressions.

## V1 polish closed inline (from final review)

V2 also addresses three V1 final-review observations:

- **MIN-1 (shared utils):** `asInt`/`asMicros` extracted into `insights-utils.ts`; V1's 3 normalizers re-import.
- **MIN-2 (backfill error swallow):** `backfillAdsBreakdownsAction` checks `res.ok` and surfaces error via toast/return value.
- **MIN-3 (silent rollup errors):** `query*Rollup` functions log Supabase `error` via `console.error(...)` before returning empty.

(MIN-4 — cron credential loading per-loop — deferred to V3's optimization phase since BH currently has very few campaigns.)

## Deployment ordering

```
1. Ship shared utils (insights-utils.ts + buildings.ts) + extract asInt/asMicros from V1's 3 files
2. Ship per-building.ts (attribution helper + getBuildingBreakdown) + tests
3. Ship funnel.ts + lead-quality.ts + frt.ts + cohort.ts + tests
4. Ship <PerBuildingFilter /> component + jsdom test
5. Ship <FrtCard /> component + jsdom test
6. Wire <PerBuildingFilter /> + <FrtCard /> into /beithady/ads main
7. Ship FunnelTab + QualityTab + CohortTab components + jsdom tests
8. Wire all 3 new sub-tabs into audience/page.tsx + tab nav
9. Extend V1's geo/demo/device tabs to honor buildingCode? prop
10. Close MIN-2 (backfill action) + MIN-3 (rollup error logging)
11. Smoke test all 6 manual checks
12. Mark V2 done in handoff
```

Each step pushes to main → Vercel auto-deploys → manual smoke before proceeding.

## Done criteria

- [ ] All ~20 code tasks committed and pushed
- [ ] 5 V2 features render on their target surfaces (FRT card + per-building chip on main; Funnel/Quality/Cohort tabs on audience page)
- [ ] V1 polish closed inline (MIN-1, MIN-2, MIN-3)
- [ ] Per-building filter URL param works on every V1 + V2 tab
- [ ] FRT card hides cleanly when no leads in range
- [ ] Cohort tab matrix renders with correct ISO-week labels (Cairo TZ DST-safe)
- [ ] Full test suite green: target ~825 passing, zero regressions
- [ ] `tsc --noEmit` clean
- [ ] Deployed to prod; `app.limeinc.cc` alias updated if needed

## Cost summary

| Resource | V2 cost |
|---|---|
| DB storage | 0 (no new tables) |
| Migrations | 0 |
| Cron API calls | 0 (no new crons) |
| Vercel function runtime | All within existing limits |
| Claude API | $0 (deferred to V3's E4) |

## Open questions

None remaining for V2. All product decisions locked.

V2.5 follow-ups if anything surfaces in practice:
- Tunable SLA threshold (currently hardcoded 60min)
- Per-building × per-platform cross-table (matrix view)
- Cohort granularity toggle (weekly ↔ monthly)
- Backfill `building_interest` from historical lead form data
