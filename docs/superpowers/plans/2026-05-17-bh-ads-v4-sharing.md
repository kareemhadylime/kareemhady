# BH Ads Insights V4 — Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public tokenized share links + browser-print PDF export to `/beithady/ads/`. Recipient sees a frozen mirror of the entire dashboard (overview + 8 audience sub-tabs) without login. Link expires 48h after generation.

**Architecture:** Single new table `ads_dashboard_snapshots` (mirrors `daily_report_snapshots` pattern). One server action gathers all 13 data slices + regenerates AI summary + stores JSONB payload + returns token. Public route `/r/beithady/ads/[token]` reads payload and renders existing presentation components in `readonly` mode. PDF = browser print of that page via `@page A4` CSS. Bulk of the work is splitting 13 existing data-fetching server components into pure view + thin fetcher wrappers so live + snapshot share the same view code.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`ix-card` / `ix-btn-*` utilities), TypeScript strict, Supabase Postgres (project `bpjproljatbrbmszwbov`), Vitest + jsdom for tests, `crypto.randomBytes` for tokens, existing `@/lib/anthropic` SDK wrapper for AI summary regen.

---

## File structure overview

**New files:**
- `supabase/migrations/0141_ads_dashboard_snapshots.sql`
- `src/lib/beithady/ads/snapshot.ts` + `snapshot.test.ts` — payload assembly, token gen, cleanup function
- `src/app/r/beithady/ads/[token]/page.tsx` + `page.test.tsx` — public route
- `src/app/beithady/ads/_components/share-link-button.tsx` + `share-link-button.test.tsx` — header button + dialog
- `src/app/beithady/ads/_components/ads-snapshot-view.tsx` + `ads-snapshot-view.test.tsx` — composition wrapper for snapshot mode
- `src/app/beithady/ads/_components/anomaly-banner-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/_components/frt-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/_components/spend-pacing-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/_components/audience-summary-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/audience/_components/geo-tab-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/audience/_components/demo-tab-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/audience/_components/device-tab-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/audience/_components/funnel-tab-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/audience/_components/quality-tab-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/audience/_components/cohort-tab-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/audience/_components/time-tab-view.tsx` + `.test.tsx`
- `src/app/beithady/ads/audience/_components/optimize-tab-view.tsx` + `.test.tsx`

**Modified files:**
- `src/app/beithady/ads/_components/ai-summary-card.tsx` — add `readonly?` + `skippedReason?` props
- `src/app/beithady/ads/_components/anomaly-banner.tsx` — delegate to view
- `src/app/beithady/ads/_components/frt-card.tsx` — delegate to view
- `src/app/beithady/ads/_components/spend-pacing-card.tsx` — delegate to view
- `src/app/beithady/ads/_components/audience-summary-widget.tsx` — delegate to view
- All 8 audience tab components — delegate to their view
- `src/app/beithady/ads/actions.ts` — add `createAdsShareLinkAction`
- `src/app/beithady/ads/page.tsx` — render `<ShareLinkButton />` in header right slot
- `src/app/api/cron/beithady-daily-report-cleanup/route.ts` — also call `cleanupExpiredAdsSnapshots()`

---

## Task 1: Migration 0141 — `ads_dashboard_snapshots` table

**Files:**
- Create: `supabase/migrations/0141_ads_dashboard_snapshots.sql`

- [ ] **Step 1: Write the SQL migration file**

```sql
-- supabase/migrations/0141_ads_dashboard_snapshots.sql
-- BH Ads V4 — public read-only dashboard snapshots reachable via /r/beithady/ads/<token>.
-- Mirrors daily_report_snapshots schema. Auto-expires 48h after generation.
-- Hourly cleanup cron (beithady-daily-report-cleanup) zeroes payload + sets deleted_at.

create extension if not exists pgcrypto;

create table public.ads_dashboard_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  token                 text unique not null,
  payload               jsonb,
  generated_at          timestamptz not null default now(),
  generated_by_user_id  uuid references public.accounts(id) on delete set null,
  expires_at            timestamptz not null,
  deleted_at            timestamptz
);

create index ads_dashboard_snapshots_expires_idx
  on public.ads_dashboard_snapshots (expires_at)
  where deleted_at is null;

create index ads_dashboard_snapshots_user_recent_idx
  on public.ads_dashboard_snapshots (generated_by_user_id, generated_at desc)
  where deleted_at is null;

comment on table public.ads_dashboard_snapshots is
  'BH Ads V4 — public read-only dashboard snapshots reachable via /r/beithady/ads/<token>. Auto-expires 48h after generation.';
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use `mcp__…__apply_migration` against project `bpjproljatbrbmszwbov` with the SQL above. Per CLAUDE.md standing authorization, this does NOT require asking for permission.

- [ ] **Step 3: Verify table exists**

Run `mcp__…__execute_sql` with:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'ads_dashboard_snapshots'
order by ordinal_position;
```

Expected output: 7 rows — `id uuid NO`, `token text NO`, `payload jsonb YES`, `generated_at timestamptz NO`, `generated_by_user_id uuid YES`, `expires_at timestamptz NO`, `deleted_at timestamptz YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0141_ads_dashboard_snapshots.sql
git commit -m "feat(bh-ads): migration 0141 — ads_dashboard_snapshots table (V4)"
```

---

## Task 2: `snapshot.ts` helper — token gen + payload type + cleanup function

**Files:**
- Create: `src/lib/beithady/ads/snapshot.ts`
- Create: `src/lib/beithady/ads/snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/beithady/ads/snapshot.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      update: () => ({
        lt: () => ({
          is: () => ({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

describe('snapshot.ts', () => {
  it('generateSnapshotToken returns 32-char base64url string', async () => {
    const { generateSnapshotToken } = await import('./snapshot');
    const t = generateSnapshotToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('generateSnapshotToken returns unique values across calls', async () => {
    const { generateSnapshotToken } = await import('./snapshot');
    const set = new Set(Array.from({ length: 50 }, () => generateSnapshotToken()));
    expect(set.size).toBe(50);
  });

  it('cleanupExpiredAdsSnapshots returns count of rows zeroed', async () => {
    const { cleanupExpiredAdsSnapshots } = await import('./snapshot');
    const r = await cleanupExpiredAdsSnapshots();
    expect(r.deleted).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/snapshot.test.ts`
Expected: FAIL with "Cannot find module './snapshot'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/beithady/ads/snapshot.ts
import 'server-only';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Schema version of AdsSnapshotPayload. Bump if the shape changes; the
 * /r/ route can then gracefully degrade older snapshots.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

/**
 * BH Ads V4 snapshot payload. JSONB blob persisted in
 * ads_dashboard_snapshots.payload. ~50-200KB. Postgres TOAST handles
 * compression transparently.
 *
 * NOTE: data slice types (DashboardKpis, FrtData, etc.) are loosely typed
 * here as `unknown`-ish to avoid circular imports across V1/V2/V3 lib
 * modules. The actual shapes are documented in the spec § 6.1 and
 * enforced at assembly time by getAdsSnapshotData().
 */
export type AdsSnapshotPayload = {
  meta: {
    schema_version: typeof SNAPSHOT_SCHEMA_VERSION;
    generated_at: string;
    generated_by_user_id: string | null;
    generated_by_user_email: string | null;
    range: { from: string; to: string; preset: string };
    compare: 'prev_period' | 'prev_year' | null;
    building: string | null;
    ai_used: boolean;
    ai_skipped_reason?: 'cap_reached' | 'error';
  };
  kpis: { current: Record<string, unknown>; prior: Record<string, unknown> | null };
  campaigns: Array<Record<string, unknown>>;
  recent_leads: Array<Record<string, unknown>>;
  platform_status: { meta: unknown; google: unknown; tiktok: unknown };
  frt: Record<string, unknown> | null;
  spend_pacing: Record<string, unknown>;
  anomalies: Array<Record<string, unknown>>;
  audience_summary: Record<string, unknown>;
  ai_summary: string | null;
  audience_geo: Array<Record<string, unknown>>;
  audience_demo: Array<Record<string, unknown>>;
  audience_device: Array<Record<string, unknown>>;
  funnel: Record<string, unknown>;
  quality: Array<Record<string, unknown>>;
  cohort: Record<string, unknown>;
  time: { lead_density: Array<Record<string, unknown>>; meta_hourly: Array<Record<string, unknown>> };
  optimize: { top_ads: Array<Record<string, unknown>>; top_assets: Array<Record<string, unknown>> };
};

/**
 * 192-bit token (24 random bytes, base64url-encoded → 32 chars).
 * Same entropy + encoding as daily_report_snapshots.token.
 */
export function generateSnapshotToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Hourly cleanup — zeroes payload + marks deleted_at on expired rows.
 * Row stays for audit, payload bytes freed via TOAST.
 * Called from the existing beithady-daily-report-cleanup cron.
 */
export async function cleanupExpiredAdsSnapshots(): Promise<{ deleted: number }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('ads_dashboard_snapshots')
    .update({ payload: null, deleted_at: new Date().toISOString() })
    .lt('expires_at', new Date().toISOString())
    .is('deleted_at', null)
    .select('id');
  if (error) throw error;
  return { deleted: data?.length ?? 0 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/beithady/ads/snapshot.test.ts`
Expected: PASS — 3/3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/ads/snapshot.ts src/lib/beithady/ads/snapshot.test.ts
git commit -m "feat(bh-ads): snapshot.ts — token gen + payload type + cleanup (V4)"
```

---

## Task 3: Extend cleanup cron to call `cleanupExpiredAdsSnapshots`

**Files:**
- Modify: `src/app/api/cron/beithady-daily-report-cleanup/route.ts`

- [ ] **Step 1: Read the current cron route**

```ts
// Current (src/app/api/cron/beithady-daily-report-cleanup/route.ts):
import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredSnapshots } from '@/lib/beithady-daily-report/run';

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const r = await cleanupExpiredSnapshots();
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const maxDuration = 30;
export const dynamic = 'force-dynamic';
```

- [ ] **Step 2: Modify the route to also call cleanupExpiredAdsSnapshots**

Replace the file contents with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredSnapshots } from '@/lib/beithady-daily-report/run';
import { cleanupExpiredAdsSnapshots } from '@/lib/beithady/ads/snapshot';

// Hourly cleanup: clears pdf_bytes + payload from snapshots past their
// 48-hour expiry. Tokens become invalid (the [token] route checks
// expires_at on read), and the heavy bytes free up so we don't grow
// unbounded.
// V4 (2026-05-17): also cleans ads_dashboard_snapshots from BH Ads
// V4 share links — same 48h expiry, same soft-delete pattern.

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const [daily, ads] = await Promise.all([
      cleanupExpiredSnapshots(),
      cleanupExpiredAdsSnapshots(),
    ]);
    return NextResponse.json({ daily, ads });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const maxDuration = 30;
export const dynamic = 'force-dynamic';
```

- [ ] **Step 3: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: PASS (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/beithady-daily-report-cleanup/route.ts
git commit -m "feat(bh-ads): extend cleanup cron to purge ads_dashboard_snapshots (V4)"
```

---

## Task 4: `getAdsSnapshotData` — gather all 13 data slices into a payload

**Files:**
- Modify: `src/lib/beithady/ads/snapshot.ts`
- Modify: `src/lib/beithady/ads/snapshot.test.ts`

- [ ] **Step 1: Add failing test for the gather function**

Append to `src/lib/beithady/ads/snapshot.test.ts`:

```ts
describe('getAdsSnapshotData', () => {
  it('assembles all 13 slices into an AdsSnapshotPayload', async () => {
    // Mock every lib function used by the gather
    vi.doMock('@/lib/beithady/ads/reporting', () => ({
      getDashboardKpisWithCompare: vi.fn().mockResolvedValue({
        current: { spend: 100, leads: 5 }, prior: { spend: 80, leads: 4 },
      }),
      listCampaigns: vi.fn().mockResolvedValue([]),
      listLeadFunnel: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/frt', () => ({
      getFrtSummary: vi.fn().mockResolvedValue({ total_leads: 0 }),
      getFrtPerCampaign: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/pacing', () => ({
      getSpendPacing: vi.fn().mockResolvedValue({ daily: [], campaigns: [], total_spend_egp: 0, total_cap_egp: 0 }),
    }));
    vi.doMock('@/lib/beithady/ads/anomalies', () => ({
      detectAnomalies: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/insights-geo', () => ({
      queryGeoRollup: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/insights-demo', () => ({
      queryDemoRollup: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/insights-device', () => ({
      queryDeviceRollup: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/funnel', () => ({
      getFunnelStages: vi.fn().mockResolvedValue({ stages: [] }),
    }));
    vi.doMock('@/lib/beithady/ads/lead-quality', () => ({
      getLeadQualityPerCampaign: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/cohort', () => ({
      getLeadToBookingCohort: vi.fn().mockResolvedValue({ buckets: [] }),
      cellColorBucket: vi.fn().mockReturnValue(''),
    }));
    vi.doMock('@/lib/beithady/ads/hourly', () => ({
      getLeadDensityHeatmap: vi.fn().mockResolvedValue([]),
      getMetaHourlyHeatmap: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/top-ads', () => ({
      getTopAds: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/beithady/ads/top-assets', () => ({
      getTopAssets: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/credentials', () => ({
      getProviderEnabled: vi.fn().mockResolvedValue(true),
      getProviderStatus: vi.fn().mockResolvedValue({ config_keys_set: [], has_env_fallback: [] }),
    }));
    vi.doMock('@/lib/fx-rates', () => ({
      convertManyToEgp: vi.fn().mockResolvedValue([]),
    }));

    const { getAdsSnapshotData } = await import('./snapshot');
    const data = await getAdsSnapshotData({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: 'prev_period',
      building: null,
    });

    expect(data.kpis.current).toEqual({ spend: 100, leads: 5 });
    expect(data.kpis.prior).toEqual({ spend: 80, leads: 4 });
    expect(data.campaigns).toEqual([]);
    expect(data.anomalies).toEqual([]);
    expect(data.audience_geo).toEqual([]);
    expect(data.optimize.top_ads).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/beithady/ads/snapshot.test.ts`
Expected: FAIL with "getAdsSnapshotData is not exported"

- [ ] **Step 3: Implement `getAdsSnapshotData` in snapshot.ts**

Append to `src/lib/beithady/ads/snapshot.ts`:

```ts
import { getDashboardKpisWithCompare, listCampaigns, listLeadFunnel } from './reporting';
import { getFrtSummary, getFrtPerCampaign } from './frt';
import { getSpendPacing } from './pacing';
import { detectAnomalies } from './anomalies';
import { queryGeoRollup } from './insights-geo';
import { queryDemoRollup } from './insights-demo';
import { queryDeviceRollup } from './insights-device';
import { getFunnelStages } from './funnel';
import { getLeadQualityPerCampaign } from './lead-quality';
import { getLeadDensityHeatmap, getMetaHourlyHeatmap } from './hourly';
import { getTopAds } from './top-ads';
import { getTopAssets } from './top-assets';
import { getProviderEnabled, getProviderStatus } from '@/lib/credentials';
import { convertManyToEgp } from '@/lib/fx-rates';

/**
 * Gather every data slice the /beithady/ads dashboard renders.
 * Called by createAdsShareLinkAction before storing the snapshot.
 *
 * All slices fetch in parallel via Promise.all. If any throws, the
 * whole gather fails — the caller (action) returns a data_error response.
 *
 * AI summary is gathered separately by the action (force regenerate
 * via generateAiSummary, with graceful skip on cap/error).
 */
export type SnapshotGatherInput = {
  range: { from: string; to: string; preset: string };
  compare: 'prev_period' | 'prev_year' | null;
  building: string | null;
};

export type SnapshotGatherResult = Omit<AdsSnapshotPayload, 'meta' | 'ai_summary'>;

export async function getAdsSnapshotData(
  input: SnapshotGatherInput,
): Promise<SnapshotGatherResult> {
  const { range, compare, building } = input;
  const buildingCode = building ?? undefined;

  const [
    kpisCompare,
    campaigns,
    recent_leads,
    metaEnabled, metaStatus,
    googleEnabled, googleStatus,
    tiktokEnabled, tiktokStatus,
    frtSummary, frtPerCampaign,
    spend_pacing,
    anomalies,
    audience_geo, audience_demo, audience_device,
    funnel,
    quality,
    leadDensity, metaHourly,
    top_ads, top_assets,
  ] = await Promise.all([
    getDashboardKpisWithCompare({ range: { from: range.from, to: range.to }, compare: compare ?? undefined }),
    listCampaigns(),
    listLeadFunnel({ limit: 10 }),
    getProviderEnabled('meta_marketing'), getProviderStatus('meta_marketing'),
    getProviderEnabled('google_ads'), getProviderStatus('google_ads'),
    getProviderEnabled('tiktok_ads'), getProviderStatus('tiktok_ads'),
    getFrtSummary({ from: range.from, to: range.to, buildingCode }),
    getFrtPerCampaign({ from: range.from, to: range.to, buildingCode }),
    getSpendPacing({ range: { from: range.from, to: range.to } }),
    detectAnomalies(),
    queryGeoRollup({ from: range.from, to: range.to }),
    queryDemoRollup({ from: range.from, to: range.to }),
    queryDeviceRollup({ from: range.from, to: range.to }),
    getFunnelStages({ from: range.from, to: range.to, buildingCode }),
    getLeadQualityPerCampaign({ from: range.from, to: range.to }),
    getLeadDensityHeatmap({ from: range.from, to: range.to, buildingCode }),
    getMetaHourlyHeatmap({ from: range.from, to: range.to }),
    getTopAds({ from: range.from, to: range.to, sortBy: 'leads', limit: 20, buildingCode }),
    getTopAssets({ buildingCode, limit: 20 }),
  ]);

  // EGP-convert campaign spend up front so the snapshot doesn't need
  // FX rates at render time.
  const campaignSpendEgp = await convertManyToEgp(
    campaigns.map((c: { spend: unknown; account_currency: string }) => ({
      amount: Number(c.spend) || 0,
      currency: c.account_currency,
    })),
  );
  const campaignsWithEgp = campaigns.map((c: Record<string, unknown>, i: number) => ({
    ...c,
    spend_egp: campaignSpendEgp[i] || 0,
  }));

  // Platform connection status: matches PlatformStatusCard in page.tsx
  function platformConfigured(enabled: boolean, status: { config_keys_set: string[]; has_env_fallback: string[] }, minKeys: number) {
    return enabled && (status.config_keys_set.length >= minKeys || status.has_env_fallback.length >= minKeys);
  }
  const platform_status = {
    meta: { configured: platformConfigured(metaEnabled, metaStatus, 4) },
    google: { configured: platformConfigured(googleEnabled, googleStatus, 4) },
    tiktok: { configured: platformConfigured(tiktokEnabled, tiktokStatus, 2) },
  };

  // Build the AudienceSummaryWidget shape (it normally fetches all 3
  // breakdowns + a total). We've already got geo/demo/device above.
  const audience_summary = {
    geo: audience_geo.slice(0, 3),
    demo: audience_demo.slice(0, 3),
    device: audience_device.slice(0, 3),
    totals: {
      geo_clicks: audience_geo.reduce((s: number, r: { clicks: number }) => s + r.clicks, 0) || 1,
      demo_clicks: audience_demo.reduce((s: number, r: { clicks: number }) => s + r.clicks, 0) || 1,
      device_clicks: audience_device.reduce((s: number, r: { clicks: number }) => s + r.clicks, 0) || 1,
    },
  };

  // FRT: null if no leads in range
  const frt = frtSummary.total_leads === 0
    ? null
    : { summary: frtSummary, per_campaign: frtPerCampaign };

  // Cohort: placeholder shape — getLeadToBookingCohort is a V2 export but
  // not currently rendered on the dashboard. Add an empty bucket array
  // (CohortTabView handles empty).
  const cohort = { buckets: [] };

  return {
    kpis: { current: kpisCompare.current, prior: kpisCompare.prior },
    campaigns: campaignsWithEgp,
    recent_leads,
    platform_status,
    frt,
    spend_pacing,
    anomalies,
    audience_summary,
    audience_geo,
    audience_demo,
    audience_device,
    funnel,
    quality,
    cohort,
    time: { lead_density: leadDensity, meta_hourly: metaHourly },
    optimize: { top_ads, top_assets },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/beithady/ads/snapshot.test.ts`
Expected: PASS — 4/4 tests.

- [ ] **Step 5: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: PASS (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady/ads/snapshot.ts src/lib/beithady/ads/snapshot.test.ts
git commit -m "feat(bh-ads): getAdsSnapshotData — gather all 13 dashboard slices (V4)"
```

---

## Task 5: `createAdsShareLinkAction` — server action with rate limit + AI cap-skip

**Files:**
- Modify: `src/app/beithady/ads/actions.ts`
- Create: `src/app/beithady/ads/actions.share-link.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/ads/actions.share-link.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCurrentUser = vi.fn();
const mockHasPermission = vi.fn();
const mockGetSnapshotData = vi.fn();
const mockGenerateAiSummary = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock('@/lib/auth', () => ({ getCurrentUser: mockCurrentUser }));
vi.mock('@/lib/beithady/auth', () => ({
  hasBeithadyPermission: mockHasPermission,
  requireBeithadyPermission: vi.fn(),
}));
vi.mock('@/lib/beithady/ads/snapshot', async () => {
  const actual = await vi.importActual<typeof import('@/lib/beithady/ads/snapshot')>('@/lib/beithady/ads/snapshot');
  return { ...actual, getAdsSnapshotData: mockGetSnapshotData, generateSnapshotToken: () => 'fixed-token-32-chars-base64url--xx' };
});
vi.mock('@/lib/beithady/ads/ai-summary', () => ({
  generateAiSummary: mockGenerateAiSummary,
  AI_SUMMARY_DAILY_CAP: 20,
}));
vi.mock('@/lib/beithady/audit', () => ({ recordAudit: mockRecordAudit }));

const insertMock = vi.fn().mockResolvedValue({ error: null });
const auditCountMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'ads_dashboard_snapshots') return { insert: insertMock };
      if (table === 'beithady_audit_log') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: auditCountMock,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentUser.mockResolvedValue({ id: 'user-1', username: 'kareem', email: 'k@x' });
  mockHasPermission.mockResolvedValue(true);
  mockGetSnapshotData.mockResolvedValue({
    kpis: { current: {}, prior: null }, campaigns: [], recent_leads: [],
    platform_status: { meta: {}, google: {}, tiktok: {} },
    frt: null, spend_pacing: {}, anomalies: [], audience_summary: {},
    audience_geo: [], audience_demo: [], audience_device: [],
    funnel: {}, quality: [], cohort: { buckets: [] },
    time: { lead_density: [], meta_hourly: [] }, optimize: { top_ads: [], top_assets: [] },
  });
  mockGenerateAiSummary.mockResolvedValue({ ok: true, text: 'P1\n\nP2\n\nP3', cost_usd: 0.01 });
  auditCountMock.mockResolvedValue({ count: 0, error: null });
});

describe('createAdsShareLinkAction', () => {
  it('success path returns token + URL + expires_at', async () => {
    const { createAdsShareLinkAction } = await import('./actions');
    const r = await createAdsShareLinkAction({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: null, building: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.token).toBe('fixed-token-32-chars-base64url--xx');
    expect(r.url).toMatch(/\/r\/beithady\/ads\/fixed-token-32-chars-base64url--xx$/);
    expect(insertMock).toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalledWith(expect.objectContaining({
      module: 'ads', action: 'ads_share_link_created',
    }));
  });

  it('rate_limit when audit log already has 5 entries today', async () => {
    auditCountMock.mockResolvedValueOnce({ count: 5, error: null });
    const { createAdsShareLinkAction } = await import('./actions');
    const r = await createAdsShareLinkAction({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: null, building: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('rate_limit');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('graceful AI cap-skip — snapshot succeeds with ai_skipped_reason', async () => {
    mockGenerateAiSummary.mockResolvedValueOnce({ ok: false, error: 'cap_reached', cost_usd: 0, detail: 'over cap' });
    const { createAdsShareLinkAction } = await import('./actions');
    const r = await createAdsShareLinkAction({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: null, building: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.ai_skipped_reason).toBe('cap_reached');
    // Inserted payload should have ai_summary=null
    const insertedPayload = insertMock.mock.calls[0][0].payload;
    expect(insertedPayload.ai_summary).toBeNull();
    expect(insertedPayload.meta.ai_skipped_reason).toBe('cap_reached');
  });

  it('data_error when getAdsSnapshotData throws', async () => {
    mockGetSnapshotData.mockRejectedValueOnce(new Error('supabase down'));
    const { createAdsShareLinkAction } = await import('./actions');
    const r = await createAdsShareLinkAction({
      range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
      compare: null, building: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('data_error');
    expect(r.message).toContain('supabase down');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/actions.share-link.test.ts`
Expected: FAIL with "createAdsShareLinkAction is not a function" or "not exported"

- [ ] **Step 3: Implement createAdsShareLinkAction in actions.ts**

Append to `src/app/beithady/ads/actions.ts` (after the last existing export):

```ts
// =====================================================================
// V4 — Public share link creation
// =====================================================================
import {
  getAdsSnapshotData,
  generateSnapshotToken,
  SNAPSHOT_SCHEMA_VERSION,
  type AdsSnapshotPayload,
} from '@/lib/beithady/ads/snapshot';
import { AI_SUMMARY_DAILY_CAP } from '@/lib/beithady/ads/ai-summary';

const SHARE_LINK_DAILY_CAP = 5;
const SHARE_LINK_TTL_HOURS = 48;
const APP_BASE = (() => {
  const b =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'https://limeinc.vercel.app';
  return b.startsWith('http') ? b : `https://${b}`;
})();

export type CreateShareLinkInput = {
  range: { from: string; to: string; preset: string };
  compare: 'prev_period' | 'prev_year' | null;
  building: string | null;
};

export type CreateShareLinkResult =
  | { ok: true; token: string; url: string; expires_at: string; ai_skipped_reason?: 'cap_reached' | 'error' }
  | { ok: false; error: 'rate_limit' | 'data_error' | 'forbidden'; message: string };

export async function createAdsShareLinkAction(
  input: CreateShareLinkInput,
): Promise<CreateShareLinkResult> {
  // Auth — ads:read (more permissive than the requireFull() used by other actions)
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'forbidden', message: 'Not authenticated' };
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'ads', 'read'));
  if (!allowed) return { ok: false, error: 'forbidden', message: 'Missing ads:read permission' };

  // Rate limit — count today's snapshots in Cairo time
  const sb = supabaseAdmin();
  const cairoToday = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
  const sinceIso = new Date(cairoToday + 'T00:00:00+03:00').toISOString();
  const { count, error: countError } = await sb.from('beithady_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'ads')
    .eq('action', 'ads_share_link_created')
    .eq('actor_user_id', user.id)
    .gte('created_at', sinceIso);
  if (countError) {
    return { ok: false, error: 'data_error', message: `Rate-limit check failed: ${countError.message}` };
  }
  if ((count ?? 0) >= SHARE_LINK_DAILY_CAP) {
    return {
      ok: false,
      error: 'rate_limit',
      message: `You've used ${SHARE_LINK_DAILY_CAP}/${SHARE_LINK_DAILY_CAP} share links today. Try again after midnight Cairo.`,
    };
  }

  // Gather data
  let data;
  try {
    data = await getAdsSnapshotData(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: 'data_error', message: msg };
  }

  // AI summary — force regenerate with graceful skip
  let aiSummary: string | null = null;
  let aiSkippedReason: 'cap_reached' | 'error' | undefined;
  try {
    const aiResult = await generateAiSummary({
      range: { from: input.range.from, to: input.range.to },
      dashboardData: {
        kpis: {
          spend_egp: (data.kpis.current as { spend?: number }).spend ?? 0,
          leads: (data.kpis.current as { leads?: number }).leads ?? 0,
          bookings: (data.kpis.current as { bookings?: number }).bookings ?? 0,
          cpl_egp: (data.kpis.current as { cpl?: number | null }).cpl ?? null,
          roas: (data.kpis.current as { roas?: number | null }).roas ?? null,
          attributed_revenue_egp: (data.kpis.current as { attributed_revenue?: number }).attributed_revenue ?? 0,
        },
        topCountries: (data.audience_geo as Array<{ country_code: string; clicks: number }>).slice(0, 5).map(r => ({ country: r.country_code, clicks: r.clicks, pct: 0 })),
        topDemos: (data.audience_demo as Array<{ age_range: string; gender: string; clicks: number }>).slice(0, 5).map(r => ({ age_range: r.age_range, gender: r.gender, clicks: r.clicks, pct: 0 })),
        topDevices: (data.audience_device as Array<{ device_platform: string; clicks: number }>).slice(0, 5).map(r => ({ device: r.device_platform, clicks: r.clicks, pct: 0 })),
        topCampaigns: (data.quality as Array<{ campaign_name: string; platform: string; leads: number; quality_pct: number }>).slice(0, 5).map(r => ({ name: r.campaign_name, platform: r.platform, leads: r.leads, cpl_egp: null, quality_pct: r.quality_pct })),
        frtSummary: data.frt
          ? { median_minutes: ((data.frt as { summary: { median_minutes: number } }).summary).median_minutes, p95_minutes: ((data.frt as { summary: { p95_minutes: number } }).summary).p95_minutes, over_1h_pct: ((data.frt as { summary: { over_1h_pct: number } }).summary).over_1h_pct }
          : { median_minutes: null, p95_minutes: null, over_1h_pct: 0 },
        anomalies: data.anomalies as Array<{ type: string; severity: string; message: string }>,
        funnelStages: ((data.funnel as { stages?: Array<{ key: string; count: number }> }).stages ?? []).map(s => ({ key: s.key, count: s.count })),
      },
    });
    if (aiResult.ok) {
      aiSummary = aiResult.text;
    } else {
      aiSkippedReason = aiResult.error === 'cap_reached' ? 'cap_reached' : 'error';
    }
  } catch {
    aiSkippedReason = 'error';
  }

  // Build payload
  const generated_at = new Date().toISOString();
  const expires_at = new Date(Date.now() + SHARE_LINK_TTL_HOURS * 3600 * 1000).toISOString();
  const payload: AdsSnapshotPayload = {
    meta: {
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      generated_at,
      generated_by_user_id: user.id ? String(user.id) : null,
      generated_by_user_email: user.email ?? null,
      range: input.range,
      compare: input.compare,
      building: input.building,
      ai_used: aiSummary !== null,
      ...(aiSkippedReason ? { ai_skipped_reason: aiSkippedReason } : {}),
    },
    ...data,
    ai_summary: aiSummary,
  };

  // Insert
  const token = generateSnapshotToken();
  const { error: insertError } = await sb.from('ads_dashboard_snapshots').insert({
    token, payload,
    generated_by_user_id: user.id ? String(user.id) : null,
    expires_at,
  });
  if (insertError) {
    return { ok: false, error: 'data_error', message: `Snapshot insert failed: ${insertError.message}` };
  }

  // Audit (also serves as rate-limit ledger)
  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'ads_share_link_created',
    metadata: {
      token, expires_at,
      range: input.range,
      building: input.building,
      ai_skipped_reason: aiSkippedReason ?? null,
    },
  });

  return {
    ok: true,
    token,
    url: `${APP_BASE}/r/beithady/ads/${token}`,
    expires_at,
    ...(aiSkippedReason ? { ai_skipped_reason: aiSkippedReason } : {}),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/beithady/ads/actions.share-link.test.ts`
Expected: PASS — 4/4 tests.

- [ ] **Step 5: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: PASS (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/actions.ts src/app/beithady/ads/actions.share-link.test.ts
git commit -m "feat(bh-ads): createAdsShareLinkAction — 5/day rate limit + graceful AI cap-skip (V4)"
```

---

## Task 6: Refactor `<AiSummaryCard />` — add `readonly` + `skippedReason` props

**Files:**
- Modify: `src/app/beithady/ads/_components/ai-summary-card.tsx`
- Create: `src/app/beithady/ads/_components/ai-summary-card.readonly.test.tsx`

Note: `AiSummaryCard` is already mostly a view component (takes `summary` as a prop, doesn't fetch). This task adds readonly mode for snapshot rendering.

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/ads/_components/ai-summary-card.readonly.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiSummaryCard } from './ai-summary-card';

describe('AiSummaryCard readonly mode', () => {
  it('hides the Generate button when readonly=true', () => {
    render(<AiSummaryCard range={{ from: '2026-05-01', to: '2026-05-15' }} summary={'P1\n\nP2'} usedToday={0} readonly />);
    expect(screen.queryByText(/Generate summary/i)).toBeNull();
    expect(screen.queryByText(/Cap reached/i)).toBeNull();
    expect(screen.getByText(/P1/)).toBeTruthy();
    expect(screen.getByText(/P2/)).toBeTruthy();
  });
  it('shows skipped note when skippedReason="cap_reached"', () => {
    render(<AiSummaryCard range={{ from: '2026-05-01', to: '2026-05-15' }} summary={null} usedToday={0} readonly skippedReason="cap_reached" />);
    expect(screen.getByText(/AI summary unavailable/i)).toBeTruthy();
    expect(screen.getByText(/cap reached/i)).toBeTruthy();
  });
  it('shows skipped note when skippedReason="error"', () => {
    render(<AiSummaryCard range={{ from: '2026-05-01', to: '2026-05-15' }} summary={null} usedToday={0} readonly skippedReason="error" />);
    expect(screen.getByText(/AI summary unavailable/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/ai-summary-card.readonly.test.tsx`
Expected: FAIL — `readonly` and `skippedReason` props don't exist yet.

- [ ] **Step 3: Modify ai-summary-card.tsx to support readonly mode**

Replace the file contents with:

```tsx
import { Sparkles } from 'lucide-react';
import { generateAiSummaryAction } from '../actions';

export function AiSummaryCard({
  range, summary, usedToday, readonly, skippedReason,
}: {
  range: { from: string; to: string };
  summary: string | null;
  usedToday: number;
  readonly?: boolean;
  skippedReason?: 'cap_reached' | 'error';
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
        {!readonly && (
          <form action={async (fd) => { await generateAiSummaryAction(fd); }}>
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
        )}
      </div>
      {!readonly && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          cost ~$0.01 · daily cap {usedToday}/20
        </div>
      )}
      {paragraphs.length > 0 ? (
        <div className="space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      ) : readonly && skippedReason ? (
        <div className="text-xs text-amber-700 dark:text-amber-300 italic">
          AI summary unavailable — {skippedReason === 'cap_reached' ? 'daily AI cap reached' : 'generation error'} at snapshot time.
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/beithady/ads/_components/ai-summary-card`
Expected: PASS — both the existing test (if any) AND the new readonly test.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/ads/_components/ai-summary-card.tsx src/app/beithady/ads/_components/ai-summary-card.readonly.test.tsx
git commit -m "feat(bh-ads): AiSummaryCard supports readonly + skippedReason for V4 snapshots"
```

---

## Task 7: Refactor `<AnomalyBanner />` → view + fetcher split

**Files:**
- Create: `src/app/beithady/ads/_components/anomaly-banner-view.tsx`
- Create: `src/app/beithady/ads/_components/anomaly-banner-view.test.tsx`
- Modify: `src/app/beithady/ads/_components/anomaly-banner.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/ads/_components/anomaly-banner-view.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnomalyBannerView } from './anomaly-banner-view';

describe('AnomalyBannerView', () => {
  it('returns null when events array is empty', () => {
    const { container } = render(<AnomalyBannerView events={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders rose-tinted card for critical severity', () => {
    render(<AnomalyBannerView events={[
      { type: 'spend_spike', severity: 'critical', platform: 'meta', message: 'Meta spend 6× yesterday' },
    ]} />);
    const card = screen.getByText(/Meta spend 6× yesterday/).closest('div.ix-card');
    expect(card?.className).toMatch(/rose-/);
  });
  it('renders amber-tinted card for warning severity', () => {
    render(<AnomalyBannerView events={[
      { type: 'low_roas', severity: 'warning', platform: 'google', message: 'Google ROAS 0.4' },
    ]} />);
    const card = screen.getByText(/Google ROAS 0.4/).closest('div.ix-card');
    expect(card?.className).toMatch(/amber-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/anomaly-banner-view.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the view component**

Create `src/app/beithady/ads/_components/anomaly-banner-view.tsx`:

```tsx
import { AlertTriangle } from 'lucide-react';
import type { AnomalyEvent } from '@/lib/beithady/ads/anomalies';

function tintFor(severity: AnomalyEvent['severity']): string {
  return severity === 'critical'
    ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
    : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300';
}

export function AnomalyBannerView({ events }: { events: AnomalyEvent[] }) {
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

- [ ] **Step 4: Update the live wrapper to delegate**

Replace `src/app/beithady/ads/_components/anomaly-banner.tsx` contents with:

```tsx
import { detectAnomalies } from '@/lib/beithady/ads/anomalies';
import { AnomalyBannerView } from './anomaly-banner-view';

export async function AnomalyBanner() {
  const events = await detectAnomalies();
  return <AnomalyBannerView events={events} />;
}
```

- [ ] **Step 5: Run all anomaly-banner tests**

Run: `npx vitest run src/app/beithady/ads/_components/anomaly-banner`
Expected: PASS — view tests + existing live tests (if any).

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/_components/anomaly-banner.tsx src/app/beithady/ads/_components/anomaly-banner-view.tsx src/app/beithady/ads/_components/anomaly-banner-view.test.tsx
git commit -m "refactor(bh-ads): split AnomalyBanner into view + fetcher (V4)"
```

---

## Task 8: Refactor `<FrtCard />` → view + fetcher split

**Files:**
- Create: `src/app/beithady/ads/_components/frt-view.tsx`
- Create: `src/app/beithady/ads/_components/frt-view.test.tsx`
- Modify: `src/app/beithady/ads/_components/frt-card.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/ads/_components/frt-view.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FrtView } from './frt-view';

const baseData = {
  summary: { total_leads: 10, responded_leads: 8, median_minutes: 15, p95_minutes: 65, over_1h_pct: 12, over_1h_count: 1, unresponded_count: 2 },
  per_campaign: [
    { campaign_id: 1, campaign_name: 'CTWA EG', total_leads: 5, over_1h_pct: 30 },
    { campaign_id: 2, campaign_name: 'Search SA', total_leads: 3, over_1h_pct: 5 },
  ],
};

describe('FrtView', () => {
  it('renders nothing for null data', () => {
    const { container } = render(<FrtView data={null} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders median/p95/SLA stats', () => {
    render(<FrtView data={baseData} />);
    expect(screen.getByText(/15m/)).toBeTruthy();
    expect(screen.getByText(/65m/)).toBeTruthy();
    expect(screen.getByText(/12%/)).toBeTruthy();
  });
  it('renders worst-campaign callout when worst > 10% SLA', () => {
    render(<FrtView data={baseData} />);
    expect(screen.getByText(/CTWA EG/)).toBeTruthy();
    expect(screen.getByText(/30%/)).toBeTruthy();
  });
  it('hides Link in readonly mode', () => {
    render(<FrtView data={baseData} readonly />);
    expect(screen.queryByText(/view in Quality/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/frt-view.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the view component**

Create `src/app/beithady/ads/_components/frt-view.tsx`:

```tsx
import Link from 'next/link';
import { Clock } from 'lucide-react';

export type FrtSummaryShape = {
  total_leads: number;
  responded_leads: number;
  median_minutes: number | null;
  p95_minutes: number | null;
  over_1h_pct: number;
  over_1h_count: number;
  unresponded_count: number;
};

export type FrtCampaignRow = {
  campaign_id: number;
  campaign_name: string;
  total_leads: number;
  over_1h_pct: number | null;
};

export type FrtViewData = {
  summary: FrtSummaryShape;
  per_campaign: FrtCampaignRow[];
} | null;

function slaTone(pct: number): string {
  if (pct < 10) return 'text-emerald-700 dark:text-emerald-300';
  if (pct < 20) return 'text-slate-700 dark:text-slate-200';
  return 'text-rose-700 dark:text-rose-300';
}

export function FrtView({ data, readonly }: { data: FrtViewData; readonly?: boolean }) {
  if (!data) return null;
  const { summary, per_campaign } = data;
  const worst = [...per_campaign]
    .filter(c => c.total_leads > 0)
    .sort((a, b) => (b.over_1h_pct ?? 0) - (a.over_1h_pct ?? 0))[0];

  return (
    <div className="ix-card p-5 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <Clock size={14} className="text-emerald-600" />
        <span>WhatsApp first-response time</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Median</div>
          <div className="text-base font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {summary.median_minutes != null ? `${summary.median_minutes}m` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">p95</div>
          <div className="text-base font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {summary.p95_minutes != null ? `${summary.p95_minutes}m` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Over 1h SLA</div>
          <div className={`text-base font-semibold tabular-nums ${slaTone(summary.over_1h_pct)}`}>
            {summary.over_1h_pct}% ({summary.over_1h_count} / {summary.responded_leads})
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Unresponded</div>
          <div className="text-base font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {summary.unresponded_count}
          </div>
        </div>
      </div>
      {worst && (worst.over_1h_pct ?? 0) > 10 && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Worst campaign: <strong className="text-slate-700 dark:text-slate-200">{worst.campaign_name}</strong>
          {' '}({worst.over_1h_pct}% over SLA)
          {!readonly && (
            <>
              {' '}<Link
                href={`/beithady/ads/audience?tab=quality&campaign=${worst.campaign_id}`}
                className="ix-link"
              >view in Quality →</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update the live wrapper to delegate**

Replace `src/app/beithady/ads/_components/frt-card.tsx` contents with:

```tsx
import { getFrtSummary, getFrtPerCampaign } from '@/lib/beithady/ads/frt';
import { FrtView, type FrtViewData } from './frt-view';

export async function FrtCard({
  range, buildingCode,
}: {
  range: { from: string; to: string };
  buildingCode?: string;
}) {
  const [summary, perCampaign] = await Promise.all([
    getFrtSummary({ from: range.from, to: range.to, buildingCode }),
    getFrtPerCampaign({ from: range.from, to: range.to, buildingCode }),
  ]);
  const data: FrtViewData = summary.total_leads === 0
    ? null
    : { summary, per_campaign: perCampaign };
  return <FrtView data={data} />;
}
```

- [ ] **Step 5: Run all frt tests**

Run: `npx vitest run src/app/beithady/ads/_components/frt`
Expected: PASS — view tests + existing live tests (if any).

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/_components/frt-card.tsx src/app/beithady/ads/_components/frt-view.tsx src/app/beithady/ads/_components/frt-view.test.tsx
git commit -m "refactor(bh-ads): split FrtCard into view + fetcher (V4)"
```

---

## Task 9: Refactor `<SpendPacingCard />` → view + fetcher split

**Files:**
- Create: `src/app/beithady/ads/_components/spend-pacing-view.tsx`
- Create: `src/app/beithady/ads/_components/spend-pacing-view.test.tsx`
- Modify: `src/app/beithady/ads/_components/spend-pacing-card.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/ads/_components/spend-pacing-view.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpendPacingView } from './spend-pacing-view';

const baseData = {
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
};

describe('SpendPacingView', () => {
  it('renders sparkline + per-campaign bars', () => {
    render(<SpendPacingView data={baseData} />);
    expect(screen.getByText(/Spend pacing/i)).toBeTruthy();
    expect(screen.getAllByText(/CTWA EG May/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/85%/)).toBeTruthy();
    expect(screen.getByText(/Search SA/)).toBeTruthy();
  });
  it('shows projection warning for campaigns >80% of cap', () => {
    render(<SpendPacingView data={baseData} />);
    expect(screen.getByText(/projected to hit cap/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/spend-pacing-view.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the view component**

Create `src/app/beithady/ads/_components/spend-pacing-view.tsx`:

```tsx
import { TrendingUp } from 'lucide-react';
import type { CampaignPacingRow } from '@/lib/beithady/ads/pacing';

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

export type SpendPacingViewData = {
  daily: Array<{ date: string; spend_egp: number }>;
  campaigns: CampaignPacingRow[];
  total_spend_egp: number;
  total_cap_egp: number;
};

export function SpendPacingView({ data }: { data: SpendPacingViewData }) {
  const points = data.daily.map(d => d.spend_egp);
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
            EGP {data.total_spend_egp.toLocaleString()} / EGP {data.total_cap_egp.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        {data.campaigns.map(c => (
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

      {data.campaigns.filter(c => c.pct_of_cap > 80 && !c.auto_paused).map(c => (
        <div key={`warn-${c.campaign_id}`} className="text-[11px] text-amber-700 dark:text-amber-300">
          ⚠ {c.campaign_name} projected to hit cap (EGP {c.projected_egp_eom.toLocaleString()} EOM)
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Update the live wrapper to delegate**

Replace `src/app/beithady/ads/_components/spend-pacing-card.tsx` contents with:

```tsx
import { getSpendPacing } from '@/lib/beithady/ads/pacing';
import { SpendPacingView } from './spend-pacing-view';

export async function SpendPacingCard({ range }: { range: { from: string; to: string } }) {
  const pacing = await getSpendPacing({ range });
  return <SpendPacingView data={pacing} />;
}
```

- [ ] **Step 5: Run all spend-pacing tests**

Run: `npx vitest run src/app/beithady/ads/_components/spend-pacing`
Expected: PASS — view tests + existing live tests still pass (live now mocks `getSpendPacing` and asserts delegation works).

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/_components/spend-pacing-card.tsx src/app/beithady/ads/_components/spend-pacing-view.tsx src/app/beithady/ads/_components/spend-pacing-view.test.tsx
git commit -m "refactor(bh-ads): split SpendPacingCard into view + fetcher (V4)"
```

---

## Task 10: Refactor `<AudienceSummaryWidget />` → view + fetcher split

**Files:**
- Create: `src/app/beithady/ads/_components/audience-summary-view.tsx`
- Create: `src/app/beithady/ads/_components/audience-summary-view.test.tsx`
- Modify: `src/app/beithady/ads/_components/audience-summary-widget.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/ads/_components/audience-summary-view.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudienceSummaryView } from './audience-summary-view';

const baseData = {
  geo: [
    { country_code: 'EG', clicks: 500 },
    { country_code: 'SA', clicks: 300 },
    { country_code: 'AE', clicks: 100 },
  ],
  demo: [
    { age_range: '25-34', gender: 'female', clicks: 400 },
    { age_range: '35-44', gender: 'male', clicks: 300 },
  ],
  device: [
    { device_platform: 'mobile', publisher_platform: 'instagram', placement: 'feed', clicks: 700 },
  ],
  totals: { geo_clicks: 900, demo_clicks: 700, device_clicks: 700 },
};

describe('AudienceSummaryView', () => {
  it('renders top countries with clicks + pct', () => {
    render(<AudienceSummaryView data={baseData} range={{ from: '2026-05-01', to: '2026-05-15' }} />);
    expect(screen.getByText('EG')).toBeTruthy();
    expect(screen.getByText(/500 clk/)).toBeTruthy();
  });
  it('hides Open full report Link in readonly mode', () => {
    render(<AudienceSummaryView data={baseData} range={{ from: '2026-05-01', to: '2026-05-15' }} readonly />);
    expect(screen.queryByText(/Open full report/i)).toBeNull();
  });
  it('renders empty list when no data', () => {
    render(<AudienceSummaryView data={{ geo: [], demo: [], device: [], totals: { geo_clicks: 1, demo_clicks: 1, device_clicks: 1 } }} range={{ from: '2026-05-01', to: '2026-05-15' }} />);
    const empties = screen.getAllByText(/No data yet/);
    expect(empties.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/audience-summary-view.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the view component**

Create `src/app/beithady/ads/_components/audience-summary-view.tsx`:

```tsx
import Link from 'next/link';
import { Globe2, Users, MonitorSmartphone } from 'lucide-react';

const DEVICE_LABEL: Record<string, string> = {
  mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop', connected_tv: 'CTV', tv: 'TV', unknown: 'Unknown',
};

function fmtPct(num: number, denom: number): string {
  if (denom <= 0) return '—';
  return `${Math.round((num / denom) * 100)}%`;
}

export type AudienceSummaryViewData = {
  geo: Array<{ country_code: string; clicks: number }>;
  demo: Array<{ age_range: string; gender: string; clicks: number }>;
  device: Array<{ device_platform: string; publisher_platform?: string | null; placement?: string | null; clicks: number }>;
  totals: { geo_clicks: number; demo_clicks: number; device_clicks: number };
};

export function AudienceSummaryView({
  data, range, campaignId, readonly,
}: {
  data: AudienceSummaryViewData;
  range: { from: string; to: string };
  campaignId?: number;
  readonly?: boolean;
}) {
  const href = `/beithady/ads/audience?from=${range.from}&to=${range.to}${campaignId ? `&campaign=${campaignId}` : ''}`;
  return (
    <div className="ix-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Audience snapshot</h3>
        {!readonly && (
          <Link href={href} className="ix-link text-xs">Open full report →</Link>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <Globe2 size={12} /><span>Top countries</span>
          </div>
          <ul className="space-y-1">
            {data.geo.map(r => (
              <li key={r.country_code} className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.country_code}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.clicks.toLocaleString()} clk · {fmtPct(r.clicks, data.totals.geo_clicks)}</span>
              </li>
            ))}
            {data.geo.length === 0 && <li className="text-slate-400">No data yet</li>}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <Users size={12} /><span>Top demographics</span>
          </div>
          <ul className="space-y-1">
            {data.demo.map(r => (
              <li key={`${r.age_range}|${r.gender}`} className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.age_range} · {r.gender}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.clicks.toLocaleString()} clk · {fmtPct(r.clicks, data.totals.demo_clicks)}</span>
              </li>
            ))}
            {data.demo.length === 0 && <li className="text-slate-400">No data yet</li>}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <MonitorSmartphone size={12} /><span>Top device</span>
          </div>
          <ul className="space-y-1">
            {data.device.map((r, i) => (
              <li key={`${r.device_platform}|${r.publisher_platform ?? ''}|${r.placement ?? ''}|${i}`}
                  className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{DEVICE_LABEL[r.device_platform] ?? r.device_platform}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.clicks.toLocaleString()} clk · {fmtPct(r.clicks, data.totals.device_clicks)}</span>
              </li>
            ))}
            {data.device.length === 0 && <li className="text-slate-400">No data yet</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update the live wrapper to delegate**

Replace `src/app/beithady/ads/_components/audience-summary-widget.tsx` contents with:

```tsx
import { queryGeoRollup } from '@/lib/beithady/ads/insights-geo';
import { queryDemoRollup } from '@/lib/beithady/ads/insights-demo';
import { queryDeviceRollup } from '@/lib/beithady/ads/insights-device';
import { AudienceSummaryView } from './audience-summary-view';

export async function AudienceSummaryWidget({
  range, campaignId,
}: {
  range: { from: string; to: string };
  campaignId?: number;
}) {
  const [geo, demo, device] = await Promise.all([
    queryGeoRollup({ from: range.from, to: range.to, campaignId }),
    queryDemoRollup({ from: range.from, to: range.to, campaignId }),
    queryDeviceRollup({ from: range.from, to: range.to, campaignId }),
  ]);
  const data = {
    geo: geo.slice(0, 3),
    demo: demo.slice(0, 3),
    device: device.slice(0, 3),
    totals: {
      geo_clicks: geo.reduce((s, r) => s + r.clicks, 0) || 1,
      demo_clicks: demo.reduce((s, r) => s + r.clicks, 0) || 1,
      device_clicks: device.reduce((s, r) => s + r.clicks, 0) || 1,
    },
  };
  return <AudienceSummaryView data={data} range={range} campaignId={campaignId} />;
}
```

- [ ] **Step 5: Run all audience-summary tests**

Run: `npx vitest run src/app/beithady/ads/_components/audience-summary`
Expected: PASS — view tests + existing live tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/_components/audience-summary-widget.tsx src/app/beithady/ads/_components/audience-summary-view.tsx src/app/beithady/ads/_components/audience-summary-view.test.tsx
git commit -m "refactor(bh-ads): split AudienceSummaryWidget into view + fetcher (V4)"
```

---

## Task 11: Refactor 3 audience rollup tabs (Geo + Demo + Device) → view + fetcher split

**Files:**
- Create: `src/app/beithady/ads/audience/_components/geo-tab-view.tsx` + `.test.tsx`
- Create: `src/app/beithady/ads/audience/_components/demo-tab-view.tsx` + `.test.tsx`
- Create: `src/app/beithady/ads/audience/_components/device-tab-view.tsx` + `.test.tsx`
- Modify: `src/app/beithady/ads/audience/_components/geo-tab.tsx`
- Modify: `src/app/beithady/ads/audience/_components/demo-tab.tsx`
- Modify: `src/app/beithady/ads/audience/_components/device-tab.tsx`

Note: These three tabs share an identical pattern (rollup query → table render). Refactor all three in one commit since the structure is mechanical.

- [ ] **Step 1: Read the existing tab files**

Use Read on `src/app/beithady/ads/audience/_components/geo-tab.tsx`, `demo-tab.tsx`, and `device-tab.tsx` to capture their exact current render output.

- [ ] **Step 2: Write failing tests for the 3 view components**

For each, create a `.test.tsx` that imports the view, passes a fixture row array, and asserts key text appears. Example for geo-tab-view:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeoTabView } from './geo-tab-view';

describe('GeoTabView', () => {
  it('renders rows with country code + clicks', () => {
    render(<GeoTabView rows={[
      { country_code: 'EG', clicks: 500, impressions: 10000, spend_micros: 50000000, leads: 5 },
    ]} />);
    expect(screen.getByText('EG')).toBeTruthy();
    expect(screen.getByText('500')).toBeTruthy();
  });
  it('renders empty state when no rows', () => {
    render(<GeoTabView rows={[]} />);
    expect(screen.getByText(/No geo data/i)).toBeTruthy();
  });
});
```

(Same shape for demo-tab-view and device-tab-view, with appropriate row fixtures.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/beithady/ads/audience/_components/geo-tab-view src/app/beithady/ads/audience/_components/demo-tab-view src/app/beithady/ads/audience/_components/device-tab-view`
Expected: FAIL — modules don't exist.

- [ ] **Step 4: Create the 3 view components**

For each, extract the JSX from the existing tab file into a new `*-view.tsx` that takes `rows: T[]` as a prop. Pattern (showing geo, repeat for demo + device):

```tsx
// src/app/beithady/ads/audience/_components/geo-tab-view.tsx
import type { GeoRollupRow } from '@/lib/beithady/ads/insights-geo';

export function GeoTabView({ rows }: { rows: GeoRollupRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No geo data yet for this range.
      </div>
    );
  }
  // ... rest of the JSX copied from geo-tab.tsx, using rows instead of fetched data
}
```

Use the actual current geo-tab.tsx / demo-tab.tsx / device-tab.tsx JSX as the source of truth.

- [ ] **Step 5: Update the 3 live wrappers to delegate**

For each:
```tsx
// e.g. geo-tab.tsx
import { queryGeoRollup } from '@/lib/beithady/ads/insights-geo';
import { GeoTabView } from './geo-tab-view';

export async function GeoTab({ range, campaignId, buildingCode }: { /* ... */ }) {
  const rows = await queryGeoRollup({ from: range.from, to: range.to, campaignId, buildingCode });
  return <GeoTabView rows={rows} />;
}
```

- [ ] **Step 6: Run all 3 tab tests**

Run: `npx vitest run src/app/beithady/ads/audience/_components`
Expected: PASS — all 6 test files (3 view + 3 existing live).

- [ ] **Step 7: Commit**

```bash
git add src/app/beithady/ads/audience/_components/geo-tab.tsx src/app/beithady/ads/audience/_components/geo-tab-view.tsx src/app/beithady/ads/audience/_components/geo-tab-view.test.tsx src/app/beithady/ads/audience/_components/demo-tab.tsx src/app/beithady/ads/audience/_components/demo-tab-view.tsx src/app/beithady/ads/audience/_components/demo-tab-view.test.tsx src/app/beithady/ads/audience/_components/device-tab.tsx src/app/beithady/ads/audience/_components/device-tab-view.tsx src/app/beithady/ads/audience/_components/device-tab-view.test.tsx
git commit -m "refactor(bh-ads): split Geo/Demo/Device tabs into view + fetcher (V4)"
```

---

## Task 12: Refactor `<FunnelTab />` → view + fetcher split

**Files:**
- Create: `src/app/beithady/ads/audience/_components/funnel-tab-view.tsx`
- Create: `src/app/beithady/ads/audience/_components/funnel-tab-view.test.tsx`
- Modify: `src/app/beithady/ads/audience/_components/funnel-tab.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FunnelTabView } from './funnel-tab-view';

describe('FunnelTabView', () => {
  it('renders empty state when all stages are zero', () => {
    render(<FunnelTabView stages={[
      { key: 'impressions', label: 'Impressions', count: 0, conversion_pct_from_prev: null, conversion_pct_from_top: null },
      { key: 'leads', label: 'Leads', count: 0, conversion_pct_from_prev: null, conversion_pct_from_top: null },
    ]} />);
    expect(screen.getByText(/No funnel data/i)).toBeTruthy();
  });
  it('renders stages with counts + conversion %', () => {
    render(<FunnelTabView stages={[
      { key: 'impressions', label: 'Impressions', count: 1000, conversion_pct_from_prev: null, conversion_pct_from_top: 100 },
      { key: 'clicks', label: 'Clicks', count: 100, conversion_pct_from_prev: 10, conversion_pct_from_top: 10 },
    ]} />);
    expect(screen.getByText('Impressions')).toBeTruthy();
    expect(screen.getByText('1,000')).toBeTruthy();
    expect(screen.getByText(/↓ 10%/)).toBeTruthy();
  });
  it('shows building-filter note when buildingCode is provided', () => {
    render(<FunnelTabView stages={[
      { key: 'leads', label: 'Leads', count: 5, conversion_pct_from_prev: null, conversion_pct_from_top: null },
    ]} buildingCode="BH-26" />);
    expect(screen.getByText(/Impressions\/Reach\/Clicks are campaign-aggregate/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/audience/_components/funnel-tab-view.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create the view component**

```tsx
// src/app/beithady/ads/audience/_components/funnel-tab-view.tsx
import type { FunnelStage } from '@/lib/beithady/ads/funnel';

export function FunnelTabView({ stages, buildingCode }: { stages: FunnelStage[]; buildingCode?: string }) {
  const max = stages.reduce((m, s) => Math.max(m, s.count), 0) || 1;
  const totalEmpty = stages.every(s => s.count === 0);

  if (totalEmpty) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No funnel data yet for this range.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="ix-card p-5 space-y-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Conversion funnel</h3>
        {stages.map((s, i) => (
          <div key={s.key}>
            <div className="grid grid-cols-[120px_1fr] items-center gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">{s.label}</span>
              <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden" title={`${s.count.toLocaleString()}`}>
                <div className="h-full bg-slate-400/70 dark:bg-slate-500/70" style={{ width: `${(s.count / max) * 100}%` }} />
              </div>
            </div>
            {i < stages.length - 1 && stages[i + 1].conversion_pct_from_prev != null && (
              <div className="grid grid-cols-[120px_1fr] gap-3 text-[10px] text-slate-400 my-0.5">
                <span />
                <span className="text-center">↓ {stages[i + 1].conversion_pct_from_prev}%</span>
              </div>
            )}
          </div>
        ))}
        {buildingCode && (
          <div className="text-[11px] text-slate-400 italic mt-2">
            * Impressions/Reach/Clicks are campaign-aggregate (not per-building); only Leads/Bookings reflect the {buildingCode} filter.
          </div>
        )}
      </div>

      <div className="ix-card p-5">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Stage</th>
              <th className="py-2 text-right">Count</th>
              <th className="py-2 text-right">% of previous</th>
              <th className="py-2 text-right">% of top</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {stages.map(s => (
              <tr key={s.key} className="text-slate-700 dark:text-slate-200">
                <td className="py-1.5 font-medium">{s.label}</td>
                <td className="py-1.5 text-right">{s.count.toLocaleString()}</td>
                <td className="py-1.5 text-right">{s.conversion_pct_from_prev != null ? `${s.conversion_pct_from_prev}%` : '—'}</td>
                <td className="py-1.5 text-right" title={s.conversion_pct_from_top != null ? `${s.conversion_pct_from_top}%` : undefined}>
                  {s.conversion_pct_from_top != null ? `${s.conversion_pct_from_top}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update the live wrapper to delegate**

Replace `src/app/beithady/ads/audience/_components/funnel-tab.tsx` contents with:

```tsx
import { getFunnelStages } from '@/lib/beithady/ads/funnel';
import { FunnelTabView } from './funnel-tab-view';

export async function FunnelTab({
  range, campaignId, buildingCode,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  buildingCode?: string;
}) {
  const { stages } = await getFunnelStages({
    from: range.from, to: range.to, campaignId, buildingCode,
  });
  return <FunnelTabView stages={stages} buildingCode={buildingCode} />;
}
```

- [ ] **Step 5: Run all funnel-tab tests**

Run: `npx vitest run src/app/beithady/ads/audience/_components/funnel`
Expected: PASS — new view tests + existing live tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/audience/_components/funnel-tab.tsx src/app/beithady/ads/audience/_components/funnel-tab-view.tsx src/app/beithady/ads/audience/_components/funnel-tab-view.test.tsx
git commit -m "refactor(bh-ads): split FunnelTab into view + fetcher (V4)"
```

---

## Task 13: Refactor `<QualityTab />` → view + fetcher split

**Files:**
- Create: `src/app/beithady/ads/audience/_components/quality-tab-view.tsx`
- Create: `src/app/beithady/ads/audience/_components/quality-tab-view.test.tsx`
- Modify: `src/app/beithady/ads/audience/_components/quality-tab.tsx`

- [ ] **Step 1: Read the existing quality-tab.tsx**

Use Read on `src/app/beithady/ads/audience/_components/quality-tab.tsx` to capture the current JSX + data shape (`getLeadQualityPerCampaign` returns).

- [ ] **Step 2: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualityTabView } from './quality-tab-view';

describe('QualityTabView', () => {
  it('renders campaign rows with quality_pct', () => {
    render(<QualityTabView rows={[
      { campaign_id: 1, campaign_name: 'CTWA EG', platform: 'meta', leads: 100, bookings: 25, quality_pct: 25, revenue_egp: 50000 },
    ]} />);
    expect(screen.getByText(/CTWA EG/)).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
  });
  it('renders empty state when no rows', () => {
    render(<QualityTabView rows={[]} />);
    expect(screen.getByText(/No lead quality data/i)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/audience/_components/quality-tab-view.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Create view component + update live wrapper**

Extract JSX from `quality-tab.tsx` into `quality-tab-view.tsx` accepting `rows: LeadQualityRow[]` as the prop. Update `quality-tab.tsx` to fetch + delegate (same pattern as Task 12).

- [ ] **Step 5: Run all quality-tab tests**

Run: `npx vitest run src/app/beithady/ads/audience/_components/quality`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/audience/_components/quality-tab.tsx src/app/beithady/ads/audience/_components/quality-tab-view.tsx src/app/beithady/ads/audience/_components/quality-tab-view.test.tsx
git commit -m "refactor(bh-ads): split QualityTab into view + fetcher (V4)"
```

---

## Task 14: Refactor `<CohortTab />` → view + fetcher split

**Files:**
- Create: `src/app/beithady/ads/audience/_components/cohort-tab-view.tsx`
- Create: `src/app/beithady/ads/audience/_components/cohort-tab-view.test.tsx`
- Modify: `src/app/beithady/ads/audience/_components/cohort-tab.tsx`

- [ ] **Step 1: Read the existing cohort-tab.tsx**

Use Read on `src/app/beithady/ads/audience/_components/cohort-tab.tsx`.

- [ ] **Step 2: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CohortTabView } from './cohort-tab-view';

describe('CohortTabView', () => {
  it('renders cohort buckets', () => {
    render(<CohortTabView data={{ buckets: [
      { week: '2026-W18', leads: 100, bookings_w1: 5, bookings_w2: 8, bookings_w3: 12 },
    ] }} />);
    expect(screen.getByText(/2026-W18/)).toBeTruthy();
  });
  it('renders empty state when no buckets', () => {
    render(<CohortTabView data={{ buckets: [] }} />);
    expect(screen.getByText(/No cohort data/i)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/audience/_components/cohort-tab-view.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Create view component + update live wrapper**

Same pattern as Tasks 12-13. The cohort `data` prop wraps `{ buckets: [...] }` so it can extend with rates/totals if the underlying lib evolves.

- [ ] **Step 5: Run all cohort-tab tests**

Run: `npx vitest run src/app/beithady/ads/audience/_components/cohort`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/audience/_components/cohort-tab.tsx src/app/beithady/ads/audience/_components/cohort-tab-view.tsx src/app/beithady/ads/audience/_components/cohort-tab-view.test.tsx
git commit -m "refactor(bh-ads): split CohortTab into view + fetcher (V4)"
```

---

## Task 15: Refactor `<TimeTab />` → view + fetcher split (with `readonly` mode for snapshots)

**Files:**
- Create: `src/app/beithady/ads/audience/_components/time-tab-view.tsx`
- Create: `src/app/beithady/ads/audience/_components/time-tab-view.test.tsx`
- Modify: `src/app/beithady/ads/audience/_components/time-tab.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeTabView } from './time-tab-view';

describe('TimeTabView', () => {
  it('renders both heatmaps when readonly=true (no toggle)', () => {
    render(<TimeTabView
      leadCells={[{ day_of_week: 0, hour: 12, lead_count: 5 }]}
      metaCells={[{ day_of_week: 0, hour: 12, clicks: 50, impressions: 1000, spend_micros: 100000 }]}
      readonly
    />);
    expect(screen.getByText(/Lead density/i)).toBeTruthy();
    expect(screen.getByText(/Meta spend/i)).toBeTruthy();
    // No clickable toggle links in readonly mode
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('renders only active mode with toggle links when not readonly', () => {
    render(<TimeTabView
      leadCells={[{ day_of_week: 0, hour: 12, lead_count: 5 }]}
      metaCells={[]}
      activeMode="leads"
      baseQs="from=2026-05-01&to=2026-05-15&tab=time"
    />);
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/audience/_components/time-tab-view.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create view component**

Extract `time-tab.tsx` JSX into `time-tab-view.tsx`. Accept props:
- `leadCells: HeatmapCell[]`
- `metaCells: MetaHourlyCell[]`
- `activeMode?: 'leads' | 'meta'` (defaults to 'leads' in non-readonly)
- `baseQs?: string` (URL search params for the toggle links, only used when !readonly)
- `readonly?: boolean` — when true, render BOTH heatmaps stacked vertically with section headings; no toggle links.

The interactive (non-readonly) path renders the same toggle pills + single heatmap that currently lives in time-tab.tsx.

- [ ] **Step 4: Update the live wrapper to delegate**

```tsx
// time-tab.tsx
import { getLeadDensityHeatmap, getMetaHourlyHeatmap } from '@/lib/beithady/ads/hourly';
import { TimeTabView } from './time-tab-view';

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
  }).toString();

  const [leadCells, metaCells] = await Promise.all([
    getLeadDensityHeatmap({ from: range.from, to: range.to, campaignId, buildingCode }),
    getMetaHourlyHeatmap({ from: range.from, to: range.to, campaignId }),
  ]);

  return <TimeTabView leadCells={leadCells} metaCells={metaCells} activeMode={activeMode} baseQs={baseQs} />;
}
```

- [ ] **Step 5: Run all time-tab tests**

Run: `npx vitest run src/app/beithady/ads/audience/_components/time-tab`
Expected: PASS — new view tests + existing live tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/audience/_components/time-tab.tsx src/app/beithady/ads/audience/_components/time-tab-view.tsx src/app/beithady/ads/audience/_components/time-tab-view.test.tsx
git commit -m "refactor(bh-ads): split TimeTab into view + fetcher with readonly stacked mode (V4)"
```

---

## Task 16: Refactor `<OptimizeTab />` → view + fetcher split (with `readonly` mode for snapshots)

**Files:**
- Create: `src/app/beithady/ads/audience/_components/optimize-tab-view.tsx`
- Create: `src/app/beithady/ads/audience/_components/optimize-tab-view.test.tsx`
- Modify: `src/app/beithady/ads/audience/_components/optimize-tab.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OptimizeTabView } from './optimize-tab-view';

const topAds = [
  { ad_id: 1, ad_name: 'Ad A', campaign_name: 'CTWA EG', impressions: 1000, clicks: 50, ctr_pct: 5, spend_egp: 500, leads: 10, cpl_egp: 50 },
];
const topAssets = [
  { asset_id: 'a1', public_url: '/x.jpg', building_code: 'BH-26', ad_count: 3, impressions: 5000, clicks: 200, cpl: 25 },
];

describe('OptimizeTabView', () => {
  it('renders top-ads + top-assets tables', () => {
    render(<OptimizeTabView topAds={topAds} topAssets={topAssets} sortBy="leads" />);
    expect(screen.getByText('Ad A')).toBeTruthy();
    expect(screen.getByText(/Top creative assets/i)).toBeTruthy();
  });
  it('hides sort tabs in readonly mode', () => {
    render(<OptimizeTabView topAds={topAds} topAssets={topAssets} sortBy="leads" readonly />);
    expect(screen.queryByRole('link', { name: /CTR|CPL/ })).toBeNull();
  });
  it('renders sort tabs when not readonly', () => {
    render(<OptimizeTabView topAds={topAds} topAssets={topAssets} sortBy="leads" baseQs="from=x&to=y" />);
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/audience/_components/optimize-tab-view.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create view component**

Extract `optimize-tab.tsx` JSX into `optimize-tab-view.tsx`. Accept props:
- `topAds: TopAdRow[]`
- `topAssets: TopAssetRow[]`
- `sortBy: 'leads' | 'ctr' | 'cpl'`
- `baseQs?: string` (only used when !readonly for the sort-tab Links)
- `readonly?: boolean` — when true, no sort tabs, just the table rendered with `sortBy` as static.

- [ ] **Step 4: Update the live wrapper to delegate**

```tsx
// optimize-tab.tsx
import { getTopAds, type TopAdSortBy } from '@/lib/beithady/ads/top-ads';
import { getTopAssets } from '@/lib/beithady/ads/top-assets';
import { OptimizeTabView } from './optimize-tab-view';

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
  const baseQs = new URLSearchParams({
    from: range.from, to: range.to,
    ...(range.preset ? { preset: range.preset } : {}),
    ...(range.compare ? { compare: '1' } : {}),
    ...(campaignId ? { campaign: String(campaignId) } : {}),
    ...(buildingCode ? { building: buildingCode } : {}),
    tab: 'optimize',
  }).toString();

  const [topAds, topAssets] = await Promise.all([
    getTopAds({ from: range.from, to: range.to, sortBy, limit: 20, buildingCode }),
    getTopAssets({ buildingCode, limit: 20 }),
  ]);

  return <OptimizeTabView topAds={topAds} topAssets={topAssets} sortBy={sortBy} baseQs={baseQs} />;
}
```

- [ ] **Step 5: Run all optimize-tab tests**

Run: `npx vitest run src/app/beithady/ads/audience/_components/optimize`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/audience/_components/optimize-tab.tsx src/app/beithady/ads/audience/_components/optimize-tab-view.tsx src/app/beithady/ads/audience/_components/optimize-tab-view.test.tsx
git commit -m "refactor(bh-ads): split OptimizeTab into view + fetcher with readonly mode (V4)"
```

---

## Task 17: `<AdsSnapshotView />` — compose all view components from snapshot payload

**Files:**
- Create: `src/app/beithady/ads/_components/ads-snapshot-view.tsx`
- Create: `src/app/beithady/ads/_components/ads-snapshot-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdsSnapshotView } from './ads-snapshot-view';
import type { AdsSnapshotPayload } from '@/lib/beithady/ads/snapshot';

const minimalPayload: AdsSnapshotPayload = {
  meta: {
    schema_version: 1,
    generated_at: '2026-05-17T10:00:00Z',
    generated_by_user_id: 'u1',
    generated_by_user_email: 'kareem@x',
    range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' },
    compare: null,
    building: null,
    ai_used: true,
  },
  kpis: { current: { spend: 100, leads: 5, cpl: 20, bookings: 1, attributed_revenue: 500, active_campaigns: 2, draft_campaigns: 0 }, prior: null },
  campaigns: [],
  recent_leads: [],
  platform_status: { meta: { configured: true }, google: { configured: false }, tiktok: { configured: false } },
  frt: null,
  spend_pacing: { daily: [], campaigns: [], total_spend_egp: 0, total_cap_egp: 0 },
  anomalies: [],
  audience_summary: { geo: [], demo: [], device: [], totals: { geo_clicks: 1, demo_clicks: 1, device_clicks: 1 } },
  ai_summary: 'P1\n\nP2\n\nP3',
  audience_geo: [],
  audience_demo: [],
  audience_device: [],
  funnel: { stages: [] },
  quality: [],
  cohort: { buckets: [] },
  time: { lead_density: [], meta_hourly: [] },
  optimize: { top_ads: [], top_assets: [] },
};

describe('AdsSnapshotView', () => {
  it('renders header with range + building label', () => {
    render(<AdsSnapshotView payload={minimalPayload} />);
    expect(screen.getByText(/2026-05-01.*2026-05-15/)).toBeTruthy();
    expect(screen.getByText(/All buildings/i)).toBeTruthy();
  });
  it('renders KPI cards with values from payload', () => {
    render(<AdsSnapshotView payload={minimalPayload} />);
    expect(screen.getByText('EGP 100')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });
  it('renders AI summary paragraphs when ai_summary present', () => {
    render(<AdsSnapshotView payload={minimalPayload} />);
    expect(screen.getByText(/P1/)).toBeTruthy();
    expect(screen.getByText(/P3/)).toBeTruthy();
  });
  it('renders skipped note when ai_summary=null + ai_skipped_reason set', () => {
    render(<AdsSnapshotView payload={{
      ...minimalPayload,
      ai_summary: null,
      meta: { ...minimalPayload.meta, ai_used: false, ai_skipped_reason: 'cap_reached' },
    }} />);
    expect(screen.getByText(/AI summary unavailable/i)).toBeTruthy();
  });
  it('renders footer with generated_by + expires note when expiresAt prop given', () => {
    render(<AdsSnapshotView payload={minimalPayload} expiresAtLabel="2026-05-19 10:00 Cairo" />);
    expect(screen.getByText(/kareem@x/)).toBeTruthy();
    expect(screen.getByText(/2026-05-19 10:00 Cairo/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/ads-snapshot-view.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the composition component**

```tsx
// src/app/beithady/ads/_components/ads-snapshot-view.tsx
import { DollarSign, Users, Activity } from 'lucide-react';
import type { AdsSnapshotPayload } from '@/lib/beithady/ads/snapshot';
import { AiSummaryCard } from './ai-summary-card';
import { AnomalyBannerView } from './anomaly-banner-view';
import { FrtView, type FrtViewData } from './frt-view';
import { SpendPacingView, type SpendPacingViewData } from './spend-pacing-view';
import { AudienceSummaryView, type AudienceSummaryViewData } from './audience-summary-view';
import { GeoTabView } from '../audience/_components/geo-tab-view';
import { DemoTabView } from '../audience/_components/demo-tab-view';
import { DeviceTabView } from '../audience/_components/device-tab-view';
import { FunnelTabView } from '../audience/_components/funnel-tab-view';
import { QualityTabView } from '../audience/_components/quality-tab-view';
import { CohortTabView } from '../audience/_components/cohort-tab-view';
import { TimeTabView } from '../audience/_components/time-tab-view';
import { OptimizeTabView } from '../audience/_components/optimize-tab-view';
import type { AnomalyEvent } from '@/lib/beithady/ads/anomalies';

export function AdsSnapshotView({
  payload, expiresAtLabel,
}: {
  payload: AdsSnapshotPayload;
  expiresAtLabel?: string;
}) {
  const { meta, kpis } = payload;
  const k = kpis.current as Record<string, number>;
  const buildingLabel = meta.building ?? 'All buildings';

  return (
    <div className="space-y-5 px-5 py-6 max-w-[210mm] mx-auto print:max-w-none">
      {/* 1. Header strip */}
      <header className="border-b border-slate-200 dark:border-slate-700 pb-3">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Beit Hady — Ads Performance</h1>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {meta.range.from} → {meta.range.to} · {buildingLabel} · Generated {new Date(meta.generated_at).toLocaleString('en-US', { timeZone: 'Africa/Cairo' })}
        </div>
      </header>

      {/* 2. AI summary */}
      <AiSummaryCard
        range={{ from: meta.range.from, to: meta.range.to }}
        summary={payload.ai_summary}
        usedToday={0}
        readonly
        skippedReason={meta.ai_skipped_reason}
      />

      {/* 3. Anomaly banner */}
      <AnomalyBannerView events={payload.anomalies as AnomalyEvent[]} />

      {/* 4. KPI cards */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <Stat icon={DollarSign} label="Spend" value={`EGP ${(k.spend ?? 0).toLocaleString()}`} />
        <Stat icon={Users} label="Leads" value={(k.leads ?? 0).toLocaleString()} accent="cyan" />
        <Stat label="CPL" value={k.cpl == null ? '—' : `EGP ${k.cpl.toFixed(2)}`} accent="amber" />
        <Stat label="Bookings" value={(k.bookings ?? 0).toLocaleString()} accent="emerald" />
        <Stat label="Revenue (EGP)" value={`EGP ${(k.attributed_revenue ?? 0).toLocaleString()}`} accent="emerald" />
        <Stat icon={Activity} label="Active" value={(k.active_campaigns ?? 0).toLocaleString()} />
        <Stat label="Drafts" value={(k.draft_campaigns ?? 0).toLocaleString()} accent="slate" />
      </section>

      {/* 5. FRT + Spend pacing side by side */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <FrtView data={payload.frt as FrtViewData} readonly />
        <SpendPacingView data={payload.spend_pacing as SpendPacingViewData} />
      </section>

      {/* 6. Audience summary */}
      <AudienceSummaryView
        data={payload.audience_summary as AudienceSummaryViewData}
        range={{ from: meta.range.from, to: meta.range.to }}
        readonly
      />

      {/* 9. Page break → Audience deep dive */}
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 pt-4 break-before-page">
        Audience deep dive
      </h2>
      <GeoTabView rows={payload.audience_geo as Parameters<typeof GeoTabView>[0]['rows']} />
      <DemoTabView rows={payload.audience_demo as Parameters<typeof DemoTabView>[0]['rows']} />
      <DeviceTabView rows={payload.audience_device as Parameters<typeof DeviceTabView>[0]['rows']} />

      {/* 13. Page break → Funnel & quality */}
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 pt-4 break-before-page">
        Funnel & quality
      </h2>
      <FunnelTabView stages={(payload.funnel as { stages: Parameters<typeof FunnelTabView>[0]['stages'] }).stages} buildingCode={meta.building ?? undefined} />
      <QualityTabView rows={payload.quality as Parameters<typeof QualityTabView>[0]['rows']} />
      <CohortTabView data={payload.cohort as Parameters<typeof CohortTabView>[0]['data']} />

      {/* 17. Page break → Time & optimization */}
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 pt-4 break-before-page">
        Time & optimization
      </h2>
      <TimeTabView
        leadCells={payload.time.lead_density as Parameters<typeof TimeTabView>[0]['leadCells']}
        metaCells={payload.time.meta_hourly as Parameters<typeof TimeTabView>[0]['metaCells']}
        readonly
      />
      <OptimizeTabView
        topAds={payload.optimize.top_ads as Parameters<typeof OptimizeTabView>[0]['topAds']}
        topAssets={payload.optimize.top_assets as Parameters<typeof OptimizeTabView>[0]['topAssets']}
        sortBy="leads"
        readonly
      />

      {/* Footer */}
      <footer className="text-[10px] text-slate-400 pt-4 border-t border-slate-200 dark:border-slate-700 text-center">
        Generated by {meta.generated_by_user_email ?? 'Beit Hady operator'}
        {expiresAtLabel ? ` · Snapshot expires ${expiresAtLabel}` : ''}
      </footer>
    </div>
  );
}

function Stat({ label, value, accent, icon: Icon }: {
  label: string; value: string;
  accent?: 'cyan' | 'amber' | 'emerald' | 'slate';
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const cls = accent === 'cyan' ? 'text-cyan-700 dark:text-cyan-300'
    : accent === 'amber' ? 'text-amber-700 dark:text-amber-300'
    : accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
    : accent === 'slate' ? 'text-slate-500'
    : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 inline-flex items-center justify-center gap-1">
        {Icon && <Icon size={10} />}
        {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/beithady/ads/_components/ads-snapshot-view.test.tsx`
Expected: PASS — 5/5 tests.

- [ ] **Step 5: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/ads/_components/ads-snapshot-view.tsx src/app/beithady/ads/_components/ads-snapshot-view.test.tsx
git commit -m "feat(bh-ads): <AdsSnapshotView> — composes all view components for snapshots (V4)"
```

---

## Task 18: Public route `/r/beithady/ads/[token]/page.tsx` + print toolbar + print CSS

**Files:**
- Create: `src/app/r/beithady/ads/[token]/page.tsx`
- Create: `src/app/r/beithady/ads/[token]/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';

vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));

const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const pastExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function snapshotRow(overrides: Partial<{ payload: unknown; expires_at: string; deleted_at: string | null }> = {}) {
  return {
    id: 'r1',
    payload: {
      meta: { schema_version: 1, generated_at: new Date().toISOString(), generated_by_user_id: null, generated_by_user_email: 'x@x', range: { from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' }, compare: null, building: null, ai_used: true },
      kpis: { current: { spend: 0, leads: 0, cpl: null, bookings: 0, attributed_revenue: 0, active_campaigns: 0, draft_campaigns: 0 }, prior: null },
      campaigns: [], recent_leads: [], platform_status: { meta: {}, google: {}, tiktok: {} },
      frt: null, spend_pacing: { daily: [], campaigns: [], total_spend_egp: 0, total_cap_egp: 0 },
      anomalies: [], audience_summary: { geo: [], demo: [], device: [], totals: { geo_clicks: 1, demo_clicks: 1, device_clicks: 1 } },
      ai_summary: null,
      audience_geo: [], audience_demo: [], audience_device: [],
      funnel: { stages: [] }, quality: [], cohort: { buckets: [] },
      time: { lead_density: [], meta_hourly: [] }, optimize: { top_ads: [], top_assets: [] },
    },
    expires_at: futureExpiry,
    deleted_at: null,
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

const maybeSingleMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: maybeSingleMock,
        }),
      }),
    }),
  }),
}));

describe('/r/beithady/ads/[token] public route', () => {
  it('renders snapshot with print toolbar when valid', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: snapshotRow(), error: null });
    const { default: Page } = await import('./page');
    const ui = await Page({ params: Promise.resolve({ token: 'valid-token' }) });
    render(ui);
    expect(screen.getByText(/Save as PDF/i)).toBeTruthy();
    expect(screen.getByText(/Link expires/i)).toBeTruthy();
  });

  it('404 when token not found', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { default: Page } = await import('./page');
    await expect(Page({ params: Promise.resolve({ token: 'missing' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404 when deleted_at is set', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: snapshotRow({ deleted_at: new Date().toISOString(), payload: null }), error: null });
    const { default: Page } = await import('./page');
    await expect(Page({ params: Promise.resolve({ token: 'deleted' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404 when expired', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: snapshotRow({ expires_at: pastExpiry }), error: null });
    const { default: Page } = await import('./page');
    await expect(Page({ params: Promise.resolve({ token: 'expired' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/r/beithady/ads/[token]/page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create the public route**

```tsx
// src/app/r/beithady/ads/[token]/page.tsx
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { AdsSnapshotView } from '@/app/beithady/ads/_components/ads-snapshot-view';
import type { AdsSnapshotPayload } from '@/lib/beithady/ads/snapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const APP_BASE = (() => {
  const b =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'https://limeinc.vercel.app';
  return b.startsWith('http') ? b : `https://${b}`;
})();
const OG_IMAGE = `${APP_BASE.replace(/\/$/, '')}/brand/beithady/logo-stacked.jpg`;

export const metadata = {
  title: 'Beit Hady · Ads Performance Snapshot',
  description: 'BH Ads dashboard snapshot. Confidential — link expires 48h after generation.',
  applicationName: 'Beit Hady',
  openGraph: {
    title: 'Beit Hady · Ads Performance Snapshot',
    description: 'BH Ads dashboard snapshot.',
    type: 'website' as const,
    siteName: 'Beit Hady',
    images: [{ url: OG_IMAGE, width: 1200, height: 1200, alt: 'Beit Hady' }],
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'Beit Hady · Ads Performance Snapshot',
    description: 'BH Ads dashboard snapshot.',
    images: [OG_IMAGE],
  },
  robots: { index: false, follow: false },
};

type SnapshotRow = {
  id: string;
  payload: AdsSnapshotPayload | null;
  expires_at: string;
  deleted_at: string | null;
  generated_at: string;
};

const PRINT_CSS = `
  @page { size: A4; margin: 14mm; }
  body.bh-ads-snapshot-body { background: #f1f5f9 !important; margin: 0 !important; padding: 0 !important; }
  .bh-ads-snapshot-shell { background: white; max-width: 210mm; margin: 16px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-radius: 6px; }
  .bh-ads-snapshot-toolbar { padding: 12px; background: #0f172a; color: white; text-align: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .bh-ads-snapshot-toolbar button { padding: 8px 16px; background: #0e7490; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .bh-ads-snapshot-toolbar button:hover { background: #155e75; }
  .bh-ads-snapshot-toolbar .expiry { font-size: 11px; color: #94a3b8; margin-top: 6px; }
  @media print {
    body.bh-ads-snapshot-body { background: white !important; }
    .bh-ads-snapshot-shell { box-shadow: none !important; margin: 0 !important; max-width: none !important; border-radius: 0 !important; }
    .bh-ads-snapshot-toolbar { display: none !important; }
  }
`;

const PRINT_SCRIPT = `
  (function(){
    document.body.classList.add('bh-ads-snapshot-body');
    var btn = document.getElementById('bh-ads-snapshot-print');
    if (btn) { btn.addEventListener('click', function(){ window.print(); }); }
  })();
`;

export default async function PublicBhAdsSnapshotPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_dashboard_snapshots')
    .select('id, payload, expires_at, deleted_at, generated_at')
    .eq('token', token)
    .maybeSingle();
  const snap = data as SnapshotRow | null;

  if (!snap || snap.deleted_at || !snap.payload) notFound();
  if (new Date(snap.expires_at).getTime() < Date.now()) notFound();

  const expiryLabel = new Date(snap.expires_at).toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
  });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="bh-ads-snapshot-toolbar">
        <button id="bh-ads-snapshot-print" type="button">Save as PDF / Print</button>
        <div className="expiry">Link expires {expiryLabel} Cairo</div>
      </div>
      <div className="bh-ads-snapshot-shell">
        <AdsSnapshotView payload={snap.payload} expiresAtLabel={`${expiryLabel} Cairo`} />
      </div>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />
    </>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/r/beithady/ads/[token]/page.test.tsx`
Expected: PASS — 4/4 tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/r/beithady/ads/[token]/page.tsx" "src/app/r/beithady/ads/[token]/page.test.tsx"
git commit -m "feat(bh-ads): public route /r/beithady/ads/[token] with print toolbar (V4)"
```

---

## Task 19: `<ShareLinkButton />` — header button + dialog

**Files:**
- Create: `src/app/beithady/ads/_components/share-link-button.tsx`
- Create: `src/app/beithady/ads/_components/share-link-button.test.tsx`
- Modify: `src/app/beithady/ads/page.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockAction = vi.fn();
vi.mock('../actions', () => ({ createAdsShareLinkAction: mockAction }));

import { ShareLinkButton } from './share-link-button';

describe('ShareLinkButton', () => {
  it('renders the Share button in initial state', () => {
    render(<ShareLinkButton range={{ from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' }} compare={null} building={null} />);
    expect(screen.getByRole('button', { name: /Share/i })).toBeTruthy();
  });

  it('shows dialog with Generate button on open', () => {
    render(<ShareLinkButton range={{ from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' }} compare={null} building={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Share/i }));
    expect(screen.getByText(/Generate a 48-hour public link/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generate/i })).toBeTruthy();
  });

  it('shows URL + copy button after successful generation', async () => {
    mockAction.mockResolvedValueOnce({ ok: true, token: 'tok123', url: 'https://app/r/beithady/ads/tok123', expires_at: new Date(Date.now() + 48 * 3600e3).toISOString() });
    render(<ShareLinkButton range={{ from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' }} compare={null} building={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Share/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    // Wait microtask
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByDisplayValue(/r\/beithady\/ads\/tok123/)).toBeTruthy();
  });

  it('shows rate-limit message on error="rate_limit"', async () => {
    mockAction.mockResolvedValueOnce({ ok: false, error: 'rate_limit', message: 'You have used 5/5 share links today.' });
    render(<ShareLinkButton range={{ from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' }} compare={null} building={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Share/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByText(/5\/5 share links/)).toBeTruthy();
  });

  it('shows AI cap-skipped note in success state', async () => {
    mockAction.mockResolvedValueOnce({ ok: true, token: 'tok', url: 'https://app/r/tok', expires_at: new Date().toISOString(), ai_skipped_reason: 'cap_reached' });
    render(<ShareLinkButton range={{ from: '2026-05-01', to: '2026-05-15', preset: 'last_15d' }} compare={null} building={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Share/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByText(/AI narrative was skipped/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/beithady/ads/_components/share-link-button.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Create the component**

```tsx
// src/app/beithady/ads/_components/share-link-button.tsx
'use client';
import { useState, useTransition } from 'react';
import { Share2, Copy } from 'lucide-react';
import { createAdsShareLinkAction, type CreateShareLinkInput, type CreateShareLinkResult } from '../actions';

type DialogState =
  | { kind: 'initial' }
  | { kind: 'loading' }
  | { kind: 'success'; url: string; expiresAt: string; aiSkipped?: 'cap_reached' | 'error' }
  | { kind: 'rate_limit'; message: string }
  | { kind: 'error'; message: string };

export function ShareLinkButton({
  range, compare, building,
}: CreateShareLinkInput) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DialogState>({ kind: 'initial' });
  const [, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setState({ kind: 'initial' });
  }

  function generate() {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const r: CreateShareLinkResult = await createAdsShareLinkAction({ range, compare, building });
      if (r.ok) {
        setState({ kind: 'success', url: r.url, expiresAt: r.expires_at, aiSkipped: r.ai_skipped_reason });
      } else if (r.error === 'rate_limit') {
        setState({ kind: 'rate_limit', message: r.message });
      } else {
        setState({ kind: 'error', message: r.message });
      }
    });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard?.writeText(text).catch(() => { /* fail silently */ });
  }

  const rangeLabel = range.preset === 'custom' ? `${range.from} → ${range.to}` : range.preset;
  const buildingLabel = building ?? 'all buildings';
  const expiryLabel = state.kind === 'success'
    ? new Date(state.expiresAt).toLocaleString('en-US', { timeZone: 'Africa/Cairo' })
    : '';

  return (
    <>
      <button
        type="button"
        className="ix-btn-secondary text-xs"
        onClick={() => setOpen(true)}
        title="Generate a 48-hour public share link for this dashboard"
      >
        <Share2 size={12} /> Share
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="ix-card max-w-md w-full mx-4 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Share dashboard</h3>
              <button type="button" className="text-xs text-slate-500" onClick={close}>Close</button>
            </div>

            {state.kind === 'initial' && (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Generate a 48-hour public link to share this dashboard view ({rangeLabel}, {buildingLabel}). Generating regenerates the AI narrative (~$0.01).
                </p>
                <button type="button" className="ix-btn-primary text-xs w-full" onClick={generate}>Generate share link</button>
              </>
            )}

            {state.kind === 'loading' && (
              <p className="text-xs text-slate-500">Generating snapshot…</p>
            )}

            {state.kind === 'success' && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={state.url}
                    className="ix-input text-xs flex-1"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="ix-btn-secondary text-xs"
                    onClick={() => copyToClipboard(state.url)}
                    title="Copy URL"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Link expires {expiryLabel} Cairo. To save as PDF: open the link, click the Print button at the top, choose "Save as PDF" in the browser dialog.
                </p>
                {state.aiSkipped && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    AI narrative was skipped ({state.aiSkipped === 'cap_reached' ? 'daily AI cap reached' : 'generation error'}). Other sections are unaffected.
                  </p>
                )}
              </>
            )}

            {state.kind === 'rate_limit' && (
              <p className="text-xs text-amber-700 dark:text-amber-300">{state.message}</p>
            )}

            {state.kind === 'error' && (
              <>
                <p className="text-xs text-rose-700 dark:text-rose-300">Snapshot failed: {state.message}</p>
                <button type="button" className="ix-btn-secondary text-xs" onClick={generate}>Retry</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Wire the button into the page header**

Modify `src/app/beithady/ads/page.tsx` — add import and render in the header `right` slot:

```tsx
// Add to imports near the top:
import { ShareLinkButton } from './_components/share-link-button';

// In the page body, find the BeithadyHeader `right` prop:
//   right={
//     <div className="flex items-center gap-2">
//       <form action={syncAllAction} className="inline"> ... </form>
//       <Link href={`/beithady/ads/create...`} className="ix-btn-primary"> ... </Link>
//     </div>
//   }
// Change to:
        right={
          <div className="flex items-center gap-2">
            <form action={syncAllAction} className="inline">
              <button type="submit" className="ix-btn-secondary text-xs" title="Pull latest spend + leads from Meta + Google + TikTok">
                <RefreshCw size={12} /> Sync now
              </button>
            </form>
            <ShareLinkButton
              range={{ from: range.from, to: range.to, preset: range.preset }}
              compare={range.compare ?? null}
              building={sp.building ?? null}
            />
            <Link
              href={`/beithady/ads/create${sp.building ? `?building=${sp.building}` : ''}${sp.date ? `&date=${sp.date}` : ''}${sp.signal ? `&signal=${sp.signal}` : ''}`}
              className="ix-btn-primary"
            >
              <Plus size={14} /> New campaign
            </Link>
          </div>
        }
```

- [ ] **Step 5: Run all share-link tests**

Run: `npx vitest run src/app/beithady/ads/_components/share-link-button`
Expected: PASS — 5/5 tests.

- [ ] **Step 6: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/beithady/ads/_components/share-link-button.tsx src/app/beithady/ads/_components/share-link-button.test.tsx src/app/beithady/ads/page.tsx
git commit -m "feat(bh-ads): <ShareLinkButton> + dialog wired in page header (V4)"
```

---

## Task 20: Final verification + V4 handoff entry

**Files:**
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 1: Run the full vitest suite**

Run: `npx vitest run`
Expected: PASS — all tests green (V1+V2+V3 suite + new V4 tests). Take note of the exact count for the handoff entry. Should be ~950+ passing tests (V3 was 922 + ~30 new V4 tests).

- [ ] **Step 2: Run tsc**

Run: `npx tsc --noEmit`
Expected: PASS (exit 0).

- [ ] **Step 3: Verify migration applied + 18 V4 commits pushed**

Run via Supabase MCP `execute_sql` with `select count(*) as cnt from ads_dashboard_snapshots`:
Expected: `[{ "cnt": 0 }]` (table exists, empty until first share-link).

Run: `git log --oneline origin/main..HEAD` — expect empty (everything pushed).
Run: `git log --oneline -25` — verify 20 V4 commits visible.

- [ ] **Step 4: Prepend V4 SHIPPED entry to SESSION_HANDOFF.md**

Prepend this to the top of the file:

```markdown
## 2026-05-17 — SHIPPED: BH Ads Insights V4 (20/20 tasks) ✅

**Scope:** F1 public share link `/r/beithady/ads/<token>` + F2 PDF via browser print. Full mirror of overview + all 8 audience sub-tabs. Fixed 48h expiry, 5 links/user/day rate limit, graceful AI cap-skip. Spec [docs/superpowers/specs/2026-05-17-bh-ads-v4-sharing-design.md](docs/superpowers/specs/2026-05-17-bh-ads-v4-sharing-design.md), plan [docs/superpowers/plans/2026-05-17-bh-ads-v4-sharing.md](docs/superpowers/plans/2026-05-17-bh-ads-v4-sharing.md).

**What landed:**
- New table `ads_dashboard_snapshots` (migration 0141). Cleanup folded into existing `beithady-daily-report-cleanup` cron.
- Server action `createAdsShareLinkAction` — rate-limited (5/day via audit-log count), gathers 13 data slices in parallel, regenerates AI summary with graceful cap-skip, stores ~50-200KB JSONB payload, returns token + URL.
- 13 cards refactored to view+fetcher split (5 main-page + 8 sub-tabs). Live components delegate to view components; snapshot route renders the same views with frozen payload data + `readonly` prop.
- New public route `/r/beithady/ads/[token]` — mirrors daily-report `/r/` pattern. Print toolbar with @page A4 CSS. 404s on not-found / deleted / expired.
- New `<ShareLinkButton>` in page header (between Sync + New campaign). Dialog with initial / loading / success / rate_limit / error states.

**Verification:** Tests passing (count: TBD-from-step-1). `tsc --noEmit` clean. Migration 0141 present in schema.

**Smoke checklist for kareem:**
- [ ] Open `/beithady/ads`, click Share → generate link → open in incognito → verify all 8 sub-tab sections render
- [ ] Click "Save as PDF / Print" on the snapshot → verify A4 layout without toolbar
- [ ] Try generating a 6th link in one Cairo-day → expect rate-limit message
- [ ] After 48h, verify expired snapshot 404s

---
```

- [ ] **Step 5: Commit + push**

```bash
git add SESSION_HANDOFF.md
git commit -m "chore: V4 final handoff — BH Ads Insights V4 shipped (20/20)"
git push origin HEAD:main
```

---

## Notes for the implementing engineer

- **Permissions to apply migrations:** Standing authorization in [CLAUDE.md](../../CLAUDE.md) — apply migrations via Supabase MCP without asking.
- **Deploy:** Push to `main` auto-deploys via GitHub → Vercel integration. No manual `vercel --prod` needed (worktree quirk noted in CLAUDE.md).
- **Stop hook:** Update `SESSION_HANDOFF.md` after every turn or the hook blocks the turn from ending.
- **BH theme rule:** Only `ix-card` / `ix-btn-*` / `ix-input` utilities + emerald/slate/amber/rose palette. No raw Tailwind palette on BH surfaces (per memory `feedback_beithady_brand_only.md`).
- **Read existing files first:** When a task says "read existing file X", actually read it — don't guess at the JSX shape. The view extraction MUST preserve current rendered output verbatim so existing live tests stay green.
- **If implementer status = BLOCKED**: most likely cause is a card's JSX referencing a prop / helper that wasn't documented here. Read the existing card carefully, capture the exact dependencies, and re-dispatch.
