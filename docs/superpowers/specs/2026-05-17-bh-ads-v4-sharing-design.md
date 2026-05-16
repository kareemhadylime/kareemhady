# BH Ads Insights V4 — Sharing Design

**Date:** 2026-05-17
**Author:** kareemhady + Claude
**Status:** Approved — ready for plan
**Roadmap parent:** [docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md](2026-05-16-bh-ads-insights-roadmap.md) § V4 — Sharing
**Predecessors:** V1 (filter + audience, 25 tasks), V2 (funnel + quality, 17 tasks), V3 (time/patterns + optimization, 19 tasks) — all shipped.

---

## 1. Goal

Add **off-platform sharing** to `/beithady/ads/`:

- **F1 — Public share link**: tokenized read-only URL `https://app.limeinc.cc/r/beithady/ads/<token>` that renders a **frozen snapshot of the entire dashboard** (overview + all 8 audience sub-tabs) without requiring login. Recipient sees the dashboard as it looked at snapshot time.
- **F2 — PDF export**: the public page includes a "Save as PDF / Print" button. Browser converts via `@page A4` CSS. No server-side PDF rendering.

Both features use the **same snapshot** — one creation flow produces one URL that satisfies both deliverables.

## 2. Why this design

- **Mirrors the existing `/r/beithady/[token]` daily-report pattern** ([src/app/r/beithady/[token]/page.tsx](../../../src/app/r/beithady/[token]/page.tsx)) — token entropy, expiry handling, cleanup cron, OG metadata, print toolbar are all already-proven primitives.
- **Browser-print path** is dramatically cheaper than a dedicated `@react-pdf/renderer` route for a full-dashboard mirror. The daily-report does both in parallel; for V4 we only need the cheaper one because all output flows through the share link.
- **View+fetcher refactor** prevents code drift: live dashboard and snapshot view render the *same* presentation components, just with different data sources. Future dashboard tweaks automatically flow into share-link output.
- **Fixed 48h expiry + 5/day rate limit** prevents abuse (link spam, indefinite public exposure) without adding configuration complexity.

## 3. Scope decisions

| Decision | Value | Rationale |
|---|---|---|
| Snapshot scope | Full mirror — overview + 8 audience sub-tabs | Kareem chose for completeness. Partners can scroll the deep cuts. |
| PDF strategy | Browser print only (`window.print()` from `/r/` page) | Cheap, matches daily-report pattern, leverages existing print toolbar code. |
| Link expiry | Fixed 48h | Matches daily-report. No per-link configuration. |
| AI summary | Force regenerate on snapshot creation; graceful skip if 20/day cap hit | Recipient sees AI narrative when available; snapshot still ships otherwise. |
| Create permission | `ads:read` (any operator) | Permissive. Operators routinely share with teammates. |
| Rate limit | Max 5 snapshots / user / 24h Cairo | Prevents accidental spam; enforced via `beithady_audit_log` count. |
| Render path | Refactor existing cards to view+fetcher split | Single source of truth for layout. Live + snapshot share view components. |

## 4. Out of scope (explicit YAGNI)

- Configurable expiry (24h / 7d / 30d picker)
- Snapshot management UI (list / revoke / regenerate / "my links")
- Edit-after-creation (snapshots are immutable)
- Per-snapshot AI regeneration after creation
- Server-side `@react-pdf/renderer` route
- CSV / Excel / PNG export formats
- Embeddable widget mode (stripped layout for `<iframe>`)
- Email-gated share ("only john@acme.com can view") — V4 is fully public-link
- Watermark / "DRAFT" overlay
- View analytics ("how many times has this link been opened")

## 5. Architecture

### 5.1 New surface

```
src/
  app/
    beithady/ads/
      _components/
        share-link-button.tsx          (NEW: header button + dialog)
        ai-summary-view.tsx            (NEW: pure view, extracted from ai-summary-card.tsx)
        anomaly-banner-view.tsx        (NEW: pure view, extracted)
        frt-view.tsx                   (NEW: pure view, extracted)
        spend-pacing-view.tsx          (NEW: pure view, extracted)
        audience-summary-view.tsx      (NEW: pure view, extracted)
        ads-snapshot-view.tsx          (NEW: assembles ALL view components into snapshot layout)
      audience/_components/
        geo-tab-view.tsx               (NEW: pure view, extracted from geo-tab.tsx)
        demo-tab-view.tsx              (NEW: pure view, extracted)
        device-tab-view.tsx            (NEW: pure view, extracted)
        funnel-tab-view.tsx            (NEW: pure view, extracted)
        quality-tab-view.tsx           (NEW: pure view, extracted)
        cohort-tab-view.tsx            (NEW: pure view, extracted)
        time-tab-view.tsx              (NEW: pure view, extracted)
        optimize-tab-view.tsx          (NEW: pure view, extracted)
      actions.ts                       (MODIFY: add createAdsShareLinkAction)
    r/beithady/ads/[token]/
      page.tsx                         (NEW: public route, reuses /r/beithady/[token] shell pattern)
  lib/beithady/ads/
    snapshot.ts                        (NEW: payload assembly + types + token gen)
supabase/migrations/
  0141_ads_dashboard_snapshots.sql     (NEW: table + indexes)
```

### 5.2 Migration 0141 — `ads_dashboard_snapshots`

```sql
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

No RLS — service-role only. Public access goes through `/r/` route which validates token + expiry server-side, same pattern as `daily_report_snapshots`.

### 5.3 Cleanup cron

**Extend the existing `beithady-daily-report-cleanup` cron** ([src/app/api/cron/beithady-daily-report-cleanup/route.ts](../../../src/app/api/cron/beithady-daily-report-cleanup/route.ts)) — already runs hourly, already calls `cleanupExpiredSnapshots()` from [src/lib/beithady-daily-report/run.ts](../../../src/lib/beithady-daily-report/run.ts) to purge `daily_report_snapshots`.

**Concrete change:**
1. Add a sibling function `cleanupExpiredAdsSnapshots()` in `src/lib/beithady/ads/snapshot.ts`:
   ```ts
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
2. Modify the cron route to call both functions and merge their result:
   ```ts
   const [dailyResult, adsResult] = await Promise.all([
     cleanupExpiredSnapshots(),
     cleanupExpiredAdsSnapshots(),
   ]);
   return NextResponse.json({ daily: dailyResult, ads: adsResult });
   ```

No `vercel.json` change required — the cron schedule already fires hourly. Authorization (`Bearer $CRON_SECRET`) inherited from the existing route.

Setting `payload = null` zeroes the bytes via TOAST; `deleted_at` marks soft-deleted. Row stays for audit; payload is gone.

## 6. Snapshot payload

### 6.1 TypeScript shape

```ts
// src/lib/beithady/ads/snapshot.ts

export type AdsSnapshotPayload = {
  meta: {
    schema_version: 1;
    generated_at: string;                 // ISO
    generated_by_user_id: string | null;
    generated_by_user_email: string | null;  // for display only
    range: { from: string; to: string; preset: string };
    compare: 'prev_period' | 'prev_year' | null;
    building: string | null;              // building_code or null = all
    ai_used: boolean;
    ai_skipped_reason?: 'cap_reached' | 'error';
  };

  // Main page slices
  kpis: { current: DashboardKpis; prior: DashboardKpis | null };
  campaigns: CampaignRowWithEgp[];        // EGP-converted spend baked in
  recent_leads: LeadFunnelRow[];          // top 10
  platform_status: {
    meta: PlatformBreakdownStat;
    google: PlatformBreakdownStat;
    tiktok: PlatformBreakdownStat;
  };
  frt: FrtData | null;                    // null if FrtCard would have returned empty
  spend_pacing: SpendPacingData;
  anomalies: AnomalyEvent[];
  audience_summary: AudienceSummaryData;
  ai_summary: string | null;              // null when ai_skipped_reason set

  // Sub-tab slices (V1 + V2 + V3 surfaces)
  audience_geo: GeoBreakdownData;
  audience_demo: DemoBreakdownData;
  audience_device: DeviceBreakdownData;
  funnel: FunnelData;
  quality: QualityData;
  cohort: CohortData;
  time: { lead_density: HeatmapData; meta_hourly: HeatmapData };
  optimize: { top_ads: TopAdRow[]; top_assets: TopAssetRow[] };
};
```

Estimated payload size: 50-200KB. Postgres TOAST handles transparently.

### 6.2 Schema versioning

`meta.schema_version = 1`. The public route checks this; if a future V5 changes the shape, bump to `2` and the route gracefully degrades old snapshots (renders what it can, hides what it can't). For V4 we don't implement a migration path — just the version tag for future use.

## 7. Server action — `createAdsShareLinkAction`

Location: `src/app/beithady/ads/actions.ts`.

Signature:
```ts
export type CreateShareLinkResult =
  | { ok: true; token: string; url: string; expires_at: string; ai_skipped_reason?: string }
  | { ok: false; error: 'rate_limit' | 'data_error'; message: string };

export async function createAdsShareLinkAction(input: {
  range: { from: string; to: string; preset: string };
  compare: 'prev_period' | 'prev_year' | null;
  building: string | null;
}): Promise<CreateShareLinkResult>;
```

### 7.1 Steps

1. **Auth**: `await requireBeithadyPermission('ads', 'read')` — throws on unauthorized.
2. **Rate limit**: count `beithady_audit_log` rows where `module='ads' and action='ads_share_link_created' and user_id=$current and created_at >= today_cairo_midnight_iso`. If `≥ 5`, return `{ ok: false, error: 'rate_limit', message: 'You have used 5/5 share links today. Try again after midnight Cairo.' }`.
3. **Gather data slices** in parallel via `Promise.all`. Use existing lib functions:
   - `getDashboardKpisWithCompare({ range, compare })` → kpis
   - `listCampaigns()` + `convertManyToEgp(...)` → campaigns with EGP spend
   - `listLeadFunnel({ limit: 10 })` → recent_leads
   - `getProviderEnabled / getProviderStatus` × 3 → platform_status
   - `getFrt({ range, buildingCode })` → frt (catch + null on error)
   - `getSpendPacing({ range })` → spend_pacing
   - `detectAnomalies({ range })` → anomalies
   - `getAudienceSummary({ range, building })` → audience_summary
   - `getGeoBreakdown / getDemoBreakdown / getDeviceBreakdown({ range, building })` → audience_*
   - `getFunnel / getQuality / getCohort({ range, building })` → funnel, quality, cohort
   - `getLeadDensityHeatmap / getMetaHourlyHeatmap({ range, building })` → time
   - `getTopAds({ range, building, sortBy: 'leads', limit: 20 })` + `getTopAssets({ buildingCode, limit: 20 })` → optimize
4. **AI summary**: try `generateAiSummary({ range, building, slices })`. On success → string. On `cap_reached` throw → set `ai_skipped_reason='cap_reached'`, summary `null`. On any other error → `ai_skipped_reason='error'`, summary `null`. **Never fail the whole snapshot on AI errors.**
5. **Assemble payload** with `schema_version: 1`.
6. **Generate token**: `crypto.randomBytes(24).toString('base64url')` (192-bit entropy).
7. **Insert** into `ads_dashboard_snapshots`: `payload`, `token`, `expires_at = now() + interval '48 hours'`, `generated_by_user_id = $current_user`.
8. **Audit log**: insert into `beithady_audit_log` with `module='ads'`, `action='ads_share_link_created'`, `user_id=$current`, `metadata = { token, expires_at, range, building, ai_skipped_reason? }`. This row IS the rate-limit ledger — single source of truth.
9. **Return** `{ ok: true, token, url: '${APP_BASE}/r/beithady/ads/${token}', expires_at, ai_skipped_reason? }`.

### 7.2 Error semantics

- **Data slice errors** (e.g. `getSpendPacing` throws Supabase 500): action returns `{ ok: false, error: 'data_error', message: <err.message> }`. Don't ship a half-empty snapshot.
- **AI errors**: NEVER fail. Set `ai_skipped_reason`, omit summary, ship snapshot.
- **Insert errors**: bubble up to client as `data_error`.

## 8. UI — `<ShareLinkButton />` in page header

Location: `src/app/beithady/ads/_components/share-link-button.tsx`.

### 8.1 Placement

`src/app/beithady/ads/page.tsx` header `right={...}` prop — appears alongside "Sync now" and "New campaign". Compact secondary button: `<Share2 /> Share`.

### 8.2 Dialog behavior

Native `<dialog>` element (matches existing dialog pattern in daily-report). States:

| State | UI |
|---|---|
| Initial | "Generate a 48-hour public link to share this dashboard view (`{range_label}`, `{building or 'all buildings'}`). Generating regenerates the AI narrative (~$0.01)." + `<Generate>` button. |
| Loading | Spinner + "Generating snapshot…" |
| Success | URL displayed in read-only input + `<Copy>` button (uses `navigator.clipboard.writeText`). "Save as PDF: open link, click Print, choose 'Save as PDF'." + "Expires `{cairo_local_time}`." |
| Rate limited | "You've used 5/5 share links today. Try after midnight Cairo." + `<Close>`. |
| AI cap-skipped (info, not error) | Success state + small amber note: "AI narrative was skipped (daily AI cap reached). Other sections are unaffected." |
| Data error | "Snapshot failed: `{message}`." + `<Retry>` + `<Close>`. |

Submits to `createAdsShareLinkAction` via React Server Action (form action). Client-side `useTransition` for pending state.

## 9. Public route — `/r/beithady/ads/[token]/page.tsx`

### 9.1 Shape

Clone the existing `/r/beithady/[token]/page.tsx` structure:
- `export const dynamic = 'force-dynamic'; export const revalidate = 0;`
- `export const metadata = { title: 'Beit Hady · Ads Performance Snapshot', robots: { index: false, follow: false }, openGraph: { ... limeinc logo ... } }`
- `PRINT_CSS` constant: `@page { size: A4; margin: 14mm; }` + body classes + hide-toolbar-when-printing rules + page-break-before on each major section.
- `PRINT_SCRIPT` constant: wires the Print button to `window.print()`.
- Page function: query `ads_dashboard_snapshots` by token, 404 on not-found / deleted / expired, render `<SnapshotShell>` + `<AdsSnapshotView payload={...}>` + print script.

### 9.2 `<SnapshotShell>` (inline component in the page file)

```
[Toolbar: "Beit Hady · Ads Performance" + "Save as PDF / Print" button + "Link expires {cairo_time}"]
[Shell: white box, max-width 210mm A4, centered]
  <AdsSnapshotView payload={...} />
[End shell]
```

Identical visual treatment to the daily-report shell (cream/navy/gold palette).

### 9.3 `<AdsSnapshotView>` (new, lives in `_components/`)

Composes the existing view components in a fixed vertical order:

```
1.  Header strip: "Beit Hady — Ads Performance · {date range} · {building or 'All buildings'} · Generated {cairo_time}"
2.  <AiSummaryView /> (or "AI narrative skipped — daily cap" note if null)
3.  <AnomalyBannerView />
4.  KPI cards (Spend / Leads / CPL / Bookings / Revenue / Active / Drafts with PeriodDeltaBadge)
5.  <FrtView /> + <SpendPacingView /> side by side (or stacked on print)
6.  <AudienceSummaryView />
7.  Campaigns table (slice top 12, same as live)
8.  Recent leads (top 10)
9.  Page break — § Audience deep dive
10. <GeoTabView />
11. <DemoTabView />
12. <DeviceTabView />
13. Page break — § Funnel & quality
14. <FunnelTabView />
15. <QualityTabView />
16. <CohortTabView />
17. Page break — § Time & optimization
18. <TimeTabView /> (renders BOTH lead-density and meta-hourly heatmaps stacked, no toggle)
19. <OptimizeTabView /> (renders top ads + top assets, no sort toggle — server-rendered as 'leads' default)
20. Footer: "Generated by {user_email or 'Beit Hady operator'} · Snapshot expires {cairo_time}"
```

No interactivity in the snapshot: no tab switcher, no heatmap toggle, no sort tabs. Everything is statically rendered with sensible defaults.

## 10. View+fetcher refactor (the bulk of the work)

For each affected card/tab, split into two files:

**Pattern:**
```ts
// xxx-view.tsx — pure, no async, no Supabase
export function XxxView({ data }: { data: XxxData }) {
  return <div>...</div>;
}

// xxx-card.tsx (or xxx-tab.tsx) — async server component, thin wrapper
export async function XxxCard(props: XxxFetchProps) {
  const data = await getXxx(props);
  return <XxxView data={data} />;
}
```

**Files to refactor (existing → split):**

| Existing file | View file | Data type |
|---|---|---|
| `_components/ai-summary-card.tsx` | `_components/ai-summary-view.tsx` | `{ summary: string \| null; usedToday: number; cap: number; range; readonly?: boolean }` |
| `_components/anomaly-banner.tsx` | `_components/anomaly-banner-view.tsx` | `AnomalyEvent[]` |
| `_components/frt-card.tsx` | `_components/frt-view.tsx` | `FrtData \| null` |
| `_components/spend-pacing-card.tsx` | `_components/spend-pacing-view.tsx` | `SpendPacingData` |
| `_components/audience-summary-widget.tsx` | `_components/audience-summary-view.tsx` | `AudienceSummaryData` |
| `audience/_components/geo-tab.tsx` | `audience/_components/geo-tab-view.tsx` | `GeoBreakdownData` |
| `audience/_components/demo-tab.tsx` | `audience/_components/demo-tab-view.tsx` | `DemoBreakdownData` |
| `audience/_components/device-tab.tsx` | `audience/_components/device-tab-view.tsx` | `DeviceBreakdownData` |
| `audience/_components/funnel-tab.tsx` | `audience/_components/funnel-tab-view.tsx` | `FunnelData` |
| `audience/_components/quality-tab.tsx` | `audience/_components/quality-tab-view.tsx` | `QualityData` |
| `audience/_components/cohort-tab.tsx` | `audience/_components/cohort-tab-view.tsx` | `CohortData` |
| `audience/_components/time-tab.tsx` | `audience/_components/time-tab-view.tsx` | `{ lead_density, meta_hourly, mode?: 'lead' \| 'meta' \| 'both' }` |
| `audience/_components/optimize-tab.tsx` | `audience/_components/optimize-tab-view.tsx` | `{ top_ads, top_assets, sortBy?: 'leads' \| 'ctr' \| 'cpl' }` |

**Readonly mode:** the View components receive an optional `readonly?: boolean` prop. Snapshot pages pass `readonly={true}` which suppresses interactive controls (the Generate button in AiSummaryView; the sort tabs in OptimizeTabView; the mode toggle in TimeTabView). Live cards pass `readonly={false}` (default).

**Testing**: existing component tests target the live wrappers; new tests target the View components with fixture data. Live wrapper tests stay green (now mock the data fetcher, render delegates to View).

## 11. Error handling matrix

| Failure | Where | Behavior | Test |
|---|---|---|---|
| Rate limit ≥5/day | server action | Return `{ ok: false, error: 'rate_limit', message }` | Action unit test with mocked audit-log count |
| AI cap reached | server action | `ai_skipped_reason='cap_reached'`, snapshot succeeds | Action test with mocked `generateAiSummary` throwing cap error |
| AI other error | server action | `ai_skipped_reason='error'`, snapshot succeeds | Action test with mocked AI throwing generic error |
| Data slice error | server action | `{ ok: false, error: 'data_error', message }` | Action test with mocked `getSpendPacing` throwing |
| Token not found | `/r/` page | `notFound()` (404) | Page test |
| Token deleted (cleanup ran) | `/r/` page | `notFound()` (404) | Page test |
| Token expired (`expires_at < now`) | `/r/` page | `notFound()` (404) | Page test |
| Cleanup cron error | cron route | Log to `beithady_audit_log`, return 500. Cron retries hourly. | Cron unit test |

## 12. Tests

### 12.1 Unit (vitest, colocated)

- `src/lib/beithady/ads/snapshot.test.ts` — payload assembly with mocked data slices; token generation entropy check; `assembleSnapshotPayload(slices)` returns valid shape; schema_version is 1.
- `src/app/beithady/ads/actions.test.ts` — `createAdsShareLinkAction`: rate-limit path, AI cap path, AI error path, data-error path, success path.

### 12.2 Component (vitest + @testing-library/react)

- `share-link-button.test.tsx` — dialog states (initial / loading / success / rate-limited / cap-skipped / data-error). Mocked form action.
- One `.view.test.tsx` per view component (13 files) — render with fixture data, assert key text. Existing live-card tests adapted to delegate to view.
- `r/beithady/ads/[token]/page.test.tsx` — renders all view components from a fixture payload; renders 404 path for expired/deleted/not-found.
- `ads-snapshot-view.test.tsx` — composition order, page-break markers present, "AI narrative skipped" rendered when `ai_summary=null` and `ai_skipped_reason='cap_reached'`.

### 12.3 Integration

- Manual smoke after deploy: generate snapshot → open `/r/beithady/ads/<token>` → verify all 8 sub-tab sections render → click Print → verify A4 layout in browser preview.

## 13. Estimated effort

| # | Bucket | Tasks |
|---|---|---|
| 1 | Migration 0141 + extend cleanup cron | 1 |
| 2 | Snapshot helper + types + token gen | 1 |
| 3 | `createAdsShareLinkAction` + rate limit | 1 |
| 4 | Refactor 5 main-page cards to view+fetcher | 5 |
| 5 | Refactor 8 sub-tab components to view+fetcher | 8 |
| 6 | `<AdsSnapshotView>` (composition) | 1 |
| 7 | Public route `/r/beithady/ads/[token]/page.tsx` + print toolbar + print CSS | 1 |
| 8 | `<ShareLinkButton>` + dialog wiring | 1 |
| 9 | Final smoke + handoff entry | 1 |
| | **Total** | **~19 tasks** |

(Refactor tasks may consolidate during plan-writing if any cards are particularly trivial — final task count is the plan author's call.)

## 14. Migration applies + deploys

- Migration via Supabase MCP `apply_migration` (per standing authorization in CLAUDE.md).
- Cron extension in `vercel.json` if no existing cleanup cron exists; otherwise modify in place.
- Forward-deploy via push to `main` + Vercel auto-deploy (per standing authorization).

## 15. Success criteria

- ✅ Operator on `/beithady/ads/` clicks Share → gets a URL in <5s
- ✅ Recipient opens URL (logged out, different browser) → sees frozen dashboard with all 8 sub-tab sections
- ✅ Recipient clicks "Save as PDF / Print" → browser print dialog with A4 layout, no toolbar in output
- ✅ Link 404s after 48h (verified by manipulating `expires_at` in DB to test)
- ✅ 6th share-link attempt by same user in same Cairo-day returns clear rate-limit error
- ✅ AI cap-reached path: snapshot creates successfully, "AI narrative skipped" note visible on `/r/` page
- ✅ All existing tests still pass (live wrappers delegate to view components without breaking suite)
- ✅ New tests target view components with fixture data; ~30+ new tests added

---

**Next step:** invoke `superpowers:writing-plans` to generate TDD task list at `docs/superpowers/plans/2026-05-17-bh-ads-v4-sharing.md`.
