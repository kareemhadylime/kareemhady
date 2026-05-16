# BH Ads Insights — V1 (Date Filter + Audience Breakdowns) — Design Spec

**Date:** 2026-05-16
**Author:** kareemhady + Claude
**Status:** Draft, awaiting user review

## Goal

Transform `/beithady/ads/` from a static 30-day overview into an interactive insights surface that answers the two questions kareem asked plus their dependencies:

1. **Where is response coming from?** Audience breakdown per campaign across geo / demographics / device & placement.
2. **How is this campaign performing this week vs last?** Date period filter + period-over-period comparison.

V1 is the first of four phases (V1–V4) in the [BH Ads Insights Roadmap](2026-05-16-bh-ads-insights-roadmap.md).

## Non-goals (V1)

- ❌ Funnel chart impressions → bookings (V2's C1)
- ❌ Per-building (BH-26 vs BH-73 vs …) breakdown of audience (V2's C4)
- ❌ Lead → booking cohort attribution (V2's C5)
- ❌ Hourly time-of-day heatmap (V3's D1)
- ❌ Top-performing ads ranking (V3's E1)
- ❌ AI narrative summary (V3's E4)
- ❌ Anomaly detection (V3's E3)
- ❌ Export PDF / shareable token link (V4)
- ❌ Choropleth map visualization for geo (table-only in V1; V1.5 visual)

## Locked product decisions

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Main dashboard summary + dedicated `/beithady/ads/audience/` page** | Best of glance + drill. Same data, two views. |
| Q2 | **All three platforms (Meta + Google + TikTok)** | Google is biggest spend right now (EGP 14,634); Meta and TikTok must be in V1 for unified rollups. |
| Q3 | **Presets + custom range + period comparison toggle** | Absorbs V3's D3 because date filter and compare share the same UI surface. |
| Q4a | **Campaign + adset-level drill-down** | Meta carries distinct targeting per adset; ad-level audience usually mirrors adset (V3's E1 covers ad-level performance separately). |
| Q4b | **90-day historical backfill on V1 deploy** | Date filter immediately useful day 1. Compare 30d vs prior 30d needs 60d minimum. |

## Architecture chosen — Approach 2 (per-dimension tables)

Three separate tables (`ads_insights_geo`, `ads_insights_demo`, `ads_insights_device`), one per breakdown dimension. Each has a common spine (account/campaign/adset/platform/date) + dimension-specific columns. Server-rendered pages with URL-state filters. New cron `beithady-ads-breakdowns` every 6h. ~25 TDD-sized tasks total.

Alternatives considered (single flexible table; client-rendered with React state) — rejected for type-clarity and SEO-friendliness reasons.

## High-level architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Operator browser                                                      │
│                                                                       │
│ Main dashboard /beithady/ads/                                         │
│   • Date filter (presets + custom + compare)                          │
│   • KPI cards (existing) — all recompute on date change               │
│   • Audience summary widget [Open full report →]                      │
│   • Campaigns table (existing)                                        │
│                                                                       │
│ Dedicated /beithady/ads/audience/                                     │
│   • Date filter (same component, URL-shared state)                    │
│   • Campaign / adset / platform filters                               │
│   • Tabs: [Geo] [Demographics] [Device & Placement]                   │
│   • Period-delta badges in every cell                                 │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │
                                  ▼
                ┌──────────────────────────────────┐
                │ Server (Next.js server components)│
                │                                   │
                │   reporting.ts (extended)         │
                │   insights-geo.ts        (NEW)    │
                │   insights-demo.ts       (NEW)    │
                │   insights-device.ts     (NEW)    │
                │   period-delta.ts        (NEW)    │
                │   date-range.ts          (NEW)    │
                └──────────────┬───────────────────┘
                               │
                               ▼
                  ┌──────────────────────────────────┐
                  │ Supabase Postgres                 │
                  │                                   │
                  │  ads_insights_geo                 │  ← NEW
                  │  ads_insights_demo                │  ← NEW
                  │  ads_insights_device              │  ← NEW
                  └────────────────┬─────────────────┘
                                   │
                                   ▼
                  ┌──────────────────────────────────┐
                  │ Cron: beithady-ads-breakdowns     │
                  │   (NEW, runs every 6h)            │
                  │                                   │
                  │   Per account, per campaign:      │
                  │     • Meta /insights?breakdowns=  │
                  │     • Google GAQL on              │
                  │       geographic/gender/age_range/│
                  │       device_views                │
                  │     • TikTok report/integrated/   │
                  │       get/ with dimensions        │
                  │   Upsert into 3 tables             │
                  └──────────────────────────────────┘
```

### New files (~12)

| File | Purpose |
|---|---|
| `supabase/migrations/0138_bh_ads_insights_breakdowns.sql` | 3 tables + indexes |
| `src/lib/beithady/ads/insights-geo.ts` | Fetch/normalize/upsert geo breakdowns; query helpers |
| `src/lib/beithady/ads/insights-demo.ts` | Same for age + gender |
| `src/lib/beithady/ads/insights-device.ts` | Same for device + placement |
| `src/lib/beithady/ads/period-delta.ts` | Pure function: `(current, previous, opts)` → delta |
| `src/lib/beithady/ads/date-range.ts` | Parse + validate URL params; preset → range helpers |
| `src/lib/beithady/ads/insights-errors.ts` | Typed `InsightsBreakdownFetchError` + `InsightsUpsertError` |
| `src/app/api/cron/beithady-ads-breakdowns/route.ts` | Cron orchestrator |
| `src/app/beithady/ads/audience/page.tsx` | Dedicated audience report page |
| `src/app/beithady/ads/audience/_components/geo-tab.tsx` | Country + city tables |
| `src/app/beithady/ads/audience/_components/demo-tab.tsx` | Age × gender bars |
| `src/app/beithady/ads/audience/_components/device-tab.tsx` | Device + placement |
| `src/app/beithady/ads/audience/_components/audience-filters.tsx` | Campaign/adset/platform pickers |
| `src/app/beithady/ads/_components/date-range-filter.tsx` | Preset chips + custom + compare toggle |
| `src/app/beithady/ads/_components/audience-summary-widget.tsx` | Compact dashboard card |
| `src/app/beithady/ads/_components/period-delta-badge.tsx` | Inline `↑22%` badge |

### Modified files (~7)

| File | Change |
|---|---|
| `src/lib/beithady/ads/reporting.ts` | `getDashboardKpis(days)` → `getDashboardKpis({ from, to })`; same for `listCampaigns`, `listCampaignRoas` |
| `src/lib/beithady/ads/meta-client.ts` | New `fetchMetaInsightsBreakdown` |
| `src/lib/beithady/ads/google-client.ts` | New `fetchGoogleGeoView` / `fetchGoogleDemoView` / `fetchGoogleDeviceView` |
| `src/lib/beithady/ads/tiktok-client.ts` | New `fetchTikTokIntegratedReport` |
| `src/app/beithady/ads/page.tsx` | Read date range from URL; render `<DateRangeFilter />` + `<AudienceSummaryWidget />` |
| `src/app/beithady/ads/campaigns/[id]/page.tsx` | Same date filter; campaign-specific audience summary |
| `src/app/beithady/ads/performance/page.tsx` | Same date filter |
| `src/app/admin/integrations/page.tsx` | "Backfill 90d ads breakdowns" button |
| `vercel.json` | New cron schedule |

## Database schema

Single migration `0138_bh_ads_insights_breakdowns.sql`.

### Common spine (across all 3 tables)

```
id bigserial PRIMARY KEY
account_id bigint NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE
campaign_id bigint NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE
ad_set_id bigint REFERENCES ads_ad_sets(id) ON DELETE CASCADE      -- nullable for campaign-level
platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok'))
metric_date date NOT NULL
-- ... dimension-specific columns ...
impressions bigint NOT NULL DEFAULT 0
clicks bigint NOT NULL DEFAULT 0
spend_micros bigint NOT NULL DEFAULT 0
reach bigint
leads bigint NOT NULL DEFAULT 0
fetched_at timestamptz NOT NULL DEFAULT now()
```

### Table 1: `ads_insights_geo`

```sql
CREATE TABLE ads_insights_geo (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  ad_set_id bigint REFERENCES ads_ad_sets(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  metric_date date NOT NULL,
  country_code text NOT NULL,        -- ISO 3166-1 alpha-2 ('EG', 'AE', 'SA')
  region text,                       -- nullable
  city text,                         -- nullable
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  spend_micros bigint NOT NULL DEFAULT 0,
  reach bigint,
  leads bigint NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ads_insights_geo_unique
  ON ads_insights_geo (campaign_id, ad_set_id, metric_date, platform, country_code, region, city)
  NULLS NOT DISTINCT;

CREATE INDEX ads_insights_geo_campaign_date
  ON ads_insights_geo (campaign_id, metric_date);

CREATE INDEX ads_insights_geo_account_date
  ON ads_insights_geo (account_id, metric_date);
```

### Table 2: `ads_insights_demo`

```sql
CREATE TABLE ads_insights_demo (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  ad_set_id bigint REFERENCES ads_ad_sets(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  metric_date date NOT NULL,
  age_range text NOT NULL CHECK (age_range IN
    ('13-17','18-24','25-34','35-44','45-54','55-64','65+','unknown')),
  gender text NOT NULL CHECK (gender IN ('male','female','unknown')),
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  spend_micros bigint NOT NULL DEFAULT 0,
  reach bigint,
  leads bigint NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ads_insights_demo_unique
  ON ads_insights_demo (campaign_id, ad_set_id, metric_date, platform, age_range, gender)
  NULLS NOT DISTINCT;

CREATE INDEX ads_insights_demo_campaign_date
  ON ads_insights_demo (campaign_id, metric_date);

CREATE INDEX ads_insights_demo_account_date
  ON ads_insights_demo (account_id, metric_date);
```

### Table 3: `ads_insights_device`

```sql
CREATE TABLE ads_insights_device (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  ad_set_id bigint REFERENCES ads_ad_sets(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  metric_date date NOT NULL,
  device_platform text NOT NULL CHECK (device_platform IN
    ('mobile','tablet','desktop','tv','connected_tv','unknown')),
  publisher_platform text,            -- Meta only; null elsewhere
  placement text,                     -- Meta: 'feed','stories','reels',…; Google: ad network; TikTok: 'feed','pangle'
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  spend_micros bigint NOT NULL DEFAULT 0,
  reach bigint,
  leads bigint NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ads_insights_device_unique
  ON ads_insights_device (campaign_id, ad_set_id, metric_date, platform, device_platform, publisher_platform, placement)
  NULLS NOT DISTINCT;

CREATE INDEX ads_insights_device_campaign_date
  ON ads_insights_device (campaign_id, metric_date);

CREATE INDEX ads_insights_device_account_date
  ON ads_insights_device (account_id, metric_date);
```

### Why `NULLS NOT DISTINCT`

Postgres default treats `NULL ≠ NULL`. We need `(campaign_id=5, ad_set_id=NULL, country='EG', region=NULL, city=NULL)` to be unique. Postgres 15+ supports `NULLS NOT DISTINCT` directly; Supabase is on 15+.

### Storage estimate

5–10 active campaigns × 90 days × 3 dimensions = ~2,700 rows per dimension over 90d. Three tables × 2,700 = ~8,100 rows total. ~100 bytes each → <1 MB. Indexes ~3×. Negligible.

## Data fetching

### Meta breakdowns

```ts
fetchMetaInsightsBreakdown({
  entityId,            // campaign or adset external_id
  level: 'campaign' | 'adset',
  breakdowns: 'country' | 'age,gender' | 'device_platform,publisher_platform,publisher_position',
  fromDate, toDate, token,
})
```

Endpoint: `${GRAPH}/${entityId}/insights?fields=impressions,clicks,spend,reach&breakdowns=…&time_range[since]=…&time_range[until]=…&time_increment=1&level=…`. Pagination via `paging.next`. Normalization: Meta returns ISO-2 natively; age buckets pass through; `device_platform` `'mobile_app'+'mobile_web'` → `'mobile'`.

### Google breakdowns

Separate GAQL queries per dimension:

- `geographic_view` — geo with `segments.geo_target_country` + `segments.geo_target_city`
- `gender_view` — gender with `segments.gender`
- `age_range_view` — age with `segments.age_range`
- `device_view` — device with `segments.device`

Date range via `WHERE segments.date BETWEEN '$from' AND '$to'`. Normalization: `geo_target_constant` resource name → ISO-2 via cached lookup (~250 countries); `segments.device` enum (`MOBILE/TABLET/DESKTOP/CONNECTED_TV`) → our enum; `AGE_RANGE_25_34` → `'25-34'`; `GENDER_MALE/FEMALE/UNDETERMINED` → `'male'/'female'/'unknown'`. Google doesn't return `publisher_platform` or placement details for PMax — null.

### TikTok breakdowns

```ts
fetchTikTokIntegratedReport({
  advertiserId, campaignIds,
  dimensions: ['country_code' | 'gender' | 'age' | 'placement'],
  fromDate, toDate, token,
})
```

Endpoint: `POST /open_api/v1.3/report/integrated/get/` with body containing `report_type=AUDIENCE`, `data_level=AUCTION_CAMPAIGN`, `dimensions`, `metrics`. Pagination via `data.page_info.has_more`. Normalization: ISO-3 country (`EGY`) → ISO-2 (`EG`); age buckets pass through; gender pass through. `device_platform` not in TikTok's audience report — left `'unknown'` for V1 (V1.5 can add a separate query to derive it).

### Cron orchestrator

`src/app/api/cron/beithady-ads-breakdowns/route.ts`:

- `maxDuration = 800`
- Rolling 7-day window per run (captures late attribution; upsert dedupes)
- For each `ads_accounts` row × each non-removed campaign:
  - Call platform's 3 breakdown APIs
  - Map to normalized shapes
  - Bulk upsert via `ON CONFLICT (campaign_id, ad_set_id, metric_date, platform, …) DO UPDATE SET …`
- Per-account/per-campaign failure isolated; cron returns JSON summary

Schedule in `vercel.json`:
```jsonc
{ "path": "/api/cron/beithady-ads-breakdowns", "schedule": "0 */6 * * *" }
```

### 90-day backfill

Admin button at `/admin/integrations` → `backfillAdsBreakdownsAction` server action that runs the same cron logic with `fromDate = today - 90 days`. ~135 API calls total for current portfolio; completes in <60s.

### Quota math

| Platform | Per-run | Cron freq | Daily | Limit | Headroom |
|---|---|---|---|---|---|
| Meta | 3 breakdowns × 5 campaigns = 15 | every 6h | 60 | ~600/h user token | 99% |
| Google | 3 GAQL × 5 campaigns = 15 ops | every 6h | 60 | 15k/day | 99% |
| TikTok | 3 × 5 = 15 | every 6h | 60 | ~50 RPS | 99% |
| Backfill (one-shot) | ~135 total | once | 135 | — | fine |

## UI structure

### Date range filter (`src/app/beithady/ads/_components/date-range-filter.tsx`)

Client component. URL-state driven (`?from=YYYY-MM-DD&to=YYYY-MM-DD&compare=1`). Preset chips: 7d / 30d / 90d / Lifetime / Custom. Compare toggle. Reused on `/beithady/ads/`, `/beithady/ads/audience/`, `/beithady/ads/campaigns/[id]/`, `/beithady/ads/performance/`.

### Audience summary widget (`src/app/beithady/ads/_components/audience-summary-widget.tsx`)

Compact card on main dashboard showing top-3 per dimension across all platforms + campaigns. Server component. Click → opens `/beithady/ads/audience/` with same date range threaded.

### Dedicated audience page (`src/app/beithady/ads/audience/page.tsx`)

URL: `/beithady/ads/audience/?tab=geo&from=…&to=…&compare=1&campaign=42&adset=789&platforms=meta,google`

Structure:
- Date filter
- Campaign / adset / platform filters
- 3 tabs: Geo / Demographics / Device & Placement

### Geo tab

Country table (sorted by clicks desc, with period-delta column when compare=1). Below: city table for selected country (or all when no country filter). Top 10 default; expandable.

### Demographics tab

Two horizontal-stacked bar charts: Age × Gender (Imps) on left, Age × Gender (Clicks) on right. Below: detail table with `(age, gender)` × `(imps, clicks, CTR, spend, leads, Δ)` columns. Tooltip on hover. Implementation: server-rendered SVG (no chart library dependency).

### Device tab

Device-platform donut/pie chart. Meta-only placement bar chart (other platforms hidden from placement view since they don't return rich placement). Detail table below with per-platform device breakdown.

### Period-delta badge (`src/app/beithady/ads/_components/period-delta-badge.tsx`)

Inline badge: `↑22%` green / `↓ 8%` red / `→` gray / `new` (when prior=0, current>0).

`reverseColor: true` prop for "lower is better" metrics (CPL, CPA, CPC). Reused everywhere when `?compare=1`.

### Permissions

`requireBeithadyPermission('ads', 'read')` on all audience pages. Matches existing.

## Error handling

### Cron-side errors

| Error | Handling | Operator action |
|---|---|---|
| Meta `(#17) User request limit reached` | Skip account; retry next cron | Wait |
| Meta `invalid_token` / `OAuthException` | Mark needs Reconnect, audit log | Click Reconnect on accounts page |
| Google `RESOURCE_EXHAUSTED` | Skip + retry; quota resets midnight PT | Wait |
| TikTok `40103 access_token expired` | Refresh + retry next cron | Reconnect |
| Network timeout | Catch + return `{ ok: false }`; continue | Auto-recovered |
| Single campaign fails | Partial success in cron JSON response | None — wait |

### Page-load errors

| Error | Surface | Action |
|---|---|---|
| Empty data for date range | Empty state: "No audience data yet — run [Backfill 90d]" | Click backfill or wait for cron |
| Date range invalid | Inline error: "Invalid date range — using last 30d" | Pick valid dates |
| Campaign filter selects deleted campaign | Empty state + `(deleted)` label | Choose different |
| TikTok ISO-3 → ISO-2 lookup missing | Country shown as raw 3-letter + ❓ | Cosmetic; add to table |

### Period-delta edge cases

- Prior=0, current>0 → `new` badge in green
- Both=0 → badge hidden
- Current=0, prior>0 → `↓ -100%` red
- Within 0.5% rounding → `→` gray

### Typed error classes

```ts
export class InsightsBreakdownFetchError extends Error {
  constructor(
    public platform: 'meta' | 'google' | 'tiktok',
    public step: 'auth' | 'quota' | 'http' | 'parse' | 'normalize',
    message: string,
  ) {
    super(`${platform}_breakdown_${step}: ${message}`);
    this.name = 'InsightsBreakdownFetchError';
  }
}

export class InsightsUpsertError extends Error {
  constructor(public table: 'geo' | 'demo' | 'device', message: string) {
    super(`insights_upsert[${table}]: ${message}`);
    this.name = 'InsightsUpsertError';
  }
}
```

### Graceful degradation philosophy

Silent-on-success: data the user CAN see still renders correctly. Better to show "Meta data unavailable for last 7d, showing Google + TikTok only" than to break the whole page.

## Testing strategy

### Unit tests (colocated `*.test.ts`)

| File | Coverage |
|---|---|
| `date-range.test.ts` | Preset → range computation, URL parsing, compare-period derivation |
| `period-delta.test.ts` | Pure function: zero-prior, zero-current, both-zero, reverseColor for CPL |
| `insights-geo.test.ts` | Meta country normalizer, Google geo_target_constant → ISO-2 lookup, TikTok ISO-3 → ISO-2 mapping; upsert row shape |
| `insights-demo.test.ts` | Age bucket normalization (Google `AGE_RANGE_25_34` → `'25-34'`), gender enum mapping |
| `insights-device.test.ts` | Device platform normalization (`'mobile_app'+'mobile_web' → 'mobile'`), publisher_platform Meta-only |
| `meta-client.test.ts` (extend) | `fetchMetaInsightsBreakdown` mocks: response parsing, pagination, errors |
| `google-client.test.ts` (extend) | `fetchGoogleGeoView` / `fetchGoogleDemoView` / `fetchGoogleDeviceView` mocks |
| `tiktok-client.test.ts` (extend) | `fetchTikTokIntegratedReport` mocks: pagination + ISO-3 mapping |
| `beithady-ads-breakdowns/route.test.ts` | Cron auth gate, per-account loop with partial failure, JSON response |
| `period-delta-badge.test.ts` (jsdom) | Badge for up/down/flat/new states, reverseColor inversion |
| `date-range-filter.test.ts` (jsdom) | Preset chip → URL push, custom date input, compare toggle |

All use mocked `fetch` against canned platform responses.

### Manual smoke (documented for ship phase)

1. Backfill 90d → SQL shows >50 rows per breakdown table
2. Main dashboard widget renders top-3 per dimension; click → audience page with date preserved
3. Date filter: switch presets → KPI numbers update + URL has `?from=&to=`; toggle compare → delta badges appear
4. Geo tab: country table + city drill; period delta column when compare=1
5. Demo tab: age × gender bars + detail table; tooltip on hover
6. Device tab: device pie + Meta-only placement bar + per-platform table
7. Campaign drill: filter to single campaign; switch to adset view (Meta only)

### Test target

V1.2 final: ~704 passing / 22 skipped.
V1 (this) estimate: **+60 new tests** → target **~765 passing**, zero regressions.

## Deployment ordering

```
1. Apply migration 0138_bh_ads_insights_breakdowns.sql via Supabase MCP
2. Ship backend libs (insights-{geo,demo,device}.ts + period-delta.ts + date-range.ts + insights-errors.ts)
3. Ship platform client extensions (meta-client.ts + google-client.ts + tiktok-client.ts with unit tests)
4. Ship cron handler beithady-ads-breakdowns + register in vercel.json
5. Ship admin backfill button + server action
6. RUN BACKFILL — operator clicks the button — populates 90d historical
7. Ship UI: date-range-filter component + period-delta-badge
8. Ship audience summary widget on main dashboard
9. Ship dedicated audience page + 3 tab components
10. Smoke test all 7 manual checks
11. Mark V1 done in handoff
```

Each step pushes to main → Vercel auto-deploys → manual smoke before proceeding.

## Done criteria

- [ ] All ~25 code tasks committed and pushed
- [ ] Migration `0138` applied; 3 tables with proper indexes
- [ ] Cron registered in vercel.json + runs every 6h
- [ ] Backfill button works; 90d of data populated across all 3 platforms
- [ ] Date filter works on `/beithady/ads/` and `/beithady/ads/audience/` and `/beithady/ads/campaigns/[id]/`
- [ ] KPI cards on main dashboard recompute when date range changes
- [ ] Audience summary widget shows top-3 per dimension
- [ ] Dedicated audience page renders all 3 tabs correctly
- [ ] Period-delta badges appear when `?compare=1`
- [ ] Full test suite green: target ~765 passing, zero regressions
- [ ] `tsc --noEmit` clean
- [ ] Vercel deploy + alias updated

## Cost summary

| Resource | V1 cost |
|---|---|
| DB storage | ~1 MB total + ~3 MB indexes |
| Cron API calls | ~60/day per platform, 99% headroom on all quotas |
| One-time backfill | ~135 API calls total, <60s wall-clock |
| Vercel function runtime | `maxDuration: 800` but typical <30s |
| Claude API | $0 (deferred to V3's E4) |

## Open questions

None remaining for V1. All product decisions locked in brainstorming.

V1.5 follow-ups if anything surfaces in practice:
- Choropleth map for geo (table-only ships in V1)
- TikTok `device_platform` enrichment via separate query
- Per-row sparkline showing daily trend within selected period
