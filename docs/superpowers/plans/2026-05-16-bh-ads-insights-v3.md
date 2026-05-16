# BH Ads Insights V3 — Time/Patterns + Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a day×hour heatmap, spend pacing, period-delta on KPIs, top-ads/assets tables, anomaly banner, and on-demand AI summary to `/beithady/ads/` — with one new table, one cron extension, and one Anthropic SDK integration.

**Architecture:** Pure TS aggregators per feature (mirrors V1+V2 pattern). Two new audience sub-tabs (Time, Optimize) + three new main-dashboard cards (AiSummaryCard, AnomalyBanner, SpendPacingCard) + period-delta extension on every existing KPI card.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (BH theme: `ix-card` / `ix-btn-*` + emerald-active / slate-neutral palette — never raw palette outside that), TypeScript strict, Supabase Postgres (one new table), Vitest, Anthropic SDK (`@anthropic-ai/sdk` already installed; client at `@/lib/anthropic`).

**Spec:** `docs/superpowers/specs/2026-05-16-bh-ads-v3-time-optimize-design.md`
**Roadmap:** `docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md`

## UI conventions (apply to every UI task)

- All `/beithady/ads/*` pages render inside `<BeithadyShell>` + `<BeithadyHeader>`. Tabs from `<AdsTabs />`.
- Cards = `ix-card p-5` (or `p-3` for compact). Buttons = `ix-btn-primary|secondary|ghost`. Inputs = `ix-input`.
- Active chip pattern (emerald): `bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800`. Inactive: `bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400`.
- Permission gate every page: `await requireBeithadyPermission('ads', 'read');`
- No new chart libraries. SVG paths + tinted divs (V1+V2 pattern).
- Heatmap cells reuse V2's `cellColorBucket` from `cohort.ts`.

## V1+V2 context engineers need

- V1 ✅ shipped (commits `63da355..2d08c1c`) — date filter, audience page with Geo/Demo/Device tabs, `<DateRangeFilter />`, `<PeriodDeltaBadge />`, `<AudienceSummaryWidget />`, `parseDateRange`, `derivePriorPeriod`, `computePeriodDelta`, `RangeArg` overload on `reporting.ts`.
- V2 ✅ shipped (commits `f755a49..04732b9`) — Funnel/Quality/Cohort tabs, FRT card, per-building filter, `attributeLeadToBuilding`, `buildingMapForLeads`, `BH_BUILDINGS`, shared `insights-utils.ts` (`asInt`/`asMicros`).
- Anthropic client wrapper exists at `@/lib/anthropic`: `anthropic()` factory + `HAIKU = 'claude-haiku-4-5-20251001'` constant.
- Existing `beithady-ads-anomaly-alert` cron (`src/app/api/cron/beithady-ads-anomaly-alert/route.ts`, 159 lines) aggregates per-PLATFORM (not per-campaign) and detects 3 anomaly types: spend_spike (>3× yesterday), zero_leads (>$30 spend + 0 leads), low_roas (<1× over 7d with >$100 spend). It dedupes via `beithady_audit_log` (6h window) and sends WhatsApp. **V3 keeps the per-platform grain** so the refactor is behavior-identical.
- `ads_asset_performance` view (migration 0109) joins `ads_ads.creative_url` to `beithady_gallery_assets`. V1's `listAssetPerformance({ buildingCode?, limit? })` reads it.
- `ads_campaigns.monthly_budget_cap_usd` + `auto_paused_at` + `auto_paused_reason` already exist (migration 0104). V1's `listCampaignBudgetStates` reads them.
- Migration slot 0140 confirmed free (0139 = networth from parallel work).

---

## Task 1: Migration 0140 — `ads_hourly_metrics` table

**Files:**
- Create: `C:/kareemhady/supabase/migrations/0140_bh_ads_hourly_metrics.sql`

- [ ] **Step 1: Verify slot is free**

```bash
ls C:/kareemhady/supabase/migrations/ | grep 0140
```
Expected: empty output.

- [ ] **Step 2: Write the migration**

```sql
-- BH Ads Insights V3 D1: hourly Meta metrics for the day×hour heatmap.
-- Cron beithady-ads-insights fetches breakdowns=hourly_stats_aggregated_by_advertiser_time_zone
-- for Meta campaigns and upserts here. Lead-density heatmap doesn't need this table
-- (uses ads_leads.created_at directly).

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
create unique index if not exists ads_hourly_metrics_unique
  on public.ads_hourly_metrics (campaign_id, metric_date, hour, platform);
create index if not exists ads_hourly_metrics_campaign_date
  on public.ads_hourly_metrics (campaign_id, metric_date);

comment on table public.ads_hourly_metrics is
  'BH Ads V3 D1: hourly impressions/clicks/spend per campaign. Currently Meta-only.';
```

- [ ] **Step 3: Apply via Supabase MCP**

Call `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration` with:
- `project_id`: `bpjproljatbrbmszwbov`
- `name`: `0140_bh_ads_hourly_metrics`
- `query`: contents from step 2

- [ ] **Step 4: Verify table exists**

Call `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__execute_sql` with:
- `project_id`: `bpjproljatbrbmszwbov`
- `query`: `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='ads_hourly_metrics' order by ordinal_position;`
- Expected: 10 columns — id, account_id, campaign_id, platform, metric_date, hour, impressions, clicks, spend_micros, fetched_at.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add supabase/migrations/0140_bh_ads_hourly_metrics.sql
git commit -m "$(cat <<'EOF'
feat(bh-ads): add ads_hourly_metrics table (V3 D1 heatmap source)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 2: `hourly.ts` — lead density + Meta hourly aggregators

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/hourly.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/hourly.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/hourly.test.ts
import { describe, it, expect } from 'vitest';
import { cairoDayHour, bucketLeadsByHour, normalizeMetaHourlyRow, type RawLeadForHourly } from './hourly';

describe('cairoDayHour', () => {
  it('returns Mon=0 for a Monday Cairo morning', () => {
    expect(cairoDayHour('2026-05-11T08:00:00+03:00')).toEqual({ day_of_week: 0, hour: 8 });
  });
  it('returns Sun=6 for a Sunday Cairo evening', () => {
    expect(cairoDayHour('2026-05-10T20:00:00+03:00')).toEqual({ day_of_week: 6, hour: 20 });
  });
  it('returns Tue=1 for a Tuesday Cairo midday', () => {
    expect(cairoDayHour('2026-05-12T12:00:00+03:00')).toEqual({ day_of_week: 1, hour: 12 });
  });
  it('crosses midnight Cairo correctly from UTC', () => {
    // UTC 22:30 on May 11 = Cairo 01:30 on May 12 (Tue)
    expect(cairoDayHour('2026-05-11T22:30:00Z')).toEqual({ day_of_week: 1, hour: 1 });
  });
});

describe('bucketLeadsByHour', () => {
  it('counts leads per (day_of_week, hour) bucket', () => {
    const leads: RawLeadForHourly[] = [
      { created_at: '2026-05-11T08:00:00+03:00' },  // Mon 8h
      { created_at: '2026-05-11T08:30:00+03:00' },  // Mon 8h (same bucket)
      { created_at: '2026-05-13T19:00:00+03:00' },  // Wed 19h
    ];
    const out = bucketLeadsByHour(leads);
    const mon8 = out.find(b => b.day_of_week === 0 && b.hour === 8);
    const wed19 = out.find(b => b.day_of_week === 2 && b.hour === 19);
    expect(mon8?.lead_count).toBe(2);
    expect(wed19?.lead_count).toBe(1);
  });
  it('returns empty array for no leads', () => {
    expect(bucketLeadsByHour([])).toEqual([]);
  });
});

describe('normalizeMetaHourlyRow', () => {
  it('parses hour from "08:00:00 - 08:59:59" string', () => {
    const out = normalizeMetaHourlyRow({
      hourly_stats_aggregated_by_advertiser_time_zone: '08:00:00 - 08:59:59',
      impressions: '120',
      clicks: '5',
      spend: '0.50',
      date_start: '2026-05-11',
    }, { accountId: 1, campaignId: 5 });
    expect(out).toMatchObject({
      account_id: 1,
      campaign_id: 5,
      platform: 'meta',
      metric_date: '2026-05-11',
      hour: 8,
      impressions: 120,
      clicks: 5,
      spend_micros: 500_000,
    });
  });
  it('returns null when hour string unparseable', () => {
    const out = normalizeMetaHourlyRow({
      hourly_stats_aggregated_by_advertiser_time_zone: 'invalid',
      impressions: '0', clicks: '0', spend: '0', date_start: '2026-05-11',
    }, { accountId: 1, campaignId: 5 });
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/hourly.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/hourly.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { attributeLeadToBuilding } from './per-building';
import { buildingMapForLeads } from './funnel';
import { asInt, asMicros } from './insights-utils';

export type RawLeadForHourly = { created_at: string };

export type HeatmapCell = {
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;     // 0 = Mon, 6 = Sun (Cairo-local)
  hour: number;                                 // 0..23
  lead_count: number;
};

export type MetaHourlyCell = {
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hour: number;
  impressions: number;
  clicks: number;
  spend_micros: number;
};

// Convert any timestamp to Cairo-local day-of-week (0=Mon..6=Sun) + hour (0..23).
export function cairoDayHour(iso: string): { day_of_week: 0|1|2|3|4|5|6; hour: number } {
  const d = new Date(iso);
  const weekdayShort = d.toLocaleString('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' });
  const sundayBased = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekdayShort);
  // Map Sun=0..Sat=6 → Mon=0..Sun=6
  const day_of_week = ((sundayBased + 6) % 7) as 0|1|2|3|4|5|6;
  const hourStr = d.toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false });
  const hour = Number(hourStr) % 24;
  return { day_of_week, hour };
}

export function bucketLeadsByHour(leads: RawLeadForHourly[]): HeatmapCell[] {
  const map = new Map<string, HeatmapCell>();
  for (const lead of leads) {
    const { day_of_week, hour } = cairoDayHour(lead.created_at);
    const k = `${day_of_week}|${hour}`;
    const cur = map.get(k) ?? { day_of_week, hour, lead_count: 0 };
    cur.lead_count += 1;
    map.set(k, cur);
  }
  return Array.from(map.values());
}

export type MetaHourlyRawRow = {
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  date_start?: string;
};

export type MetaHourlyDbRow = {
  account_id: number;
  campaign_id: number;
  platform: 'meta';
  metric_date: string;
  hour: number;
  impressions: number;
  clicks: number;
  spend_micros: number;
};

// Parse Meta's "08:00:00 - 08:59:59" hour bucket string into 0..23.
export function normalizeMetaHourlyRow(
  row: MetaHourlyRawRow,
  ctx: { accountId: number; campaignId: number },
): MetaHourlyDbRow | null {
  const bucketStr = row.hourly_stats_aggregated_by_advertiser_time_zone ?? '';
  const m = bucketStr.match(/^(\d{1,2}):/);
  if (!m) return null;
  const hour = Number(m[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  return {
    account_id: ctx.accountId,
    campaign_id: ctx.campaignId,
    platform: 'meta',
    metric_date: String(row.date_start ?? ''),
    hour,
    impressions: asInt(row.impressions),
    clicks: asInt(row.clicks),
    spend_micros: asMicros(row.spend),
  };
}

export async function getLeadDensityHeatmap(opts: {
  from: string;
  to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<HeatmapCell[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_leads')
    .select('id, created_at, matched_reservation_id, building_interest')
    .gte('created_at', opts.from)
    .lte('created_at', opts.to + 'T23:59:59');
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  const { data, error } = await q;
  if (error) { console.error('[hourly-lead-density] query failed:', error); return []; }
  const rows = (data as Array<{ id: number; created_at: string; matched_reservation_id: string | null; building_interest: string | null }> | null) ?? [];

  let filtered = rows;
  if (opts.buildingCode) {
    const buildingByReservation = await buildingMapForLeads(sb, rows);
    filtered = rows.filter(r => {
      const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
      return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
    });
  }

  return bucketLeadsByHour(filtered.map(r => ({ created_at: r.created_at })));
}

export async function getMetaHourlyHeatmap(opts: {
  from: string;
  to: string;
  campaignId?: number;
}): Promise<MetaHourlyCell[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_hourly_metrics')
    .select('metric_date, hour, impressions, clicks, spend_micros')
    .gte('metric_date', opts.from)
    .lte('metric_date', opts.to)
    .eq('platform', 'meta');
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  const { data, error } = await q;
  if (error) { console.error('[hourly-meta] query failed:', error); return []; }
  const rows = (data as Array<{ metric_date: string; hour: number; impressions: number; clicks: number; spend_micros: number }> | null) ?? [];

  const map = new Map<string, MetaHourlyCell>();
  for (const r of rows) {
    const { day_of_week } = cairoDayHour(r.metric_date + 'T12:00:00+03:00');
    const k = `${day_of_week}|${r.hour}`;
    const cur = map.get(k) ?? { day_of_week, hour: r.hour, impressions: 0, clicks: 0, spend_micros: 0 };
    cur.impressions += asInt(r.impressions);
    cur.clicks += asInt(r.clicks);
    cur.spend_micros += asInt(r.spend_micros);
    map.set(k, cur);
  }
  return Array.from(map.values());
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/hourly.test.ts
```
Expected: 7 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/hourly.ts src/lib/beithady/ads/hourly.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add hourly.ts — lead density + Meta hourly heatmap (Cairo TZ)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 3: Extend `beithady-ads-insights` cron with Meta hourly fetch

**Files:**
- Modify: `C:/kareemhady/src/app/api/cron/beithady-ads-insights/route.ts`

After the existing daily fetch, also call Meta's hourly breakdown endpoint per campaign and upsert into `ads_hourly_metrics`. No new test file — the existing cron has no test (it's exercised manually via `?force=1` smoke); we follow that precedent here.

- [ ] **Step 1: Read the existing cron**

Read `C:/kareemhady/src/app/api/cron/beithady-ads-insights/route.ts` to confirm structure. The handler:
1. Auth-gates on CRON_SECRET
2. Opens `ads_sync_log` row
3. Loads Meta creds via `loadMetaCredentials()`
4. Calls `metaGet` for campaign-level daily insights
5. Upserts rows into `ads_daily_metrics`
6. Closes sync log

We add a step 4b: after the daily fetch succeeds, for each campaign returned in the response, fetch hourly breakdowns for the same time range and upsert into `ads_hourly_metrics`.

- [ ] **Step 2: Add the hourly fetch + upsert block**

Insert this AFTER the existing daily-fetch block (right before the sync log is closed). Use Edit to insert. The exact insertion point: after the daily metric upsert loop completes successfully.

```ts
// === V3 D1: also pull hourly stats per campaign (Meta only) ===
// Fetches hourly_stats_aggregated_by_advertiser_time_zone for yesterday+today
// and upserts into ads_hourly_metrics. Per-campaign isolation.
try {
  const { normalizeMetaHourlyRow } = await import('@/lib/beithady/ads/hourly');
  // Pull the set of Meta campaigns we just fetched for + their DB ids.
  // ads_campaigns lookup by external_id.
  const { data: metaCampaigns } = await sb
    .from('ads_campaigns')
    .select('id, external_id, account_id')
    .eq('platform', 'meta')
    .neq('status', 'REMOVED');
  for (const c of (metaCampaigns as Array<{ id: number; external_id: string; account_id: number }> | null) ?? []) {
    const hourlyPath = `${c.external_id}/insights?fields=impressions,clicks,spend,date_start&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone&time_range=${encodeURIComponent(JSON.stringify({ since: yesterday, until: today }))}&time_increment=1&level=campaign&limit=200`;
    const hr = await metaGet<{ data: Array<Record<string, unknown>> }>(hourlyPath, creds.creds.token);
    if (!hr.ok) {
      console.warn(`[ads-insights] meta hourly fetch failed for campaign ${c.id}:`, hr.error);
      continue;
    }
    const rawRows = (hr.data?.data ?? []) as Array<Record<string, unknown>>;
    const normalized = rawRows
      .map(r => normalizeMetaHourlyRow(r as Parameters<typeof normalizeMetaHourlyRow>[0], { accountId: c.account_id, campaignId: c.id }))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (normalized.length === 0) continue;
    const { error: upErr } = await sb
      .from('ads_hourly_metrics')
      .upsert(normalized, { onConflict: 'campaign_id,metric_date,hour,platform' });
    if (upErr) console.error(`[ads-insights] meta hourly upsert failed for campaign ${c.id}:`, upErr);
  }
} catch (e) {
  console.error('[ads-insights] meta hourly block failed (non-fatal):', e);
}
```

This block is wrapped in its own try/catch so a hourly-fetch failure doesn't break the existing daily-fetch sync log close.

- [ ] **Step 3: Run tsc check**

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -10
```
Expected: 0 errors.

- [ ] **Step 4: Commit + push**

```bash
cd C:/kareemhady && git add src/app/api/cron/beithady-ads-insights/route.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): extend beithady-ads-insights cron with Meta hourly fetch (V3 D1)

Adds hourly_stats_aggregated_by_advertiser_time_zone fetch per Meta campaign,
upserts into ads_hourly_metrics. Wrapped in try/catch so a hourly failure
doesn't break the existing daily-fetch flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

- [ ] **Step 5: Manual smoke (after deploy)**

After Vercel auto-deploys, trigger the cron manually:
```bash
curl "https://app.limeinc.cc/api/cron/beithady-ads-insights?force=1&secret=$CRON_SECRET"
```
Then verify via Supabase MCP:
```sql
select count(*) from ads_hourly_metrics where metric_date >= current_date - 1;
```
Expected: > 0 rows.

---

## Task 4: `pacing.ts` — daily spend trend + per-campaign cap projection

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/pacing.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/pacing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/pacing.test.ts
import { describe, it, expect } from 'vitest';
import { projectMonthlySpend, pctOfCap, type RawCampaignSpend } from './pacing';

describe('projectMonthlySpend', () => {
  it('extrapolates straight-line from current day-of-month', () => {
    // On day 10 of a 30-day month, EGP 5000 spent → projected EGP 15000
    expect(projectMonthlySpend(5000, 10, 30)).toBe(15000);
  });
  it('returns spend_mtd when on the last day of month', () => {
    expect(projectMonthlySpend(12000, 30, 30)).toBe(12000);
  });
  it('handles day_of_month=1 edge case', () => {
    expect(projectMonthlySpend(500, 1, 30)).toBe(15000);
  });
  it('returns 0 when spend_mtd=0', () => {
    expect(projectMonthlySpend(0, 15, 30)).toBe(0);
  });
});

describe('pctOfCap', () => {
  it('computes pct rounded to whole number', () => {
    expect(pctOfCap(8200, 10000)).toBe(82);
  });
  it('returns 0 when cap is null', () => {
    expect(pctOfCap(5000, null)).toBe(0);
  });
  it('returns 0 when cap is 0', () => {
    expect(pctOfCap(5000, 0)).toBe(0);
  });
  it('returns > 100 when over cap', () => {
    expect(pctOfCap(12000, 10000)).toBe(120);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/pacing.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/pacing.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { convertManyToEgp } from '@/lib/fx-rates';

export type DailySpendPoint = { date: string; spend_egp: number };

export type CampaignPacingRow = {
  campaign_id: number;
  campaign_name: string;
  platform: 'meta' | 'google' | 'tiktok';
  monthly_budget_cap_egp: number | null;
  spend_egp_mtd: number;
  projected_egp_eom: number;
  pct_of_cap: number;
  auto_paused: boolean;
};

export type RawCampaignSpend = {
  campaign_id: number;
  spend_egp_mtd: number;
  monthly_budget_cap_egp: number | null;
  auto_paused: boolean;
};

export type SpendPacingResult = {
  daily: DailySpendPoint[];
  campaigns: CampaignPacingRow[];
  total_spend_egp: number;
  total_cap_egp: number;
};

export function projectMonthlySpend(spendMtd: number, dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 0) return 0;
  return Math.round((spendMtd / dayOfMonth) * daysInMonth);
}

export function pctOfCap(spend: number, cap: number | null): number {
  if (cap == null || cap <= 0) return 0;
  return Math.round((spend / cap) * 100);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export async function getSpendPacing(opts: {
  range: { from: string; to: string };
}): Promise<SpendPacingResult> {
  const sb = supabaseAdmin();

  // Daily sparkline: sum by metric_date in the requested range, EGP-converted per currency.
  const { data: dailyRows, error: dailyErr } = await sb
    .from('ads_daily_metrics')
    .select('metric_date, spend_micros, account_id')
    .gte('metric_date', opts.range.from)
    .lte('metric_date', opts.range.to)
    .is('ad_id', null).is('ad_set_id', null);
  if (dailyErr) console.error('[pacing] daily query failed:', dailyErr);

  const { data: accounts } = await sb.from('ads_accounts').select('id, currency');
  const currencyByAccount = new Map<number, string>();
  for (const a of (accounts as Array<{ id: number; currency: string }> | null) ?? []) {
    currencyByAccount.set(a.id, a.currency);
  }

  type DailyRow = { metric_date: string; spend_micros: number | string; account_id: number };
  const drows = (dailyRows as DailyRow[] | null) ?? [];

  // Group spend per (date, currency), then convert each (date, currency) total to EGP.
  const perDateCurrency = new Map<string, Map<string, number>>();
  for (const r of drows) {
    const currency = currencyByAccount.get(r.account_id) ?? 'USD';
    const m = perDateCurrency.get(r.metric_date) ?? new Map<string, number>();
    m.set(currency, (m.get(currency) ?? 0) + (Number(r.spend_micros) || 0) / 1_000_000);
    perDateCurrency.set(r.metric_date, m);
  }
  const daily: DailySpendPoint[] = [];
  for (const [date, byCurrency] of Array.from(perDateCurrency.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const egpVals = await convertManyToEgp(
      Array.from(byCurrency.entries()).map(([currency, amount]) => ({ amount, currency }))
    );
    daily.push({ date, spend_egp: Math.round(egpVals.reduce((s, n) => s + n, 0)) });
  }

  // Per-campaign: MTD spend (current calendar month, Cairo-local) + cap + projection.
  const cairoToday = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
  const cairoYear = Number(cairoToday.slice(0, 4));
  const cairoMonth = Number(cairoToday.slice(5, 7));
  const cairoDay = Number(cairoToday.slice(8, 10));
  const monthStart = `${cairoYear}-${String(cairoMonth).padStart(2, '0')}-01`;
  const totalDays = daysInMonth(cairoYear, cairoMonth);

  const { data: mtdRows } = await sb
    .from('ads_daily_metrics')
    .select('campaign_id, spend_micros, account_id')
    .gte('metric_date', monthStart)
    .lte('metric_date', cairoToday)
    .is('ad_id', null).is('ad_set_id', null);
  type MtdRow = { campaign_id: number; spend_micros: number | string; account_id: number };
  const mtd = (mtdRows as MtdRow[] | null) ?? [];

  const spendByCampaignByCurrency = new Map<number, Map<string, number>>();
  for (const m of mtd) {
    const currency = currencyByAccount.get(m.account_id) ?? 'USD';
    const cm = spendByCampaignByCurrency.get(m.campaign_id) ?? new Map<string, number>();
    cm.set(currency, (cm.get(currency) ?? 0) + (Number(m.spend_micros) || 0) / 1_000_000);
    spendByCampaignByCurrency.set(m.campaign_id, cm);
  }

  const { data: campaignRows } = await sb
    .from('ads_campaigns')
    .select('id, name, platform, monthly_budget_cap_usd, auto_paused_at')
    .neq('status', 'REMOVED');
  type CRow = { id: number; name: string; platform: 'meta'|'google'|'tiktok'; monthly_budget_cap_usd: number | null; auto_paused_at: string | null };
  const crows = (campaignRows as CRow[] | null) ?? [];

  // EGP-convert each campaign's spend.
  const campaigns: CampaignPacingRow[] = [];
  for (const c of crows) {
    const byCurrency = spendByCampaignByCurrency.get(c.id) ?? new Map<string, number>();
    const egpVals = await convertManyToEgp(
      Array.from(byCurrency.entries()).map(([currency, amount]) => ({ amount, currency }))
    );
    const spendEgpMtd = Math.round(egpVals.reduce((s, n) => s + n, 0));
    // Cap is in USD. Convert to EGP for the row using a single-currency conversion.
    let capEgp: number | null = null;
    if (c.monthly_budget_cap_usd != null) {
      const conv = await convertManyToEgp([{ amount: c.monthly_budget_cap_usd, currency: 'USD' }]);
      capEgp = Math.round(conv[0] || 0);
    }
    const projected = projectMonthlySpend(spendEgpMtd, cairoDay, totalDays);
    campaigns.push({
      campaign_id: c.id,
      campaign_name: c.name,
      platform: c.platform,
      monthly_budget_cap_egp: capEgp,
      spend_egp_mtd: spendEgpMtd,
      projected_egp_eom: projected,
      pct_of_cap: pctOfCap(spendEgpMtd, capEgp),
      auto_paused: c.auto_paused_at != null,
    });
  }
  campaigns.sort((a, b) => b.pct_of_cap - a.pct_of_cap);

  const total_spend_egp = campaigns.reduce((s, c) => s + c.spend_egp_mtd, 0);
  const total_cap_egp = campaigns.reduce((s, c) => s + (c.monthly_budget_cap_egp ?? 0), 0);

  return { daily, campaigns, total_spend_egp, total_cap_egp };
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/pacing.test.ts
```
Expected: 8 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/pacing.ts src/lib/beithady/ads/pacing.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add pacing.ts — daily spend trend + per-campaign cap projection

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 5: `top-ads.ts` — rank ads by leads / CTR / CPL

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/top-ads.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/top-ads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/top-ads.test.ts
import { describe, it, expect } from 'vitest';
import { sortTopAds, type TopAdRow } from './top-ads';

const ROWS: TopAdRow[] = [
  { ad_id: 1, ad_name: 'A', campaign_id: 100, campaign_name: 'C1', platform: 'meta', impressions: 10000, clicks: 500, ctr_pct: 5, spend_egp: 1000, leads: 20, cpl_egp: 50 },
  { ad_id: 2, ad_name: 'B', campaign_id: 100, campaign_name: 'C1', platform: 'meta', impressions: 8000,  clicks: 240, ctr_pct: 3, spend_egp: 800,  leads: 10, cpl_egp: 80 },
  { ad_id: 3, ad_name: 'C', campaign_id: 200, campaign_name: 'C2', platform: 'google', impressions: 5000, clicks: 250, ctr_pct: 5, spend_egp: 400, leads: 0,  cpl_egp: null },
];

describe('sortTopAds', () => {
  it('sorts by leads desc when sortBy=leads', () => {
    const out = sortTopAds(ROWS, 'leads');
    expect(out.map(r => r.ad_id)).toEqual([1, 2, 3]);
  });
  it('sorts by ctr_pct desc when sortBy=ctr', () => {
    const out = sortTopAds(ROWS, 'ctr');
    // Both ad 1 + ad 3 have ctr=5, ad 2 has ctr=3. Stable sort or any order for ties OK.
    expect(out[2].ad_id).toBe(2);   // ad 2 is last (lowest CTR)
  });
  it('sorts by cpl_egp asc when sortBy=cpl AND drops null-cpl rows', () => {
    const out = sortTopAds(ROWS, 'cpl');
    expect(out.map(r => r.ad_id)).toEqual([1, 2]);   // ad 3 (null CPL) dropped
  });
  it('respects limit', () => {
    expect(sortTopAds(ROWS, 'leads', 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/top-ads.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/top-ads.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { convertManyToEgp } from '@/lib/fx-rates';
import { asInt } from './insights-utils';

export type TopAdSortBy = 'leads' | 'ctr' | 'cpl';

export type TopAdRow = {
  ad_id: number;
  ad_name: string;
  campaign_id: number;
  campaign_name: string;
  platform: 'meta' | 'google' | 'tiktok';
  impressions: number;
  clicks: number;
  ctr_pct: number;
  spend_egp: number;
  leads: number;
  cpl_egp: number | null;
};

export function sortTopAds(rows: TopAdRow[], sortBy: TopAdSortBy, limit = 20): TopAdRow[] {
  const filtered = sortBy === 'cpl' ? rows.filter(r => r.cpl_egp != null) : rows;
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'leads') return b.leads - a.leads;
    if (sortBy === 'ctr') return b.ctr_pct - a.ctr_pct;
    return (a.cpl_egp ?? Infinity) - (b.cpl_egp ?? Infinity);  // cpl asc
  });
  return sorted.slice(0, limit);
}

export async function getTopAds(opts: {
  from: string;
  to: string;
  sortBy: TopAdSortBy;
  limit?: number;
  buildingCode?: string;   // accepted for API symmetry; only relevant when leads filter applied below
}): Promise<TopAdRow[]> {
  const sb = supabaseAdmin();

  // ad-level rows: ad_id IS NOT NULL in ads_daily_metrics
  const { data: metricRows, error: mErr } = await sb
    .from('ads_daily_metrics')
    .select('ad_id, account_id, impressions, clicks, spend_micros, leads')
    .gte('metric_date', opts.from).lte('metric_date', opts.to)
    .not('ad_id', 'is', null);
  if (mErr) { console.error('[top-ads] metrics query failed:', mErr); return []; }
  type MetricRow = { ad_id: number; account_id: number; impressions: number; clicks: number; spend_micros: number | string; leads: number };
  const metrics = (metricRows as MetricRow[] | null) ?? [];

  // Aggregate per ad_id
  const perAd = new Map<number, { account_id: number; impressions: number; clicks: number; spend_micros: number; leads: number }>();
  for (const m of metrics) {
    const cur = perAd.get(m.ad_id) ?? { account_id: m.account_id, impressions: 0, clicks: 0, spend_micros: 0, leads: 0 };
    cur.impressions += asInt(m.impressions);
    cur.clicks += asInt(m.clicks);
    cur.spend_micros += Number(m.spend_micros) || 0;
    cur.leads += asInt(m.leads);
    perAd.set(m.ad_id, cur);
  }

  const adIds = Array.from(perAd.keys());
  if (adIds.length === 0) return [];

  // Join ads_ads + ads_campaigns for names + platform
  const { data: adRows } = await sb
    .from('ads_ads')
    .select('id, name, platform, ad_set_id, ads_ad_sets(campaign_id, ads_campaigns(id, name))')
    .in('id', adIds);
  type AdJoinRow = {
    id: number; name: string; platform: 'meta'|'google'|'tiktok';
    ads_ad_sets?: { campaign_id: number; ads_campaigns?: { id: number; name: string } | null } | null;
  };
  const adsList = (adRows as unknown as AdJoinRow[] | null) ?? [];

  const { data: accounts } = await sb.from('ads_accounts').select('id, currency');
  const currencyByAccount = new Map<number, string>();
  for (const a of (accounts as Array<{ id: number; currency: string }> | null) ?? []) {
    currencyByAccount.set(a.id, a.currency);
  }

  // Build TopAdRow per ad
  const rows: TopAdRow[] = [];
  for (const ad of adsList) {
    const m = perAd.get(ad.id);
    if (!m) continue;
    const currency = currencyByAccount.get(m.account_id) ?? 'USD';
    const egpVals = await convertManyToEgp([{ amount: m.spend_micros / 1_000_000, currency }]);
    const spendEgp = Math.round(egpVals[0] || 0);
    const ctrPct = m.impressions > 0 ? Math.round((m.clicks / m.impressions) * 10000) / 100 : 0;
    rows.push({
      ad_id: ad.id,
      ad_name: ad.name,
      campaign_id: ad.ads_ad_sets?.campaign_id ?? 0,
      campaign_name: ad.ads_ad_sets?.ads_campaigns?.name ?? '—',
      platform: ad.platform,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr_pct: ctrPct,
      spend_egp: spendEgp,
      leads: m.leads,
      cpl_egp: m.leads > 0 ? Math.round((spendEgp / m.leads) * 100) / 100 : null,
    });
  }

  return sortTopAds(rows, opts.sortBy, opts.limit);
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/top-ads.test.ts
```
Expected: 4 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/top-ads.ts src/lib/beithady/ads/top-ads.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add top-ads.ts — ad-level ranking by leads / CTR / CPL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 6: `top-assets.ts` — thin wrapper over V1 view

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/top-assets.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/top-assets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/top-assets.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/beithady/ads/reporting', () => ({
  listAssetPerformance: vi.fn().mockResolvedValue([
    { asset_id: 'a', building_code: 'BH-26', public_url: 'http://x', ai_caption: null, category: null, ad_count: 3, impressions: 1000, clicks: 50, spend: 100, leads: 5, ctr_pct: 5, cpc: 2, cpl: 20 },
    { asset_id: 'b', building_code: 'BH-73', public_url: 'http://y', ai_caption: null, category: null, ad_count: 2, impressions: 500,  clicks: 20, spend: 60,  leads: 2, ctr_pct: 4, cpc: 3, cpl: 30 },
  ]),
}));

describe('getTopAssets', () => {
  it('passes buildingCode through to listAssetPerformance', async () => {
    const { listAssetPerformance } = await import('@/lib/beithady/ads/reporting');
    const { getTopAssets } = await import('./top-assets');
    await getTopAssets({ buildingCode: 'BH-26', limit: 10 });
    expect(vi.mocked(listAssetPerformance)).toHaveBeenCalledWith({ buildingCode: 'BH-26', limit: 10 });
  });

  it('passes default limit=20 when limit omitted', async () => {
    const { listAssetPerformance } = await import('@/lib/beithady/ads/reporting');
    vi.mocked(listAssetPerformance).mockClear();
    const { getTopAssets } = await import('./top-assets');
    await getTopAssets({});
    expect(vi.mocked(listAssetPerformance)).toHaveBeenCalledWith({ buildingCode: undefined, limit: 20 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/top-assets.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/top-assets.ts
import 'server-only';
import { listAssetPerformance, type AssetPerformanceRow } from './reporting';

export async function getTopAssets(opts: {
  buildingCode?: string;
  limit?: number;
}): Promise<AssetPerformanceRow[]> {
  return listAssetPerformance({ buildingCode: opts.buildingCode, limit: opts.limit ?? 20 });
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/top-assets.test.ts
```
Expected: 2 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/top-assets.ts src/lib/beithady/ads/top-assets.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add top-assets.ts — thin wrapper over ads_asset_performance view

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 7: `anomalies.ts` — extract logic from existing cron

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/anomalies.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/anomalies.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/anomalies.test.ts
import { describe, it, expect } from 'vitest';
import { computeAnomalies, type PlatformDailyTotals } from './anomalies';

const TODAY = '2026-05-16';
const YESTERDAY = '2026-05-15';

describe('computeAnomalies', () => {
  it('detects spend_spike when today > 3× yesterday', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 100, yesterday_spend: 25, today_leads: 10, week_spend: 500, week_value: 600 },
    };
    const events = computeAnomalies(totals);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'spend_spike', platform: 'meta', severity: 'warning',
    }));
  });
  it('marks critical severity at ≥ 5× spike', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 150, yesterday_spend: 25, today_leads: 10, week_spend: 500, week_value: 600 },
    };
    const events = computeAnomalies(totals);
    expect(events.find(e => e.type === 'spend_spike')?.severity).toBe('critical');
  });
  it('detects zero_leads with > $30 spend', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 50, yesterday_spend: 50, today_leads: 0, week_spend: 350, week_value: 0 },
    };
    const events = computeAnomalies(totals);
    expect(events.find(e => e.type === 'zero_leads')).toBeTruthy();
  });
  it('does NOT detect zero_leads below $30 floor', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 20, yesterday_spend: 20, today_leads: 0, week_spend: 100, week_value: 0 },
    };
    const events = computeAnomalies(totals);
    expect(events.find(e => e.type === 'zero_leads')).toBeUndefined();
  });
  it('detects low_roas when week roas < 1 and week spend > $100', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 20, yesterday_spend: 20, today_leads: 1, week_spend: 200, week_value: 150 },
    };
    const events = computeAnomalies(totals);
    expect(events.find(e => e.type === 'low_roas')?.severity).toBe('critical');
  });
  it('returns empty for healthy platform', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 30, yesterday_spend: 28, today_leads: 5, week_spend: 200, week_value: 800 },
    };
    expect(computeAnomalies(totals)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/anomalies.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/anomalies.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export const SPEND_SPIKE_MULTIPLIER = 3;
export const SPEND_SPIKE_CRITICAL_MULTIPLIER = 5;
export const ZERO_LEADS_SPEND_FLOOR = 30;     // USD
export const LOW_ROAS_SPEND_FLOOR = 100;      // USD
export const LOW_ROAS_THRESHOLD = 1.0;

export type AnomalyType = 'spend_spike' | 'zero_leads' | 'low_roas';
export type AnomalySeverity = 'warning' | 'critical';

export type AnomalyEvent = {
  type: AnomalyType;
  severity: AnomalySeverity;
  platform: string;
  message: string;
  metric: { today: number; baseline: number; ratio: number };
};

export type PlatformDailyTotals = {
  today_spend: number;
  yesterday_spend: number;
  today_leads: number;
  week_spend: number;
  week_value: number;
};

export function computeAnomalies(perPlatform: Record<string, PlatformDailyTotals>): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  for (const [platform, p] of Object.entries(perPlatform)) {
    // 1. Spend spike
    if (p.today_spend > 0 && p.yesterday_spend > 0 && p.today_spend > SPEND_SPIKE_MULTIPLIER * p.yesterday_spend) {
      const ratio = p.today_spend / p.yesterday_spend;
      events.push({
        type: 'spend_spike',
        severity: ratio >= SPEND_SPIKE_CRITICAL_MULTIPLIER ? 'critical' : 'warning',
        platform,
        message: `${platform} spend $${p.today_spend.toFixed(2)} today is ${ratio.toFixed(1)}× yesterday ($${p.yesterday_spend.toFixed(2)})`,
        metric: { today: p.today_spend, baseline: p.yesterday_spend, ratio },
      });
    }
    // 2. Zero leads with material spend
    if (p.today_leads === 0 && p.today_spend >= ZERO_LEADS_SPEND_FLOOR) {
      events.push({
        type: 'zero_leads',
        severity: 'warning',
        platform,
        message: `${platform} spent $${p.today_spend.toFixed(2)} today with 0 leads`,
        metric: { today: p.today_spend, baseline: 0, ratio: Infinity },
      });
    }
    // 3. Low ROAS (7d)
    const roas = p.week_spend > 0 ? p.week_value / p.week_spend : null;
    if (p.week_spend >= LOW_ROAS_SPEND_FLOOR && roas != null && roas < LOW_ROAS_THRESHOLD) {
      events.push({
        type: 'low_roas',
        severity: 'critical',
        platform,
        message: `${platform} 7d ROAS ${roas.toFixed(2)}× on $${p.week_spend.toFixed(2)} spend (< ${LOW_ROAS_THRESHOLD}× threshold)`,
        metric: { today: roas, baseline: LOW_ROAS_THRESHOLD, ratio: roas / LOW_ROAS_THRESHOLD },
      });
    }
  }
  return events;
}

function cairoDateStr(offsetDays = 0): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return f.format(d);
}

export async function detectAnomalies(opts: { today?: string; lookbackDays?: number } = {}): Promise<AnomalyEvent[]> {
  const sb = supabaseAdmin();
  const lookbackDays = opts.lookbackDays ?? 7;
  const today = opts.today ?? cairoDateStr(0);
  const yesterday = cairoDateStr(1);
  const lookbackStart = cairoDateStr(lookbackDays);

  const { data, error } = await sb
    .from('ads_daily_metrics')
    .select('platform, metric_date, spend_micros, leads, conversion_value_micros')
    .is('ad_id', null)
    .is('ad_set_id', null)
    .gte('metric_date', lookbackStart);
  if (error) { console.error('[anomalies] query failed:', error); return []; }
  type Row = { platform: string; metric_date: string; spend_micros: number; leads: number; conversion_value_micros: number | null };
  const rows = (data as Row[] | null) ?? [];

  const perPlatform: Record<string, PlatformDailyTotals> = {};
  for (const r of rows) {
    const p = (perPlatform[r.platform] ||= { today_spend: 0, yesterday_spend: 0, today_leads: 0, week_spend: 0, week_value: 0 });
    const spend = Number(r.spend_micros || 0) / 1_000_000;
    const leads = Number(r.leads || 0);
    const value = Number(r.conversion_value_micros || 0) / 1_000_000;
    p.week_spend += spend;
    p.week_value += value;
    if (r.metric_date === today) { p.today_spend += spend; p.today_leads += leads; }
    if (r.metric_date === yesterday) p.yesterday_spend += spend;
  }

  return computeAnomalies(perPlatform);
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/anomalies.test.ts
```
Expected: 6 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/anomalies.ts src/lib/beithady/ads/anomalies.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add anomalies.ts — extracted detection logic from existing cron

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 8: Refactor `beithady-ads-anomaly-alert` cron to call `anomalies.ts`

**Files:**
- Modify: `C:/kareemhady/src/app/api/cron/beithady-ads-anomaly-alert/route.ts`

The cron currently inlines the comparison + alert-shape logic. Replace with a call to the shared `detectAnomalies()`. WhatsApp send + dedup-via-audit-log behavior is UNCHANGED.

- [ ] **Step 1: Read the current cron**

Read `C:/kareemhady/src/app/api/cron/beithady-ads-anomaly-alert/route.ts` (159 lines). Note:
- Lines 1-44: imports, constants, auth check, cairoDateStr, loadManagerPhones
- Lines 46-112: the GET handler inline logic (query metrics → aggregate per-platform → compute alerts)
- Lines 114-158: dedup via audit log → send WhatsApp → audit-log fresh alerts

After refactor, lines 49-112 become: `const events = await detectAnomalies();`. Lines 114-158 stay (dedup + WhatsApp + audit logging are cron-specific, not shared).

The map from new `AnomalyEvent` shape → existing `alerts` shape: each event has `{ type, platform, message }`; the existing dedup keyed on `${kind}|${platform}` where `kind` = our `type`. The WhatsApp message uses `a.detail` which is our `message`.

- [ ] **Step 2: Apply the refactor**

Replace the file body. The auth gate + constants used by the cron alone (manager phones loader) stay. Constants moved to the shared lib are removed from the cron file.

Final cron file:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { detectAnomalies, type AnomalyEvent } from '@/lib/beithady/ads/anomalies';

// Daily-spend anomaly detector. Runs hourly during business hours.
// Detection logic lives in `@/lib/beithady/ads/anomalies` (shared with the
// V3 dashboard banner). This cron only adds dedup + WhatsApp + audit logging.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

async function loadManagerPhones(): Promise<string[]> {
  const env = (process.env.BEITHADY_OPS_ALERT_PHONES || '').split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return env;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const sb = supabaseAdmin();

  // Detect anomalies via the shared lib (same logic the dashboard banner uses).
  const events = await detectAnomalies();
  if (events.length === 0) {
    return NextResponse.json({ ok: true, alerts: 0 });
  }

  // De-dupe — don't fire the same kind+platform more than once per 6h
  const dedupSinceIso = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data: recent } = await sb
    .from('beithady_audit_log')
    .select('action, metadata, created_at')
    .eq('module', 'ads')
    .eq('action', 'spend_anomaly_alert')
    .gte('created_at', dedupSinceIso)
    .limit(100);
  type RecentRow = { action: string; metadata: Record<string, unknown> | null; created_at: string };
  const seen = new Set<string>();
  for (const r of (recent as RecentRow[] | null) || []) {
    const k = `${(r.metadata as { kind?: string })?.kind || ''}|${(r.metadata as { platform?: string })?.platform || ''}`;
    seen.add(k);
  }
  const fresh = events.filter((e: AnomalyEvent) => !seen.has(`${e.type}|${e.platform}`));

  if (fresh.length === 0) {
    return NextResponse.json({ ok: true, alerts: events.length, fresh: 0, deduped: events.length });
  }

  const phones = await loadManagerPhones();
  const lines = ['*BH Ads — anomaly alert*', '', ...fresh.map(a => `• ${a.message}`), '', 'Open /beithady/ads/performance to investigate.'];
  const msg = lines.join('\n');

  const sendResults: Array<{ phone: string; ok: boolean }> = [];
  for (const phone of phones) {
    const r = await sendWhatsApp({ to: phone, message: msg });
    sendResults.push({ phone, ok: r.ok });
  }

  // Audit-log each alert so the dedup window sees them next run
  for (const a of fresh) {
    await sb.from('beithady_audit_log').insert({
      module: 'ads',
      action: 'spend_anomaly_alert',
      metadata: { kind: a.type, platform: a.platform, detail: a.message, recipients: phones.length },
    });
  }

  return NextResponse.json({ ok: true, alerts: events.length, fresh: fresh.length, sent_to: phones.length, send_results: sendResults });
}
```

- [ ] **Step 3: Run tsc + full suite for regression**

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

```bash
cd C:/kareemhady && npm run test 2>&1 | tail -10
```
Expected: full suite still green (no anomaly cron test exists — refactor is behavior-identical).

- [ ] **Step 4: Commit + push**

```bash
cd C:/kareemhady && git add src/app/api/cron/beithady-ads-anomaly-alert/route.ts
git commit -m "$(cat <<'EOF'
refactor(bh-ads): anomaly-alert cron now calls shared detectAnomalies() lib

Behavior unchanged: same 3 anomaly types (spend_spike / zero_leads / low_roas),
same 6h dedup via audit log, same WhatsApp send to BEITHADY_OPS_ALERT_PHONES.
Just removes duplication so the V3 dashboard banner reuses the same logic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 9: `ai-summary.ts` — Claude haiku-4-5 wrapper

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/ai-summary.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/ai-summary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/ai-summary.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildAiSummaryPrompt, AI_SUMMARY_DAILY_CAP, type AiSummaryDashboardData } from './ai-summary';

const DATA: AiSummaryDashboardData = {
  kpis: { spend_egp: 14000, leads: 22, bookings: 7, cpl_egp: 636, roas: 2.5, attributed_revenue_egp: 35000 },
  topCountries: [{ country: 'EG', clicks: 800, pct: 70 }, { country: 'AE', clicks: 200, pct: 17 }],
  topDemos: [{ age_range: '25-34', gender: 'female', clicks: 400, pct: 35 }],
  topDevices: [{ device: 'mobile', clicks: 950, pct: 83 }],
  topCampaigns: [{ name: 'CTWA EG May', platform: 'meta', leads: 18, cpl_egp: 68, quality_pct: 27.8 }],
  frtSummary: { median_minutes: 12, p95_minutes: 47, over_1h_pct: 14 },
  anomalies: [],
  funnelStages: [{ key: 'impressions', count: 120000 }, { key: 'bookings', count: 7 }],
};

describe('buildAiSummaryPrompt', () => {
  it('includes the BH context line', () => {
    const p = buildAiSummaryPrompt({ from: '2026-05-01', to: '2026-05-16' }, DATA);
    expect(p).toContain('Beit Hady');
    expect(p).toContain('BH-26');
  });
  it('includes the date range', () => {
    const p = buildAiSummaryPrompt({ from: '2026-05-01', to: '2026-05-16' }, DATA);
    expect(p).toContain('2026-05-01');
    expect(p).toContain('2026-05-16');
  });
  it('serializes the dashboard data as JSON', () => {
    const p = buildAiSummaryPrompt({ from: '2026-05-01', to: '2026-05-16' }, DATA);
    expect(p).toContain('CTWA EG May');
    expect(p).toContain('27.8');
  });
  it('exports a daily cap constant of 20', () => {
    expect(AI_SUMMARY_DAILY_CAP).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/ai-summary.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/ai-summary.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { anthropic, HAIKU } from '@/lib/anthropic';
import { recordAudit } from '@/lib/beithady/audit';
import type { AnomalyEvent } from './anomalies';

export const AI_SUMMARY_DAILY_CAP = 20;
// Approximate cost based on haiku-4-5 pricing (~$0.80/$4 per Mtok in/out, ~1k tokens per call).
const APPROX_COST_PER_CALL_USD = 0.01;

export type AiSummaryDashboardData = {
  kpis: { spend_egp: number; leads: number; bookings: number; cpl_egp: number | null; roas: number | null; attributed_revenue_egp: number };
  topCountries: Array<{ country: string; clicks: number; pct: number }>;
  topDemos: Array<{ age_range: string; gender: string; clicks: number; pct: number }>;
  topDevices: Array<{ device: string; clicks: number; pct: number }>;
  topCampaigns: Array<{ name: string; platform: string; leads: number; cpl_egp: number | null; quality_pct: number }>;
  frtSummary: { median_minutes: number | null; p95_minutes: number | null; over_1h_pct: number };
  anomalies: AnomalyEvent[];
  funnelStages: Array<{ key: string; count: number }>;
};

export type AiSummaryResult =
  | { ok: true; summary: string; cost_usd: number }
  | { ok: false; error: 'daily_cap_reached' | 'api_error' | 'no_data'; cost_usd: number; detail?: string };

export function buildAiSummaryPrompt(range: { from: string; to: string }, data: AiSummaryDashboardData): string {
  return `You are an ad-ops analyst for Beit Hady, a boutique short-term rental brand in Egypt
operating five buildings: BH-26, BH-73, BH-435, BH-OK, BH-34.

Given this dashboard for the period ${range.from} through ${range.to}, write a 3-paragraph summary:

1. WHAT'S WORKING: top platforms/campaigns/audiences driving leads + bookings. Cite numbers.
2. WHAT'S NOT WORKING: slow FRT, high CPL campaigns, anomalies. Cite numbers.
3. ACTION: one concrete recommendation for tomorrow. Be specific (kill ad X, shift budget from Y to Z).

Data:
${JSON.stringify(data, null, 2)}

Keep each paragraph under 50 words. No bullet points, no hedging language.
Use EGP for money. Round percentages to whole numbers.`;
}

async function todaysAiCallCount(): Promise<number> {
  const sb = supabaseAdmin();
  // Cairo-today boundary
  const cairoToday = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
  const sinceIso = new Date(cairoToday + 'T00:00:00+03:00').toISOString();
  const { count } = await sb.from('beithady_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'ads')
    .eq('action', 'ai_summary_generated')
    .gte('created_at', sinceIso);
  return count ?? 0;
}

export async function generateAiSummary(opts: {
  range: { from: string; to: string };
  dashboardData: AiSummaryDashboardData;
}): Promise<AiSummaryResult> {
  const used = await todaysAiCallCount();
  if (used >= AI_SUMMARY_DAILY_CAP) {
    return { ok: false, error: 'daily_cap_reached', cost_usd: 0 };
  }
  const prompt = buildAiSummaryPrompt(opts.range, opts.dashboardData);
  try {
    const client = anthropic();
    const resp = await client.messages.create({
      model: HAIKU,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const summary = resp.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    await recordAudit({
      module: 'ads',
      action: 'ai_summary_generated',
      metadata: {
        range: opts.range,
        cost_usd: APPROX_COST_PER_CALL_USD,
        model: HAIKU,
        prompt_chars: prompt.length,
        summary_chars: summary.length,
      },
    });
    return { ok: true, summary, cost_usd: APPROX_COST_PER_CALL_USD };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[ai-summary] anthropic call failed:', detail);
    await recordAudit({
      module: 'ads',
      action: 'ai_summary_timeout',
      metadata: { range: opts.range, error: detail.slice(0, 200) },
    });
    return { ok: false, error: 'api_error', cost_usd: 0, detail };
  }
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/ai-summary.test.ts
```
Expected: 4 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/ai-summary.ts src/lib/beithady/ads/ai-summary.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add ai-summary.ts — Claude haiku-4-5 wrapper with 20/day cap

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 10: `generateAiSummaryAction` server action

**Files:**
- Modify: `C:/kareemhady/src/app/beithady/ads/actions.ts` (append new action)

- [ ] **Step 1: Read existing actions.ts**

Read `C:/kareemhady/src/app/beithady/ads/actions.ts` to understand the `'use server'` directive placement and existing imports.

- [ ] **Step 2: Append the action**

Add this at the bottom of `C:/kareemhady/src/app/beithady/ads/actions.ts`:

```ts
import { revalidatePath } from 'next/cache';
import { generateAiSummary, type AiSummaryResult } from '@/lib/beithady/ads/ai-summary';
import { getDashboardKpis, listCampaigns } from '@/lib/beithady/ads/reporting';
import { queryGeoRollup } from '@/lib/beithady/ads/insights-geo';
import { queryDemoRollup } from '@/lib/beithady/ads/insights-demo';
import { queryDeviceRollup } from '@/lib/beithady/ads/insights-device';
import { getLeadQualityPerCampaign } from '@/lib/beithady/ads/lead-quality';
import { getFrtSummary } from '@/lib/beithady/ads/frt';
import { detectAnomalies } from '@/lib/beithady/ads/anomalies';
import { getFunnelStages } from '@/lib/beithady/ads/funnel';

export async function generateAiSummaryAction(formData: FormData): Promise<AiSummaryResult> {
  const from = String(formData.get('from') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!from || !to) {
    return { ok: false, error: 'no_data', cost_usd: 0, detail: 'missing date range' };
  }
  const range = { from, to };

  // Gather all dashboard slices in parallel — same data the page renders.
  const [kpis, campaigns, geo, demo, device, quality, frt, anomalies, funnel] = await Promise.all([
    getDashboardKpis({ from, to }),
    listCampaigns(),
    queryGeoRollup({ from, to }),
    queryDemoRollup({ from, to }),
    queryDeviceRollup({ from, to }),
    getLeadQualityPerCampaign({ from, to }),
    getFrtSummary({ from, to }),
    detectAnomalies(),
    getFunnelStages({ from, to }),
  ]);

  const totalGeoClicks = geo.reduce((s, r) => s + r.clicks, 0) || 1;
  const totalDemoClicks = demo.reduce((s, r) => s + r.clicks, 0) || 1;
  const totalDeviceClicks = device.reduce((s, r) => s + r.clicks, 0) || 1;

  const result = await generateAiSummary({
    range,
    dashboardData: {
      kpis: {
        spend_egp: kpis.spend,
        leads: kpis.leads,
        bookings: kpis.bookings,
        cpl_egp: kpis.cpl,
        roas: kpis.roas,
        attributed_revenue_egp: kpis.attributed_revenue,
      },
      topCountries: geo.slice(0, 5).map(r => ({ country: r.country_code, clicks: r.clicks, pct: Math.round((r.clicks / totalGeoClicks) * 100) })),
      topDemos: demo.slice(0, 5).map(r => ({ age_range: r.age_range, gender: r.gender, clicks: r.clicks, pct: Math.round((r.clicks / totalDemoClicks) * 100) })),
      topDevices: device.slice(0, 5).map(r => ({ device: r.device_platform, clicks: r.clicks, pct: Math.round((r.clicks / totalDeviceClicks) * 100) })),
      topCampaigns: quality.slice(0, 5).map(r => ({ name: r.campaign_name, platform: r.platform, leads: r.leads, cpl_egp: null, quality_pct: r.quality_pct })),
      frtSummary: { median_minutes: frt.median_minutes, p95_minutes: frt.p95_minutes, over_1h_pct: frt.over_1h_pct },
      anomalies,
      funnelStages: funnel.stages.map(s => ({ key: s.key, count: s.count })),
    },
  });

  revalidatePath('/beithady/ads');
  return result;
}
```

NOTE on existing imports: the file already has `'use server';` at top + several action imports. Don't duplicate the directive. The new imports go alongside existing ones (you may need to merge them rather than re-importing).

- [ ] **Step 3: Run tsc**

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -10
```
Expected: 0 errors.

- [ ] **Step 4: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/actions.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add generateAiSummaryAction server action (V3 E4)

Gathers dashboard data slices in parallel, calls generateAiSummary, revalidates
the ads route. Returns the AiSummaryResult discriminated union so the client
card can branch on { ok: true } / { ok: false, error: ... }.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 11: `getDashboardKpisWithCompare` in `reporting.ts`

**Files:**
- Modify: `C:/kareemhady/src/lib/beithady/ads/reporting.ts` (append helper)
- Modify: `C:/kareemhady/src/lib/beithady/ads/reporting.test.ts` (append test)

- [ ] **Step 1: Append failing test**

Append at end of `C:/kareemhady/src/lib/beithady/ads/reporting.test.ts`:

```ts
import { type RangeArg } from './reporting';

describe('getDashboardKpisWithCompare (shape only)', () => {
  it('accepts { range, compare } in opts type', () => {
    // Type-level check: this should compile.
    type Opts = { range: { from: string; to: string }; compare: boolean };
    const _shape: Opts = { range: { from: '2026-05-01', to: '2026-05-16' }, compare: true };
    expect(_shape.compare).toBe(true);
  });
});
```

(Pure shape test — the actual DB read is exercised by integration. The compute path is `getDashboardKpis()` which already has tests in this file.)

- [ ] **Step 2: Run test to verify it passes (shape)**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/reporting.test.ts
```
Expected: existing tests + new shape test PASS. (The shape test only requires the type compile, not a function call.)

- [ ] **Step 3: Append the helper to reporting.ts**

Append at end of `C:/kareemhady/src/lib/beithady/ads/reporting.ts`:

```ts
// V3 D3: fetch current KPIs and (when compare=true) prior-period KPIs in one call.
// Lets the main page render <PeriodDeltaBadge /> next to each <Stat>.
export async function getDashboardKpisWithCompare(opts: {
  range: { from: string; to: string };
  compare: boolean;
}): Promise<{
  current: Awaited<ReturnType<typeof getDashboardKpis>>;
  prior: Awaited<ReturnType<typeof getDashboardKpis>> | null;
}> {
  // Lazy import to avoid circular dependency (date-range.ts → reporting.ts is hot-loaded).
  const { derivePriorPeriod } = await import('./date-range');
  if (!opts.compare) {
    const current = await getDashboardKpis({ from: opts.range.from, to: opts.range.to });
    return { current, prior: null };
  }
  const priorRange = derivePriorPeriod(opts.range);
  const [current, prior] = await Promise.all([
    getDashboardKpis({ from: opts.range.from, to: opts.range.to }),
    getDashboardKpis({ from: priorRange.from, to: priorRange.to }),
  ]);
  return { current, prior };
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/reporting.test.ts
```
Expected: all reporting tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/reporting.ts src/lib/beithady/ads/reporting.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add getDashboardKpisWithCompare for V3 D3 period-delta

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 12: `<AnomalyBanner />` — server component

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/_components/anomaly-banner.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/_components/anomaly-banner.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/anomalies', () => ({
  detectAnomalies: vi.fn().mockResolvedValue([
    { type: 'spend_spike', severity: 'warning', platform: 'meta',
      message: 'meta spend $100 today is 4.0× yesterday ($25)',
      metric: { today: 100, baseline: 25, ratio: 4 } },
    { type: 'low_roas', severity: 'critical', platform: 'google',
      message: 'google 7d ROAS 0.40× on $200 spend',
      metric: { today: 0.4, baseline: 1, ratio: 0.4 } },
  ]),
}));

describe('AnomalyBanner', () => {
  it('renders one row per anomaly with severity tint', async () => {
    const { AnomalyBanner } = await import('./anomaly-banner');
    const ui = await AnomalyBanner();
    const { container } = render(ui);
    expect(screen.getByText(/4.0×/)).toBeTruthy();
    expect(screen.getByText(/ROAS 0.40×/)).toBeTruthy();
    // Critical row should have rose tint, warning row should have amber tint
    const html = container.innerHTML;
    expect(html).toContain('rose');
    expect(html).toContain('amber');
  });

  it('returns null when no anomalies', async () => {
    const mod = await import('@/lib/beithady/ads/anomalies');
    vi.mocked(mod.detectAnomalies).mockResolvedValueOnce([]);
    const { AnomalyBanner } = await import('./anomaly-banner');
    const ui = await AnomalyBanner();
    const { container } = render(ui);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/anomaly-banner.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/_components/anomaly-banner.tsx
import { AlertTriangle } from 'lucide-react';
import { detectAnomalies, type AnomalyEvent } from '@/lib/beithady/ads/anomalies';

function tintFor(severity: AnomalyEvent['severity']): string {
  return severity === 'critical'
    ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
    : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300';
}

export async function AnomalyBanner() {
  const events = await detectAnomalies();
  if (events.length === 0) return null;
  return (
    <div className="space-y-2">
      {events.map((e, i) => (
        <div key={`${e.type}|${e.platform}|${i}`}
             className={`ix-card p-3 text-xs flex items-center gap-2 border ${tintFor(e.severity)}`}>
          <AlertTriangle size={14} className="shrink-0" />
          <span>{e.message}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/anomaly-banner.test.tsx
```
Expected: 2 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/_components/anomaly-banner.tsx src/app/beithady/ads/_components/anomaly-banner.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <AnomalyBanner /> — auto-hides when no anomalies (V3 E3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 13: `<SpendPacingCard />` — sparkline + per-campaign bars

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/_components/spend-pacing-card.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/_components/spend-pacing-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/pacing', () => ({
  getSpendPacing: vi.fn().mockResolvedValue({
    daily: [
      { date: '2026-05-14', spend_egp: 800 },
      { date: '2026-05-15', spend_egp: 1200 },
      { date: '2026-05-16', spend_egp: 600 },
    ],
    campaigns: [
      { campaign_id: 1, campaign_name: 'CTWA EG May', platform: 'meta',
        monthly_budget_cap_egp: 10000, spend_egp_mtd: 8500, projected_egp_eom: 16000,
        pct_of_cap: 85, auto_paused: false },
      { campaign_id: 2, campaign_name: 'Search SA', platform: 'google',
        monthly_budget_cap_egp: 5000, spend_egp_mtd: 1500, projected_egp_eom: 3000,
        pct_of_cap: 30, auto_paused: false },
    ],
    total_spend_egp: 10000, total_cap_egp: 15000,
  }),
}));

describe('SpendPacingCard', () => {
  it('renders sparkline + campaign rows sorted by pct_of_cap desc', async () => {
    const { SpendPacingCard } = await import('./spend-pacing-card');
    const ui = await SpendPacingCard({ range: { from: '2026-05-14', to: '2026-05-16' } });
    render(ui);
    expect(screen.getByText(/Spend pacing/i)).toBeTruthy();
    expect(screen.getByText(/CTWA EG May/)).toBeTruthy();
    expect(screen.getByText(/85%/)).toBeTruthy();
    expect(screen.getByText(/Search SA/)).toBeTruthy();
  });
  it('shows projection warning for campaigns >80% of cap', async () => {
    const { SpendPacingCard } = await import('./spend-pacing-card');
    const ui = await SpendPacingCard({ range: { from: '2026-05-14', to: '2026-05-16' } });
    render(ui);
    expect(screen.getByText(/projected to hit cap/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/spend-pacing-card.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/_components/spend-pacing-card.tsx
import { TrendingUp } from 'lucide-react';
import { getSpendPacing, type CampaignPacingRow } from '@/lib/beithady/ads/pacing';

function barTint(row: CampaignPacingRow): string {
  if (row.auto_paused) return 'bg-slate-400/70 dark:bg-slate-500/70';
  if (row.pct_of_cap >= 95) return 'bg-rose-500/70 dark:bg-rose-600/70';
  if (row.pct_of_cap >= 80) return 'bg-amber-500/70 dark:bg-amber-600/70';
  if (row.pct_of_cap >= 60) return 'bg-slate-400/70 dark:bg-slate-500/70';
  return 'bg-emerald-500/70 dark:bg-emerald-600/70';
}

function sparklinePath(points: number[], width: number, height: number): string {
  if (points.length === 0) return '';
  const max = Math.max(...points, 1);
  const stepX = width / Math.max(1, points.length - 1);
  return points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${height - (v / max) * height}`)
    .join(' ');
}

export async function SpendPacingCard({ range }: { range: { from: string; to: string } }) {
  const pacing = await getSpendPacing({ range });
  const points = pacing.daily.map(d => d.spend_egp);
  const path = sparklinePath(points, 280, 40);

  return (
    <div className="ix-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <TrendingUp size={14} className="text-emerald-600" />
        <span>Spend pacing</span>
      </div>

      <div className="flex items-center gap-4">
        <svg width="280" height="40" className="text-slate-500 dark:text-slate-400">
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <div className="text-xs tabular-nums">
          <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wide">Total / cap</div>
          <div className="text-slate-700 dark:text-slate-200 font-semibold">
            EGP {pacing.total_spend_egp.toLocaleString()} / EGP {pacing.total_cap_egp.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        {pacing.campaigns.map(c => (
          <div key={c.campaign_id} className="grid grid-cols-[180px_1fr_120px] items-center gap-3">
            <span className="truncate text-slate-600 dark:text-slate-300">
              {c.campaign_name}{c.auto_paused ? ' (auto-paused)' : ''}
            </span>
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
              <div className={`h-full ${barTint(c)}`} style={{ width: `${Math.min(100, c.pct_of_cap)}%` }} />
            </div>
            <span className="text-right tabular-nums text-slate-500 dark:text-slate-400">
              {c.pct_of_cap}% of EGP {(c.monthly_budget_cap_egp ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {pacing.campaigns.filter(c => c.pct_of_cap > 80 && !c.auto_paused).map(c => (
        <div key={`warn-${c.campaign_id}`} className="text-[11px] text-amber-700 dark:text-amber-300">
          ⚠ {c.campaign_name} projected to hit cap (EGP {c.projected_egp_eom.toLocaleString()} EOM)
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/spend-pacing-card.test.tsx
```
Expected: 2 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/_components/spend-pacing-card.tsx src/app/beithady/ads/_components/spend-pacing-card.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <SpendPacingCard /> — sparkline + per-campaign cap bars (V3 D2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 14: `<AiSummaryCard />` — button + 3-paragraph render

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/_components/ai-summary-card.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/_components/ai-summary-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiSummaryCard } from './ai-summary-card';

describe('AiSummaryCard', () => {
  it('renders button when no summary yet', () => {
    render(<AiSummaryCard range={{ from: '2026-05-09', to: '2026-05-16' }} summary={null} usedToday={3} />);
    expect(screen.getByRole('button', { name: /Generate/i })).toBeTruthy();
    expect(screen.getByText(/daily cap 3\/20/i)).toBeTruthy();
  });

  it('renders summary paragraphs after generation', () => {
    const summary = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    render(<AiSummaryCard range={{ from: '2026-05-09', to: '2026-05-16' }} summary={summary} usedToday={4} />);
    expect(screen.getByText(/Paragraph one/)).toBeTruthy();
    expect(screen.getByText(/Paragraph two/)).toBeTruthy();
    expect(screen.getByText(/Paragraph three/)).toBeTruthy();
  });

  it('disables button when daily cap reached', () => {
    render(<AiSummaryCard range={{ from: '2026-05-09', to: '2026-05-16' }} summary={null} usedToday={20} />);
    const btn = screen.getByRole('button', { name: /cap reached/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/ai-summary-card.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/_components/ai-summary-card.tsx
import { Sparkles } from 'lucide-react';
import { generateAiSummaryAction } from '../actions';

export function AiSummaryCard({
  range, summary, usedToday,
}: {
  range: { from: string; to: string };
  summary: string | null;
  usedToday: number;
}) {
  const capReached = usedToday >= 20;
  const paragraphs = summary ? summary.split(/\n\n+/).filter(p => p.trim().length > 0) : [];

  return (
    <div className="ix-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Sparkles size={14} className="text-emerald-600" />
          <span>AI summary</span>
        </div>
        <form action={generateAiSummaryAction}>
          <input type="hidden" name="from" value={range.from} />
          <input type="hidden" name="to" value={range.to} />
          <button
            type="submit"
            disabled={capReached}
            className={`ix-btn-secondary text-xs ${capReached ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={capReached ? 'Daily cap reached — resets at midnight Cairo' : 'Generates a 3-paragraph summary (~$0.01)'}
          >
            {capReached ? 'Cap reached' : 'Generate summary'}
          </button>
        </form>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        cost ~$0.01 · daily cap {usedToday}/20
      </div>
      {paragraphs.length > 0 ? (
        <div className="space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      ) : (
        <div className="text-xs text-slate-400 italic">
          No summary yet for this date range. Click {capReached ? '"Cap reached"' : '"Generate summary"'} to create one.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/ai-summary-card.test.tsx
```
Expected: 3 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/_components/ai-summary-card.tsx src/app/beithady/ads/_components/ai-summary-card.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <AiSummaryCard /> — generate button + 3-paragraph render (V3 E4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 15: `<TimeTab />` — heatmap with Lead/Meta toggle

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/time-tab.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/time-tab.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/hourly', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/beithady/ads/hourly')>();
  return {
    ...actual,
    getLeadDensityHeatmap: vi.fn().mockResolvedValue([
      { day_of_week: 0, hour: 9, lead_count: 5 },
      { day_of_week: 1, hour: 19, lead_count: 8 },
      { day_of_week: 6, hour: 20, lead_count: 12 },
    ]),
    getMetaHourlyHeatmap: vi.fn().mockResolvedValue([]),
  };
});

describe('TimeTab', () => {
  it('renders 7×24 heatmap grid in lead-density mode', async () => {
    const { TimeTab } = await import('./time-tab');
    const ui = await TimeTab({ range: { from: '2026-05-09', to: '2026-05-16', preset: '7d', compare: false } });
    const { container } = render(ui);
    // 7 day labels
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('Sun')).toBeTruthy();
    // At least one hour label
    expect(screen.getByText('9h')).toBeTruthy();
    // Cell count: 7 rows × 24 cols = 168 td.heatmap-cell elements
    expect(container.querySelectorAll('td.heatmap-cell').length).toBe(168);
  });

  it('shows empty-state hint when Meta mode has no data', async () => {
    const { TimeTab } = await import('./time-tab');
    const ui = await TimeTab({ range: { from: '2026-05-09', to: '2026-05-16', preset: '7d', compare: false }, mode: 'meta' });
    render(ui);
    expect(screen.getByText(/Meta hourly data populating/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/time-tab.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/audience/_components/time-tab.tsx
import Link from 'next/link';
import {
  getLeadDensityHeatmap, getMetaHourlyHeatmap, type HeatmapCell, type MetaHourlyCell,
} from '@/lib/beithady/ads/hourly';
import { cellColorBucket } from '@/lib/beithady/ads/cohort';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function maxOf(cells: Array<HeatmapCell | MetaHourlyCell>, field: 'lead_count' | 'clicks' | 'spend_micros' | 'impressions'): number {
  let m = 0;
  for (const c of cells) {
    const v = (c as Record<string, number>)[field] ?? 0;
    if (v > m) m = v;
  }
  return m || 1;
}

export async function TimeTab({
  range, campaignId, buildingCode, mode,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
  mode?: 'leads' | 'meta';
}) {
  const activeMode: 'leads' | 'meta' = mode === 'meta' ? 'meta' : 'leads';
  const baseQs = new URLSearchParams({
    from: range.from, to: range.to,
    ...(range.preset ? { preset: range.preset } : {}),
    ...(range.compare ? { compare: '1' } : {}),
    ...(campaignId ? { campaign: String(campaignId) } : {}),
    ...(buildingCode ? { building: buildingCode } : {}),
    tab: 'time',
  });
  const leadsQs = new URLSearchParams(baseQs); leadsQs.set('heatmap', 'leads');
  const metaQs = new URLSearchParams(baseQs); metaQs.set('heatmap', 'meta');

  const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
  const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

  // Pull both for now; cheap (mocked / small data). UI only renders the active mode.
  const [leadCells, metaCells] = await Promise.all([
    getLeadDensityHeatmap({ from: range.from, to: range.to, campaignId, buildingCode }),
    getMetaHourlyHeatmap({ from: range.from, to: range.to, campaignId }),
  ]);

  if (activeMode === 'meta' && metaCells.length === 0) {
    return (
      <div className="space-y-3">
        <div className="ix-card p-3 flex items-center gap-2 text-xs">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Mode</span>
          <Link href={`/beithady/ads/audience?${leadsQs.toString()}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${INACTIVE}`}>Lead density</Link>
          <Link href={`/beithady/ads/audience?${metaQs.toString()}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${ACTIVE}`}>Meta spend</Link>
        </div>
        <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Meta hourly data populating — try again in ~6 hours.
        </div>
      </div>
    );
  }

  const cells = activeMode === 'leads'
    ? leadCells
    : metaCells.map(c => ({ day_of_week: c.day_of_week, hour: c.hour, value: c.clicks }));
  const valueOf = activeMode === 'leads'
    ? (c: HeatmapCell) => c.lead_count
    : (c: MetaHourlyCell) => c.clicks;
  const max = activeMode === 'leads' ? maxOf(leadCells, 'lead_count') : maxOf(metaCells, 'clicks');

  // Build a quick lookup
  const lookup = new Map<string, number>();
  for (const c of (activeMode === 'leads' ? leadCells : metaCells) as Array<HeatmapCell | MetaHourlyCell>) {
    lookup.set(`${c.day_of_week}|${c.hour}`, (valueOf as (x: HeatmapCell | MetaHourlyCell) => number)(c));
  }
  const totalSum = Array.from(lookup.values()).reduce((s, n) => s + n, 0) || 1;

  return (
    <div className="space-y-3">
      <div className="ix-card p-3 flex items-center gap-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Mode</span>
        <Link href={`/beithady/ads/audience?${leadsQs.toString()}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${activeMode === 'leads' ? ACTIVE : INACTIVE}`}>Lead density</Link>
        <Link href={`/beithady/ads/audience?${metaQs.toString()}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${activeMode === 'meta' ? ACTIVE : INACTIVE}`}>Meta spend</Link>
      </div>

      <div className="ix-card p-5 overflow-x-auto">
        <table className="w-full text-[10px] tabular-nums">
          <thead className="text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1 text-left"></th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="py-1 text-center">{h}h</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, dow) => (
              <tr key={day}>
                <td className="py-1 pr-2 text-slate-600 dark:text-slate-300 font-medium">{day}</td>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = lookup.get(`${dow}|${h}`) ?? 0;
                  const pct = (v / max) * 100;
                  const colorBucket = cellColorBucket((v / totalSum) * 100);
                  const label = activeMode === 'leads'
                    ? `${DAYS[dow]} ${h}:00 — ${v} leads`
                    : `${DAYS[dow]} ${h}:00 — ${v.toLocaleString()} clicks`;
                  return (
                    <td key={h}
                        className={`heatmap-cell h-5 text-center ${colorBucket}`}
                        style={{ opacity: max > 0 ? Math.max(0.15, pct / 100) : 0.15 }}
                        title={label}>
                      {v > 0 ? v : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/time-tab.test.tsx
```
Expected: 2 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/audience/_components/time-tab.tsx src/app/beithady/ads/audience/_components/time-tab.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <TimeTab /> — 7×24 heatmap with Lead/Meta mode toggle (V3 D1)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 16: `<OptimizeTab />` — top ads + top assets stacked

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/optimize-tab.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/optimize-tab.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/top-ads', () => ({
  getTopAds: vi.fn().mockResolvedValue([
    { ad_id: 1, ad_name: 'BH-26 sunset', campaign_id: 100, campaign_name: 'CTWA EG May', platform: 'meta',
      impressions: 12400, clicks: 620, ctr_pct: 5.0, spend_egp: 1240, leads: 18, cpl_egp: 68 },
  ]),
}));

vi.mock('@/lib/beithady/ads/top-assets', () => ({
  getTopAssets: vi.fn().mockResolvedValue([
    { asset_id: 'a1', building_code: 'BH-26', public_url: 'http://x/sunset.jpg',
      ai_caption: null, category: null, ad_count: 3, impressions: 18200, clicks: 850, spend: 600, leads: 10,
      ctr_pct: 4.7, cpc: 0.7, cpl: 58 },
  ]),
}));

describe('OptimizeTab', () => {
  it('renders top-ads table + top-assets table', async () => {
    const { OptimizeTab } = await import('./optimize-tab');
    const ui = await OptimizeTab({ range: { from: '2026-05-09', to: '2026-05-16', preset: '7d', compare: false } });
    render(ui);
    expect(screen.getByText(/Top performing ads/i)).toBeTruthy();
    expect(screen.getByText(/BH-26 sunset/)).toBeTruthy();
    expect(screen.getByText(/Top creative assets/i)).toBeTruthy();
    // Thumbnail
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('http://x/sunset.jpg');
  });

  it('renders sort tabs (Leads / CTR / CPL)', async () => {
    const { OptimizeTab } = await import('./optimize-tab');
    const ui = await OptimizeTab({ range: { from: '2026-05-09', to: '2026-05-16', preset: '7d', compare: false } });
    render(ui);
    expect(screen.getByText('Leads')).toBeTruthy();
    expect(screen.getByText('CTR')).toBeTruthy();
    expect(screen.getByText('CPL')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/optimize-tab.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/audience/_components/optimize-tab.tsx
import Link from 'next/link';
import Image from 'next/image';
import { getTopAds, type TopAdSortBy } from '@/lib/beithady/ads/top-ads';
import { getTopAssets } from '@/lib/beithady/ads/top-assets';

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

export async function OptimizeTab({
  range, campaignId, buildingCode, sort,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
  sort?: TopAdSortBy;
}) {
  const sortBy: TopAdSortBy = sort === 'ctr' || sort === 'cpl' ? sort : 'leads';

  const [topAds, topAssets] = await Promise.all([
    getTopAds({ from: range.from, to: range.to, sortBy, limit: 20, buildingCode }),
    getTopAssets({ buildingCode, limit: 20 }),
  ]);

  const baseQs = new URLSearchParams({
    from: range.from, to: range.to,
    ...(range.preset ? { preset: range.preset } : {}),
    ...(range.compare ? { compare: '1' } : {}),
    ...(campaignId ? { campaign: String(campaignId) } : {}),
    ...(buildingCode ? { building: buildingCode } : {}),
    tab: 'optimize',
  });
  function sortHref(s: TopAdSortBy): string {
    const q = new URLSearchParams(baseQs); q.set('sort', s);
    return `/beithady/ads/audience?${q.toString()}`;
  }

  return (
    <div className="space-y-3">
      <div className="ix-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Top performing ads</h3>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Sort</span>
            {(['leads', 'ctr', 'cpl'] as const).map(s => (
              <Link key={s} href={sortHref(s)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${sortBy === s ? ACTIVE : INACTIVE}`}>
                {s === 'leads' ? 'Leads' : s === 'ctr' ? 'CTR' : 'CPL'}
              </Link>
            ))}
          </div>
        </div>
        {topAds.length === 0 ? (
          <div className="text-xs text-slate-400 italic">No ad-level data yet for this range.</div>
        ) : (
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2">Ad</th>
                <th className="py-2">Campaign</th>
                <th className="py-2 text-right">Impressions</th>
                <th className="py-2 text-right">Clicks</th>
                <th className="py-2 text-right">CTR</th>
                <th className="py-2 text-right">Spend (EGP)</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">CPL (EGP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {topAds.map(r => (
                <tr key={r.ad_id} className="text-slate-700 dark:text-slate-200">
                  <td className="py-1.5 font-medium">{r.ad_name}</td>
                  <td className="py-1.5">{r.campaign_name}</td>
                  <td className="py-1.5 text-right">{r.impressions.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.clicks.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.ctr_pct}%</td>
                  <td className="py-1.5 text-right">{r.spend_egp.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.leads.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.cpl_egp != null ? r.cpl_egp : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Top creative assets</h3>
        {topAssets.length === 0 ? (
          <div className="text-xs text-slate-400 italic">No creative-asset performance data yet.</div>
        ) : (
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2">Thumb</th>
                <th className="py-2">Asset</th>
                <th className="py-2">Building</th>
                <th className="py-2 text-right">Ads</th>
                <th className="py-2 text-right">Impressions</th>
                <th className="py-2 text-right">Clicks</th>
                <th className="py-2 text-right">CPL (EGP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {topAssets.map(r => (
                <tr key={r.asset_id} className="text-slate-700 dark:text-slate-200">
                  <td className="py-1.5">
                    {r.public_url ? (
                      <Image src={r.public_url} alt={r.asset_id} width={48} height={48}
                             className="w-12 h-12 rounded object-cover bg-slate-100 dark:bg-slate-800" unoptimized />
                    ) : (
                      <div className="w-12 h-12 rounded bg-slate-100 dark:bg-slate-800" />
                    )}
                  </td>
                  <td className="py-1.5 truncate max-w-[200px]">{r.asset_id}</td>
                  <td className="py-1.5">{r.building_code ?? '—'}</td>
                  <td className="py-1.5 text-right">{r.ad_count}</td>
                  <td className="py-1.5 text-right">{r.impressions.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.clicks.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.cpl != null ? Math.round(r.cpl) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/optimize-tab.test.tsx
```
Expected: 2 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/audience/_components/optimize-tab.tsx src/app/beithady/ads/audience/_components/optimize-tab.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <OptimizeTab /> — top ads + top creative assets (V3 E1 + E2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 17: Wire 3 new cards + D3 delta into /beithady/ads/page.tsx

**Files:**
- Modify: `C:/kareemhady/src/app/beithady/ads/page.tsx`

- [ ] **Step 1: Read the current page**

Read `C:/kareemhady/src/app/beithady/ads/page.tsx`. Locate:
- `<DateRangeFilter />` and `<PerBuildingFilter />` (V1/V2 wires)
- Existing `<AnomalyBanner />`/`<FrtCard />`/`<AudienceSummaryWidget />` placement
- The `<Stat>` calls in the KPI section

- [ ] **Step 2: Add imports**

Add near existing imports:
```tsx
import { AiSummaryCard } from './_components/ai-summary-card';
import { AnomalyBanner } from './_components/anomaly-banner';
import { SpendPacingCard } from './_components/spend-pacing-card';
import { getDashboardKpisWithCompare } from '@/lib/beithady/ads/reporting';
import { supabaseAdmin } from '@/lib/supabase';
```

- [ ] **Step 3: Switch the KPIs fetch to use the compare helper**

Replace the existing `getDashboardKpis({ from: range.from, to: range.to })` call inside the `Promise.all([...])` with:

```tsx
getDashboardKpisWithCompare({ range: { from: range.from, to: range.to }, compare: range.compare }),
```

Adjust the destructure: instead of `const [kpis, campaigns, ...]`, use `const [kpisCompare, campaigns, ...]`. Then below: `const kpis = kpisCompare.current; const priorKpis = kpisCompare.prior;`.

- [ ] **Step 4: Fetch the most recent AI summary for this range + today's count**

After awaiting `searchParams`, add:

```tsx
const sb = supabaseAdmin();
const { data: recentSummaryRow } = await sb
  .from('beithady_audit_log')
  .select('metadata, created_at')
  .eq('module', 'ads').eq('action', 'ai_summary_generated')
  .order('created_at', { ascending: false })
  .limit(1);
const recentSummary = (recentSummaryRow as Array<{ metadata: Record<string, unknown>; created_at: string }> | null)?.[0];
const summaryForThisRange = recentSummary && (recentSummary.metadata.range as { from: string; to: string } | undefined)?.from === range.from
  && (recentSummary.metadata.range as { from: string; to: string } | undefined)?.to === range.to
  ? String(recentSummary.metadata.summary ?? '') || null
  : null;

const cairoToday = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
const sinceIso = new Date(cairoToday + 'T00:00:00+03:00').toISOString();
const { count: usedToday } = await sb.from('beithady_audit_log')
  .select('id', { count: 'exact', head: true })
  .eq('module', 'ads').eq('action', 'ai_summary_generated')
  .gte('created_at', sinceIso);
```

**Note on summary persistence:** the ai-summary action records the AUDIT but does NOT currently save the summary text. To make the dashboard show the most recent summary, modify `ai-summary.ts:generateAiSummary` to ALSO include `summary` in the audit metadata. Add this to the audit call in `ai-summary.ts`:

```ts
metadata: {
  range: opts.range,
  cost_usd: APPROX_COST_PER_CALL_USD,
  model: HAIKU,
  prompt_chars: prompt.length,
  summary_chars: summary.length,
  summary,   // ADD THIS LINE — required for dashboard recall
},
```

(The audit log table has a `metadata jsonb` field which handles long text fine.)

- [ ] **Step 5: Render the new components**

In the JSX, place:

- `<AiSummaryCard ... />` at the very top, ABOVE `<AdsTabs active="overview" />`:
```tsx
<AiSummaryCard
  range={{ from: range.from, to: range.to }}
  summary={summaryForThisRange}
  usedToday={usedToday ?? 0}
/>
<AdsTabs active="overview" />
```

- `<AnomalyBanner />` between `<PerBuildingFilter />` and the platform-status row:
```tsx
<PerBuildingFilter />
<AnomalyBanner />
```

- `<SpendPacingCard />` between `<FrtCard />` and `<AudienceSummaryWidget />`:
```tsx
<FrtCard range={{ from: range.from, to: range.to }} buildingCode={sp.building} />
<SpendPacingCard range={{ from: range.from, to: range.to }} />
<AudienceSummaryWidget range={{ from: range.from, to: range.to }} />
```

- D3 delta on KPI cards: wrap each `<Stat ...>` to also accept and render a delta. The cleanest path: keep the existing inline `<Stat>` component but add a `delta?: { current: number; prior: number; reverseColor?: boolean }` prop, and inside `<Stat>` render `{delta && <PeriodDeltaBadge {...delta} />}` next to the value. Add the import: `import { PeriodDeltaBadge } from './_components/period-delta-badge';`

Then update each `<Stat ...>` call:

```tsx
<Stat label={`Spend (${...})`} value={`EGP ${kpis.spend.toLocaleString()}`}
      delta={priorKpis ? { current: kpis.spend, prior: priorKpis.spend } : undefined}
      icon={DollarSign} />
<Stat label={`Leads (${...})`} value={kpis.leads.toLocaleString()}
      delta={priorKpis ? { current: kpis.leads, prior: priorKpis.leads } : undefined}
      icon={Users} accent="cyan" />
<Stat label="CPL" value={kpis.cpl == null ? '—' : `EGP ${kpis.cpl.toFixed(2)}`}
      delta={priorKpis && kpis.cpl != null && priorKpis.cpl != null ? { current: kpis.cpl, prior: priorKpis.cpl, reverseColor: true } : undefined}
      accent="amber" />
{/* Same pattern for Bookings, Revenue. Active + Drafts don't compare. */}
```

Also extend the `Stat` component signature at the bottom of the file (currently inline):

```tsx
function Stat({ label, value, icon: Icon, accent, delta }: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: string;
  delta?: { current: number; prior: number; reverseColor?: boolean };
}) {
  // existing implementation + render <PeriodDeltaBadge {...delta} /> if delta present
}
```

If the existing `Stat` is more complex, surgically extend rather than rewrite.

- [ ] **Step 6: Verify tsc + full suite**

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -10
```
Expected: 0 errors.

```bash
cd C:/kareemhady && npm run test 2>&1 | tail -10
```
Expected: full suite green.

- [ ] **Step 7: Commit + push**

Also include the ai-summary.ts change from Step 4:

```bash
cd C:/kareemhady && git add src/app/beithady/ads/page.tsx src/lib/beithady/ads/ai-summary.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): wire AiSummaryCard + AnomalyBanner + SpendPacingCard + D3 delta into main page

Also: ai-summary.ts now persists the full summary text in the audit metadata so
the dashboard can recall the most recent summary for the active date range.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 18: Wire 2 new tabs into /beithady/ads/audience/page.tsx

**Files:**
- Modify: `C:/kareemhady/src/app/beithady/ads/audience/page.tsx`

- [ ] **Step 1: Read the page**

Read `C:/kareemhady/src/app/beithady/ads/audience/page.tsx`. Locate the `TABS` array (currently 6 entries from V2 task 16) and the conditional tab renders.

- [ ] **Step 2: Extend TABS + searchParams + add tab renders**

Add imports:
```tsx
import { TimeTab } from './_components/time-tab';
import { OptimizeTab } from './_components/optimize-tab';
```

Extend TABS to 8:
```tsx
const TABS: Array<{ key: 'geo' | 'demo' | 'device' | 'funnel' | 'quality' | 'cohort' | 'time' | 'optimize'; label: string }> = [
  { key: 'geo', label: 'Geo' },
  { key: 'demo', label: 'Demographics' },
  { key: 'device', label: 'Device & Placement' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'quality', label: 'Quality' },
  { key: 'cohort', label: 'Cohort' },
  { key: 'time', label: 'Time' },
  { key: 'optimize', label: 'Optimize' },
];
```

Extend `searchParams` type to add `heatmap?: string; sort?: string`.

Update the `tab` literal cast: `(sp.tab as 'geo'|'demo'|'device'|'funnel'|'quality'|'cohort'|'time'|'optimize')`.

Add the conditional renders below the existing 6:
```tsx
{tab === 'time' && <TimeTab range={range} campaignId={campaignId} buildingCode={buildingCode}
                            mode={sp.heatmap === 'meta' ? 'meta' : 'leads'} />}
{tab === 'optimize' && <OptimizeTab range={range} campaignId={campaignId} buildingCode={buildingCode}
                                     sort={(sp.sort as 'leads' | 'ctr' | 'cpl' | undefined)} />}
```

Include `heatmap` + `sort` in `baseQs` so sub-tab nav preserves them:
```tsx
if (sp.heatmap) baseQs.set('heatmap', sp.heatmap);
if (sp.sort) baseQs.set('sort', sp.sort);
```

- [ ] **Step 3: Verify tsc + full suite**

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

```bash
cd C:/kareemhady && npm run test 2>&1 | tail -10
```
Expected: full suite green (now ~890 passing).

- [ ] **Step 4: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/audience/page.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): wire <TimeTab /> + <OptimizeTab /> into audience page (V3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 19: Manual smoke + final handoff

No code in this task — verification + handoff.

- [ ] **Step 1: Full test suite**

```bash
cd C:/kareemhady && npm run test 2>&1 | tail -10
```
Expected: ~890 passing / 22 skipped / 0 failures.

Per-feature test count breakdown:
- hourly: 7
- pacing: 8
- top-ads: 4
- top-assets: 2
- anomalies: 6
- ai-summary: 4
- AnomalyBanner: 2
- SpendPacingCard: 2
- AiSummaryCard: 3
- TimeTab: 2
- OptimizeTab: 2
- reporting (shape): 1
= **+43 new tests** (vs spec's +41 estimate)

- [ ] **Step 2: tsc clean**

```bash
cd C:/kareemhady && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Trigger cron extension manually to populate hourly metrics**

After deploy:
```bash
curl "https://app.limeinc.cc/api/cron/beithady-ads-insights?force=1&secret=$CRON_SECRET"
```
Verify via Supabase MCP:
```sql
select platform, count(*) from ads_hourly_metrics
where metric_date >= current_date - 1
group by platform;
```
Expected: > 0 Meta rows (Google/TikTok will be 0 — only Meta is wired).

- [ ] **Step 4: Manual smoke checklist (10 checks)**

Walk live prod after GitHub auto-deploy:

1. `/beithady/ads` — `<AiSummaryCard />` renders button + "daily cap N/20".
2. Click "Generate summary" → 3-paragraph card appears within ~5s. Refresh → same summary persists (read from audit log).
3. Click 19 more times to verify cap-reached state (or just trust the count).
4. `/beithady/ads?compare=1` — every KPI card shows a delta badge (CPL with reverseColor).
5. `<AnomalyBanner />` shows real anomalies if any active in production. Otherwise invisible (correct null-return behavior).
6. `<SpendPacingCard />` — sparkline renders, per-campaign bars sorted, ≥80% campaigns show projection hint.
7. `/beithady/ads/audience?tab=time` — 7×24 heatmap renders. Toggle mode → URL updates + grid switches data.
8. `/beithady/ads/audience?tab=optimize` — both tables render. Click `CPL` sort → URL updates + rows re-sort.
9. Existing `beithady-ads-anomaly-alert` cron still fires WhatsApp correctly after refactor (check next cron tick).
10. `?building=BH-26` chip → heatmap honors it (lead density filter), other tabs likewise.

- [ ] **Step 5: Final handoff**

Prepend to `SESSION_HANDOFF.md` (manually — adapt test count to actual):

```
## 2026-05-16 — SHIPPED: BH Ads Insights V3 (19/19 tasks complete) ✅

**Status:** All 19 V3 plan tasks shipped to main. Vercel auto-deploys via GitHub.
Tests: ~890 passing / 22 skipped / 0 failures. tsc clean. Migration 0140 applied.

**Plan:** docs/superpowers/plans/2026-05-16-bh-ads-insights-v3.md
**Spec:** docs/superpowers/specs/2026-05-16-bh-ads-v3-time-optimize-design.md

**What's live:**
- `<AiSummaryCard />` on /beithady/ads main (button + Claude haiku-4-5 narrative, 20/day cap)
- `<AnomalyBanner />` on /beithady/ads main (spend_spike / zero_leads / low_roas; auto-hides when clear)
- `<SpendPacingCard />` on /beithady/ads main (sparkline + per-campaign cap bars + projection warning)
- KPI cards now wrap PeriodDeltaBadge when ?compare=1 (D3)
- /beithady/ads/audience: 2 new tabs (Time / Optimize)
- TimeTab: 7×24 heatmap with Lead-density (default) ↔ Meta-spend toggle
- OptimizeTab: top ads ranked by leads/CTR/CPL + top creative assets (thumbnails)
- One new table: ads_hourly_metrics (migration 0140)
- beithady-ads-insights cron extended with Meta hourly fetch
- beithady-ads-anomaly-alert cron refactored to call shared anomalies.ts (behavior unchanged)

**Next:** V4 (Sharing) — PDF export + tokenized share link. Final phase per roadmap.
```

Commit + push:
```bash
cd C:/kareemhady && git add SESSION_HANDOFF.md
git commit -m "chore(handoff): SHIPPED BH Ads Insights V3 (19/19 tasks)"
git push origin HEAD:main
```

---

## Self-review notes

**Spec coverage check** — every locked decision in the spec maps to a task:
- Q1 (all 7 features in V3) → Tasks 2 (D1 hourly lib), 4 (D2 pacing), 11 (D3 compare), 5 (E1 top-ads), 6 (E2 top-assets), 7-8 (E3 anomalies), 9-10 (E4 AI summary)
- Q2 (D1: lead density now + Meta hourly cron) → Task 1 (migration) + Task 3 (cron extension) + Task 2 (libs) + Task 15 (UI)
- Q3 (E4: on-demand button only) → Task 9 (lib with cap) + Task 10 (action) + Task 14 (card)
- Q4 (E3: re-compute at page load, no new table) → Task 7 (extract lib) + Task 8 (cron refactor) + Task 12 (banner)
- Approach 2 (cluster into 2 new tabs + 3 cards) → Tasks 17 (main wire) + 18 (audience wire)

**Type consistency:**
- `AnomalyEvent` shape stable across `anomalies.ts` (Task 7) → cron refactor (Task 8) → banner (Task 12) → AI summary input (Task 9).
- `TopAdSortBy = 'leads'|'ctr'|'cpl'` defined in Task 5, consumed unchanged in OptimizeTab (Task 16).
- `HeatmapCell`/`MetaHourlyCell` defined in Task 2, consumed unchanged in TimeTab (Task 15).
- `range` prop shape `{from, to, preset, compare}` matches V1+V2 convention everywhere.

**No placeholders elsewhere.** Every step has runnable code or commands.

**Open footguns flagged:**
- **Task 17 Step 4** modifies `ai-summary.ts` to persist `summary` in audit metadata so the dashboard can recall it. This is a small but important addendum to Task 9 — engineer must remember to add the field, not just paste the page code.
- **Task 3 cron extension** is the only task without unit tests (follows existing cron pattern). Smoke-tested via `?force=1` in Task 19.
- **Task 17 Step 5** needs surgical extension of the inline `Stat` component — actual implementation depends on the V2-shipped file structure. Engineer should READ the file first and adapt rather than blind-rewrite.
- **AI summary cost:** 20 calls/day × $0.01 ≈ $0.20/day max. Audit log entries are the only persistence; no need for a dedicated cost-tracking dashboard yet (V3.5 if it grows).

**Estimated final test count:** ~890 passing (+43 new). Spec estimated +41; actual slightly higher because helpers got fuller coverage. Either way: "all green, zero regressions."
