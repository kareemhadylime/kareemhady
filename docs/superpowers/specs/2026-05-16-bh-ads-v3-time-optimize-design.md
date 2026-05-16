# BH Ads Insights — V3 (Time/Patterns + Optimization) — Design Spec

**Date:** 2026-05-16
**Author:** kareemhady + Claude
**Status:** Draft, awaiting user review
**Prior phases:** [V1](2026-05-16-bh-ads-v1-filter-audience-design.md) (date filter + audience breakdowns) and [V2](2026-05-16-bh-ads-v2-funnel-quality-design.md) (funnel + quality) both shipped.

## Goal

Turn `/beithady/ads/` from "is the response any good?" (V2) into "**when** is it good, **which** specific ads work, and **what should I do tomorrow**?" by surfacing:

1. **Day × hour heatmap** — when do leads actually arrive (Cairo time); when does Meta spend convert.
2. **Spend pacing** — daily spend trajectory vs each campaign's monthly budget cap, with end-of-month projection.
3. **Period-over-period delta on KPIs** — extend V1's `<PeriodDeltaBadge />` to every KPI card on the main dashboard.
4. **Top-performing ads** — rank individual ads (not campaigns) within the window by leads / CTR / CPL.
5. **Top creative assets** — which Gallery photos/videos drive the most engagement.
6. **Anomaly banner** — visual surface for the spend-spike / zero-leads / low-ROAS alerts the existing WhatsApp cron already detects.
7. **AI narrative summary** — Claude generates a 3-paragraph "what's working / what's not / one action" on demand.

V3 is the third of four phases (V1–V4) in the [BH Ads Insights Roadmap](2026-05-16-bh-ads-insights-roadmap.md).

## Non-goals (V3)

- ❌ Hourly breakdowns from Google or TikTok (Meta only — their per-platform reliability varies)
- ❌ AI summary scheduled nightly cron (on-demand only; V3.5 if operators want it auto)
- ❌ Persistent anomaly event table (re-computed at page load; cron keeps writing WhatsApp alerts independently)
- ❌ Dismissible anomaly UI (each anomaly auto-hides when the underlying condition clears)
- ❌ Per-ad creative bidder / auto-optimizer (operator-decided, not algorithmic — V4 territory if at all)
- ❌ Cross-platform creative tagging (E2 limited to BH Gallery assets that already map through `ads_ads.creative_url`)
- ❌ PDF export / share token (V4)

## Locked product decisions

| # | Decision | Rationale |
|---|---|---|
| Q1 | **All 7 V3 features in scope.** | Roadmap commitment. ~25 TDD tasks. Big batch but each feature is small (most are UI on existing data). |
| Q2 | **D1 heatmap: lead density (instant) + Meta hourly cron (new pipeline).** | UI ships with toggle between "Lead density" (Cairo-local hour-of-week from `ads_leads.created_at`) and "Meta spend" (new `ads_hourly_metrics` table populated by cron extension). Lead density is what matters for WhatsApp staffing; spend heatmap is for media optimization. |
| Q3 | **E4 AI narrative: on-demand button only.** | Operator clicks button → Claude haiku-4-5 → 3-paragraph card. No scheduled cron, no storage table. ~$0.01/call, 20/day cap = ~$0.20/day max. |
| Q4 | **E3 anomaly banner: re-compute at page load via shared `anomalies.ts`.** | The existing `beithady-ads-anomaly-alert` cron already detects spike / zero-leads / low-ROAS and sends WhatsApp. V3 refactors that logic into a shared lib that the cron AND the new dashboard banner both call. NO new table. NO behavior change for the cron. |

## Architecture chosen — Approach 2 (cluster onto fewer surfaces)

Each feature gets a focused lib file (mirrors V1's `insights-*` pattern and V2's per-feature aggregators). UI clusters into **2 new audience sub-tabs + 3 new main-dashboard cards** instead of 7 separate surfaces — operators get less navigation overhead.

Alternatives considered:
- **Approach 1 — Each feature its own surface (7 distinct routes/cards):** highest discoverability but most clicks; rejected for navigation overhead.
- **Approach 3 — Single new `/beithady/ads/insights` mega-page:** breaks existing nav convention; rejected.

## High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Operator browser                                             │
│                                                              │
│ /beithady/ads (main)                                         │
│   + <AiSummaryCard />       (NEW V3 — E4)                    │
│   + <AnomalyBanner />        (NEW V3 — E3)                   │
│   + <SpendPacingCard />      (NEW V3 — D2)                   │
│   + KPI <Stat>s wrap delta when ?compare=1 (NEW V3 — D3)     │
│                                                              │
│ /beithady/ads/audience                                       │
│   ?tab=geo|demo|device|funnel|quality|cohort (V1+V2)         │
│   ?tab=time      → <TimeTab />     (NEW V3 — D1)             │
│   ?tab=optimize  → <OptimizeTab /> (NEW V3 — E1+E2)          │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
              ┌─────────────────────────────────┐
              │ Server (Next.js server comps)   │
              │                                 │
              │  hourly.ts          (NEW — D1)  │
              │  pacing.ts          (NEW — D2)  │
              │  top-ads.ts         (NEW — E1)  │
              │  top-assets.ts      (NEW — E2)  │
              │  anomalies.ts       (NEW — E3)  │
              │  ai-summary.ts      (NEW — E4)  │
              │  reporting.ts (EXT — D3 plumb)  │
              └────────────┬────────────────────┘
                           ▼
              ┌─────────────────────────────────┐
              │ Supabase                        │
              │                                 │
              │  ads_hourly_metrics (NEW table) │  ← migration 0140
              │  All other queries: existing    │
              └─────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Cron (extend existing, no new cron)      │
│                                          │
│  beithady-ads-insights (EXTENDED):       │
│    fetches hourly_stats for Meta last24h │
│    upserts ads_hourly_metrics            │
│                                          │
│  beithady-ads-anomaly-alert (REFACTOR):  │
│    calls shared detectAnomalies() lib    │
│    (same behavior, deduplicated logic)   │
└──────────────────────────────────────────┘
```

### New files (~17 source files + colocated tests)

| File | Purpose |
|---|---|
| `supabase/migrations/0140_bh_ads_hourly_metrics.sql` | One new table: campaign × date × hour Meta-only metrics |
| `src/lib/beithady/ads/hourly.ts` | `getLeadDensityHeatmap` + `getMetaHourlyHeatmap` (Cairo TZ) |
| `src/lib/beithady/ads/pacing.ts` | `getSpendPacing` (daily trend + per-campaign cap projection) |
| `src/lib/beithady/ads/top-ads.ts` | `getTopAds` (rank ads by sortBy='leads'\|'ctr'\|'cpl') |
| `src/lib/beithady/ads/top-assets.ts` | `getTopAssets` (thin wrapper over V1's `ads_asset_performance` view) |
| `src/lib/beithady/ads/anomalies.ts` | `detectAnomalies` (extract from existing cron) |
| `src/lib/beithady/ads/ai-summary.ts` | `generateAiSummary` (Claude haiku-4-5 wrapper + cost cap) |
| `src/app/beithady/ads/actions.ts` (extend) | `generateAiSummaryAction` server action |
| `src/app/beithady/ads/_components/ai-summary-card.tsx` | Form + result card; client wrapper |
| `src/app/beithady/ads/_components/anomaly-banner.tsx` | Server component, null when empty |
| `src/app/beithady/ads/_components/spend-pacing-card.tsx` | Sparkline + per-campaign bars |
| `src/app/beithady/ads/_components/kpi-stat-with-delta.tsx` | Extended `<Stat>` that accepts `prior` prop |
| `src/app/beithady/ads/audience/_components/time-tab.tsx` | 7×24 heatmap + Lead/Meta toggle |
| `src/app/beithady/ads/audience/_components/optimize-tab.tsx` | E1 table + E2 table stacked |
| **(colocated `*.test.ts(x)`)** | ~41 new tests total |

### Modified files (~5)

| File | Change |
|---|---|
| `src/app/api/cron/beithady-ads-insights/route.ts` | Also fetch `hourly_stats_aggregated_by_advertiser_time_zone` (last 24h, Meta only) and upsert to `ads_hourly_metrics`. |
| `src/app/api/cron/beithady-ads-anomaly-alert/route.ts` | Refactor: extract anomaly logic to `anomalies.ts` lib, cron just calls + sends WhatsApp. |
| `src/app/beithady/ads/page.tsx` | Render `<AiSummaryCard />`, `<AnomalyBanner />`, `<SpendPacingCard />`. Wrap existing `<Stat>` calls with `<PeriodDeltaBadge />` when `?compare=1`; fetch prior-period KPIs via `getDashboardKpisWithCompare`. |
| `src/app/beithady/ads/audience/page.tsx` | Add 2 tabs (`time`, `optimize`) to TABS; add conditional renders. |
| `src/lib/beithady/ads/reporting.ts` | Add `getDashboardKpisWithCompare({ range, compare })` → `{ current, prior }` helper. |

### One migration

`supabase/migrations/0140_bh_ads_hourly_metrics.sql`:

```sql
create table if not exists public.ads_hourly_metrics (
  id            bigserial primary key,
  account_id    bigint not null references public.ads_accounts(id) on delete cascade,
  campaign_id   bigint not null references public.ads_campaigns(id) on delete cascade,
  platform      text not null check (platform in ('meta','google','tiktok')),
  metric_date   date not null,
  hour          int  not null check (hour between 0 and 23),
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  spend_micros  bigint not null default 0,
  fetched_at    timestamptz not null default now()
);
create unique index ads_hourly_metrics_unique
  on public.ads_hourly_metrics (campaign_id, metric_date, hour, platform);
create index ads_hourly_metrics_campaign_date
  on public.ads_hourly_metrics (campaign_id, metric_date);

comment on table public.ads_hourly_metrics is
  'BH Ads V3 D1: hourly impressions/clicks/spend per Meta campaign. Cairo-local hour.';
```

Storage estimate: 5 campaigns × 24 hours × 90 days = 10,800 rows → < 2 MB total.

## Per-feature design

### D1 — Hourly heatmap (`hourly.ts`)

Two complementary read functions, surfaced as a toggle:

```ts
export async function getLeadDensityHeatmap(opts: {
  from: string; to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<Array<{ day_of_week: 0|1|2|3|4|5|6; hour: 0..23; lead_count: number }>>;

export async function getMetaHourlyHeatmap(opts: {
  from: string; to: string;
  campaignId?: number;
}): Promise<Array<{ day_of_week: 0..6; hour: 0..23; impressions: number; clicks: number; spend_micros: number }>>;
```

**Lead density:** queries `ads_leads.created_at` filtered to window + per-building attribution. Buckets each lead by `cairoDayOfWeek` (Mon=0..Sun=6) + `cairoHour` (0..23). Reuses Cairo TZ pattern from V2 cohort.

**Meta spend:** queries the new `ads_hourly_metrics` table. Sums per (day_of_week, hour) across the window.

**Cron extension** (`beithady-ads-insights/route.ts`): after the existing daily fetch, for each Meta campaign, also fetch:

```
GET /<campaignId>/insights
  ?fields=impressions,clicks,spend
  &breakdowns=hourly_stats_aggregated_by_advertiser_time_zone
  &time_range[since]=YESTERDAY&time_range[until]=TODAY
  &time_increment=1
```

Meta returns rows shaped `{ hourly_stats_aggregated_by_advertiser_time_zone: "00:00:00 - 00:59:59", impressions, clicks, spend }`. Parse hour from the string, derive day-of-week from `date_start` in Cairo TZ. Upsert into `ads_hourly_metrics`.

### D2 — Spend pacing (`pacing.ts`)

```ts
export async function getSpendPacing(opts: {
  range: { from: string; to: string };
}): Promise<{
  daily: Array<{ date: string; spend_egp: number }>,
  campaigns: Array<{
    campaign_id: number;
    campaign_name: string;
    monthly_budget_cap_egp: number | null;     // converted from monthly_budget_cap_usd if set
    spend_egp_mtd: number;                      // month-to-date
    projected_egp_eom: number;                  // straight-line projection
    pct_of_cap: number;                         // 0..100+
    auto_paused: boolean;
  }>;
  total_spend_egp: number;
  total_cap_egp: number;                        // sum of campaign caps
}>;
```

**Daily series:** sum `spend_micros` from `ads_daily_metrics` grouped by `metric_date`, converted to EGP via `convertManyToEgp`. Powers the sparkline.

**Per-campaign:** join `ads_campaigns` (`monthly_budget_cap_usd`, `auto_paused_at`, `auto_paused_reason`) × MTD spend from `ads_daily_metrics`. Cap converted to EGP. Projection = `spend_mtd / day_of_month * days_in_month` (straight-line).

Highlights:
- `auto_paused === true` → row tinted slate + "auto-paused" badge
- `pct_of_cap > 80 && !auto_paused` → row tinted amber + "projected to hit cap by Mmm dd" hint

### D3 — Period-delta on KPIs (`reporting.ts` extension)

Add helper that fetches the current period AND derives + fetches the prior period in one go:

```ts
export async function getDashboardKpisWithCompare(opts: {
  range: { from: string; to: string };
  compare: boolean;
}): Promise<{
  current: ReturnType<typeof getDashboardKpis>;     // the V1 KPI shape
  prior: ReturnType<typeof getDashboardKpis> | null; // null when compare=false
}>;
```

Internally calls `getDashboardKpis({ from, to })` for current. When `compare === true`, also calls it for `derivePriorPeriod(range)`. Main page wraps each `<Stat>` like:

```tsx
<Stat label="Spend (7d)" value={`EGP ${current.spend}`} />
{prior && <PeriodDeltaBadge current={current.spend} prior={prior.spend} />}

<Stat label="CPL" value={`EGP ${current.cpl}`} />
{prior && <PeriodDeltaBadge current={current.cpl} prior={prior.cpl} reverseColor />}
```

`reverseColor` for CPL (lower = better) per V1's pattern.

### E1 — Top-performing ads (`top-ads.ts`)

```ts
export async function getTopAds(opts: {
  from: string; to: string;
  sortBy: 'leads' | 'ctr' | 'cpl';
  limit?: number;          // default 20
  buildingCode?: string;
}): Promise<Array<{
  ad_id: number;
  ad_name: string;
  campaign_id: number;
  campaign_name: string;
  platform: 'meta' | 'google' | 'tiktok';
  impressions: number;
  clicks: number;
  ctr_pct: number;          // clicks/impressions*100
  spend_egp: number;        // converted
  leads: number;            // from ads_leads.ad_id join
  cpl_egp: number | null;   // spend/leads, null when leads=0
}>>;
```

Join `ads_ads × ads_daily_metrics` filtered by `ad_id IS NOT NULL` (ad-level rows). Aggregate per ad. EGP-convert spend (using account currency). Sort in-process by `sortBy`. CPL=null rows (zero leads) excluded when `sortBy=cpl`. Per-building filter via the V2 attribution helper (only relevant when leads exist for the ad).

### E2 — Top creative assets (`top-assets.ts`)

```ts
export async function getTopAssets(opts: {
  buildingCode?: string;
  limit?: number;          // default 20
}): Promise<AssetPerformanceRow[]>;
```

Thin wrapper over `listAssetPerformance({ buildingCode, limit })` from V1's `reporting.ts`. The underlying `ads_asset_performance` view (migration 0109) already joins `ads_ads.creative_url` to `beithady_gallery_assets`. New helper just hard-codes the V3 default limit and exposes it as a focused module.

### E3 — Anomaly banner (`anomalies.ts`)

Extract logic from existing `beithady-ads-anomaly-alert` cron:

```ts
export type AnomalyEvent = {
  type: 'spend_spike' | 'zero_leads' | 'low_roas';
  severity: 'warning' | 'critical';
  campaign_id?: number;
  campaign_name?: string;
  message: string;
  metric: { today: number; baseline: number; ratio: number };
};

export async function detectAnomalies(opts: {
  today?: string;          // ISO date, default Cairo-today
  lookbackDays?: number;   // default 7
}): Promise<AnomalyEvent[]>;
```

Three detection rules (same as existing cron):
- `spend_spike`: today's spend > 3× yesterday's spend (severity=warning at 3-5×, critical at 5×+)
- `zero_leads`: spend > $30 today + 0 leads (severity=warning)
- `low_roas`: trailing-7d ROAS < 1× with > $100 spend (severity=critical)

**Cron refactor:** `beithady-ads-anomaly-alert/route.ts` becomes a thin caller — `const events = await detectAnomalies(); for (const e of events) await sendWhatsApp(...)`. Logic is identical; deduplication is the win.

**Banner:** server component on `/beithady/ads`, calls `detectAnomalies()` at request time. Returns `null` when empty. Each anomaly = an `ix-card` row, tinted amber (warning) or rose (critical).

### E4 — AI narrative summary (`ai-summary.ts`)

```ts
export async function generateAiSummary(opts: {
  range: { from: string; to: string };
  dashboardData: {
    kpis: { spend_egp, leads, bookings, cpl_egp, roas, attributed_revenue_egp };
    topCountries: Array<{ country, clicks, pct }>;
    topDemos: Array<{ age_range, gender, clicks, pct }>;
    topDevices: Array<{ device, clicks, pct }>;
    topCampaigns: Array<{ name, platform, leads, cpl_egp, quality_pct }>;
    frtSummary: { median_minutes, p95_minutes, over_1h_pct };
    anomalies: AnomalyEvent[];
    funnelStages: Array<{ key, count }>;
  };
}): Promise<{ summary: string; cost_usd: number }>;
```

Calls Anthropic SDK with `claude-haiku-4-5` (~$0.01/call). Prompt structure:

```
You are an ad-ops analyst for Beit Hady, a boutique short-term rental brand in Egypt
operating five buildings: BH-26, BH-73, BH-435, BH-OK, BH-34.

Given this dashboard for the period <from> through <to>, write a 3-paragraph summary:

1. WHAT'S WORKING: top platforms/campaigns/audiences driving leads + bookings. Cite numbers.
2. WHAT'S NOT WORKING: slow FRT, high CPL campaigns, anomalies. Cite numbers.
3. ACTION: one concrete recommendation for tomorrow. Be specific (kill ad X, shift budget from Y to Z).

Data:
<JSON.stringify(dashboardData, null, 2)>

Keep each paragraph under 50 words. No bullet points, no hedging language.
Use EGP for money. Round percentages to whole numbers.
```

**Cost cap:** before calling, count today's `beithady_audit_log` entries where `module='ads' AND action='ai_summary_generated'`. If count ≥ 20, return `{ summary: '', cost_usd: 0, error: 'daily_cap_reached' }`. Otherwise call and record audit:

```ts
await recordAudit({
  module: 'ads',
  action: 'ai_summary_generated',
  metadata: { range, cost_usd, model: 'claude-haiku-4-5' },
});
```

Rendering: server action returns the summary string; client card splits on `\n\n` and renders one `<p>` per paragraph (no markdown lib needed since prompt forbids bullets).

## UI structure

### `<AiSummaryCard />` — top of /beithady/ads

`ix-card p-5` with form + result. Server-renders the most recent summary for this exact range if one exists in audit log within the last hour; otherwise shows only the button. Button text + cost shown: `Generate summary · cost ~$0.01 · daily cap 17/20`. After form submit, page revalidates and renders the new summary.

### `<AnomalyBanner />` — under platform-status row, above FRT card

Server component. Returns `null` when `detectAnomalies()` returns `[]`. Each event = a row with `ix-card border-amber-200 bg-amber-50` (warning) or `border-rose-200 bg-rose-50` (critical). Icon: `AlertTriangle`. Auto-hides when underlying condition clears (no dismiss UI).

### `<SpendPacingCard />` — under FRT card, above audience widget

`ix-card p-5`. Top half: SVG sparkline of daily spend (slate stroke) + total/cap summary. Bottom half: per-campaign bars (background = `bg-slate-100`, fill colored by `pct_of_cap` bucket using same emerald→amber→rose palette as cohort tab). Projection hint inline under bars when relevant.

### KPI cards with delta (D3)

Existing `<Stat label value icon accent>` extended to accept optional `prior?: number` and `reverseColor?: boolean`. When `prior` is non-null, renders `<PeriodDeltaBadge />` inline next to the value. No new component file — extend the existing `Stat` defined inline in `/beithady/ads/page.tsx`.

### `<TimeTab />` — audience page `?tab=time`

```
Mode toggle: [ Lead density ] [ Meta spend ]

       0h 1h 2h ... 8h 9h ... 18h 19h ... 23h
Mon    ▁  ▁  ▁  ... ▃  ▅  ...  ▇  █  ...  ▃
Tue    ...
...
Sun    ...
```

7 rows × 24 cols. Cell tinted by V2's `cellColorBucket` palette (slate→emerald). Tooltip on hover: `Mon 19:00 — 8 leads (12% of total)` for lead mode, `Mon 19:00 — EGP 45 spend, 234 impressions` for Meta mode. Mode toggle is a client component; pushes `?heatmap=leads|meta` to URL (default = leads).

When Meta mode is selected but `ads_hourly_metrics` has no data for the range (cron hasn't populated yet), render: "Meta hourly data populating — try again in ~6 hours" placeholder.

### `<OptimizeTab />` — audience page `?tab=optimize`

Two stacked `ix-card` blocks:

1. **Top performing ads** — table with sort tabs (Leads / CTR / CPL) at top. URL: `?tab=optimize&sort=cpl`. Columns: `Ad name | Campaign | Impressions | Clicks | CTR | Spend EGP | Leads | CPL EGP`. Sort tab uses emerald-active / slate-inactive (same as `<DateRangeFilter>`).

2. **Top creative assets** — table with thumbnail column. Columns: `Thumbnail (60×60 img) | Filename | Building | Ads | Impressions | Clicks | CPL EGP`. Thumbnail uses `<img src={public_url}>` (Supabase signed-url already in the view). Empty state when no assets: "No creative-asset performance data yet."

### Tab nav update

```
[ Geo ] [ Demo ] [ Device ] [ Funnel ] [ Quality ] [ Cohort ] [ Time ] [ Optimize ]
```

8 tabs. Same emerald-active / slate-inactive pattern.

### Permissions

All new pages/components remain under `requireBeithadyPermission('ads', 'read')`. E4 AI summary action also gates on `read` (operator can read = operator can spend the API call; explicit write permission would be over-engineering for a $0.01 click).

## Error handling

### Page-load errors

| Surface | Failure | Behavior |
|---|---|---|
| `<AnomalyBanner />` | `detectAnomalies()` throws | Returns `null` (banner hidden); logs error |
| `<SpendPacingCard />` | DB query fails | Renders empty-state card "Spend data temporarily unavailable" |
| `<AiSummaryCard />` | Anthropic SDK error | Server action returns `{ ok: false, error }`; card shows inline error message + retry button |
| `<TimeTab />` | Lead query OR Meta query fails | Renders the mode that did succeed; failed mode shows "Data unavailable" placeholder |
| `<OptimizeTab />` | Either table query fails | Other table still renders; failed one shows placeholder |
| AI summary cap reached | Daily cap of 20 hit | Button disabled with "Daily cap reached — resets at midnight Cairo" hint |
| Cron Meta hourly fetch fails | Same as existing cron failure handling | Per-campaign isolation; partial success in JSON response |

### AI cost guards

- Hard cap: 20 calls/day per Cairo-local date (counted via `beithady_audit_log`).
- Each call audit-logged with `cost_usd` field so kareem can trace spend in the log.
- Anthropic SDK timeout: 30s. On timeout, audit logs `action='ai_summary_timeout'`.

## Testing strategy

| File | Test count | Coverage |
|---|---|---|
| `hourly.test.ts` | 5 | Cairo day-of-week mapping; lead bucket boundaries; Meta hourly normalizer; cross-midnight hour; empty data |
| `pacing.test.ts` | 4 | Daily aggregation; cap projection math; `pct_of_cap` calc; `auto_paused` flag |
| `top-ads.test.ts` | 4 | Sort by leads / ctr / cpl; limit honored; CPL math with 0 leads excluded; campaign join |
| `top-assets.test.ts` | 2 | Wrapper passes through; buildingCode filter applied |
| `anomalies.test.ts` | 6 | Each anomaly type; severity threshold; multi-campaign aggregation; empty case; lookback window; Cairo-today boundary |
| `ai-summary.test.ts` | 4 | Prompt construction includes all dashboard sections; cap enforcement; cost logging; Anthropic SDK error path |
| `ai-summary-card.test.tsx` | 3 | Initial state (button only); after-submit renders 3 paragraphs; cap-reached disabled state |
| `anomaly-banner.test.tsx` | 2 | Returns null when empty; renders rows with correct tint per severity |
| `spend-pacing-card.test.tsx` | 3 | Sparkline path points; per-campaign bars sorted by pct_of_cap; cap-projection warning shown >80% |
| `time-tab.test.tsx` | 3 | 7×24 grid renders; mode toggle URL push; empty-state hint when Meta data missing |
| `optimize-tab.test.tsx` | 3 | Both tables render; sort tab URL push; thumbnail src present |
| `reporting.test.ts` (extend) | 2 | `getDashboardKpisWithCompare` returns `{current, prior}` when compare=true; prior=null otherwise |

**Total: +41 new tests** → target **~890 passing / 22 skipped**, zero regressions.

### Manual smoke (documented for ship phase)

1. Apply migration 0140; verify `ads_hourly_metrics` table exists.
2. Manually trigger `beithady-ads-insights` cron with `?force=1` and confirm hourly rows land for last 24h.
3. `/beithady/ads` — `<AiSummaryCard />` renders button. Click → 3-paragraph card appears within ~5s. Cost shown.
4. Click 19 more times in a day → 20th click shows cap-reached state.
5. `/beithady/ads?compare=1` — every KPI card shows a delta badge (CPL with reverseColor).
6. `<AnomalyBanner />` shows real anomalies (manually craft data if none active in production).
7. `<SpendPacingCard />` — sparkline renders; per-campaign bars sorted; one campaign at >80% has the projection hint.
8. `/beithady/ads/audience?tab=time` — heatmap renders. Toggle mode → URL updates + grid switches data source.
9. `/beithady/ads/audience?tab=optimize` — both tables render. Click `CPL` sort tab → URL updates + rows re-sort.
10. Existing `beithady-ads-anomaly-alert` cron still fires WhatsApp correctly after refactor.

## Deployment ordering

```
1. Apply migration 0140_bh_ads_hourly_metrics.sql via Supabase MCP
2. Ship hourly.ts + pacing.ts + top-ads.ts + top-assets.ts + tests
3. Ship anomalies.ts + refactor beithady-ads-anomaly-alert cron to use it
4. Ship ai-summary.ts + server action + tests
5. Extend beithady-ads-insights cron with Meta hourly fetch (wait ~6h for first data)
6. Ship UI primitives: AiSummaryCard + AnomalyBanner + SpendPacingCard
7. Wire those 3 cards + D3 delta into /beithady/ads/page.tsx
8. Ship TimeTab + OptimizeTab + wire into audience/page.tsx tab list
9. reporting.ts: add getDashboardKpisWithCompare
10. Smoke test all 10 manual checks
11. Mark V3 done in handoff
```

Each step pushes to main → Vercel auto-deploys → manual smoke before proceeding.

## Done criteria

- [ ] All ~25 code tasks committed and pushed
- [ ] Migration 0140 applied; `ads_hourly_metrics` table populated within 24h of cron extension
- [ ] All 7 features render correctly on their target surfaces
- [ ] `?compare=1` shows delta badges on every KPI card on main
- [ ] AI summary button works end-to-end; daily cap of 20 enforced via audit log
- [ ] Existing `beithady-ads-anomaly-alert` cron unchanged behavior post-refactor (still fires WhatsApp)
- [ ] Full suite: ~890 passing, zero regressions
- [ ] `tsc --noEmit` clean
- [ ] Deployed to prod; `app.limeinc.cc` alias updated if needed

## Cost summary

| Resource | V3 cost |
|---|---|
| DB storage | New table ~2 MB total + indexes (5 campaigns × 24h × 90d = 10,800 rows) |
| Migrations | 1 (`0140`) |
| Cron API calls | +5 Meta hourly fetches per `beithady-ads-insights` run → +5/day, 99% headroom on Meta user-token quota |
| Anthropic API | `~$0.01/call × 20 daily cap = ~$0.20/day max`. Typical use: ~$0.05/day. |
| Vercel function runtime | All within existing limits (`beithady-ads-insights` `maxDuration` stays 300s) |

## Open questions

None remaining for V3. All product decisions locked.

V3.5 follow-ups if anything surfaces in practice:
- Google + TikTok hourly data (lower fidelity than Meta — was excluded for that reason)
- AI summary scheduled morning brief (auto-runs at Cairo 8 AM, stored persistently)
- Per-ad creative thumbnail in E1 top-ads table (currently text-only; would need join through `ads_ads.creative_url`)
- Persistent `ads_anomaly_events` table for trend analysis (if operators want to track anomaly frequency over time)
- Tunable anomaly thresholds (currently hardcoded constants in `anomalies.ts`)
- AI summary cost dashboard (currently logged only; surface monthly Anthropic spend if it grows)
