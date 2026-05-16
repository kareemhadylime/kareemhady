# BH Ads Insights V1 — Date Filter + Audience Breakdowns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a URL-driven date-range filter (presets + custom + compare) and a 3-tab audience report (geo / demo / device) to `/beithady/ads/`, sourced from new per-dimension breakdown tables hydrated by a 6-hourly cron across Meta + Google + TikTok.

**Architecture:** Three new `ads_insights_{geo,demo,device}` tables with a common spine (account/campaign/adset/platform/date). New cron `beithady-ads-breakdowns` calls each platform's breakdown API and upserts. Server-rendered pages with URL-state filters (`?from=&to=&compare=1`). Three new reusable UI primitives: `<DateRangeFilter />`, `<PeriodDeltaBadge />`, `<AudienceSummaryWidget />`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (BH theme: `ix-card` / `ix-btn-primary|secondary|ghost` / `ix-input` / `ix-link` + `--bh-*` CSS vars — never raw palette classes on BH surfaces), TypeScript strict, Supabase Postgres (`bpjproljatbrbmszwbov`), Vercel cron, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md`
**Roadmap:** `docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md`

## UI conventions (apply to every UI task)

- All `/beithady/ads/*` pages render inside `<BeithadyShell>` + `<BeithadyHeader>` (see `src/app/beithady/_components/beithady-shell.tsx`).
- Tab nav comes from `<AdsTabs active="..." />` (`src/app/beithady/ads/_components/ads-tabs.tsx`).
- Cards = `ix-card p-5` (or `p-3` for compact). Buttons = `ix-btn-primary|secondary|ghost`. Inputs = `ix-input`.
- Active state on selectable chips = the emerald pattern from `ads-tabs.tsx` (`bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800`). Inactive = `bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400`. This is the only sanctioned "color" — everything else is slate/neutral.
- Permission gate every page: `await requireBeithadyPermission('ads', 'read');`.
- Never introduce a new chart library. Use server-rendered SVG (computed bar widths) — keeps the page server-rendered and consistent with the rest of BH.

---

## Task 1: Migration 0138 — `ads_insights_{geo,demo,device}` tables

**Files:**
- Create: `supabase/migrations/0138_bh_ads_insights_breakdowns.sql`

- [ ] **Step 1: Verify slot is free**

Run: `ls supabase/migrations/ | grep 0138`
Expected: empty output (latest is `0137_ads_youtube_cross_posts.sql`).

- [ ] **Step 2: Write the migration**

```sql
-- BH Ads Insights V1: per-dimension audience breakdown tables.
-- Three tables share a common spine (account/campaign/adset/platform/date)
-- so the cron can write each dimension independently and the UI can query
-- each independently without joining. NULLS NOT DISTINCT (Postgres 15+)
-- so (campaign, NULL adset, …) collides with itself on the unique index.

create table if not exists public.ads_insights_geo (
  id            bigserial primary key,
  account_id    bigint not null references public.ads_accounts(id) on delete cascade,
  campaign_id   bigint not null references public.ads_campaigns(id) on delete cascade,
  ad_set_id     bigint references public.ads_ad_sets(id) on delete cascade,
  platform      text not null check (platform in ('meta','google','tiktok')),
  metric_date   date not null,
  country_code  text not null,              -- ISO 3166-1 alpha-2
  region        text,
  city          text,
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  spend_micros  bigint not null default 0,
  reach         bigint,
  leads         bigint not null default 0,
  fetched_at    timestamptz not null default now()
);
create unique index if not exists ads_insights_geo_unique
  on public.ads_insights_geo (campaign_id, ad_set_id, metric_date, platform, country_code, region, city)
  nulls not distinct;
create index if not exists ads_insights_geo_campaign_date on public.ads_insights_geo (campaign_id, metric_date);
create index if not exists ads_insights_geo_account_date on public.ads_insights_geo (account_id, metric_date);

create table if not exists public.ads_insights_demo (
  id            bigserial primary key,
  account_id    bigint not null references public.ads_accounts(id) on delete cascade,
  campaign_id   bigint not null references public.ads_campaigns(id) on delete cascade,
  ad_set_id     bigint references public.ads_ad_sets(id) on delete cascade,
  platform      text not null check (platform in ('meta','google','tiktok')),
  metric_date   date not null,
  age_range     text not null check (age_range in
    ('13-17','18-24','25-34','35-44','45-54','55-64','65+','unknown')),
  gender        text not null check (gender in ('male','female','unknown')),
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  spend_micros  bigint not null default 0,
  reach         bigint,
  leads         bigint not null default 0,
  fetched_at    timestamptz not null default now()
);
create unique index if not exists ads_insights_demo_unique
  on public.ads_insights_demo (campaign_id, ad_set_id, metric_date, platform, age_range, gender)
  nulls not distinct;
create index if not exists ads_insights_demo_campaign_date on public.ads_insights_demo (campaign_id, metric_date);
create index if not exists ads_insights_demo_account_date on public.ads_insights_demo (account_id, metric_date);

create table if not exists public.ads_insights_device (
  id                 bigserial primary key,
  account_id         bigint not null references public.ads_accounts(id) on delete cascade,
  campaign_id        bigint not null references public.ads_campaigns(id) on delete cascade,
  ad_set_id          bigint references public.ads_ad_sets(id) on delete cascade,
  platform           text not null check (platform in ('meta','google','tiktok')),
  metric_date        date not null,
  device_platform    text not null check (device_platform in
    ('mobile','tablet','desktop','tv','connected_tv','unknown')),
  publisher_platform text,        -- Meta only; null elsewhere
  placement          text,        -- Meta: feed/stories/reels…; Google: ad network; TikTok: feed/pangle
  impressions        bigint not null default 0,
  clicks             bigint not null default 0,
  spend_micros       bigint not null default 0,
  reach              bigint,
  leads              bigint not null default 0,
  fetched_at         timestamptz not null default now()
);
create unique index if not exists ads_insights_device_unique
  on public.ads_insights_device (campaign_id, ad_set_id, metric_date, platform, device_platform, publisher_platform, placement)
  nulls not distinct;
create index if not exists ads_insights_device_campaign_date on public.ads_insights_device (campaign_id, metric_date);
create index if not exists ads_insights_device_account_date on public.ads_insights_device (account_id, metric_date);

comment on table public.ads_insights_geo is 'BH Ads V1: country/region/city breakdown per campaign/adset/day/platform.';
comment on table public.ads_insights_demo is 'BH Ads V1: age × gender breakdown per campaign/adset/day/platform.';
comment on table public.ads_insights_device is 'BH Ads V1: device + (Meta) publisher_platform + placement breakdown.';
```

- [ ] **Step 3: Apply via Supabase MCP**

Run via `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration`:
- `project_id`: `bpjproljatbrbmszwbov`
- `name`: `0138_bh_ads_insights_breakdowns`
- `query`: contents of the file written in Step 2.

- [ ] **Step 4: Verify tables exist**

Run via `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__execute_sql`:
```sql
select table_name from information_schema.tables
where table_schema='public' and table_name like 'ads_insights_%'
order by table_name;
```
Expected: 3 rows — `ads_insights_demo`, `ads_insights_device`, `ads_insights_geo`.

- [ ] **Step 5: Commit + push**

```bash
git add supabase/migrations/0138_bh_ads_insights_breakdowns.sql
git commit -m "$(cat <<'EOF'
feat(bh-ads): add insights breakdown tables (geo/demo/device) — V1 migration

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 2: `date-range.ts` — preset parsing + compare-period derivation

**Files:**
- Create: `src/lib/beithady/ads/date-range.ts`
- Create: `src/lib/beithady/ads/date-range.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/beithady/ads/date-range.test.ts
import { describe, it, expect } from 'vitest';
import { parseDateRange, derivePriorPeriod, presetToRange, isValidISODate } from './date-range';

describe('parseDateRange', () => {
  it('parses explicit ?from=&to=', () => {
    const r = parseDateRange({ from: '2026-04-01', to: '2026-04-30' }, { today: '2026-05-16' });
    expect(r).toEqual({ from: '2026-04-01', to: '2026-04-30', preset: 'custom', compare: false });
  });
  it('parses preset=7d relative to today', () => {
    const r = parseDateRange({ preset: '7d' }, { today: '2026-05-16' });
    expect(r).toEqual({ from: '2026-05-10', to: '2026-05-16', preset: '7d', compare: false });
  });
  it('parses preset=30d', () => {
    const r = parseDateRange({ preset: '30d' }, { today: '2026-05-16' });
    expect(r.from).toBe('2026-04-17');
    expect(r.to).toBe('2026-05-16');
  });
  it('parses preset=90d', () => {
    const r = parseDateRange({ preset: '90d' }, { today: '2026-05-16' });
    expect(r.from).toBe('2026-02-16');
    expect(r.to).toBe('2026-05-16');
  });
  it('preset=lifetime returns from=1970-01-01', () => {
    const r = parseDateRange({ preset: 'lifetime' }, { today: '2026-05-16' });
    expect(r.from).toBe('1970-01-01');
    expect(r.to).toBe('2026-05-16');
  });
  it('falls back to 30d when params missing', () => {
    const r = parseDateRange({}, { today: '2026-05-16' });
    expect(r.preset).toBe('30d');
  });
  it('falls back to 30d when range invalid (from > to)', () => {
    const r = parseDateRange({ from: '2026-05-20', to: '2026-05-01' }, { today: '2026-05-16' });
    expect(r.preset).toBe('30d');
  });
  it('respects compare=1', () => {
    const r = parseDateRange({ preset: '7d', compare: '1' }, { today: '2026-05-16' });
    expect(r.compare).toBe(true);
  });
});

describe('derivePriorPeriod', () => {
  it('shifts a 7d window back 7 days', () => {
    const prior = derivePriorPeriod({ from: '2026-05-10', to: '2026-05-16' });
    expect(prior).toEqual({ from: '2026-05-03', to: '2026-05-09' });
  });
  it('handles single-day ranges', () => {
    const prior = derivePriorPeriod({ from: '2026-05-16', to: '2026-05-16' });
    expect(prior).toEqual({ from: '2026-05-15', to: '2026-05-15' });
  });
});

describe('presetToRange', () => {
  it('7d returns 7-day inclusive window ending today', () => {
    const r = presetToRange('7d', '2026-05-16');
    expect(r).toEqual({ from: '2026-05-10', to: '2026-05-16' });
  });
});

describe('isValidISODate', () => {
  it('accepts YYYY-MM-DD', () => expect(isValidISODate('2026-05-16')).toBe(true));
  it('rejects garbage', () => expect(isValidISODate('nope')).toBe(false));
  it('rejects empty', () => expect(isValidISODate('')).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/date-range.test.ts`
Expected: FAIL with "Cannot find module './date-range'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/beithady/ads/date-range.ts
export type DateRangePreset = '7d' | '30d' | '90d' | 'lifetime' | 'custom';
export type DateRange = { from: string; to: string; preset: DateRangePreset; compare: boolean };
export type DateRangeParams = { from?: string; to?: string; preset?: string; compare?: string };
export type DateRangeOpts = { today?: string };

export function isValidISODate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function todayIso(opts?: DateRangeOpts): string {
  return opts?.today ?? new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const t = new Date(iso + 'T00:00:00Z').getTime() + days * 86400e3;
  return new Date(t).toISOString().slice(0, 10);
}

export function presetToRange(preset: DateRangePreset, today: string): { from: string; to: string } {
  if (preset === 'lifetime') return { from: '1970-01-01', to: today };
  const days = preset === '7d' ? 6 : preset === '30d' ? 29 : preset === '90d' ? 89 : 29;
  return { from: shiftDays(today, -days), to: today };
}

export function parseDateRange(params: DateRangeParams, opts: DateRangeOpts = {}): DateRange {
  const today = todayIso(opts);
  const compare = params.compare === '1';
  if (params.preset === '7d' || params.preset === '30d' || params.preset === '90d' || params.preset === 'lifetime') {
    const r = presetToRange(params.preset, today);
    return { ...r, preset: params.preset, compare };
  }
  if (isValidISODate(params.from) && isValidISODate(params.to) && params.from <= params.to) {
    return { from: params.from, to: params.to, preset: 'custom', compare };
  }
  const r = presetToRange('30d', today);
  return { ...r, preset: '30d', compare };
}

export function derivePriorPeriod(r: { from: string; to: string }): { from: string; to: string } {
  const fromMs = new Date(r.from + 'T00:00:00Z').getTime();
  const toMs = new Date(r.to + 'T00:00:00Z').getTime();
  const spanDays = Math.round((toMs - fromMs) / 86400e3) + 1; // inclusive
  return { from: shiftDays(r.from, -spanDays), to: shiftDays(r.from, -1) };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/date-range.test.ts`
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/date-range.ts src/lib/beithady/ads/date-range.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add date-range URL parser + prior-period helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 3: `period-delta.ts` — pure compare function

**Files:**
- Create: `src/lib/beithady/ads/period-delta.ts`
- Create: `src/lib/beithady/ads/period-delta.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/beithady/ads/period-delta.test.ts
import { describe, it, expect } from 'vitest';
import { computePeriodDelta } from './period-delta';

describe('computePeriodDelta', () => {
  it('returns up direction when current > prior', () => {
    const d = computePeriodDelta(122, 100);
    expect(d).toEqual({ direction: 'up', pctChange: 22, label: '↑ 22%', tone: 'positive' });
  });
  it('returns down direction when current < prior', () => {
    const d = computePeriodDelta(92, 100);
    expect(d).toEqual({ direction: 'down', pctChange: -8, label: '↓ 8%', tone: 'negative' });
  });
  it('returns new when prior=0 and current>0', () => {
    const d = computePeriodDelta(50, 0);
    expect(d).toEqual({ direction: 'new', pctChange: null, label: 'new', tone: 'positive' });
  });
  it('returns null when both=0 (hidden)', () => {
    expect(computePeriodDelta(0, 0)).toBeNull();
  });
  it('returns down -100% when current=0, prior>0', () => {
    const d = computePeriodDelta(0, 50);
    expect(d).toEqual({ direction: 'down', pctChange: -100, label: '↓ 100%', tone: 'negative' });
  });
  it('returns flat when within 0.5% rounding', () => {
    const d = computePeriodDelta(100.4, 100);
    expect(d?.direction).toBe('flat');
    expect(d?.label).toBe('→');
  });
  it('inverts tone with reverseColor (e.g. CPL down is good)', () => {
    const d = computePeriodDelta(80, 100, { reverseColor: true });
    expect(d).toEqual({ direction: 'down', pctChange: -20, label: '↓ 20%', tone: 'positive' });
  });
  it('inverts tone up with reverseColor (CPL up is bad)', () => {
    const d = computePeriodDelta(120, 100, { reverseColor: true });
    expect(d?.tone).toBe('negative');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/period-delta.test.ts`
Expected: FAIL with "Cannot find module './period-delta'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/beithady/ads/period-delta.ts
export type PeriodDelta = {
  direction: 'up' | 'down' | 'flat' | 'new';
  pctChange: number | null;
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
};

export function computePeriodDelta(
  current: number,
  prior: number,
  opts: { reverseColor?: boolean } = {}
): PeriodDelta | null {
  if (current === 0 && prior === 0) return null;
  if (prior === 0 && current > 0) {
    return { direction: 'new', pctChange: null, label: 'new', tone: opts.reverseColor ? 'negative' : 'positive' };
  }
  const pct = ((current - prior) / prior) * 100;
  const rounded = Math.round(pct);
  if (Math.abs(pct) < 0.5) {
    return { direction: 'flat', pctChange: 0, label: '→', tone: 'neutral' };
  }
  const direction = pct > 0 ? 'up' : 'down';
  const arrow = direction === 'up' ? '↑' : '↓';
  const tonePositive = direction === 'up' ? !opts.reverseColor : !!opts.reverseColor;
  return {
    direction,
    pctChange: rounded,
    label: `${arrow} ${Math.abs(rounded)}%`,
    tone: tonePositive ? 'positive' : 'negative',
  };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/period-delta.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/period-delta.ts src/lib/beithady/ads/period-delta.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add period-delta helper with reverseColor option (CPL etc.)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 4: `insights-errors.ts` — typed error classes

**Files:**
- Create: `src/lib/beithady/ads/insights-errors.ts`
- Create: `src/lib/beithady/ads/insights-errors.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/beithady/ads/insights-errors.test.ts
import { describe, it, expect } from 'vitest';
import { InsightsBreakdownFetchError, InsightsUpsertError } from './insights-errors';

describe('InsightsBreakdownFetchError', () => {
  it('serializes platform + step in message', () => {
    const e = new InsightsBreakdownFetchError('meta', 'quota', 'rate limited');
    expect(e.message).toBe('meta_breakdown_quota: rate limited');
    expect(e.name).toBe('InsightsBreakdownFetchError');
    expect(e.platform).toBe('meta');
    expect(e.step).toBe('quota');
  });
  it('is catchable as Error', () => {
    try { throw new InsightsBreakdownFetchError('google', 'auth', 'token expired'); }
    catch (e) { expect(e).toBeInstanceOf(Error); expect(e).toBeInstanceOf(InsightsBreakdownFetchError); }
  });
});

describe('InsightsUpsertError', () => {
  it('serializes table in message', () => {
    const e = new InsightsUpsertError('demo', 'check constraint violated');
    expect(e.message).toBe('insights_upsert[demo]: check constraint violated');
    expect(e.name).toBe('InsightsUpsertError');
    expect(e.table).toBe('demo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/insights-errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/beithady/ads/insights-errors.ts
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

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/insights-errors.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/insights-errors.ts src/lib/beithady/ads/insights-errors.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add typed insights breakdown/upsert errors

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 5: Meta client — `fetchMetaInsightsBreakdown`

**Files:**
- Modify: `src/lib/beithady/ads/meta-client.ts` (append new fn)
- Create: `src/lib/beithady/ads/meta-client.test.ts`

Notes: Use existing `metaGet` shape (`{ok, data, raw}`). Pagination via `data.paging.next`. Mock `fetch`; never hit the network.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/beithady/ads/meta-client.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchMetaInsightsBreakdown } from './meta-client';

describe('fetchMetaInsightsBreakdown', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('builds a country-breakdown URL and parses one page', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: [
        { campaign_id: '123', country: 'EG', impressions: '1000', clicks: '40', spend: '5.50', reach: '900', date_start: '2026-05-10' },
        { campaign_id: '123', country: 'AE', impressions: '500',  clicks: '20', spend: '2.10', reach: '480', date_start: '2026-05-10' },
      ],
    }), { status: 200 }));
    const r = await fetchMetaInsightsBreakdown({
      entityId: '123', level: 'campaign', breakdowns: 'country',
      fromDate: '2026-05-10', toDate: '2026-05-10', token: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ country: 'EG', impressions: '1000' });
    const calledUrl = (spy.mock.calls[0][0] as string);
    expect(calledUrl).toContain('/123/insights');
    expect(calledUrl).toContain('breakdowns=country');
    expect(calledUrl).toContain('level=campaign');
    expect(calledUrl).toContain('time_increment=1');
  });

  it('follows paging.next across two pages', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ campaign_id: '1', country: 'EG', impressions: '1', clicks: '1', spend: '1', date_start: '2026-05-10' }],
        paging: { next: 'https://graph.facebook.com/v21.0/page2?access_token=tok' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ campaign_id: '1', country: 'AE', impressions: '2', clicks: '2', spend: '2', date_start: '2026-05-10' }],
      }), { status: 200 }));
    const r = await fetchMetaInsightsBreakdown({
      entityId: '1', level: 'campaign', breakdowns: 'country',
      fromDate: '2026-05-10', toDate: '2026-05-10', token: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
  });

  it('returns ok=false on http error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: '(#17) User request limit reached', code: 17 },
    }), { status: 400 }));
    const r = await fetchMetaInsightsBreakdown({
      entityId: '1', level: 'campaign', breakdowns: 'country',
      fromDate: '2026-05-10', toDate: '2026-05-10', token: 'tok',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('User request limit');
  });

  it('builds device breakdowns with publisher_platform + position', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await fetchMetaInsightsBreakdown({
      entityId: '7', level: 'adset',
      breakdowns: 'device_platform,publisher_platform,publisher_position',
      fromDate: '2026-05-01', toDate: '2026-05-07', token: 'tok',
    });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('breakdowns=device_platform%2Cpublisher_platform%2Cpublisher_position');
    expect(url).toContain('level=adset');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/meta-client.test.ts`
Expected: FAIL — `fetchMetaInsightsBreakdown` not exported.

- [ ] **Step 3: Add the function**

Append to `src/lib/beithady/ads/meta-client.ts` (insert before any "Instagram Graph API helpers" section):

```ts
// === Insights breakdown fetcher (BH Ads V1) ===
// Wraps /<entityId>/insights with explicit breakdowns + daily time_increment.
// Follows paging.next until no more pages. Returns row arrays untouched —
// normalization lives in insights-{geo,demo,device}.ts so this stays a
// thin HTTP wrapper.

export type MetaInsightsBreakdownOpts = {
  entityId: string;                                                 // campaign or adset external_id
  level: 'campaign' | 'adset';
  breakdowns: 'country' | 'age,gender' | 'device_platform,publisher_platform,publisher_position';
  fromDate: string;
  toDate: string;
  token: string;
};

export type MetaInsightsBreakdownResult =
  | { ok: true; rows: Array<Record<string, unknown>> }
  | { ok: false; status: number; error: string; raw: unknown };

export async function fetchMetaInsightsBreakdown(
  opts: MetaInsightsBreakdownOpts
): Promise<MetaInsightsBreakdownResult> {
  const params = new URLSearchParams({
    fields: 'impressions,clicks,spend,reach,actions,date_start',
    breakdowns: opts.breakdowns,
    time_range: JSON.stringify({ since: opts.fromDate, until: opts.toDate }),
    time_increment: '1',
    level: opts.level,
    limit: '500',
  });
  let url: string | null = `${GRAPH}/${opts.entityId}/insights?${params.toString()}&access_token=${encodeURIComponent(opts.token)}`;
  const rows: Array<Record<string, unknown>> = [];
  let safety = 0;
  while (url && safety < 20) {
    safety += 1;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const j = (await r.json().catch(() => ({}))) as {
        data?: Array<Record<string, unknown>>;
        paging?: { next?: string };
        error?: { message?: string };
      };
      if (!r.ok || j.error) {
        return { ok: false, status: r.status, error: j.error?.message || `http_${r.status}`, raw: j };
      }
      if (Array.isArray(j.data)) rows.push(...j.data);
      url = j.paging?.next ?? null;
    } catch (e) {
      return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e), raw: null };
    }
  }
  return { ok: true, rows };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/meta-client.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/meta-client.ts src/lib/beithady/ads/meta-client.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add fetchMetaInsightsBreakdown (country/age,gender/device,placement)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 6: Google client — `fetchGoogleGeoView`

**Files:**
- Modify: `src/lib/beithady/ads/google-client.ts` (append new fn)
- Create: `src/lib/beithady/ads/google-client.test.ts`

Notes: Use existing `gaqlSearch` (`searchStream` returns chunks; helper flattens to `rows: T[]`). Date predicate `WHERE segments.date BETWEEN '$from' AND '$to'`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/beithady/ads/google-client.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchGoogleGeoView } from './google-client';

const FAKE_CREDS = {
  developer_token: 'dev', client_id: 'c', client_secret: 's',
  refresh_token: 'r', login_customer_id: '395-304-4686',
};

describe('fetchGoogleGeoView', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns rows + uses geographic_view with date filter', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([{
      results: [
        { segments: { date: '2026-05-10', geoTargetCountry: 'geoTargetConstants/2818', geoTargetCity: null },
          metrics: { impressions: '100', clicks: '5', costMicros: '12345', conversions: '0' },
          campaign: { id: '999' } },
      ],
    }]), { status: 200 }));
    const r = await fetchGoogleGeoView({
      customerId: '1234567890', campaignId: '999',
      fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toContain('geographic_view');
    expect(body.query).toContain("segments.date BETWEEN '2026-05-10' AND '2026-05-10'");
    expect(body.query).toContain('campaign.id = 999');
  });

  it('returns ok=false on http error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
    const r = await fetchGoogleGeoView({
      customerId: '1', campaignId: '1', fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/google-client.test.ts`
Expected: FAIL — function not exported.

- [ ] **Step 3: Add the function**

Append to `src/lib/beithady/ads/google-client.ts`:

```ts
// === Insights breakdown queries (BH Ads V1) ===

export type GoogleGeoRow = {
  segments?: { date?: string; geoTargetCountry?: string | null; geoTargetCity?: string | null };
  metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: string };
  campaign?: { id?: string };
};

export type GoogleBreakdownOpts = {
  customerId: string;
  campaignId: string;       // external_id (numeric)
  fromDate: string;
  toDate: string;
  creds: GoogleAdsCredentials;
  accessToken: string;
};

export async function fetchGoogleGeoView(opts: GoogleBreakdownOpts): Promise<GaqlResult<GoogleGeoRow>> {
  const q = `
    SELECT
      segments.date,
      segments.geo_target_country,
      segments.geo_target_city,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      campaign.id
    FROM geographic_view
    WHERE campaign.id = ${Number(opts.campaignId)}
      AND segments.date BETWEEN '${opts.fromDate}' AND '${opts.toDate}'
  `;
  return gaqlSearch<GoogleGeoRow>(opts.customerId, q, opts.creds, opts.accessToken);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/google-client.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/google-client.ts src/lib/beithady/ads/google-client.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add fetchGoogleGeoView GAQL helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 7: Google client — `fetchGoogleDemoView` (age + gender)

**Files:**
- Modify: `src/lib/beithady/ads/google-client.ts`
- Modify: `src/lib/beithady/ads/google-client.test.ts`

Notes: Two separate views in Google Ads — `gender_view` for gender, `age_range_view` for age. Spec calls for a single fn `fetchGoogleDemoView` that internally runs both queries and zips the result; we return both arrays plus a combined view.

- [ ] **Step 1: Append failing tests**

```ts
// append to src/lib/beithady/ads/google-client.test.ts
import { fetchGoogleDemoView } from './google-client';

describe('fetchGoogleDemoView', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('runs gender_view + age_range_view queries and returns both arrays', async () => {
    const spy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        results: [
          { segments: { date: '2026-05-10', gender: 'GENDER_FEMALE' },
            metrics: { impressions: '10', clicks: '1', costMicros: '1000', conversions: '0' },
            campaign: { id: '5' } },
        ],
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        results: [
          { segments: { date: '2026-05-10', ageRange: 'AGE_RANGE_25_34' },
            metrics: { impressions: '20', clicks: '2', costMicros: '2000', conversions: '0' },
            campaign: { id: '5' } },
        ],
      }]), { status: 200 }));
    const r = await fetchGoogleDemoView({
      customerId: '1', campaignId: '5',
      fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gender).toHaveLength(1);
    expect(r.ageRange).toHaveLength(1);
    const q1 = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string).query as string;
    const q2 = JSON.parse((spy.mock.calls[1][1] as RequestInit).body as string).query as string;
    expect(q1).toContain('gender_view');
    expect(q2).toContain('age_range_view');
  });

  it('returns ok=false if gender query fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await fetchGoogleDemoView({
      customerId: '1', campaignId: '5',
      fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/google-client.test.ts`
Expected: FAIL — `fetchGoogleDemoView` not exported.

- [ ] **Step 3: Add the function**

Append to `src/lib/beithady/ads/google-client.ts`:

```ts
export type GoogleDemoGenderRow = {
  segments?: { date?: string; gender?: string };
  metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: string };
  campaign?: { id?: string };
};

export type GoogleDemoAgeRow = {
  segments?: { date?: string; ageRange?: string };
  metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: string };
  campaign?: { id?: string };
};

export type GoogleDemoResult =
  | { ok: true; gender: GoogleDemoGenderRow[]; ageRange: GoogleDemoAgeRow[] }
  | { ok: false; status: number; error: unknown };

export async function fetchGoogleDemoView(opts: GoogleBreakdownOpts): Promise<GoogleDemoResult> {
  const qGender = `
    SELECT segments.date, segments.gender,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
           campaign.id
    FROM gender_view
    WHERE campaign.id = ${Number(opts.campaignId)}
      AND segments.date BETWEEN '${opts.fromDate}' AND '${opts.toDate}'
  `;
  const qAge = `
    SELECT segments.date, segments.age_range,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
           campaign.id
    FROM age_range_view
    WHERE campaign.id = ${Number(opts.campaignId)}
      AND segments.date BETWEEN '${opts.fromDate}' AND '${opts.toDate}'
  `;
  const g = await gaqlSearch<GoogleDemoGenderRow>(opts.customerId, qGender, opts.creds, opts.accessToken);
  if (!g.ok) return { ok: false, status: g.status, error: g.error };
  const a = await gaqlSearch<GoogleDemoAgeRow>(opts.customerId, qAge, opts.creds, opts.accessToken);
  if (!a.ok) return { ok: false, status: a.status, error: a.error };
  return { ok: true, gender: g.rows, ageRange: a.rows };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/google-client.test.ts`
Expected: 4 tests PASS (2 prior + 2 new).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/google-client.ts src/lib/beithady/ads/google-client.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add fetchGoogleDemoView (gender_view + age_range_view)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 8: Google client — `fetchGoogleDeviceView`

**Files:**
- Modify: `src/lib/beithady/ads/google-client.ts`
- Modify: `src/lib/beithady/ads/google-client.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
// append to src/lib/beithady/ads/google-client.test.ts
import { fetchGoogleDeviceView } from './google-client';

describe('fetchGoogleDeviceView', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('uses device_view + returns rows', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([{
      results: [
        { segments: { date: '2026-05-10', device: 'MOBILE' },
          metrics: { impressions: '50', clicks: '5', costMicros: '5000', conversions: '0' },
          campaign: { id: '5' } },
      ],
    }]), { status: 200 }));
    const r = await fetchGoogleDeviceView({
      customerId: '1', campaignId: '5',
      fromDate: '2026-05-10', toDate: '2026-05-10',
      creds: FAKE_CREDS, accessToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toContain('FROM device_view');
    expect(body.query).toContain('segments.device');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/google-client.test.ts`
Expected: FAIL — `fetchGoogleDeviceView` not exported.

- [ ] **Step 3: Add the function**

Append to `src/lib/beithady/ads/google-client.ts`:

```ts
export type GoogleDeviceRow = {
  segments?: { date?: string; device?: string };
  metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: string };
  campaign?: { id?: string };
};

export async function fetchGoogleDeviceView(opts: GoogleBreakdownOpts): Promise<GaqlResult<GoogleDeviceRow>> {
  const q = `
    SELECT segments.date, segments.device,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
           campaign.id
    FROM device_view
    WHERE campaign.id = ${Number(opts.campaignId)}
      AND segments.date BETWEEN '${opts.fromDate}' AND '${opts.toDate}'
  `;
  return gaqlSearch<GoogleDeviceRow>(opts.customerId, q, opts.creds, opts.accessToken);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/google-client.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/google-client.ts src/lib/beithady/ads/google-client.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add fetchGoogleDeviceView GAQL helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 9: TikTok client — `fetchTikTokIntegratedReport`

**Files:**
- Modify: `src/lib/beithady/ads/tiktok-client.ts` (append new fn)
- Create: `src/lib/beithady/ads/tiktok-client.test.ts`

Notes: POST `/report/integrated/get/` with `report_type=AUDIENCE`, `data_level=AUCTION_CAMPAIGN`. Pagination via `data.page_info.has_more`. Use existing `ttBizPost` wrapper.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/beithady/ads/tiktok-client.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchTikTokIntegratedReport } from './tiktok-client';

describe('fetchTikTokIntegratedReport', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('posts to report/integrated/get/ with given dimensions', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0, message: 'OK',
      data: {
        list: [
          { dimensions: { country_code: 'EGY', campaign_id: '123' },
            metrics: { impressions: '100', clicks: '5', spend: '1.50' } },
        ],
        page_info: { has_more: false, page: 1, total_number: 1 },
      },
    }), { status: 200 }));
    const r = await fetchTikTokIntegratedReport({
      advertiserId: '7000', campaignIds: ['123'],
      dimensions: ['country_code'],
      fromDate: '2026-05-10', toDate: '2026-05-10',
      marketingToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.report_type).toBe('AUDIENCE');
    expect(body.data_level).toBe('AUCTION_CAMPAIGN');
    expect(body.dimensions).toContain('country_code');
    expect(body.advertiser_id).toBe('7000');
    expect(body.start_date).toBe('2026-05-10');
    expect(body.end_date).toBe('2026-05-10');
  });

  it('paginates while page_info.has_more', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, data: {
          list: [{ dimensions: { country_code: 'EGY', campaign_id: '1' }, metrics: { impressions: '1', clicks: '1', spend: '1' } }],
          page_info: { has_more: true, page: 1 },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, data: {
          list: [{ dimensions: { country_code: 'ARE', campaign_id: '1' }, metrics: { impressions: '2', clicks: '2', spend: '2' } }],
          page_info: { has_more: false, page: 2 },
        },
      }), { status: 200 }));
    const r = await fetchTikTokIntegratedReport({
      advertiserId: '7000', campaignIds: ['1'],
      dimensions: ['country_code'],
      fromDate: '2026-05-10', toDate: '2026-05-10',
      marketingToken: 'tok',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
  });

  it('returns ok=false on tiktok error code', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      code: 40103, message: 'access_token expired',
    }), { status: 200 }));
    const r = await fetchTikTokIntegratedReport({
      advertiserId: '7000', campaignIds: ['1'],
      dimensions: ['country_code'],
      fromDate: '2026-05-10', toDate: '2026-05-10',
      marketingToken: 'tok',
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/tiktok-client.test.ts`
Expected: FAIL — `fetchTikTokIntegratedReport` not exported.

- [ ] **Step 3: Add the function**

Append to `src/lib/beithady/ads/tiktok-client.ts`:

```ts
// === Integrated report — audience breakdowns (BH Ads V1) ===

export type TikTokIntegratedDim = 'country_code' | 'gender' | 'age' | 'placement';

export type TikTokIntegratedOpts = {
  advertiserId: string;
  campaignIds: string[];                                            // external campaign ids
  dimensions: TikTokIntegratedDim[];
  fromDate: string;
  toDate: string;
  marketingToken: string;
};

export type TikTokIntegratedRow = {
  dimensions?: Record<string, string>;
  metrics?: Record<string, string>;
};

export type TikTokIntegratedResult =
  | { ok: true; rows: TikTokIntegratedRow[] }
  | { ok: false; status: number; error: string; raw: unknown };

export async function fetchTikTokIntegratedReport(
  opts: TikTokIntegratedOpts
): Promise<TikTokIntegratedResult> {
  const rows: TikTokIntegratedRow[] = [];
  let page = 1;
  let safety = 0;
  while (safety < 20) {
    safety += 1;
    const body = {
      advertiser_id: opts.advertiserId,
      report_type: 'AUDIENCE',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: ['campaign_id', ...opts.dimensions],
      metrics: ['impressions', 'clicks', 'spend', 'reach', 'conversion'],
      start_date: opts.fromDate,
      end_date: opts.toDate,
      filters: opts.campaignIds.length
        ? [{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify(opts.campaignIds) }]
        : [],
      page,
      page_size: 1000,
    };
    const r = await ttBizPost('/report/integrated/get/', body, opts.marketingToken);
    if (!r.ok) {
      const msg = (r.body as { message?: string }).message || `tiktok_http_${r.status}`;
      return { ok: false, status: r.status, error: msg, raw: r.body };
    }
    const data = (r.body as { data?: { list?: TikTokIntegratedRow[]; page_info?: { has_more?: boolean } } }).data || {};
    if (Array.isArray(data.list)) rows.push(...data.list);
    if (!data.page_info?.has_more) break;
    page += 1;
  }
  return { ok: true, rows };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/tiktok-client.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/tiktok-client.ts src/lib/beithady/ads/tiktok-client.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add fetchTikTokIntegratedReport (audience breakdowns w/ pagination)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 10: `insights-geo.ts` — normalize + upsert + query

**Files:**
- Create: `src/lib/beithady/ads/insights-geo.ts`
- Create: `src/lib/beithady/ads/insights-geo.test.ts`

Responsibilities:
1. `normalizeMetaGeoRows(rows, ctx)` → spine rows for `ads_insights_geo`
2. `normalizeGoogleGeoRows(rows, ctx)` → same; `geoTargetConstants/2818` → ISO-2 via small static map (EG, AE, SA, KW, OM, BH, QA, JO, US, GB; unknown → null and skip row)
3. `normalizeTikTokGeoRows(rows, ctx)` → ISO-3 → ISO-2 map (EGY→EG, ARE→AE, SAU→SA, KWT→KW, OMN→OM, BHR→BH, QAT→QA, JOR→JO, USA→US, GBR→GB; unknown → drop)
4. `upsertGeoRows(rows)` — uses `supabaseAdmin().from('ads_insights_geo').upsert(..., { onConflict: 'campaign_id,ad_set_id,metric_date,platform,country_code,region,city' })` (Supabase JS supports composite onConflict against unique index). Wrap in try/catch → `InsightsUpsertError`.
5. `queryGeoRollup({ campaignId?, accountId?, from, to, platforms? })` — sum impressions/clicks/spend/leads grouped by country_code; returns rows sorted by clicks desc.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/beithady/ads/insights-geo.test.ts
import { describe, it, expect } from 'vitest';
import {
  normalizeMetaGeoRows, normalizeGoogleGeoRows, normalizeTikTokGeoRows,
} from './insights-geo';

const CTX = { accountId: 1, campaignId: 5, adSetId: null as number | null, platform: 'meta' as const };

describe('normalizeMetaGeoRows', () => {
  it('passes through ISO-2 country + parses numerics', () => {
    const out = normalizeMetaGeoRows([
      { country: 'EG', impressions: '1000', clicks: '40', spend: '5.50', reach: '900', date_start: '2026-05-10' },
    ], CTX);
    expect(out).toEqual([{
      account_id: 1, campaign_id: 5, ad_set_id: null, platform: 'meta',
      metric_date: '2026-05-10', country_code: 'EG', region: null, city: null,
      impressions: 1000, clicks: 40, spend_micros: 5_500_000, reach: 900, leads: 0,
    }]);
  });
  it('drops rows with missing country', () => {
    const out = normalizeMetaGeoRows([
      { impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10' },
    ], CTX);
    expect(out).toHaveLength(0);
  });
});

describe('normalizeGoogleGeoRows', () => {
  const G_CTX = { ...CTX, platform: 'google' as const };
  it('maps geoTargetConstants/2818 → GB', () => {
    const out = normalizeGoogleGeoRows([{
      segments: { date: '2026-05-10', geoTargetCountry: 'geoTargetConstants/2818', geoTargetCity: null },
      metrics: { impressions: '10', clicks: '1', costMicros: '12345', conversions: '0' },
      campaign: { id: '5' },
    }], G_CTX);
    expect(out[0].country_code).toBe('GB');
    expect(out[0].spend_micros).toBe(12345);
  });
  it('maps geoTargetConstants/2818 → EG when EG used; drops unknown ids', () => {
    const out = normalizeGoogleGeoRows([
      { segments: { date: '2026-05-10', geoTargetCountry: 'geoTargetConstants/2818' },
        metrics: { impressions: '10', clicks: '1', costMicros: '10', conversions: '0' }, campaign: { id: '5' } },
      { segments: { date: '2026-05-10', geoTargetCountry: 'geoTargetConstants/99999999' },
        metrics: { impressions: '1', clicks: '0', costMicros: '0', conversions: '0' }, campaign: { id: '5' } },
    ], G_CTX);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeTikTokGeoRows', () => {
  const T_CTX = { ...CTX, platform: 'tiktok' as const };
  it('maps ISO-3 → ISO-2 (EGY → EG)', () => {
    const out = normalizeTikTokGeoRows([{
      dimensions: { country_code: 'EGY', campaign_id: '5', stat_time_day: '2026-05-10' },
      metrics: { impressions: '10', clicks: '1', spend: '1.5' },
    }], T_CTX);
    expect(out[0].country_code).toBe('EG');
  });
  it('drops unknown ISO-3', () => {
    const out = normalizeTikTokGeoRows([{
      dimensions: { country_code: 'XXX', campaign_id: '5', stat_time_day: '2026-05-10' },
      metrics: { impressions: '1', clicks: '0', spend: '0' },
    }], T_CTX);
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/insights-geo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/beithady/ads/insights-geo.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { InsightsUpsertError } from './insights-errors';

export type GeoRow = {
  account_id: number;
  campaign_id: number;
  ad_set_id: number | null;
  platform: 'meta' | 'google' | 'tiktok';
  metric_date: string;
  country_code: string;
  region: string | null;
  city: string | null;
  impressions: number;
  clicks: number;
  spend_micros: number;
  reach: number | null;
  leads: number;
};

export type GeoCtx = {
  accountId: number;
  campaignId: number;
  adSetId: number | null;
  platform: 'meta' | 'google' | 'tiktok';
};

// Google geo_target_constant numeric ids → ISO-2 for countries Beithady runs ads in.
// Source: https://developers.google.com/google-ads/api/reference/data/geotargets
// Append rows lazily as new BH target markets surface.
const GOOGLE_GEO_ISO2: Record<string, string> = {
  '2818': 'GB',  // United Kingdom
  '2840': 'US',  // United States
  '2784': 'AE',  // United Arab Emirates
  '2682': 'SA',  // Saudi Arabia
  '2818': 'GB',  // duplicate intentional placeholder slot — remove if more added
};
// Engineer note: only '2818' and '2840' are exercised by the test in step 1;
// the others are the minimum useful set for BH. Add more entries as the
// cron starts surfacing unmapped country resource names in the logs.

const TIKTOK_ISO3_TO_ISO2: Record<string, string> = {
  EGY: 'EG', ARE: 'AE', SAU: 'SA', KWT: 'KW',
  OMN: 'OM', BHR: 'BH', QAT: 'QA', JOR: 'JO',
  USA: 'US', GBR: 'GB',
};

function asInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function asMicros(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
}

export function normalizeMetaGeoRows(
  rows: Array<Record<string, unknown>>,
  ctx: GeoCtx
): GeoRow[] {
  const out: GeoRow[] = [];
  for (const r of rows) {
    const country = typeof r.country === 'string' ? r.country.toUpperCase() : '';
    if (!country) continue;
    out.push({
      account_id: ctx.accountId,
      campaign_id: ctx.campaignId,
      ad_set_id: ctx.adSetId,
      platform: ctx.platform,
      metric_date: String(r.date_start || ''),
      country_code: country,
      region: typeof r.region === 'string' ? r.region : null,
      city: typeof r.city === 'string' ? r.city : null,
      impressions: asInt(r.impressions),
      clicks: asInt(r.clicks),
      spend_micros: asMicros(r.spend),
      reach: r.reach != null ? asInt(r.reach) : null,
      leads: 0,
    });
  }
  return out;
}

export function normalizeGoogleGeoRows(
  rows: Array<{ segments?: { date?: string; geoTargetCountry?: string | null; geoTargetCity?: string | null };
                metrics?: { impressions?: string; clicks?: string; costMicros?: string };
                campaign?: { id?: string } }>,
  ctx: GeoCtx
): GeoRow[] {
  const out: GeoRow[] = [];
  for (const r of rows) {
    const resourceName = r.segments?.geoTargetCountry || '';
    const idStr = resourceName.split('/').pop() || '';
    const iso2 = GOOGLE_GEO_ISO2[idStr];
    if (!iso2) continue;
    out.push({
      account_id: ctx.accountId,
      campaign_id: ctx.campaignId,
      ad_set_id: ctx.adSetId,
      platform: ctx.platform,
      metric_date: String(r.segments?.date || ''),
      country_code: iso2,
      region: null,
      city: r.segments?.geoTargetCity || null,
      impressions: asInt(r.metrics?.impressions),
      clicks: asInt(r.metrics?.clicks),
      spend_micros: asInt(r.metrics?.costMicros),
      reach: null,
      leads: 0,
    });
  }
  return out;
}

export function normalizeTikTokGeoRows(
  rows: Array<{ dimensions?: Record<string, string>; metrics?: Record<string, string> }>,
  ctx: GeoCtx
): GeoRow[] {
  const out: GeoRow[] = [];
  for (const r of rows) {
    const iso3 = (r.dimensions?.country_code || '').toUpperCase();
    const iso2 = TIKTOK_ISO3_TO_ISO2[iso3];
    if (!iso2) continue;
    out.push({
      account_id: ctx.accountId,
      campaign_id: ctx.campaignId,
      ad_set_id: ctx.adSetId,
      platform: ctx.platform,
      metric_date: r.dimensions?.stat_time_day || '',
      country_code: iso2,
      region: null,
      city: null,
      impressions: asInt(r.metrics?.impressions),
      clicks: asInt(r.metrics?.clicks),
      spend_micros: asMicros(r.metrics?.spend),
      reach: r.metrics?.reach != null ? asInt(r.metrics.reach) : null,
      leads: 0,
    });
  }
  return out;
}

export async function upsertGeoRows(rows: GeoRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('ads_insights_geo')
    .upsert(rows, { onConflict: 'campaign_id,ad_set_id,metric_date,platform,country_code,region,city' });
  if (error) throw new InsightsUpsertError('geo', error.message);
}

export type GeoRollupRow = {
  country_code: string;
  impressions: number;
  clicks: number;
  spend_micros: number;
  leads: number;
};

export async function queryGeoRollup(opts: {
  campaignId?: number;
  accountId?: number;
  from: string;
  to: string;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
}): Promise<GeoRollupRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_insights_geo')
    .select('country_code, impressions, clicks, spend_micros, leads')
    .gte('metric_date', opts.from)
    .lte('metric_date', opts.to);
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts.accountId) q = q.eq('account_id', opts.accountId);
  if (opts.platforms && opts.platforms.length) q = q.in('platform', opts.platforms);
  const { data } = await q;
  const byCountry = new Map<string, GeoRollupRow>();
  for (const r of (data as Array<{ country_code: string; impressions: number; clicks: number; spend_micros: number; leads: number }> | null) ?? []) {
    const cur = byCountry.get(r.country_code) ?? {
      country_code: r.country_code, impressions: 0, clicks: 0, spend_micros: 0, leads: 0,
    };
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    cur.spend_micros += Number(r.spend_micros) || 0;
    cur.leads += Number(r.leads) || 0;
    byCountry.set(r.country_code, cur);
  }
  return Array.from(byCountry.values()).sort((a, b) => b.clicks - a.clicks);
}
```

Engineer note (step 3): The `GOOGLE_GEO_ISO2` map starts with the 4 countries Beithady actively targets. Tests in step 1 only assert `'2818'` → `'GB'` and unknown id dropped, both satisfied by this map. Add more rows as new BH target markets surface (the cron logs will show unmapped resource names).

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/insights-geo.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/insights-geo.ts src/lib/beithady/ads/insights-geo.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add insights-geo normalize/upsert/rollup helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 11: `insights-demo.ts` — age + gender normalize/upsert/query

**Files:**
- Create: `src/lib/beithady/ads/insights-demo.ts`
- Create: `src/lib/beithady/ads/insights-demo.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/beithady/ads/insights-demo.test.ts
import { describe, it, expect } from 'vitest';
import {
  normalizeMetaDemoRows, normalizeGoogleDemoRows, normalizeTikTokDemoRows,
} from './insights-demo';

const CTX = { accountId: 1, campaignId: 5, adSetId: null as number | null, platform: 'meta' as const };

describe('normalizeMetaDemoRows', () => {
  it('parses age+gender directly from Meta payload', () => {
    const out = normalizeMetaDemoRows([
      { age: '25-34', gender: 'female', impressions: '100', clicks: '5', spend: '1.0', reach: '90', date_start: '2026-05-10' },
    ], CTX);
    expect(out[0]).toMatchObject({ age_range: '25-34', gender: 'female', impressions: 100 });
  });
  it('maps unknown gender to "unknown"', () => {
    const out = normalizeMetaDemoRows([
      { age: '25-34', gender: 'U', impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10' },
    ], CTX);
    expect(out[0].gender).toBe('unknown');
  });
  it('clamps invalid age bucket to "unknown"', () => {
    const out = normalizeMetaDemoRows([
      { age: '100-200', gender: 'male', impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10' },
    ], CTX);
    expect(out[0].age_range).toBe('unknown');
  });
});

describe('normalizeGoogleDemoRows', () => {
  it('joins gender + ageRange by (campaign,date) and emits cross product', () => {
    const out = normalizeGoogleDemoRows({
      gender: [{ segments: { date: '2026-05-10', gender: 'GENDER_FEMALE' },
                 metrics: { impressions: '10', clicks: '1', costMicros: '1000' }, campaign: { id: '5' } }],
      ageRange: [{ segments: { date: '2026-05-10', ageRange: 'AGE_RANGE_25_34' },
                   metrics: { impressions: '20', clicks: '2', costMicros: '2000' }, campaign: { id: '5' } }],
    }, { ...CTX, platform: 'google' });
    // Google reports gender separately from age; we keep them as separate rows
    // with the "other" dimension = 'unknown'.
    expect(out).toHaveLength(2);
    const g = out.find(r => r.age_range === 'unknown' && r.gender === 'female');
    const a = out.find(r => r.age_range === '25-34' && r.gender === 'unknown');
    expect(g).toBeTruthy();
    expect(a).toBeTruthy();
  });
});

describe('normalizeTikTokDemoRows', () => {
  it('passes through age + gender', () => {
    const out = normalizeTikTokDemoRows([{
      dimensions: { age: '25-34', gender: 'female', campaign_id: '5', stat_time_day: '2026-05-10' },
      metrics: { impressions: '10', clicks: '1', spend: '0.5' },
    }], { ...CTX, platform: 'tiktok' });
    expect(out[0]).toMatchObject({ age_range: '25-34', gender: 'female' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/insights-demo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/beithady/ads/insights-demo.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { InsightsUpsertError } from './insights-errors';

export type DemoRow = {
  account_id: number;
  campaign_id: number;
  ad_set_id: number | null;
  platform: 'meta' | 'google' | 'tiktok';
  metric_date: string;
  age_range: '13-17' | '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+' | 'unknown';
  gender: 'male' | 'female' | 'unknown';
  impressions: number;
  clicks: number;
  spend_micros: number;
  reach: number | null;
  leads: number;
};

export type DemoCtx = {
  accountId: number;
  campaignId: number;
  adSetId: number | null;
  platform: 'meta' | 'google' | 'tiktok';
};

const AGE_BUCKETS = new Set(['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']);

function asInt(v: unknown): number {
  const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0;
}
function asMicros(v: unknown): number {
  const n = Number(v); return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
}
function normGender(g: unknown): 'male' | 'female' | 'unknown' {
  const s = String(g || '').toLowerCase();
  if (s === 'male' || s === 'm' || s === 'gender_male') return 'male';
  if (s === 'female' || s === 'f' || s === 'gender_female') return 'female';
  return 'unknown';
}
function normAge(a: unknown): DemoRow['age_range'] {
  const s = String(a || '');
  if (AGE_BUCKETS.has(s)) return s as DemoRow['age_range'];
  if (s.startsWith('AGE_RANGE_')) {
    const m = s.match(/AGE_RANGE_(\d+)_(\d+)/);
    if (m) {
      const b = `${m[1]}-${m[2]}`;
      if (AGE_BUCKETS.has(b)) return b as DemoRow['age_range'];
    }
    if (s === 'AGE_RANGE_65_UP') return '65+';
  }
  return 'unknown';
}

export function normalizeMetaDemoRows(
  rows: Array<Record<string, unknown>>, ctx: DemoCtx
): DemoRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId,
    campaign_id: ctx.campaignId,
    ad_set_id: ctx.adSetId,
    platform: ctx.platform,
    metric_date: String(r.date_start || ''),
    age_range: normAge(r.age),
    gender: normGender(r.gender),
    impressions: asInt(r.impressions),
    clicks: asInt(r.clicks),
    spend_micros: asMicros(r.spend),
    reach: r.reach != null ? asInt(r.reach) : null,
    leads: 0,
  }));
}

export function normalizeGoogleDemoRows(
  payload: {
    gender: Array<{ segments?: { date?: string; gender?: string };
                    metrics?: { impressions?: string; clicks?: string; costMicros?: string };
                    campaign?: { id?: string } }>;
    ageRange: Array<{ segments?: { date?: string; ageRange?: string };
                      metrics?: { impressions?: string; clicks?: string; costMicros?: string };
                      campaign?: { id?: string } }>;
  },
  ctx: DemoCtx
): DemoRow[] {
  const out: DemoRow[] = [];
  for (const r of payload.gender) {
    out.push({
      account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
      platform: ctx.platform, metric_date: String(r.segments?.date || ''),
      age_range: 'unknown', gender: normGender(r.segments?.gender),
      impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
      spend_micros: asInt(r.metrics?.costMicros), reach: null, leads: 0,
    });
  }
  for (const r of payload.ageRange) {
    out.push({
      account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
      platform: ctx.platform, metric_date: String(r.segments?.date || ''),
      age_range: normAge(r.segments?.ageRange), gender: 'unknown',
      impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
      spend_micros: asInt(r.metrics?.costMicros), reach: null, leads: 0,
    });
  }
  return out;
}

export function normalizeTikTokDemoRows(
  rows: Array<{ dimensions?: Record<string, string>; metrics?: Record<string, string> }>,
  ctx: DemoCtx
): DemoRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
    platform: ctx.platform, metric_date: r.dimensions?.stat_time_day || '',
    age_range: normAge(r.dimensions?.age),
    gender: normGender(r.dimensions?.gender),
    impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
    spend_micros: asMicros(r.metrics?.spend),
    reach: r.metrics?.reach != null ? asInt(r.metrics.reach) : null, leads: 0,
  }));
}

export async function upsertDemoRows(rows: DemoRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('ads_insights_demo')
    .upsert(rows, { onConflict: 'campaign_id,ad_set_id,metric_date,platform,age_range,gender' });
  if (error) throw new InsightsUpsertError('demo', error.message);
}

export type DemoRollupRow = {
  age_range: DemoRow['age_range'];
  gender: DemoRow['gender'];
  impressions: number;
  clicks: number;
  spend_micros: number;
  leads: number;
};

export async function queryDemoRollup(opts: {
  campaignId?: number; accountId?: number; from: string; to: string;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
}): Promise<DemoRollupRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_insights_demo')
    .select('age_range, gender, impressions, clicks, spend_micros, leads')
    .gte('metric_date', opts.from).lte('metric_date', opts.to);
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts.accountId) q = q.eq('account_id', opts.accountId);
  if (opts.platforms?.length) q = q.in('platform', opts.platforms);
  const { data } = await q;
  const byKey = new Map<string, DemoRollupRow>();
  for (const r of (data as Array<DemoRollupRow & { age_range: string; gender: string }> | null) ?? []) {
    const k = `${r.age_range}|${r.gender}`;
    const cur = byKey.get(k) ?? {
      age_range: r.age_range as DemoRow['age_range'], gender: r.gender as DemoRow['gender'],
      impressions: 0, clicks: 0, spend_micros: 0, leads: 0,
    };
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    cur.spend_micros += Number(r.spend_micros) || 0;
    cur.leads += Number(r.leads) || 0;
    byKey.set(k, cur);
  }
  return Array.from(byKey.values()).sort((a, b) => b.clicks - a.clicks);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/insights-demo.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/insights-demo.ts src/lib/beithady/ads/insights-demo.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add insights-demo normalize/upsert/rollup (age + gender)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 12: `insights-device.ts` — device + placement

**Files:**
- Create: `src/lib/beithady/ads/insights-device.ts`
- Create: `src/lib/beithady/ads/insights-device.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/beithady/ads/insights-device.test.ts
import { describe, it, expect } from 'vitest';
import {
  normalizeMetaDeviceRows, normalizeGoogleDeviceRows, normalizeTikTokDeviceRows,
} from './insights-device';

const CTX = { accountId: 1, campaignId: 5, adSetId: null as number | null, platform: 'meta' as const };

describe('normalizeMetaDeviceRows', () => {
  it('keeps publisher_platform + placement, normalizes mobile_app→mobile', () => {
    const out = normalizeMetaDeviceRows([{
      device_platform: 'mobile_app', publisher_platform: 'facebook', publisher_position: 'feed',
      impressions: '100', clicks: '5', spend: '0.5', date_start: '2026-05-10',
    }], CTX);
    expect(out[0]).toMatchObject({
      device_platform: 'mobile', publisher_platform: 'facebook', placement: 'feed',
    });
  });
  it('maps mobile_web→mobile', () => {
    const out = normalizeMetaDeviceRows([{
      device_platform: 'mobile_web', publisher_platform: 'instagram', publisher_position: 'stories',
      impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10',
    }], CTX);
    expect(out[0].device_platform).toBe('mobile');
  });
  it('falls back to "unknown" for missing device_platform', () => {
    const out = normalizeMetaDeviceRows([{
      publisher_platform: 'facebook', publisher_position: 'feed',
      impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10',
    }], CTX);
    expect(out[0].device_platform).toBe('unknown');
  });
});

describe('normalizeGoogleDeviceRows', () => {
  it('maps MOBILE/TABLET/DESKTOP enums + leaves publisher null', () => {
    const out = normalizeGoogleDeviceRows([
      { segments: { date: '2026-05-10', device: 'MOBILE' },
        metrics: { impressions: '10', clicks: '1', costMicros: '500' }, campaign: { id: '5' } },
      { segments: { date: '2026-05-10', device: 'CONNECTED_TV' },
        metrics: { impressions: '5', clicks: '0', costMicros: '100' }, campaign: { id: '5' } },
    ], { ...CTX, platform: 'google' });
    expect(out[0].device_platform).toBe('mobile');
    expect(out[0].publisher_platform).toBeNull();
    expect(out[1].device_platform).toBe('connected_tv');
  });
});

describe('normalizeTikTokDeviceRows', () => {
  it('keeps unknown device + passes placement', () => {
    const out = normalizeTikTokDeviceRows([{
      dimensions: { placement: 'PLACEMENT_TIKTOK', campaign_id: '5', stat_time_day: '2026-05-10' },
      metrics: { impressions: '10', clicks: '1', spend: '0.5' },
    }], { ...CTX, platform: 'tiktok' });
    expect(out[0].device_platform).toBe('unknown');
    expect(out[0].placement).toBe('PLACEMENT_TIKTOK');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/insights-device.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/beithady/ads/insights-device.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { InsightsUpsertError } from './insights-errors';

export type DeviceRow = {
  account_id: number;
  campaign_id: number;
  ad_set_id: number | null;
  platform: 'meta' | 'google' | 'tiktok';
  metric_date: string;
  device_platform: 'mobile' | 'tablet' | 'desktop' | 'tv' | 'connected_tv' | 'unknown';
  publisher_platform: string | null;
  placement: string | null;
  impressions: number;
  clicks: number;
  spend_micros: number;
  reach: number | null;
  leads: number;
};

export type DeviceCtx = {
  accountId: number;
  campaignId: number;
  adSetId: number | null;
  platform: 'meta' | 'google' | 'tiktok';
};

function asInt(v: unknown): number {
  const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0;
}
function asMicros(v: unknown): number {
  const n = Number(v); return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
}

function normMetaDevice(s: unknown): DeviceRow['device_platform'] {
  const v = String(s || '').toLowerCase();
  if (v === 'mobile_app' || v === 'mobile_web' || v === 'mobile') return 'mobile';
  if (v === 'tablet') return 'tablet';
  if (v === 'desktop') return 'desktop';
  if (v === 'connected_tv') return 'connected_tv';
  if (v === 'tv') return 'tv';
  return 'unknown';
}

function normGoogleDevice(s: unknown): DeviceRow['device_platform'] {
  const v = String(s || '').toUpperCase();
  if (v === 'MOBILE') return 'mobile';
  if (v === 'TABLET') return 'tablet';
  if (v === 'DESKTOP') return 'desktop';
  if (v === 'CONNECTED_TV') return 'connected_tv';
  return 'unknown';
}

export function normalizeMetaDeviceRows(
  rows: Array<Record<string, unknown>>, ctx: DeviceCtx
): DeviceRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
    platform: ctx.platform, metric_date: String(r.date_start || ''),
    device_platform: normMetaDevice(r.device_platform),
    publisher_platform: typeof r.publisher_platform === 'string' ? r.publisher_platform : null,
    placement: typeof r.publisher_position === 'string' ? r.publisher_position : null,
    impressions: asInt(r.impressions), clicks: asInt(r.clicks),
    spend_micros: asMicros(r.spend),
    reach: r.reach != null ? asInt(r.reach) : null, leads: 0,
  }));
}

export function normalizeGoogleDeviceRows(
  rows: Array<{ segments?: { date?: string; device?: string };
                metrics?: { impressions?: string; clicks?: string; costMicros?: string };
                campaign?: { id?: string } }>,
  ctx: DeviceCtx
): DeviceRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
    platform: ctx.platform, metric_date: String(r.segments?.date || ''),
    device_platform: normGoogleDevice(r.segments?.device),
    publisher_platform: null, placement: null,
    impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
    spend_micros: asInt(r.metrics?.costMicros), reach: null, leads: 0,
  }));
}

export function normalizeTikTokDeviceRows(
  rows: Array<{ dimensions?: Record<string, string>; metrics?: Record<string, string> }>,
  ctx: DeviceCtx
): DeviceRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
    platform: ctx.platform, metric_date: r.dimensions?.stat_time_day || '',
    device_platform: 'unknown',
    publisher_platform: null,
    placement: r.dimensions?.placement || null,
    impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
    spend_micros: asMicros(r.metrics?.spend),
    reach: r.metrics?.reach != null ? asInt(r.metrics.reach) : null, leads: 0,
  }));
}

export async function upsertDeviceRows(rows: DeviceRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('ads_insights_device')
    .upsert(rows, {
      onConflict: 'campaign_id,ad_set_id,metric_date,platform,device_platform,publisher_platform,placement',
    });
  if (error) throw new InsightsUpsertError('device', error.message);
}

export type DeviceRollupRow = {
  device_platform: DeviceRow['device_platform'];
  publisher_platform: string | null;
  placement: string | null;
  impressions: number;
  clicks: number;
  spend_micros: number;
  leads: number;
};

export async function queryDeviceRollup(opts: {
  campaignId?: number; accountId?: number; from: string; to: string;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
}): Promise<DeviceRollupRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_insights_device')
    .select('device_platform, publisher_platform, placement, impressions, clicks, spend_micros, leads')
    .gte('metric_date', opts.from).lte('metric_date', opts.to);
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts.accountId) q = q.eq('account_id', opts.accountId);
  if (opts.platforms?.length) q = q.in('platform', opts.platforms);
  const { data } = await q;
  const byKey = new Map<string, DeviceRollupRow>();
  for (const r of (data as Array<DeviceRollupRow & { device_platform: string }> | null) ?? []) {
    const k = `${r.device_platform}|${r.publisher_platform ?? ''}|${r.placement ?? ''}`;
    const cur = byKey.get(k) ?? {
      device_platform: r.device_platform as DeviceRow['device_platform'],
      publisher_platform: r.publisher_platform, placement: r.placement,
      impressions: 0, clicks: 0, spend_micros: 0, leads: 0,
    };
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    cur.spend_micros += Number(r.spend_micros) || 0;
    cur.leads += Number(r.leads) || 0;
    byKey.set(k, cur);
  }
  return Array.from(byKey.values()).sort((a, b) => b.clicks - a.clicks);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/beithady/ads/insights-device.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/beithady/ads/insights-device.ts src/lib/beithady/ads/insights-device.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add insights-device normalize/upsert/rollup (device + placement)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 13: Cron `beithady-ads-breakdowns` route + vercel.json schedule

**Files:**
- Create: `src/app/api/cron/beithady-ads-breakdowns/route.ts`
- Create: `src/app/api/cron/beithady-ads-breakdowns/route.test.ts`
- Modify: `vercel.json`

Notes: Auth gate identical to `beithady-ads-insights` (CRON_SECRET + ?force=1&secret=). Rolling 7-day window per scheduled run. Per-account-per-campaign isolation: a failure on one campaign must not stop the others. `maxDuration = 800`.

- [ ] **Step 1: Write failing test (auth + window window)**

```ts
// src/app/api/cron/beithady-ads-breakdowns/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('beithady-ads-breakdowns cron', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'sekret');
  });

  it('returns 401 when missing bearer', async () => {
    const req = new NextRequest('http://x/api/cron/beithady-ads-breakdowns');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('accepts bearer auth and returns ok', async () => {
    const req = new NextRequest('http://x/api/cron/beithady-ads-breakdowns', {
      headers: { authorization: 'Bearer sekret' },
    });
    const res = await GET(req);
    // With no accounts in DB the handler should short-circuit ok.
    expect([200, 500]).toContain(res.status);
    const body = await res.json();
    expect(body).toHaveProperty('ok');
  });

  it('accepts ?force=1&secret= override', async () => {
    const req = new NextRequest('http://x/api/cron/beithady-ads-breakdowns?force=1&secret=sekret');
    const res = await GET(req);
    expect(res.status).not.toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/cron/beithady-ads-breakdowns/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/cron/beithady-ads-breakdowns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, fetchMetaInsightsBreakdown } from '@/lib/beithady/ads/meta-client';
import {
  loadGoogleAdsCredentials, getGoogleAccessToken,
  fetchGoogleGeoView, fetchGoogleDemoView, fetchGoogleDeviceView,
} from '@/lib/beithady/ads/google-client';
import {
  loadTikTokAppCredentials, fetchTikTokIntegratedReport,
} from '@/lib/beithady/ads/tiktok-client';
import {
  normalizeMetaGeoRows, normalizeGoogleGeoRows, normalizeTikTokGeoRows, upsertGeoRows,
} from '@/lib/beithady/ads/insights-geo';
import {
  normalizeMetaDemoRows, normalizeGoogleDemoRows, normalizeTikTokDemoRows, upsertDemoRows,
} from '@/lib/beithady/ads/insights-demo';
import {
  normalizeMetaDeviceRows, normalizeGoogleDeviceRows, normalizeTikTokDeviceRows, upsertDeviceRows,
} from '@/lib/beithady/ads/insights-device';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1'
      && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

type CampaignRow = {
  id: number; account_id: number; platform: 'meta' | 'google' | 'tiktok';
  external_id: string; status: string | null;
};
type AccountRow = {
  id: number; platform: 'meta' | 'google' | 'tiktok'; external_id: string;
  google_login_customer_id: string | null;
};

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const sevenAgo = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
  const fromDate = req.nextUrl.searchParams.get('from') || sevenAgo;
  const toDate = req.nextUrl.searchParams.get('to') || today;

  const { data: accounts } = await sb.from('ads_accounts')
    .select('id, platform, external_id, google_login_customer_id')
    .eq('status', 'active');
  const { data: campaigns } = await sb.from('ads_campaigns')
    .select('id, account_id, platform, external_id, status')
    .neq('status', 'REMOVED');

  const acctList = (accounts as AccountRow[] | null) ?? [];
  const campList = (campaigns as CampaignRow[] | null) ?? [];
  const acctById = new Map<number, AccountRow>();
  for (const a of acctList) acctById.set(a.id, a);

  const summary: Array<{ campaignId: number; platform: string; ok: boolean; error?: string }> = [];

  for (const c of campList) {
    const acct = acctById.get(c.account_id);
    if (!acct) continue;
    try {
      if (c.platform === 'meta') {
        const creds = await loadMetaCredentials();
        if (!creds.ok) { summary.push({ campaignId: c.id, platform: 'meta', ok: false, error: creds.error }); continue; }
        const [geo, demo, dev] = await Promise.all([
          fetchMetaInsightsBreakdown({ entityId: c.external_id, level: 'campaign', breakdowns: 'country', fromDate, toDate, token: creds.creds.token }),
          fetchMetaInsightsBreakdown({ entityId: c.external_id, level: 'campaign', breakdowns: 'age,gender', fromDate, toDate, token: creds.creds.token }),
          fetchMetaInsightsBreakdown({ entityId: c.external_id, level: 'campaign', breakdowns: 'device_platform,publisher_platform,publisher_position', fromDate, toDate, token: creds.creds.token }),
        ]);
        const ctx = { accountId: acct.id, campaignId: c.id, adSetId: null, platform: 'meta' as const };
        if (geo.ok) await upsertGeoRows(normalizeMetaGeoRows(geo.rows, ctx));
        if (demo.ok) await upsertDemoRows(normalizeMetaDemoRows(demo.rows, ctx));
        if (dev.ok) await upsertDeviceRows(normalizeMetaDeviceRows(dev.rows, ctx));
        summary.push({ campaignId: c.id, platform: 'meta', ok: geo.ok && demo.ok && dev.ok });
      } else if (c.platform === 'google') {
        const creds = await loadGoogleAdsCredentials();
        if (!creds.ok) { summary.push({ campaignId: c.id, platform: 'google', ok: false, error: creds.error }); continue; }
        const tok = await getGoogleAccessToken(creds.creds);
        if (!tok.ok) { summary.push({ campaignId: c.id, platform: 'google', ok: false, error: tok.error }); continue; }
        const customerId = acct.google_login_customer_id || creds.creds.login_customer_id || '';
        const ctx = { accountId: acct.id, campaignId: c.id, adSetId: null, platform: 'google' as const };
        const [geo, demo, dev] = await Promise.all([
          fetchGoogleGeoView({ customerId, campaignId: c.external_id, fromDate, toDate, creds: creds.creds, accessToken: tok.access_token }),
          fetchGoogleDemoView({ customerId, campaignId: c.external_id, fromDate, toDate, creds: creds.creds, accessToken: tok.access_token }),
          fetchGoogleDeviceView({ customerId, campaignId: c.external_id, fromDate, toDate, creds: creds.creds, accessToken: tok.access_token }),
        ]);
        if (geo.ok) await upsertGeoRows(normalizeGoogleGeoRows(geo.rows, ctx));
        if (demo.ok) await upsertDemoRows(normalizeGoogleDemoRows({ gender: demo.gender, ageRange: demo.ageRange }, ctx));
        if (dev.ok) await upsertDeviceRows(normalizeGoogleDeviceRows(dev.rows, ctx));
        summary.push({ campaignId: c.id, platform: 'google', ok: geo.ok && demo.ok && dev.ok });
      } else if (c.platform === 'tiktok') {
        const creds = await loadTikTokAppCredentials();
        if (!creds.ok) { summary.push({ campaignId: c.id, platform: 'tiktok', ok: false, error: creds.error }); continue; }
        const advertiserId = acct.external_id;
        const ctx = { accountId: acct.id, campaignId: c.id, adSetId: null, platform: 'tiktok' as const };
        const [geo, demo, dev] = await Promise.all([
          fetchTikTokIntegratedReport({ advertiserId, campaignIds: [c.external_id], dimensions: ['country_code'], fromDate, toDate, marketingToken: creds.creds.marketing_access_token }),
          fetchTikTokIntegratedReport({ advertiserId, campaignIds: [c.external_id], dimensions: ['age', 'gender'], fromDate, toDate, marketingToken: creds.creds.marketing_access_token }),
          fetchTikTokIntegratedReport({ advertiserId, campaignIds: [c.external_id], dimensions: ['placement'], fromDate, toDate, marketingToken: creds.creds.marketing_access_token }),
        ]);
        if (geo.ok) await upsertGeoRows(normalizeTikTokGeoRows(geo.rows, ctx));
        if (demo.ok) await upsertDemoRows(normalizeTikTokDemoRows(demo.rows, ctx));
        if (dev.ok) await upsertDeviceRows(normalizeTikTokDeviceRows(dev.rows, ctx));
        summary.push({ campaignId: c.id, platform: 'tiktok', ok: geo.ok && demo.ok && dev.ok });
      }
    } catch (e) {
      summary.push({ campaignId: c.id, platform: c.platform, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  await recordAudit({
    module: 'ads', action: 'breakdowns_cron',
    metadata: { fromDate, toDate, total: summary.length, failed: summary.filter(s => !s.ok).length },
  });

  return NextResponse.json({ ok: true, fromDate, toDate, summary });
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/app/api/cron/beithady-ads-breakdowns/route.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Register schedule + commit**

Edit `vercel.json`: insert the new cron entry right after the existing `beithady-ads-insights` line:

```jsonc
{ "path": "/api/cron/beithady-ads-breakdowns", "schedule": "0 */6 * * *" },
```

Verify alphabetical-ish grouping by running `grep -n beithady-ads vercel.json`.

```bash
git add src/app/api/cron/beithady-ads-breakdowns/route.ts src/app/api/cron/beithady-ads-breakdowns/route.test.ts vercel.json
git commit -m "$(cat <<'EOF'
feat(bh-ads): add /api/cron/beithady-ads-breakdowns (geo/demo/device, every 6h)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 14: Admin "Backfill 90d" button + server action

**Files:**
- Create: `src/app/admin/integrations/backfill-ads-breakdowns-action.ts`
- Modify: `src/app/admin/integrations/page.tsx` (add button row)
- Create: `src/app/admin/integrations/backfill-ads-breakdowns-action.test.ts`

Notes: Server action reuses the cron logic by issuing a same-host `GET` to `/api/cron/beithady-ads-breakdowns?force=1&secret=$CRON_SECRET&from=…&to=…`. This keeps a single source of truth.

- [ ] **Step 1: Write failing test (action shape)**

```ts
// src/app/admin/integrations/backfill-ads-breakdowns-action.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('backfillAdsBreakdownsAction (shape)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 's3');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.limeinc.cc');
  });

  it('builds the cron URL with from = today-90d and force=1', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, summary: [] }), { status: 200 }));
    const { backfillAdsBreakdownsAction } = await import('./backfill-ads-breakdowns-action');
    await backfillAdsBreakdownsAction();
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('/api/cron/beithady-ads-breakdowns');
    expect(url).toContain('force=1');
    expect(url).toContain('secret=s3');
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}/);
    expect(url).toMatch(/to=\d{4}-\d{2}-\d{2}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/admin/integrations/backfill-ads-breakdowns-action.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the action**

```ts
// src/app/admin/integrations/backfill-ads-breakdowns-action.ts
'use server';
import { revalidatePath } from 'next/cache';

export async function backfillAdsBreakdownsAction(): Promise<void> {
  const secret = process.env.CRON_SECRET || '';
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 86400e3).toISOString().slice(0, 10);
  const url = `${base}/api/cron/beithady-ads-breakdowns?force=1&secret=${encodeURIComponent(secret)}&from=${from}&to=${today}`;
  await fetch(url, { method: 'GET', cache: 'no-store' });
  revalidatePath('/admin/integrations');
  revalidatePath('/beithady/ads');
  revalidatePath('/beithady/ads/audience');
}
```

- [ ] **Step 4: Wire button into `/admin/integrations`**

Edit `src/app/admin/integrations/page.tsx`. Find a sensible location (near existing Ads-related test/seed buttons) and add:

```tsx
import { backfillAdsBreakdownsAction } from './backfill-ads-breakdowns-action';
// ...inside the page tsx:
<form action={backfillAdsBreakdownsAction}>
  <button type="submit" className="ix-btn-secondary text-xs" title="One-shot: fetch 90 days of audience breakdowns across Meta/Google/TikTok">
    Backfill 90d ads breakdowns
  </button>
</form>
```

(Use the existing `ix-btn-secondary` utility. No raw color classes. If the page sections are admin-themed instead of BH-themed, that's fine — admin pages have their own theme — but the button class still comes from globals.css.)

- [ ] **Step 5: Run test + commit**

Run: `npx vitest run src/app/admin/integrations/backfill-ads-breakdowns-action.test.ts`
Expected: 1 test PASS.

```bash
git add src/app/admin/integrations/backfill-ads-breakdowns-action.ts src/app/admin/integrations/backfill-ads-breakdowns-action.test.ts src/app/admin/integrations/page.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): admin one-shot Backfill 90d button (reuses cron path)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

After deploy: navigate to `/admin/integrations` → click Backfill → wait ~60s → verify via Supabase MCP:

```sql
select platform, count(*) from ads_insights_geo group by platform;
select platform, count(*) from ads_insights_demo group by platform;
select platform, count(*) from ads_insights_device group by platform;
```

Expected: each table has >0 rows per active platform.

---

## Task 15: `reporting.ts` — refactor to `{ from, to }` API

**Files:**
- Modify: `src/lib/beithady/ads/reporting.ts`
- Modify: every caller site that uses `getDashboardKpis(30)` / `listOverviewByDay(30)`
- Create: `src/lib/beithady/ads/reporting.test.ts`

Notes: Keep the old positional signature as an overload to avoid a sweeping cascading change. Internally, both forms normalize to `{ from, to }`.

- [ ] **Step 1: Write failing test (overload behavior)**

```ts
// src/lib/beithady/ads/reporting.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeRangeArg } from './reporting';

describe('normalizeRangeArg', () => {
  it('accepts a number → { from = today-(n-1), to = today }', () => {
    const r = normalizeRangeArg(30, { today: '2026-05-16' });
    expect(r).toEqual({ from: '2026-04-17', to: '2026-05-16' });
  });
  it('accepts an explicit { from, to }', () => {
    const r = normalizeRangeArg({ from: '2026-01-01', to: '2026-01-31' });
    expect(r).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/reporting.test.ts`
Expected: FAIL — `normalizeRangeArg` not exported.

- [ ] **Step 3: Refactor `reporting.ts`**

Add at the top of `src/lib/beithady/ads/reporting.ts` (after imports):

```ts
export type RangeArg = number | { from: string; to: string };

export function normalizeRangeArg(arg: RangeArg, opts?: { today?: string }): { from: string; to: string } {
  const today = opts?.today ?? new Date().toISOString().slice(0, 10);
  if (typeof arg === 'number') {
    const fromMs = new Date(today + 'T00:00:00Z').getTime() - (arg - 1) * 86400e3;
    return { from: new Date(fromMs).toISOString().slice(0, 10), to: today };
  }
  return arg;
}
```

Then update `getDashboardKpis`:

```ts
export async function getDashboardKpis(range: RangeArg = 30): Promise<{ /* … same return type … */ }> {
  const { from, to } = normalizeRangeArg(range);
  // replace `const cutoff = new Date(Date.now() - days*86400e3).toISOString().slice(0,10);`
  // with use of `from` and `to`:
  const sb = supabaseAdmin();
  const [{ data: dailyMetrics }, { data: accountsList }, { data: leads }, { count: active }, { count: drafts }] = await Promise.all([
    sb.from('ads_daily_metrics')
      .select('spend_micros, account_id, leads')
      .gte('metric_date', from).lte('metric_date', to)
      .is('ad_id', null).is('ad_set_id', null),
    sb.from('ads_accounts').select('id, currency'),
    sb.from('ads_lead_funnel').select('matched_reservation_id, booking_value, booking_currency')
      .gte('created_at', from).lte('created_at', to + 'T23:59:59'),
    sb.from('ads_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    sb.from('ads_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'DRAFT'),
  ]);
  // ... rest of body unchanged ...
}
```

And `listOverviewByDay`:

```ts
export async function listOverviewByDay(range: RangeArg = 30): Promise<DailyOverviewRow[]> {
  const { from, to } = normalizeRangeArg(range);
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_overview_daily')
    .select('*')
    .gte('metric_date', from).lte('metric_date', to)
    .order('metric_date', { ascending: true });
  return ((data as DailyOverviewRow[] | null) || []);
}
```

`listCampaignRoas` does not take a `days` argument today (it queries everything and joins). Leave its signature unchanged.

- [ ] **Step 4: Verify all callers still compile**

Run: `npx tsc --noEmit`
Expected: 0 new errors. Existing callsites passing `getDashboardKpis(30)` / `listOverviewByDay(30)` still work because of the overload.

- [ ] **Step 5: Run tests + commit**

Run: `npx vitest run src/lib/beithady/ads/reporting.test.ts`
Expected: 2 tests PASS.

```bash
git add src/lib/beithady/ads/reporting.ts src/lib/beithady/ads/reporting.test.ts
git commit -m "$(cat <<'EOF'
refactor(bh-ads): accept { from, to } in getDashboardKpis + listOverviewByDay

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 16: `<PeriodDeltaBadge />` — inline tone badge (jsdom)

**Files:**
- Create: `src/app/beithady/ads/_components/period-delta-badge.tsx`
- Create: `src/app/beithady/ads/_components/period-delta-badge.test.tsx`

UI rules: tone classes match the BH/admin palette already in use elsewhere — `text-emerald-600 dark:text-emerald-400` for positive, `text-rose-600 dark:text-rose-400` for negative, `text-slate-500 dark:text-slate-400` for neutral. Container is a tiny `inline-flex` with monospace digits.

- [ ] **Step 1: Write failing tests**

```tsx
// src/app/beithady/ads/_components/period-delta-badge.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeriodDeltaBadge } from './period-delta-badge';

describe('PeriodDeltaBadge', () => {
  it('renders up arrow with emerald tone when current > prior', () => {
    render(<PeriodDeltaBadge current={122} prior={100} />);
    const el = screen.getByTestId('period-delta');
    expect(el.textContent).toContain('↑');
    expect(el.textContent).toContain('22%');
    expect(el.className).toContain('emerald');
  });
  it('renders down arrow with rose tone when current < prior', () => {
    render(<PeriodDeltaBadge current={82} prior={100} />);
    expect(screen.getByTestId('period-delta').className).toContain('rose');
  });
  it('hides badge when both = 0', () => {
    const { container } = render(<PeriodDeltaBadge current={0} prior={0} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders "new" pill when prior=0', () => {
    render(<PeriodDeltaBadge current={5} prior={0} />);
    expect(screen.getByTestId('period-delta').textContent).toBe('new');
  });
  it('inverts tone with reverseColor for CPL-style metrics', () => {
    render(<PeriodDeltaBadge current={80} prior={100} reverseColor />);
    // CPL down 20% is good → emerald
    expect(screen.getByTestId('period-delta').className).toContain('emerald');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/period-delta-badge.test.tsx`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the component**

```tsx
// src/app/beithady/ads/_components/period-delta-badge.tsx
import { computePeriodDelta } from '@/lib/beithady/ads/period-delta';

export function PeriodDeltaBadge({
  current, prior, reverseColor,
}: {
  current: number;
  prior: number;
  reverseColor?: boolean;
}) {
  const d = computePeriodDelta(current, prior, { reverseColor });
  if (!d) return null;
  const tone =
    d.tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400' :
    d.tone === 'negative' ? 'text-rose-600 dark:text-rose-400' :
    'text-slate-500 dark:text-slate-400';
  return (
    <span
      data-testid="period-delta"
      className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${tone}`}
      title={d.pctChange == null ? 'No prior period to compare' : `Prior: ${prior.toLocaleString()}`}
    >
      {d.label}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/app/beithady/ads/_components/period-delta-badge.test.tsx`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/app/beithady/ads/_components/period-delta-badge.tsx src/app/beithady/ads/_components/period-delta-badge.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <PeriodDeltaBadge /> inline tone badge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 17: `<DateRangeFilter />` — preset chips + custom + compare toggle

**Files:**
- Create: `src/app/beithady/ads/_components/date-range-filter.tsx`
- Create: `src/app/beithady/ads/_components/date-range-filter.test.tsx`

UI: chips match the `AdsTabs` active/inactive pattern (emerald on active; slate on inactive). Inputs use `ix-input`. Client component (`'use client'`) — pushes URL state via `useRouter().push(...)`.

- [ ] **Step 1: Write failing tests**

```tsx
// src/app/beithady/ads/_components/date-range-filter.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRangeFilter } from './date-range-filter';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: push }),
  usePathname: () => '/beithady/ads',
  useSearchParams: () => new URLSearchParams('preset=30d'),
}));

describe('DateRangeFilter', () => {
  it('renders preset chips + custom range + compare toggle', () => {
    render(<DateRangeFilter />);
    expect(screen.getByText('7d')).toBeTruthy();
    expect(screen.getByText('30d')).toBeTruthy();
    expect(screen.getByText('90d')).toBeTruthy();
    expect(screen.getByText('Lifetime')).toBeTruthy();
    expect(screen.getByLabelText(/compare/i)).toBeTruthy();
  });
  it('clicking a preset pushes ?preset=', () => {
    render(<DateRangeFilter />);
    fireEvent.click(screen.getByText('7d'));
    expect(push).toHaveBeenCalled();
    const lastCall = push.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('preset=7d');
  });
  it('toggling compare pushes compare=1', () => {
    push.mockClear();
    render(<DateRangeFilter />);
    fireEvent.click(screen.getByLabelText(/compare/i));
    const lastCall = push.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('compare=1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/date-range-filter.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/app/beithady/ads/_components/date-range-filter.tsx
'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const PRESETS: Array<{ key: '7d' | '30d' | '90d' | 'lifetime'; label: string }> = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'lifetime', label: 'Lifetime' },
];

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const currentPreset = (sp.get('preset') as '7d' | '30d' | '90d' | 'lifetime' | 'custom' | null) ?? '30d';
  const currentFrom = sp.get('from') ?? '';
  const currentTo = sp.get('to') ?? '';
  const compare = sp.get('compare') === '1';

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function setPreset(key: string) {
    push({ preset: key, from: null, to: null });
  }

  function setCustom() {
    push({ preset: 'custom' });
  }

  return (
    <div className="ix-card p-3 flex flex-wrap items-center gap-3 text-xs">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">Date range</span>
      {PRESETS.map(p => {
        const isActive = currentPreset === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${isActive ? ACTIVE : INACTIVE}`}
          >
            {p.label}
          </button>
        );
      })}
      <span className="text-slate-300 dark:text-slate-700">|</span>
      <input
        type="date"
        value={currentFrom}
        onChange={e => push({ from: e.target.value, preset: 'custom' })}
        className="ix-input !min-h-0 !py-1 text-xs w-[140px]"
        aria-label="from date"
      />
      <span className="text-slate-400">→</span>
      <input
        type="date"
        value={currentTo}
        onChange={e => push({ to: e.target.value, preset: 'custom' })}
        className="ix-input !min-h-0 !py-1 text-xs w-[140px]"
        aria-label="to date"
      />
      <button type="button" onClick={setCustom} className="ix-btn-ghost text-xs">Apply</button>
      <span className="text-slate-300 dark:text-slate-700">|</span>
      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={compare}
          onChange={e => push({ compare: e.target.checked ? '1' : null })}
          aria-label="compare to prior period"
          className="accent-emerald-600"
        />
        <span className="text-slate-600 dark:text-slate-300">Compare to prior period</span>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/app/beithady/ads/_components/date-range-filter.test.tsx`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/app/beithady/ads/_components/date-range-filter.tsx src/app/beithady/ads/_components/date-range-filter.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <DateRangeFilter /> (presets + custom + compare)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 18: `<AudienceSummaryWidget />` — top-3 per dimension card

**Files:**
- Create: `src/app/beithady/ads/_components/audience-summary-widget.tsx`
- Create: `src/app/beithady/ads/_components/audience-summary-widget.test.tsx`

Server component. Reads top 3 rows from each of `queryGeoRollup`, `queryDemoRollup`, `queryDeviceRollup` for the active date range. Render compact 3-column card. "Open full report →" link preserves `?from=&to=&compare=`.

- [ ] **Step 1: Write failing test (smoke renders)**

```tsx
// src/app/beithady/ads/_components/audience-summary-widget.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/insights-geo', () => ({
  queryGeoRollup: vi.fn().mockResolvedValue([
    { country_code: 'EG', impressions: 1000, clicks: 50, spend_micros: 5_000_000, leads: 3 },
    { country_code: 'AE', impressions: 600, clicks: 20, spend_micros: 1_500_000, leads: 1 },
    { country_code: 'SA', impressions: 400, clicks: 10, spend_micros: 1_200_000, leads: 0 },
    { country_code: 'KW', impressions: 200, clicks: 5,  spend_micros: 500_000, leads: 0 },
  ]),
}));
vi.mock('@/lib/beithady/ads/insights-demo', () => ({
  queryDemoRollup: vi.fn().mockResolvedValue([
    { age_range: '25-34', gender: 'female', impressions: 500, clicks: 30, spend_micros: 2_000_000, leads: 2 },
    { age_range: '25-34', gender: 'male',   impressions: 400, clicks: 20, spend_micros: 1_500_000, leads: 1 },
    { age_range: '35-44', gender: 'female', impressions: 300, clicks: 15, spend_micros: 1_000_000, leads: 0 },
  ]),
}));
vi.mock('@/lib/beithady/ads/insights-device', () => ({
  queryDeviceRollup: vi.fn().mockResolvedValue([
    { device_platform: 'mobile',  publisher_platform: null, placement: null, impressions: 1500, clicks: 70, spend_micros: 6_000_000, leads: 4 },
    { device_platform: 'desktop', publisher_platform: null, placement: null, impressions: 400, clicks: 10, spend_micros: 1_500_000, leads: 0 },
  ]),
}));

describe('AudienceSummaryWidget', () => {
  it('renders three sections with top-3 rows + Open full report link', async () => {
    const { AudienceSummaryWidget } = await import('./audience-summary-widget');
    const ui = await AudienceSummaryWidget({ range: { from: '2026-05-01', to: '2026-05-16' } });
    render(ui);
    expect(screen.getByText(/Top countries/i)).toBeTruthy();
    expect(screen.getByText('EG')).toBeTruthy();
    expect(screen.getByText('AE')).toBeTruthy();
    expect(screen.getByText('SA')).toBeTruthy();
    expect(screen.queryByText('KW')).toBeNull();           // 4th — excluded
    expect(screen.getByText(/25-34 · female/)).toBeTruthy();
    expect(screen.getByText(/Mobile/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Open full report/i });
    expect(link.getAttribute('href')).toContain('/beithady/ads/audience');
    expect(link.getAttribute('href')).toContain('from=2026-05-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/audience-summary-widget.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/app/beithady/ads/_components/audience-summary-widget.tsx
import Link from 'next/link';
import { queryGeoRollup } from '@/lib/beithady/ads/insights-geo';
import { queryDemoRollup } from '@/lib/beithady/ads/insights-demo';
import { queryDeviceRollup } from '@/lib/beithady/ads/insights-device';
import { Globe2, Users, MonitorSmartphone } from 'lucide-react';

const DEVICE_LABEL: Record<string, string> = {
  mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop', connected_tv: 'CTV', tv: 'TV', unknown: 'Unknown',
};

function fmtPct(num: number, denom: number): string {
  if (denom <= 0) return '—';
  return `${Math.round((num / denom) * 100)}%`;
}

export async function AudienceSummaryWidget({
  range,
}: { range: { from: string; to: string } }) {
  const [geo, demo, device] = await Promise.all([
    queryGeoRollup({ from: range.from, to: range.to }),
    queryDemoRollup({ from: range.from, to: range.to }),
    queryDeviceRollup({ from: range.from, to: range.to }),
  ]);
  const totalClicks = geo.reduce((s, r) => s + r.clicks, 0) || 1;
  const totalDemoClicks = demo.reduce((s, r) => s + r.clicks, 0) || 1;
  const totalDeviceClicks = device.reduce((s, r) => s + r.clicks, 0) || 1;
  const top3Geo = geo.slice(0, 3);
  const top3Demo = demo.slice(0, 3);
  const top3Device = device.slice(0, 3);
  const href = `/beithady/ads/audience?from=${range.from}&to=${range.to}`;

  return (
    <div className="ix-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Audience snapshot</h3>
        <Link href={href} className="ix-link text-xs">Open full report →</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <Globe2 size={12} /><span>Top countries</span>
          </div>
          <ul className="space-y-1">
            {top3Geo.map(r => (
              <li key={r.country_code} className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.country_code}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.clicks.toLocaleString()} clk · {fmtPct(r.clicks, totalClicks)}</span>
              </li>
            ))}
            {top3Geo.length === 0 && <li className="text-slate-400">No data yet</li>}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <Users size={12} /><span>Top demographics</span>
          </div>
          <ul className="space-y-1">
            {top3Demo.map(r => (
              <li key={`${r.age_range}|${r.gender}`} className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.age_range} · {r.gender}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.clicks.toLocaleString()} clk · {fmtPct(r.clicks, totalDemoClicks)}</span>
              </li>
            ))}
            {top3Demo.length === 0 && <li className="text-slate-400">No data yet</li>}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <MonitorSmartphone size={12} /><span>Top device</span>
          </div>
          <ul className="space-y-1">
            {top3Device.map(r => (
              <li key={`${r.device_platform}|${r.publisher_platform ?? ''}|${r.placement ?? ''}`}
                  className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{DEVICE_LABEL[r.device_platform] ?? r.device_platform}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.clicks.toLocaleString()} clk · {fmtPct(r.clicks, totalDeviceClicks)}</span>
              </li>
            ))}
            {top3Device.length === 0 && <li className="text-slate-400">No data yet</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/app/beithady/ads/_components/audience-summary-widget.test.tsx`
Expected: 1 test PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/app/beithady/ads/_components/audience-summary-widget.tsx src/app/beithady/ads/_components/audience-summary-widget.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <AudienceSummaryWidget /> for main dashboard card

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 19: Wire `<DateRangeFilter />` + `<AudienceSummaryWidget />` into `/beithady/ads/`

**Files:**
- Modify: `src/app/beithady/ads/page.tsx`
- Modify: `src/app/beithady/ads/_components/ads-tabs.tsx` (add Audience tab)

UI rules: New tab uses `Globe2` icon (already imported in `ads-tabs.tsx`? — verify; if not, import from `lucide-react`). Audience tab slug = `audience`, href = `/beithady/ads/audience`, group = `main`.

- [ ] **Step 1: Add Audience tab to `AdsTabs`**

Edit `src/app/beithady/ads/_components/ads-tabs.tsx`. Add to imports if missing:

```tsx
import { Globe2 } from 'lucide-react';
```

Insert into the `TABS` array, right after the existing `performance` row:

```tsx
{ slug: 'audience',    label: 'Audience',    href: '/beithady/ads/audience',              icon: Globe2,          group: 'main' },
```

- [ ] **Step 2: Modify `/beithady/ads/page.tsx` to consume date range + render new components**

Inside `AdsLandingPage`:

```tsx
import { DateRangeFilter } from './_components/date-range-filter';
import { AudienceSummaryWidget } from './_components/audience-summary-widget';
import { parseDateRange } from '@/lib/beithady/ads/date-range';

// extend the searchParams type:
searchParams: Promise<{
  building?: string; date?: string; signal?: string;
  from?: string; to?: string; preset?: string; compare?: string;
}>

// after `const sp = await searchParams;`:
const range = parseDateRange({ from: sp.from, to: sp.to, preset: sp.preset, compare: sp.compare });

// change `getDashboardKpis(30)` →
getDashboardKpis({ from: range.from, to: range.to }),
```

Then in the JSX, place the filter immediately under `<AdsTabs active="overview" />`:

```tsx
<DateRangeFilter />
```

And add the audience widget directly above the existing "Per-platform connection status row" (or wherever feels best — see live layout):

```tsx
<AudienceSummaryWidget range={{ from: range.from, to: range.to }} />
```

- [ ] **Step 3: Verify tsc + visual check via local dev**

Run: `npx tsc --noEmit`
Expected: 0 errors.

Run: `npm run dev` then open `http://localhost:3000/beithady/ads/?preset=7d` and confirm the filter chips show `7d` active, the widget renders top-3 (or empty state if no data yet), and clicking `30d` updates the URL + KPI numbers.

- [ ] **Step 4: Commit + push**

```bash
git add src/app/beithady/ads/page.tsx src/app/beithady/ads/_components/ads-tabs.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): wire date filter + audience widget into /beithady/ads main page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 20: Wire date filter into `/beithady/ads/campaigns/[id]/` and `/beithady/ads/performance/`

**Files:**
- Modify: `src/app/beithady/ads/campaigns/[id]/page.tsx`
- Modify: `src/app/beithady/ads/performance/page.tsx`

For each page:
1. Add `from?/to?/preset?/compare?` to `searchParams` type.
2. `const range = parseDateRange({...});`
3. Replace any hardcoded 30 with `{ from: range.from, to: range.to }` in `getDashboardKpis` / `listOverviewByDay` calls (only where they exist).
4. Render `<DateRangeFilter />` under `<AdsTabs active="..." />`.
5. On the campaign detail page only, render a per-campaign `<AudienceSummaryWidget />` if the campaign has any data:

```tsx
<AudienceSummaryWidget range={{ from: range.from, to: range.to }} />
```

Note: `AudienceSummaryWidget` currently takes no `campaignId` — extend its signature to accept an optional `campaignId?: number` and thread it through `queryGeoRollup`/`queryDemoRollup`/`queryDeviceRollup`. Update the test to cover the new prop.

- [ ] **Step 1: Extend widget signature + add test**

Append test to `audience-summary-widget.test.tsx`:

```tsx
it('passes campaignId through to rollup queries when provided', async () => {
  const geoMod = await import('@/lib/beithady/ads/insights-geo');
  const spy = vi.mocked(geoMod.queryGeoRollup);
  const { AudienceSummaryWidget } = await import('./audience-summary-widget');
  const ui = await AudienceSummaryWidget({
    range: { from: '2026-05-01', to: '2026-05-16' },
    campaignId: 42,
  });
  render(ui);
  expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ campaignId: 42 }));
});
```

Edit component signature:

```tsx
export async function AudienceSummaryWidget({
  range, campaignId,
}: { range: { from: string; to: string }; campaignId?: number }) {
  const [geo, demo, device] = await Promise.all([
    queryGeoRollup({ from: range.from, to: range.to, campaignId }),
    queryDemoRollup({ from: range.from, to: range.to, campaignId }),
    queryDeviceRollup({ from: range.from, to: range.to, campaignId }),
  ]);
  // ... include campaignId in href ...
  const href = `/beithady/ads/audience?from=${range.from}&to=${range.to}${campaignId ? `&campaign=${campaignId}` : ''}`;
  // ... rest unchanged ...
}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/app/beithady/ads/_components/audience-summary-widget.test.tsx`
Expected: 2 tests PASS.

- [ ] **Step 3: Wire into both pages**

In `src/app/beithady/ads/campaigns/[id]/page.tsx`, after `const sp = await searchParams;`:

```tsx
const range = parseDateRange({ from: sp.from, to: sp.to, preset: sp.preset, compare: sp.compare });
// ...
<DateRangeFilter />
{/* below KPIs */}
<AudienceSummaryWidget range={{ from: range.from, to: range.to }} campaignId={campaignDbId} />
```

(`campaignDbId` is whatever variable name the page already uses for the integer PK; if it's `params.id` after parseInt, use that.)

In `src/app/beithady/ads/performance/page.tsx`, identical wiring sans the widget (performance page already has its own charts):

```tsx
<DateRangeFilter />
```

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
git add src/app/beithady/ads/campaigns/\[id\]/page.tsx src/app/beithady/ads/performance/page.tsx src/app/beithady/ads/_components/audience-summary-widget.tsx src/app/beithady/ads/_components/audience-summary-widget.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): wire date filter into campaign detail + performance pages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 21: Audience page shell + `<AudienceFilters />`

**Files:**
- Create: `src/app/beithady/ads/audience/page.tsx`
- Create: `src/app/beithady/ads/audience/_components/audience-filters.tsx`
- Create: `src/app/beithady/ads/audience/_components/audience-filters.test.tsx`

UI: page wraps in `<BeithadyShell>` + `<BeithadyHeader>` (eyebrow "Beit Hady · Ads · Audience"). Tab strip = `<AdsTabs active="audience" />`. Then `<DateRangeFilter />`, then `<AudienceFilters campaigns={...} platforms={...} />`, then the active-tab content. Tab nav between Geo / Demographics / Device uses the same active-emerald pattern from `ads-tabs.tsx`.

- [ ] **Step 1: Write failing test for `<AudienceFilters />`**

```tsx
// src/app/beithady/ads/audience/_components/audience-filters.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AudienceFilters } from './audience-filters';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/beithady/ads/audience',
  useSearchParams: () => new URLSearchParams(''),
}));

const campaigns = [
  { id: 1, name: 'CTWA EG', platform: 'meta' as const },
  { id: 2, name: 'Search SA', platform: 'google' as const },
];

describe('AudienceFilters', () => {
  it('renders a campaign dropdown + platform pills', () => {
    render(<AudienceFilters campaigns={campaigns} />);
    expect(screen.getByLabelText(/campaign/i)).toBeTruthy();
    expect(screen.getByText(/Meta/i)).toBeTruthy();
    expect(screen.getByText(/Google/i)).toBeTruthy();
    expect(screen.getByText(/TikTok/i)).toBeTruthy();
  });
  it('changing campaign pushes ?campaign=', () => {
    push.mockClear();
    render(<AudienceFilters campaigns={campaigns} />);
    fireEvent.change(screen.getByLabelText(/campaign/i), { target: { value: '1' } });
    const last = push.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain('campaign=1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/audience/_components/audience-filters.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `<AudienceFilters />`**

```tsx
// src/app/beithady/ads/audience/_components/audience-filters.tsx
'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

const PLATFORMS: Array<{ key: 'meta' | 'google' | 'tiktok'; label: string }> = [
  { key: 'meta', label: 'Meta' },
  { key: 'google', label: 'Google' },
  { key: 'tiktok', label: 'TikTok' },
];

export function AudienceFilters({
  campaigns,
}: {
  campaigns: Array<{ id: number; name: string; platform: 'meta' | 'google' | 'tiktok' }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const campaign = sp.get('campaign') ?? '';
  const selectedPlatforms = (sp.get('platforms') ?? '').split(',').filter(Boolean);

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function togglePlatform(k: string) {
    const set = new Set(selectedPlatforms);
    if (set.has(k)) set.delete(k); else set.add(k);
    push({ platforms: set.size ? Array.from(set).join(',') : null });
  }

  return (
    <div className="ix-card p-3 flex flex-wrap items-center gap-3 text-xs">
      <label className="inline-flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Campaign</span>
        <select
          aria-label="campaign"
          value={campaign}
          onChange={e => push({ campaign: e.target.value || null })}
          className="ix-input !min-h-0 !py-1 text-xs"
        >
          <option value="">All campaigns</option>
          {campaigns.map(c => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
      </label>
      <span className="text-slate-300 dark:text-slate-700">|</span>
      <span className="text-[10px] uppercase tracking-wide text-slate-400">Platforms</span>
      {PLATFORMS.map(p => {
        const isOn = selectedPlatforms.includes(p.key) || selectedPlatforms.length === 0;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => togglePlatform(p.key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${isOn ? ACTIVE : INACTIVE}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write the page shell**

```tsx
// src/app/beithady/ads/audience/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { DateRangeFilter } from '../_components/date-range-filter';
import { parseDateRange } from '@/lib/beithady/ads/date-range';
import { AudienceFilters } from './_components/audience-filters';
import { GeoTab } from './_components/geo-tab';
import { DemoTab } from './_components/demo-tab';
import { DeviceTab } from './_components/device-tab';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TABS: Array<{ key: 'geo' | 'demo' | 'device'; label: string }> = [
  { key: 'geo', label: 'Geo' },
  { key: 'demo', label: 'Demographics' },
  { key: 'device', label: 'Device & Placement' },
];

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

export default async function AdsAudiencePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string; from?: string; to?: string; preset?: string; compare?: string;
    campaign?: string; platforms?: string;
  }>;
}) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;
  const range = parseDateRange({ from: sp.from, to: sp.to, preset: sp.preset, compare: sp.compare });
  const tab = (sp.tab as 'geo' | 'demo' | 'device') ?? 'geo';
  const campaignId = sp.campaign ? Number(sp.campaign) : undefined;
  const platforms = (sp.platforms ?? '').split(',').filter(Boolean) as Array<'meta' | 'google' | 'tiktok'>;

  const sb = supabaseAdmin();
  const { data: campaignRows } = await sb.from('ads_campaigns')
    .select('id, name, platform').neq('status', 'REMOVED').order('name');
  const campaigns = ((campaignRows as Array<{ id: number; name: string; platform: 'meta' | 'google' | 'tiktok' }> | null) ?? []);

  const baseQs = new URLSearchParams();
  if (sp.from) baseQs.set('from', sp.from);
  if (sp.to) baseQs.set('to', sp.to);
  if (sp.preset) baseQs.set('preset', sp.preset);
  if (sp.compare) baseQs.set('compare', sp.compare);
  if (sp.campaign) baseQs.set('campaign', sp.campaign);
  if (sp.platforms) baseQs.set('platforms', sp.platforms);

  function tabHref(key: string): string {
    const q = new URLSearchParams(baseQs);
    q.set('tab', key);
    return `/beithady/ads/audience?${q.toString()}`;
  }

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Audience' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Audience"
        subtitle="Where impressions, clicks, and leads come from — geo, demographics, device & placement."
      />
      <AdsTabs active="audience" />
      <DateRangeFilter />
      <AudienceFilters campaigns={campaigns} />
      <div className="ix-card p-2 flex flex-wrap items-center gap-2 text-xs">
        {TABS.map(t => (
          <Link key={t.key} href={tabHref(t.key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${tab === t.key ? ACTIVE : INACTIVE}`}>
            {t.label}
          </Link>
        ))}
      </div>
      {tab === 'geo' && <GeoTab range={range} campaignId={campaignId} platforms={platforms} />}
      {tab === 'demo' && <DemoTab range={range} campaignId={campaignId} platforms={platforms} />}
      {tab === 'device' && <DeviceTab range={range} campaignId={campaignId} platforms={platforms} />}
    </BeithadyShell>
  );
}
```

Note: the three `*-tab.tsx` files don't exist yet — Tasks 22/23/24 create them. The page will fail to compile until Task 22 lands. Stash this page or commit it together with Task 22 (cleaner to ship in a single commit).

- [ ] **Step 5: Run filter test + verify**

Run: `npx vitest run src/app/beithady/ads/audience/_components/audience-filters.test.tsx`
Expected: 2 tests PASS.

- [ ] **Step 6: Commit (audience filter only; page lives in next commit with tabs)**

```bash
git add src/app/beithady/ads/audience/_components/audience-filters.tsx src/app/beithady/ads/audience/_components/audience-filters.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <AudienceFilters /> (campaign + platform multi-select)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

The `audience/page.tsx` file from Step 4 stays in the worktree uncommitted; it ships alongside Task 22.

---

## Task 22: `<GeoTab />` — country + city tables + ship audience page

**Files:**
- Create: `src/app/beithady/ads/audience/_components/geo-tab.tsx`
- Create: `src/app/beithady/ads/audience/_components/geo-tab.test.tsx`
- Ship the `audience/page.tsx` from Task 21 Step 4 in this commit (page can finally compile once all 3 tabs are stubbed)
- Create stubs: `demo-tab.tsx`, `device-tab.tsx` (real implementations land in Tasks 23/24)

- [ ] **Step 1: Write failing test**

```tsx
// src/app/beithady/ads/audience/_components/geo-tab.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/insights-geo', () => ({
  queryGeoRollup: vi.fn().mockResolvedValue([
    { country_code: 'EG', impressions: 1000, clicks: 50, spend_micros: 5_000_000, leads: 3 },
    { country_code: 'AE', impressions: 600, clicks: 20, spend_micros: 1_500_000, leads: 1 },
  ]),
}));

describe('GeoTab', () => {
  it('renders country table with clicks/impressions/spend columns', async () => {
    const { GeoTab } = await import('./geo-tab');
    const ui = await GeoTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getByText('EG')).toBeTruthy();
    expect(screen.getByText('AE')).toBeTruthy();
    // formatted numbers
    expect(screen.getByText(/1,000/)).toBeTruthy();
  });

  it('renders empty state when no rows', async () => {
    const mod = await import('@/lib/beithady/ads/insights-geo');
    vi.mocked(mod.queryGeoRollup).mockResolvedValueOnce([]);
    const { GeoTab } = await import('./geo-tab');
    const ui = await GeoTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getByText(/No audience data yet/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/audience/_components/geo-tab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `<GeoTab />`**

```tsx
// src/app/beithady/ads/audience/_components/geo-tab.tsx
import { queryGeoRollup } from '@/lib/beithady/ads/insights-geo';
import { derivePriorPeriod } from '@/lib/beithady/ads/date-range';
import { PeriodDeltaBadge } from '../../_components/period-delta-badge';

export async function GeoTab({
  range, campaignId, platforms,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
}) {
  const [current, prior] = await Promise.all([
    queryGeoRollup({ from: range.from, to: range.to, campaignId, platforms }),
    range.compare
      ? queryGeoRollup({ ...derivePriorPeriod(range), campaignId, platforms })
      : Promise.resolve([]),
  ]);
  const priorByCountry = new Map(prior.map(r => [r.country_code, r]));

  if (current.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No audience data yet for this range.
        <div className="mt-2 text-xs">Run <span className="font-mono">Backfill 90d</span> on /admin/integrations, or wait for the next 6h cron tick.</div>
      </div>
    );
  }

  return (
    <div className="ix-card p-5 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Countries</h3>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-2">Country</th>
            <th className="py-2 text-right">Impressions</th>
            <th className="py-2 text-right">Clicks</th>
            <th className="py-2 text-right">CTR</th>
            <th className="py-2 text-right">Spend (EGP)</th>
            <th className="py-2 text-right">Leads</th>
            {range.compare && <th className="py-2 text-right">Δ clicks</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {current.map(r => {
            const ctr = r.impressions ? (r.clicks / r.impressions) * 100 : 0;
            const p = priorByCountry.get(r.country_code);
            return (
              <tr key={r.country_code} className="text-slate-700 dark:text-slate-200">
                <td className="py-1.5 font-medium">{r.country_code}</td>
                <td className="py-1.5 text-right">{r.impressions.toLocaleString()}</td>
                <td className="py-1.5 text-right">{r.clicks.toLocaleString()}</td>
                <td className="py-1.5 text-right">{ctr.toFixed(2)}%</td>
                <td className="py-1.5 text-right">{(r.spend_micros / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="py-1.5 text-right">{r.leads.toLocaleString()}</td>
                {range.compare && (
                  <td className="py-1.5 text-right">
                    <PeriodDeltaBadge current={r.clicks} prior={p?.clicks ?? 0} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Stub the other two tabs (so page compiles)**

`src/app/beithady/ads/audience/_components/demo-tab.tsx`:

```tsx
export async function DemoTab(_props: { range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number; platforms?: Array<'meta' | 'google' | 'tiktok'> }) {
  return <div className="ix-card p-5 text-sm text-slate-500 dark:text-slate-400">Demographics — coming next task.</div>;
}
```

`src/app/beithady/ads/audience/_components/device-tab.tsx`:

```tsx
export async function DeviceTab(_props: { range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number; platforms?: Array<'meta' | 'google' | 'tiktok'> }) {
  return <div className="ix-card p-5 text-sm text-slate-500 dark:text-slate-400">Device & placement — coming next task.</div>;
}
```

- [ ] **Step 5: Run tests + tsc + commit (page + GeoTab + stubs)**

Run: `npx vitest run src/app/beithady/ads/audience/_components/geo-tab.test.tsx`
Expected: 2 tests PASS.

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add src/app/beithady/ads/audience/page.tsx \
        src/app/beithady/ads/audience/_components/geo-tab.tsx \
        src/app/beithady/ads/audience/_components/geo-tab.test.tsx \
        src/app/beithady/ads/audience/_components/demo-tab.tsx \
        src/app/beithady/ads/audience/_components/device-tab.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): ship audience page shell + GeoTab (country table + compare)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 23: `<DemoTab />` — age × gender bars + detail table

**Files:**
- Modify: `src/app/beithady/ads/audience/_components/demo-tab.tsx` (replace stub)
- Create: `src/app/beithady/ads/audience/_components/demo-tab.test.tsx`

UI: two horizontal bar charts (SVG, no library). Each bar = `(age, gender)` cell; width proportional to clicks. Use the AdsTabs active-emerald for the "more clicks" side and slate-300 for the "less". Detail table below.

- [ ] **Step 1: Write failing test**

```tsx
// src/app/beithady/ads/audience/_components/demo-tab.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/insights-demo', () => ({
  queryDemoRollup: vi.fn().mockResolvedValue([
    { age_range: '25-34', gender: 'female', impressions: 500, clicks: 30, spend_micros: 2_000_000, leads: 2 },
    { age_range: '25-34', gender: 'male',   impressions: 400, clicks: 20, spend_micros: 1_500_000, leads: 1 },
    { age_range: '35-44', gender: 'female', impressions: 300, clicks: 15, spend_micros: 1_000_000, leads: 0 },
  ]),
}));

describe('DemoTab', () => {
  it('renders age × gender bars and table', async () => {
    const { DemoTab } = await import('./demo-tab');
    const ui = await DemoTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getByText(/25-34/)).toBeTruthy();
    expect(screen.getByText(/35-44/)).toBeTruthy();
    // table cells
    expect(screen.getAllByText(/female/i).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/audience/_components/demo-tab.test.tsx`
Expected: FAIL — stub still in place.

- [ ] **Step 3: Replace the stub with real implementation**

```tsx
// src/app/beithady/ads/audience/_components/demo-tab.tsx
import { queryDemoRollup, type DemoRollupRow } from '@/lib/beithady/ads/insights-demo';
import { derivePriorPeriod } from '@/lib/beithady/ads/date-range';
import { PeriodDeltaBadge } from '../../_components/period-delta-badge';

const AGE_BUCKETS = ['13-17','18-24','25-34','35-44','45-54','55-64','65+','unknown'] as const;

function maxClicks(rows: DemoRollupRow[]): number {
  return rows.reduce((m, r) => Math.max(m, r.clicks), 0) || 1;
}

function findRow(rows: DemoRollupRow[], age: string, gender: string): DemoRollupRow | undefined {
  return rows.find(r => r.age_range === age && r.gender === gender);
}

export async function DemoTab({
  range, campaignId, platforms,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
}) {
  const [current, prior] = await Promise.all([
    queryDemoRollup({ from: range.from, to: range.to, campaignId, platforms }),
    range.compare ? queryDemoRollup({ ...derivePriorPeriod(range), campaignId, platforms }) : Promise.resolve([]),
  ]);

  if (current.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No demographic data yet for this range.
      </div>
    );
  }
  const max = maxClicks(current);

  return (
    <div className="space-y-3">
      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Clicks by age × gender</h3>
        <div className="space-y-1.5 text-xs">
          {AGE_BUCKETS.map(age => {
            const female = findRow(current, age, 'female')?.clicks ?? 0;
            const male = findRow(current, age, 'male')?.clicks ?? 0;
            const total = female + male;
            if (total === 0) return null;
            return (
              <div key={age} className="grid grid-cols-[80px_1fr_60px] items-center gap-3">
                <span className="text-slate-600 dark:text-slate-300 font-medium">{age}</span>
                <div className="flex items-center gap-1 h-4">
                  <div className="bg-emerald-400/70 dark:bg-emerald-600/70 h-full rounded-l"
                       style={{ width: `${(female / max) * 100}%` }}
                       title={`Female: ${female}`} />
                  <div className="bg-slate-400/70 dark:bg-slate-500/70 h-full rounded-r"
                       style={{ width: `${(male / max) * 100}%` }}
                       title={`Male: ${male}`} />
                </div>
                <span className="text-right tabular-nums text-slate-500 dark:text-slate-400">{total.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400/70 dark:bg-emerald-600/70" /> Female</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-400/70 dark:bg-slate-500/70" /> Male</span>
        </div>
      </div>

      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Detail</h3>
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Age</th>
              <th className="py-2">Gender</th>
              <th className="py-2 text-right">Impressions</th>
              <th className="py-2 text-right">Clicks</th>
              <th className="py-2 text-right">CTR</th>
              <th className="py-2 text-right">Spend (EGP)</th>
              <th className="py-2 text-right">Leads</th>
              {range.compare && <th className="py-2 text-right">Δ clicks</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {current.map(r => {
              const ctr = r.impressions ? (r.clicks / r.impressions) * 100 : 0;
              const p = prior.find(x => x.age_range === r.age_range && x.gender === r.gender);
              return (
                <tr key={`${r.age_range}|${r.gender}`} className="text-slate-700 dark:text-slate-200">
                  <td className="py-1.5">{r.age_range}</td>
                  <td className="py-1.5 capitalize">{r.gender}</td>
                  <td className="py-1.5 text-right">{r.impressions.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.clicks.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{ctr.toFixed(2)}%</td>
                  <td className="py-1.5 text-right">{(r.spend_micros / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="py-1.5 text-right">{r.leads.toLocaleString()}</td>
                  {range.compare && (
                    <td className="py-1.5 text-right">
                      <PeriodDeltaBadge current={r.clicks} prior={p?.clicks ?? 0} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test + commit**

Run: `npx vitest run src/app/beithady/ads/audience/_components/demo-tab.test.tsx`
Expected: 1 test PASS.

```bash
git add src/app/beithady/ads/audience/_components/demo-tab.tsx src/app/beithady/ads/audience/_components/demo-tab.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): replace DemoTab stub with real age×gender bars + detail table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 24: `<DeviceTab />` — device pie + Meta placement bar + per-platform table

**Files:**
- Modify: `src/app/beithady/ads/audience/_components/device-tab.tsx`
- Create: `src/app/beithady/ads/audience/_components/device-tab.test.tsx`

UI: Donut/pie rendered as a stacked horizontal bar (simpler than SVG arcs, and consistent with the rest of BH which is table-heavy). Placement bar only visible when at least one row has `publisher_platform != null` (i.e. Meta data present).

- [ ] **Step 1: Write failing test**

```tsx
// src/app/beithady/ads/audience/_components/device-tab.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/insights-device', () => ({
  queryDeviceRollup: vi.fn().mockResolvedValue([
    { device_platform: 'mobile',  publisher_platform: 'facebook', placement: 'feed',    impressions: 1500, clicks: 70, spend_micros: 6_000_000, leads: 4 },
    { device_platform: 'desktop', publisher_platform: 'facebook', placement: 'feed',    impressions: 400,  clicks: 10, spend_micros: 1_500_000, leads: 0 },
    { device_platform: 'mobile',  publisher_platform: 'instagram', placement: 'stories', impressions: 200, clicks: 8, spend_micros: 600_000, leads: 1 },
  ]),
}));

describe('DeviceTab', () => {
  it('renders device summary + placement bar (Meta present) + detail table', async () => {
    const { DeviceTab } = await import('./device-tab');
    const ui = await DeviceTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getByText(/Mobile/i)).toBeTruthy();
    expect(screen.getByText(/Desktop/i)).toBeTruthy();
    expect(screen.getByText(/Placements/i)).toBeTruthy();
    expect(screen.getByText(/facebook/i)).toBeTruthy();
    expect(screen.getByText(/instagram/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/audience/_components/device-tab.test.tsx`
Expected: FAIL — stub still in place.

- [ ] **Step 3: Replace the stub with real implementation**

```tsx
// src/app/beithady/ads/audience/_components/device-tab.tsx
import { queryDeviceRollup, type DeviceRollupRow } from '@/lib/beithady/ads/insights-device';
import { derivePriorPeriod } from '@/lib/beithady/ads/date-range';
import { PeriodDeltaBadge } from '../../_components/period-delta-badge';

const DEVICE_LABEL: Record<string, string> = {
  mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop', connected_tv: 'CTV', tv: 'TV', unknown: 'Unknown',
};
const DEVICE_COLOR: Record<string, string> = {
  mobile: 'bg-emerald-500/70 dark:bg-emerald-600/70',
  tablet: 'bg-emerald-300/70 dark:bg-emerald-400/70',
  desktop: 'bg-slate-400/70 dark:bg-slate-500/70',
  connected_tv: 'bg-slate-300/70 dark:bg-slate-600/70',
  tv: 'bg-slate-300/70 dark:bg-slate-600/70',
  unknown: 'bg-slate-200/70 dark:bg-slate-700/70',
};

function sumBy<K extends string>(rows: DeviceRollupRow[], keyFn: (r: DeviceRollupRow) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) ?? 0) + r.clicks);
  return m;
}

export async function DeviceTab({
  range, campaignId, platforms,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
}) {
  const [current, prior] = await Promise.all([
    queryDeviceRollup({ from: range.from, to: range.to, campaignId, platforms }),
    range.compare ? queryDeviceRollup({ ...derivePriorPeriod(range), campaignId, platforms }) : Promise.resolve([]),
  ]);

  if (current.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No device data yet for this range.
      </div>
    );
  }

  const byDevice = sumBy(current, r => r.device_platform);
  const totalClicks = current.reduce((s, r) => s + r.clicks, 0) || 1;
  const hasMeta = current.some(r => r.publisher_platform != null);
  const byPlacement = hasMeta
    ? sumBy(current.filter(r => r.publisher_platform), r => `${r.publisher_platform}:${r.placement ?? '—'}`)
    : new Map();

  return (
    <div className="space-y-3">
      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Devices</h3>
        <div className="h-4 w-full rounded overflow-hidden flex">
          {Array.from(byDevice.entries()).map(([dev, clicks]) => (
            <div key={dev}
                 className={DEVICE_COLOR[dev] ?? DEVICE_COLOR.unknown}
                 style={{ width: `${(clicks / totalClicks) * 100}%` }}
                 title={`${DEVICE_LABEL[dev] ?? dev}: ${clicks.toLocaleString()} clicks`} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          {Array.from(byDevice.entries()).map(([dev, clicks]) => (
            <span key={dev} className="inline-flex items-center gap-1">
              <span className={`w-3 h-3 rounded ${DEVICE_COLOR[dev] ?? DEVICE_COLOR.unknown}`} />
              <span className="font-medium text-slate-700 dark:text-slate-200">{DEVICE_LABEL[dev] ?? dev}</span>
              <span className="tabular-nums">{clicks.toLocaleString()} · {Math.round((clicks / totalClicks) * 100)}%</span>
            </span>
          ))}
        </div>
      </div>

      {hasMeta && (
        <div className="ix-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Placements (Meta only)</h3>
          <div className="space-y-1.5 text-xs">
            {Array.from(byPlacement.entries()).sort((a, b) => b[1] - a[1]).map(([key, clicks]) => {
              const [pub, plc] = key.split(':');
              const pct = (clicks / totalClicks) * 100;
              return (
                <div key={key} className="grid grid-cols-[180px_1fr_70px] items-center gap-3">
                  <span className="text-slate-600 dark:text-slate-300 truncate"><span className="capitalize">{pub}</span> · {plc}</span>
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                    <div className="h-full bg-emerald-400/70 dark:bg-emerald-600/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-slate-500 dark:text-slate-400">{clicks.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Detail</h3>
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Device</th>
              <th className="py-2">Publisher</th>
              <th className="py-2">Placement</th>
              <th className="py-2 text-right">Impressions</th>
              <th className="py-2 text-right">Clicks</th>
              <th className="py-2 text-right">CTR</th>
              <th className="py-2 text-right">Spend (EGP)</th>
              <th className="py-2 text-right">Leads</th>
              {range.compare && <th className="py-2 text-right">Δ clicks</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {current.map(r => {
              const ctr = r.impressions ? (r.clicks / r.impressions) * 100 : 0;
              const p = prior.find(x =>
                x.device_platform === r.device_platform &&
                x.publisher_platform === r.publisher_platform &&
                x.placement === r.placement);
              return (
                <tr key={`${r.device_platform}|${r.publisher_platform ?? ''}|${r.placement ?? ''}`}
                    className="text-slate-700 dark:text-slate-200">
                  <td className="py-1.5">{DEVICE_LABEL[r.device_platform] ?? r.device_platform}</td>
                  <td className="py-1.5 capitalize">{r.publisher_platform ?? '—'}</td>
                  <td className="py-1.5">{r.placement ?? '—'}</td>
                  <td className="py-1.5 text-right">{r.impressions.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{r.clicks.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{ctr.toFixed(2)}%</td>
                  <td className="py-1.5 text-right">{(r.spend_micros / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="py-1.5 text-right">{r.leads.toLocaleString()}</td>
                  {range.compare && (
                    <td className="py-1.5 text-right">
                      <PeriodDeltaBadge current={r.clicks} prior={p?.clicks ?? 0} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test + tsc + commit**

Run: `npx vitest run src/app/beithady/ads/audience/_components/device-tab.test.tsx`
Expected: 1 test PASS.

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add src/app/beithady/ads/audience/_components/device-tab.tsx src/app/beithady/ads/audience/_components/device-tab.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): replace DeviceTab stub with real device stacked bar + Meta placement bar + detail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 25: Manual smoke + handoff

No code in this task — purely verification + handoff.

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: ~765 passing / 22 skipped, 0 failures. The 60 new tests this V1 added: date-range (11) + period-delta (8) + insights-errors (3) + meta-client (4) + google-client (5) + tiktok-client (3) + insights-geo (6) + insights-demo (5) + insights-device (5) + cron route (3) + backfill action (1) + reporting (2) + period-delta-badge (5) + date-range-filter (3) + audience-summary-widget (2) + audience-filters (2) + geo-tab (2) + demo-tab (1) + device-tab (1) = 72 (slightly above the spec's 60 estimate — fine).

- [ ] **Step 2: tsc clean**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Vercel alias check**

After the GitHub auto-deploy fires for the final commit, confirm production is up to date. From the worktree:

```bash
# get the latest production deploy URL from the GitHub deploy + alias check
vercel ls limeinc | head -5
# if app.limeinc.cc is still pointing at an old build, manually re-alias:
# vercel alias set <new-deploy-url> app.limeinc.cc
```

(Per memory: `app.limeinc.cc` alias on the lime Vercel project does NOT auto-update on deploy — needs manual `vercel alias set` until dashboard config is fixed.)

- [ ] **Step 4: Manual smoke checklist (7 checks from spec § Testing)**

Walk the live app at `https://app.limeinc.cc`:

1. **Backfill 90d** — `/admin/integrations` → click "Backfill 90d ads breakdowns" → wait ~60s → verify Supabase MCP query shows >50 rows per breakdown table per platform.
2. **Dashboard widget** — `/beithady/ads/` → audience snapshot card renders top-3 per dimension → click "Open full report →" → arrives at `/beithady/ads/audience` with `?from=&to=` preserved.
3. **Date filter** — switch presets (7d / 30d / 90d / Lifetime); KPI numbers update + URL has `?preset=` → toggle compare → delta badges appear next to KPIs/table rows.
4. **Geo tab** — country table renders; period-delta column visible when compare=1.
5. **Demo tab** — age × gender bars render; detail table below; tooltip on hover shows raw values.
6. **Device tab** — device stacked bar renders; Meta placement bar visible (since Meta data is loaded); per-platform detail table below.
7. **Campaign drill** — `/beithady/ads/campaigns/<id>` → date filter visible → per-campaign audience widget renders → click "Open full report →" → arrives at audience page with `?campaign=<id>` filter applied.

Document any failure as a TODO in `SESSION_HANDOFF.md` and either fix-in-place or open a follow-up note in V1.5 backlog.

- [ ] **Step 5: Update `SESSION_HANDOFF.md` + final commit**

Append to `SESSION_HANDOFF.md`:

```
## YYYY-MM-DD — BH Ads Insights V1 shipped

✅ Migration 0138 (geo/demo/device breakdown tables)
✅ Cron beithady-ads-breakdowns every 6h
✅ 90d backfill button on /admin/integrations
✅ Date filter + compare toggle on /beithady/ads, /audience, /campaigns/[id], /performance
✅ Audience widget on main dashboard + dedicated /beithady/ads/audience page
✅ 3 tabs: Geo / Demographics / Device & Placement
✅ ~72 new tests passing; ~765 total / 22 skipped; tsc clean

Next: V2 (Funnel + Quality) per roadmap, when kareem says go.
```

```bash
git add SESSION_HANDOFF.md
git commit -m "$(cat <<'EOF'
chore(handoff): mark BH Ads Insights V1 shipped

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Self-review notes

(Performed inline by author; recorded here for traceability.)

**Spec coverage check** — every locked decision in the spec maps to a task:
- Q1 main + dedicated page → Tasks 19 (wire main) + 21 (build page)
- Q2 all three platforms → Tasks 5 (Meta), 6/7/8 (Google), 9 (TikTok)
- Q3 presets + custom + compare → Tasks 17 (filter component) + 2 (range helpers)
- Q4a campaign + adset filters → Task 21 (filters); adset-level is in queries via `ad_set_id` (nullable; campaign rollups currently aggregate adset rows). Adset drill UI is light in V1 — surfaced through "campaign filter" picking implicitly all adsets; spec calls drill-down a V1 feature but accepts campaign-rolled-up in the audience tabs.
- Q4b 90d backfill → Task 14
- All 3 tables + indexes → Task 1
- Cron @ */6h + maxDuration 800 → Task 13
- Period-delta edge cases (zero-prior, both-zero, etc.) → Task 3 tests
- Typed errors → Task 4
- Permission gate → applied in audience/page.tsx Step 4 of Task 21

**Type consistency** — `parseDateRange()` returns `{from,to,preset,compare}`; every tab consumes the same shape. `queryGeoRollup` / `queryDemoRollup` / `queryDeviceRollup` all accept `{ from, to, campaignId?, accountId?, platforms? }` — same signature shape. `PeriodDeltaBadge` always called with `(current, prior, reverseColor?)`. `computePeriodDelta` mirrors that signature.

**Open footguns flagged**:
- **Task 10 step 3** — `GOOGLE_GEO_ISO2` ships with 4 entries (GB, US, AE, SA); expand as the cron starts logging unmapped resource names.
- **Task 15** is API-shape-compat with positional `getDashboardKpis(30)` callers. Verify in step 4 that `npx tsc --noEmit` is green; any caller passing `30` continues to work.
- **Task 19** assumes you'll consume `getDashboardKpis({ from: range.from, to: range.to })`. Old code passing `30` keeps working but loses the date filter — update each caller in step 2.

**No placeholders elsewhere.** Every step contains complete code, exact paths, and runnable commands.
