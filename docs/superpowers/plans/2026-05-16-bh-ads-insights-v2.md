# BH Ads Insights V2 — Funnel + Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a funnel chart, lead-quality %, WhatsApp first-response time card, per-building filter, and lead→booking cohort matrix to `/beithady/ads/` — without any new tables, crons, or migrations.

**Architecture:** Pure TS aggregators per feature (`funnel.ts`, `lead-quality.ts`, `frt.ts`, `per-building.ts`, `cohort.ts`), mirroring V1's `insights-{geo,demo,device}.ts` pattern. Three new sub-tabs on `/beithady/ads/audience/` (Funnel / Quality / Cohort), a compact FRT card + per-building chip row on `/beithady/ads`. All filtering is URL-state driven.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (BH theme: `ix-card` / `ix-btn-*` / emerald-active / slate-neutral — never raw palette outside that), TypeScript strict, Supabase Postgres (existing tables only), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-16-bh-ads-v2-funnel-quality-design.md`
**Roadmap:** `docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md`

## UI conventions (apply to every UI task)

- All `/beithady/ads/*` pages render inside `<BeithadyShell>` + `<BeithadyHeader>`. Tabs from `<AdsTabs />`.
- Cards = `ix-card p-5` (or `p-3` for compact). Buttons = `ix-btn-primary|secondary|ghost`. Inputs = `ix-input`.
- Chips active = the emerald pattern from `ads-tabs.tsx`:
  - Active: `bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800`
  - Inactive: `bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400`
- Permission gate every page: `await requireBeithadyPermission('ads', 'read');`
- No new chart libraries. SVG bars + tinted divs (V1's pattern).

## V1 context engineers need

- V1 shipped commits `63da355..2d08c1c`. Spec at `docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md`.
- V1 added: `ads_insights_{geo,demo,device}` tables, `<DateRangeFilter />`, `<PeriodDeltaBadge />`, `<AudienceSummaryWidget />`, `<AudienceFilters />`, `<GeoTab />`/`<DemoTab />`/`<DeviceTab />`, `parseDateRange()`, `computePeriodDelta()`, `RangeArg` overload on `reporting.ts`.
- `ads_lead_funnel` view (migration 0040, line 273) exposes `lead_id, created_at, platform, campaign_id, campaign_name, building_codes, matched_reservation_id, funnel_stage, booking_value, booking_currency, booking_check_in`.
- `ads_leads` table carries `first_response_at` (migration 0108) — V1's `listLeadFunnel` already joins it.
- Booked building lookup path: `ads_leads.matched_reservation_id` → `guesty_reservations.id` → `guesty_reservations.listing_id` → `guesty_listings.building_code`. V2 does this join in TS via a single `.in('id', reservationIds)` lookup per query.

---

## Task 1: `buildings.ts` — shared BH-* code list

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/buildings.ts`
- Create: `C:/kareemhady/src/lib/beithady/buildings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/buildings.test.ts
import { describe, it, expect } from 'vitest';
import { BH_BUILDINGS, UNATTRIBUTED, isBhBuilding } from './buildings';

describe('BH_BUILDINGS', () => {
  it('lists the 5 BH operating codes', () => {
    expect(BH_BUILDINGS.map(b => b.code)).toEqual(['BH-26','BH-73','BH-435','BH-OK','BH-34']);
  });
  it('every entry has code + name', () => {
    for (const b of BH_BUILDINGS) {
      expect(b.code).toMatch(/^BH-/);
      expect(b.name.length).toBeGreaterThan(0);
    }
  });
});

describe('UNATTRIBUTED', () => {
  it('is the literal "Unattributed"', () => expect(UNATTRIBUTED).toBe('Unattributed'));
});

describe('isBhBuilding', () => {
  it('accepts valid BH codes', () => {
    expect(isBhBuilding('BH-26')).toBe(true);
    expect(isBhBuilding('BH-OK')).toBe(true);
  });
  it('rejects garbage + Unattributed + empty', () => {
    expect(isBhBuilding('Unattributed')).toBe(false);
    expect(isBhBuilding('')).toBe(false);
    expect(isBhBuilding('XX-99')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/buildings.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/buildings.ts
export const BH_BUILDINGS = [
  { code: 'BH-26',  name: 'Beit Hady 26' },
  { code: 'BH-73',  name: 'Beit Hady 73' },
  { code: 'BH-435', name: 'Beit Hady 435' },
  { code: 'BH-OK',  name: 'Beit Hady OK' },
  { code: 'BH-34',  name: 'Beit Hady 34' },
] as const;

export type BhBuildingCode = (typeof BH_BUILDINGS)[number]['code'];

export const UNATTRIBUTED = 'Unattributed';

export function isBhBuilding(code: string): code is BhBuildingCode {
  return BH_BUILDINGS.some(b => b.code === code);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/buildings.test.ts
```
Expected: 4 tests PASS.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/buildings.ts src/lib/beithady/buildings.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add buildings.ts — single source of truth for BH-* codes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 2: `insights-utils.ts` — extract asInt/asMicros (closes V1 MIN-1)

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/insights-utils.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/insights-utils.test.ts`
- Modify: `C:/kareemhady/src/lib/beithady/ads/insights-geo.ts` (replace local helpers with import)
- Modify: `C:/kareemhady/src/lib/beithady/ads/insights-demo.ts`
- Modify: `C:/kareemhady/src/lib/beithady/ads/insights-device.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/insights-utils.test.ts
import { describe, it, expect } from 'vitest';
import { asInt, asMicros } from './insights-utils';

describe('asInt', () => {
  it('parses numeric strings', () => expect(asInt('42')).toBe(42));
  it('rounds decimals', () => expect(asInt('1.7')).toBe(2));
  it('returns 0 for non-numeric', () => expect(asInt('nope')).toBe(0));
  it('returns 0 for undefined', () => expect(asInt(undefined)).toBe(0));
  it('returns 0 for null', () => expect(asInt(null)).toBe(0));
});

describe('asMicros', () => {
  it('converts whole units to micros', () => expect(asMicros('5.50')).toBe(5_500_000));
  it('handles 0', () => expect(asMicros('0')).toBe(0));
  it('returns 0 for non-numeric', () => expect(asMicros('boom')).toBe(0));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/insights-utils.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/insights-utils.ts
export function asInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function asMicros(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
}
```

- [ ] **Step 4: Replace local helpers in V1's 3 insights files**

For each of `insights-geo.ts`, `insights-demo.ts`, `insights-device.ts`:
1. Add import at top: `import { asInt, asMicros } from './insights-utils';`
2. Delete the local `function asInt(...)` and `function asMicros(...)` declarations (they're identical across all three files; replace_all-safe).

- [ ] **Step 5: Run full test suite + commit**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/
```
Expected: insights-utils 8 PASS + all V1 normalizer tests still PASS (the 16 from Task 10/11/12).

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/insights-utils.ts src/lib/beithady/ads/insights-utils.test.ts src/lib/beithady/ads/insights-geo.ts src/lib/beithady/ads/insights-demo.ts src/lib/beithady/ads/insights-device.ts
git commit -m "$(cat <<'EOF'
refactor(bh-ads): extract asInt/asMicros to insights-utils (closes V1 MIN-1)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 3: `per-building.ts` — attribution helper + getBuildingBreakdown

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/per-building.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/per-building.test.ts`

The attribution function is pure; `getBuildingBreakdown` calls supabaseAdmin. Tests cover the pure helper exhaustively; the DB helper gets a smoke shape test using mocked supabaseAdmin.

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/per-building.test.ts
import { describe, it, expect } from 'vitest';
import { attributeLeadToBuilding } from './per-building';

describe('attributeLeadToBuilding', () => {
  it('uses matched_reservation_building when present (booked wins)', () => {
    expect(attributeLeadToBuilding({
      matched_reservation_building: 'BH-26',
      building_interest: 'BH-73',
    })).toBe('BH-26');
  });
  it('falls back to building_interest when not booked', () => {
    expect(attributeLeadToBuilding({
      matched_reservation_building: null,
      building_interest: 'BH-73',
    })).toBe('BH-73');
  });
  it('returns Unattributed when both missing', () => {
    expect(attributeLeadToBuilding({
      matched_reservation_building: null,
      building_interest: null,
    })).toBe('Unattributed');
  });
  it('handles undefined fields', () => {
    expect(attributeLeadToBuilding({})).toBe('Unattributed');
  });
  it('treats empty string as missing', () => {
    expect(attributeLeadToBuilding({
      matched_reservation_building: '',
      building_interest: '',
    })).toBe('Unattributed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/per-building.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/per-building.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { convertManyToEgp } from '@/lib/fx-rates';
import { UNATTRIBUTED } from '@/lib/beithady/buildings';

export type LeadAttributionInput = {
  matched_reservation_building?: string | null;
  building_interest?: string | null;
};

export function attributeLeadToBuilding(lead: LeadAttributionInput): string {
  const booked = lead.matched_reservation_building?.trim();
  if (booked) return booked;
  const interest = lead.building_interest?.trim();
  if (interest) return interest;
  return UNATTRIBUTED;
}

export type BuildingBreakdownRow = {
  building_code: string;
  leads: number;
  booked: number;
  quality_pct: number;
  spend_share_egp: number;
  spend_share_pct: number;
};

/**
 * For each BH building (+ Unattributed), aggregate leads/bookings in the date
 * range and a proportional spend share. Spend is divided equally across each
 * campaign's `building_codes` array.
 */
export async function getBuildingBreakdown(opts: {
  from: string;
  to: string;
  campaignId?: number;
}): Promise<BuildingBreakdownRow[]> {
  const sb = supabaseAdmin();

  // 1. Pull leads in window (plus the building_interest field) from ads_leads.
  let leadQ = sb.from('ads_leads')
    .select('id, matched_reservation_id, building_interest')
    .gte('created_at', opts.from)
    .lte('created_at', opts.to + 'T23:59:59');
  if (opts.campaignId) leadQ = leadQ.eq('campaign_id', opts.campaignId);
  const { data: leads, error: leadErr } = await leadQ;
  if (leadErr) { console.error('[per-building] leads query failed:', leadErr); return []; }
  const leadRows = (leads as Array<{ id: number; matched_reservation_id: string | null; building_interest: string | null }> | null) ?? [];

  // 2. Look up the building_code for any matched reservation (via listing).
  const reservationIds = leadRows.map(l => l.matched_reservation_id).filter((x): x is string => !!x);
  const buildingByReservation = new Map<string, string>();
  if (reservationIds.length) {
    const { data: resvs } = await sb.from('guesty_reservations')
      .select('id, listing_id')
      .in('id', reservationIds);
    const listingIds = ((resvs as Array<{ id: string; listing_id: string | null }> | null) ?? [])
      .map(r => r.listing_id).filter((x): x is string => !!x);
    if (listingIds.length) {
      const { data: listings } = await sb.from('guesty_listings')
        .select('id, building_code')
        .in('id', listingIds);
      const buildingByListing = new Map<string, string>();
      for (const l of (listings as Array<{ id: string; building_code: string | null }> | null) ?? []) {
        if (l.building_code) buildingByListing.set(l.id, l.building_code);
      }
      for (const r of (resvs as Array<{ id: string; listing_id: string | null }> | null) ?? []) {
        const b = r.listing_id ? buildingByListing.get(r.listing_id) : undefined;
        if (b) buildingByReservation.set(r.id, b);
      }
    }
  }

  // 3. Attribute each lead + tally.
  const tally = new Map<string, { leads: number; booked: number }>();
  for (const l of leadRows) {
    const bookedBuilding = l.matched_reservation_id ? buildingByReservation.get(l.matched_reservation_id) ?? null : null;
    const code = attributeLeadToBuilding({
      matched_reservation_building: bookedBuilding,
      building_interest: l.building_interest,
    });
    const t = tally.get(code) ?? { leads: 0, booked: 0 };
    t.leads += 1;
    if (l.matched_reservation_id) t.booked += 1;
    tally.set(code, t);
  }

  // 4. Spend share: proportional split across campaign.building_codes.
  const { data: dailyMetrics } = await sb.from('ads_daily_metrics')
    .select('campaign_id, spend_micros, account_id')
    .gte('metric_date', opts.from).lte('metric_date', opts.to)
    .is('ad_id', null).is('ad_set_id', null);
  const metricRows = (dailyMetrics as Array<{ campaign_id: number; spend_micros: number | string; account_id: number }> | null) ?? [];
  const campaignIds = Array.from(new Set(metricRows.map(m => m.campaign_id)));
  const { data: campaigns } = campaignIds.length
    ? await sb.from('ads_campaigns').select('id, building_codes').in('id', campaignIds)
    : { data: [] };
  const codesByCampaign = new Map<number, string[]>();
  for (const c of (campaigns as Array<{ id: number; building_codes: string[] | null }> | null) ?? []) {
    codesByCampaign.set(c.id, c.building_codes ?? []);
  }
  const { data: accounts } = await sb.from('ads_accounts').select('id, currency');
  const currencyByAccount = new Map<number, string>();
  for (const a of (accounts as Array<{ id: number; currency: string }> | null) ?? []) {
    currencyByAccount.set(a.id, a.currency);
  }

  // Sum spend per-currency per-building (proportional split), then convert to EGP.
  const spendByBuildingByCurrency = new Map<string, Map<string, number>>();
  for (const m of metricRows) {
    const codes = codesByCampaign.get(m.campaign_id) ?? [];
    if (codes.length === 0) continue;
    const splitMicros = Number(m.spend_micros) / codes.length;
    const currency = currencyByAccount.get(m.account_id) ?? 'USD';
    for (const code of codes) {
      const cm = spendByBuildingByCurrency.get(code) ?? new Map<string, number>();
      cm.set(currency, (cm.get(currency) ?? 0) + splitMicros);
      spendByBuildingByCurrency.set(code, cm);
    }
  }
  const spendEgpByBuilding = new Map<string, number>();
  for (const [code, byCurrency] of spendByBuildingByCurrency) {
    const conv = await convertManyToEgp(
      Array.from(byCurrency.entries()).map(([currency, micros]) => ({ amount: micros / 1_000_000, currency }))
    );
    spendEgpByBuilding.set(code, conv.reduce((s, n) => s + n, 0));
  }
  const totalSpendEgp = Array.from(spendEgpByBuilding.values()).reduce((s, n) => s + n, 0) || 1;

  // 5. Build final rows, sort BH-* alphabetically, Unattributed last.
  const codes = new Set<string>([...tally.keys(), ...spendEgpByBuilding.keys()]);
  const rows: BuildingBreakdownRow[] = Array.from(codes).map(code => {
    const t = tally.get(code) ?? { leads: 0, booked: 0 };
    const spend = spendEgpByBuilding.get(code) ?? 0;
    return {
      building_code: code,
      leads: t.leads,
      booked: t.booked,
      quality_pct: t.leads > 0 ? Math.round((t.booked / t.leads) * 1000) / 10 : 0,
      spend_share_egp: Math.round(spend),
      spend_share_pct: Math.round((spend / totalSpendEgp) * 100),
    };
  });
  rows.sort((a, b) => {
    if (a.building_code === UNATTRIBUTED) return 1;
    if (b.building_code === UNATTRIBUTED) return -1;
    return a.building_code.localeCompare(b.building_code);
  });
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/per-building.test.ts
```
Expected: 5 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/per-building.ts src/lib/beithady/ads/per-building.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add per-building attribution + getBuildingBreakdown

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 4: `funnel.ts` — 5-stage funnel aggregator

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/funnel.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/funnel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/funnel.test.ts
import { describe, it, expect } from 'vitest';
import { computeConversionPcts, type FunnelStageInput } from './funnel';

describe('computeConversionPcts', () => {
  it('produces 5 stages with conversion_pct_from_prev', () => {
    const input: FunnelStageInput[] = [
      { key: 'impressions', label: 'Impressions', count: 10000 },
      { key: 'reach', label: 'Reach', count: 7000 },
      { key: 'clicks', label: 'Clicks', count: 500 },
      { key: 'leads', label: 'Leads', count: 25 },
      { key: 'bookings', label: 'Bookings', count: 5 },
    ];
    const out = computeConversionPcts(input);
    expect(out[0].conversion_pct_from_prev).toBeNull();
    expect(out[1].conversion_pct_from_prev).toBe(70);
    expect(out[2].conversion_pct_from_prev).toBeCloseTo(7.1, 1);
    expect(out[3].conversion_pct_from_prev).toBe(5);
    expect(out[4].conversion_pct_from_prev).toBe(20);
  });
  it('handles all-zero gracefully (null conversion, no NaN)', () => {
    const input: FunnelStageInput[] = [
      { key: 'impressions', label: 'I', count: 0 },
      { key: 'reach', label: 'R', count: 0 },
      { key: 'clicks', label: 'C', count: 0 },
      { key: 'leads', label: 'L', count: 0 },
      { key: 'bookings', label: 'B', count: 0 },
    ];
    const out = computeConversionPcts(input);
    expect(out.every(s => s.count === 0)).toBe(true);
    expect(out[1].conversion_pct_from_prev).toBeNull();
  });
  it('computes conversion_pct_from_top relative to first stage', () => {
    const input: FunnelStageInput[] = [
      { key: 'impressions', label: 'I', count: 1000 },
      { key: 'reach', label: 'R', count: 500 },
      { key: 'clicks', label: 'C', count: 100 },
      { key: 'leads', label: 'L', count: 10 },
      { key: 'bookings', label: 'B', count: 2 },
    ];
    const out = computeConversionPcts(input);
    expect(out[0].conversion_pct_from_top).toBeNull();
    expect(out[4].conversion_pct_from_top).toBe(0.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/funnel.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/funnel.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { attributeLeadToBuilding } from './per-building';
import { asInt } from './insights-utils';

export type FunnelStageInput = {
  key: 'impressions' | 'reach' | 'clicks' | 'leads' | 'bookings';
  label: string;
  count: number;
};

export type FunnelStage = FunnelStageInput & {
  conversion_pct_from_prev: number | null;
  conversion_pct_from_top: number | null;
};

export type FunnelStages = { stages: FunnelStage[] };

export function computeConversionPcts(input: FunnelStageInput[]): FunnelStage[] {
  const top = input[0]?.count ?? 0;
  return input.map((stage, i) => {
    if (i === 0) return { ...stage, conversion_pct_from_prev: null, conversion_pct_from_top: null };
    const prev = input[i - 1].count;
    const fromPrev = prev > 0 ? Math.round((stage.count / prev) * 1000) / 10 : null;
    const fromTop = top > 0 ? Math.round((stage.count / top) * 1000) / 10 : null;
    return { ...stage, conversion_pct_from_prev: fromPrev, conversion_pct_from_top: fromTop };
  });
}

export async function getFunnelStages(opts: {
  from: string;
  to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<FunnelStages> {
  const sb = supabaseAdmin();

  // Top 3 stages: campaign-level metrics. ad_id IS NULL + ad_set_id IS NULL = campaign rollup.
  let metricsQ = sb.from('ads_daily_metrics')
    .select('impressions, clicks, reach, spend_micros, campaign_id')
    .gte('metric_date', opts.from).lte('metric_date', opts.to)
    .is('ad_id', null).is('ad_set_id', null);
  if (opts.campaignId) metricsQ = metricsQ.eq('campaign_id', opts.campaignId);
  const { data: metricRows, error: metricsErr } = await metricsQ;
  if (metricsErr) console.error('[funnel] metrics query failed:', metricsErr);
  const rows = (metricRows as Array<{ impressions: number; clicks: number; reach: number | null }> | null) ?? [];
  const impressions = rows.reduce((s, r) => s + asInt(r.impressions), 0);
  const reach = rows.reduce((s, r) => s + asInt(r.reach), 0);
  const clicks = rows.reduce((s, r) => s + asInt(r.clicks), 0);

  // Bottom 2 stages: lead-level with optional per-building filter.
  let leadQ = sb.from('ads_leads')
    .select('id, matched_reservation_id, building_interest')
    .gte('created_at', opts.from).lte('created_at', opts.to + 'T23:59:59');
  if (opts.campaignId) leadQ = leadQ.eq('campaign_id', opts.campaignId);
  const { data: leads, error: leadErr } = await leadQ;
  if (leadErr) console.error('[funnel] leads query failed:', leadErr);
  const leadRows = (leads as Array<{ id: number; matched_reservation_id: string | null; building_interest: string | null }> | null) ?? [];

  // If building filter active, do the reservation→listing→building_code join to filter
  const buildingByReservation = await buildingMapForLeads(sb, leadRows);
  const filteredLeads = opts.buildingCode
    ? leadRows.filter(l => {
        const bookedBuilding = l.matched_reservation_id ? buildingByReservation.get(l.matched_reservation_id) ?? null : null;
        return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: l.building_interest }) === opts.buildingCode;
      })
    : leadRows;

  const leadsCount = filteredLeads.length;
  const bookings = filteredLeads.filter(l => l.matched_reservation_id != null).length;

  return {
    stages: computeConversionPcts([
      { key: 'impressions', label: 'Impressions', count: impressions },
      { key: 'reach',       label: 'Reach',       count: reach },
      { key: 'clicks',      label: 'Clicks',      count: clicks },
      { key: 'leads',       label: 'Leads',       count: leadsCount },
      { key: 'bookings',    label: 'Bookings',    count: bookings },
    ]),
  };
}

// Shared helper used by funnel + lead-quality + frt when filtering by building.
export async function buildingMapForLeads(
  sb: ReturnType<typeof supabaseAdmin>,
  leadRows: Array<{ matched_reservation_id: string | null }>,
): Promise<Map<string, string>> {
  const reservationIds = leadRows.map(l => l.matched_reservation_id).filter((x): x is string => !!x);
  if (reservationIds.length === 0) return new Map();
  const { data: resvs } = await sb.from('guesty_reservations')
    .select('id, listing_id').in('id', reservationIds);
  const listingIds = ((resvs as Array<{ id: string; listing_id: string | null }> | null) ?? [])
    .map(r => r.listing_id).filter((x): x is string => !!x);
  if (listingIds.length === 0) return new Map();
  const { data: listings } = await sb.from('guesty_listings')
    .select('id, building_code').in('id', listingIds);
  const buildingByListing = new Map<string, string>();
  for (const l of (listings as Array<{ id: string; building_code: string | null }> | null) ?? []) {
    if (l.building_code) buildingByListing.set(l.id, l.building_code);
  }
  const map = new Map<string, string>();
  for (const r of (resvs as Array<{ id: string; listing_id: string | null }> | null) ?? []) {
    const b = r.listing_id ? buildingByListing.get(r.listing_id) : undefined;
    if (b) map.set(r.id, b);
  }
  return map;
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/funnel.test.ts
```
Expected: 3 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/funnel.ts src/lib/beithady/ads/funnel.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add funnel.ts — 5-stage funnel + conversion-pct helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 5: `lead-quality.ts` — per-campaign quality % aggregator

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/lead-quality.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/lead-quality.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/lead-quality.test.ts
import { describe, it, expect } from 'vitest';
import { rollupQualityByCampaign, type FunnelRowForQuality } from './lead-quality';

describe('rollupQualityByCampaign', () => {
  const rows: FunnelRowForQuality[] = [
    { campaign_id: 1, campaign_name: 'A', platform: 'meta',   matched_reservation_id: 'r1' },
    { campaign_id: 1, campaign_name: 'A', platform: 'meta',   matched_reservation_id: null },
    { campaign_id: 1, campaign_name: 'A', platform: 'meta',   matched_reservation_id: 'r2' },
    { campaign_id: 2, campaign_name: 'B', platform: 'google', matched_reservation_id: null },
    { campaign_id: 2, campaign_name: 'B', platform: 'google', matched_reservation_id: null },
  ];

  it('counts leads + booked per campaign with quality_pct', () => {
    const out = rollupQualityByCampaign(rows);
    const a = out.find(r => r.campaign_id === 1);
    const b = out.find(r => r.campaign_id === 2);
    expect(a).toMatchObject({ leads: 3, booked: 2, quality_pct: 66.7 });
    expect(b).toMatchObject({ leads: 2, booked: 0, quality_pct: 0 });
  });
  it('sorts by leads desc', () => {
    const out = rollupQualityByCampaign(rows);
    expect(out[0].leads).toBeGreaterThanOrEqual(out[1].leads);
  });
  it('returns empty for empty input', () => {
    expect(rollupQualityByCampaign([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/lead-quality.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/lead-quality.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { attributeLeadToBuilding } from './per-building';
import { buildingMapForLeads } from './funnel';

export type FunnelRowForQuality = {
  campaign_id: number | null;
  campaign_name: string | null;
  platform: 'meta' | 'google' | 'tiktok';
  matched_reservation_id: string | null;
};

export type LeadQualityRow = {
  campaign_id: number;
  campaign_name: string;
  platform: 'meta' | 'google' | 'tiktok';
  leads: number;
  booked: number;
  quality_pct: number;          // booked/leads * 100, 1 decimal
};

export function rollupQualityByCampaign(rows: FunnelRowForQuality[]): LeadQualityRow[] {
  const byCampaign = new Map<number, LeadQualityRow>();
  for (const r of rows) {
    if (r.campaign_id == null) continue;
    const cur = byCampaign.get(r.campaign_id) ?? {
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name ?? `Campaign ${r.campaign_id}`,
      platform: r.platform,
      leads: 0, booked: 0, quality_pct: 0,
    };
    cur.leads += 1;
    if (r.matched_reservation_id) cur.booked += 1;
    byCampaign.set(r.campaign_id, cur);
  }
  return Array.from(byCampaign.values())
    .map(r => ({ ...r, quality_pct: r.leads > 0 ? Math.round((r.booked / r.leads) * 1000) / 10 : 0 }))
    .filter(r => r.leads > 0)
    .sort((a, b) => b.leads - a.leads);
}

export async function getLeadQualityPerCampaign(opts: {
  from: string;
  to: string;
  buildingCode?: string;
}): Promise<LeadQualityRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('ads_lead_funnel')
    .select('campaign_id, campaign_name, platform, matched_reservation_id, building_interest')
    .gte('created_at', opts.from)
    .lte('created_at', opts.to + 'T23:59:59');
  if (error) { console.error('[lead-quality] funnel query failed:', error); return []; }
  const rows = (data as Array<FunnelRowForQuality & { building_interest: string | null }> | null) ?? [];

  let filtered = rows;
  if (opts.buildingCode) {
    const buildingByReservation = await buildingMapForLeads(sb, rows);
    filtered = rows.filter(r => {
      const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
      return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
    });
  }
  return rollupQualityByCampaign(filtered);
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/lead-quality.test.ts
```
Expected: 3 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/lead-quality.ts src/lib/beithady/ads/lead-quality.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add lead-quality.ts — per-campaign quality % aggregator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 6: `frt.ts` — FRT summary + per-campaign

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/frt.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/frt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/frt.test.ts
import { describe, it, expect } from 'vitest';
import { computeFrtSummary, type FrtInput } from './frt';

describe('computeFrtSummary', () => {
  function l(deltaMin: number | null): FrtInput {
    if (deltaMin == null) return { created_at: '2026-05-10T00:00:00Z', first_response_at: null };
    return {
      created_at: '2026-05-10T00:00:00Z',
      first_response_at: new Date(Date.parse('2026-05-10T00:00:00Z') + deltaMin * 60_000).toISOString(),
    };
  }

  it('computes median for odd count', () => {
    const out = computeFrtSummary([l(5), l(10), l(15)]);
    expect(out.median_minutes).toBe(10);
  });
  it('computes median for even count (average of middle two)', () => {
    const out = computeFrtSummary([l(5), l(10), l(20), l(40)]);
    expect(out.median_minutes).toBe(15);
  });
  it('computes p95', () => {
    const out = computeFrtSummary(Array.from({ length: 100 }, (_, i) => l(i + 1)));
    // 95th percentile of [1..100] sorted = index floor(100*0.95) = 95 → value 96
    expect(out.p95_minutes).toBe(96);
  });
  it('counts unresponded leads', () => {
    const out = computeFrtSummary([l(5), l(null), l(null), l(15)]);
    expect(out.unresponded_count).toBe(2);
    expect(out.responded_leads).toBe(2);
    expect(out.total_leads).toBe(4);
  });
  it('over_1h_count + over_1h_pct exclude boundary at exactly 60min', () => {
    const out = computeFrtSummary([l(60), l(61), l(120)]);
    expect(out.over_1h_count).toBe(2);  // 61 + 120
    expect(out.over_1h_pct).toBe(66.7);
  });
  it('all-unresponded → null median/p95, 0 over-1h-pct', () => {
    const out = computeFrtSummary([l(null), l(null)]);
    expect(out.median_minutes).toBeNull();
    expect(out.p95_minutes).toBeNull();
    expect(out.over_1h_count).toBe(0);
    expect(out.over_1h_pct).toBe(0);
  });
  it('empty input → zero/null shape', () => {
    const out = computeFrtSummary([]);
    expect(out).toEqual({
      total_leads: 0, responded_leads: 0, unresponded_count: 0,
      median_minutes: null, p95_minutes: null,
      over_1h_count: 0, over_1h_pct: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/frt.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/frt.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { attributeLeadToBuilding } from './per-building';
import { buildingMapForLeads } from './funnel';

export type FrtInput = {
  created_at: string;
  first_response_at: string | null;
};

export type FrtSummary = {
  total_leads: number;
  responded_leads: number;
  unresponded_count: number;
  median_minutes: number | null;
  p95_minutes: number | null;
  over_1h_count: number;
  over_1h_pct: number;
};

export const SLA_MINUTES = 60;

export function computeFrtSummary(leads: FrtInput[]): FrtSummary {
  const total = leads.length;
  const deltas: number[] = [];
  let unresponded = 0;
  for (const l of leads) {
    if (!l.first_response_at) { unresponded += 1; continue; }
    const delta = (Date.parse(l.first_response_at) - Date.parse(l.created_at)) / 60_000;
    if (Number.isFinite(delta) && delta >= 0) deltas.push(delta);
  }
  const responded = deltas.length;
  if (responded === 0) {
    return {
      total_leads: total, responded_leads: 0, unresponded_count: unresponded,
      median_minutes: null, p95_minutes: null, over_1h_count: 0, over_1h_pct: 0,
    };
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? Math.round(((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) * 10) / 10
    : Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = Math.round(sorted[p95Index] * 10) / 10;
  const over1h = deltas.filter(d => d > SLA_MINUTES).length;
  return {
    total_leads: total,
    responded_leads: responded,
    unresponded_count: unresponded,
    median_minutes: median,
    p95_minutes: p95,
    over_1h_count: over1h,
    over_1h_pct: responded > 0 ? Math.round((over1h / responded) * 1000) / 10 : 0,
  };
}

export async function getFrtSummary(opts: {
  from: string;
  to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<FrtSummary> {
  const rows = await loadLeadsForFrt(opts);
  return computeFrtSummary(rows);
}

export async function getFrtPerCampaign(opts: {
  from: string;
  to: string;
  buildingCode?: string;
}): Promise<Array<FrtSummary & { campaign_id: number; campaign_name: string }>> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('ads_leads')
    .select('id, created_at, first_response_at, campaign_id, matched_reservation_id, building_interest, ads_campaigns(name)')
    .gte('created_at', opts.from).lte('created_at', opts.to + 'T23:59:59');
  if (error) { console.error('[frt-per-campaign] query failed:', error); return []; }
  const rows = (data as Array<{
    id: number;
    created_at: string;
    first_response_at: string | null;
    campaign_id: number | null;
    matched_reservation_id: string | null;
    building_interest: string | null;
    ads_campaigns?: { name: string | null } | null;
  }> | null) ?? [];

  let filtered = rows;
  if (opts.buildingCode) {
    const buildingByReservation = await buildingMapForLeads(sb, rows);
    filtered = rows.filter(r => {
      const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
      return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
    });
  }

  const byCampaign = new Map<number, { name: string; leads: typeof filtered }>();
  for (const r of filtered) {
    if (r.campaign_id == null) continue;
    const cur = byCampaign.get(r.campaign_id) ?? { name: r.ads_campaigns?.name ?? `Campaign ${r.campaign_id}`, leads: [] };
    cur.leads.push(r);
    byCampaign.set(r.campaign_id, cur);
  }
  return Array.from(byCampaign.entries())
    .map(([id, group]) => ({
      campaign_id: id,
      campaign_name: group.name,
      ...computeFrtSummary(group.leads),
    }))
    .sort((a, b) => b.total_leads - a.total_leads);
}

async function loadLeadsForFrt(opts: {
  from: string; to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<FrtInput[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_leads')
    .select('id, created_at, first_response_at, matched_reservation_id, building_interest')
    .gte('created_at', opts.from).lte('created_at', opts.to + 'T23:59:59');
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  const { data, error } = await q;
  if (error) { console.error('[frt] query failed:', error); return []; }
  const rows = (data as Array<{
    id: number;
    created_at: string;
    first_response_at: string | null;
    matched_reservation_id: string | null;
    building_interest: string | null;
  }> | null) ?? [];

  if (!opts.buildingCode) return rows;
  const buildingByReservation = await buildingMapForLeads(sb, rows);
  return rows.filter(r => {
    const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
    return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
  });
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/frt.test.ts
```
Expected: 7 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/frt.ts src/lib/beithady/ads/frt.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add frt.ts — WhatsApp first-response time aggregator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 7: `cohort.ts` — weekly cohort matrix

**Files:**
- Create: `C:/kareemhady/src/lib/beithady/ads/cohort.ts`
- Create: `C:/kareemhady/src/lib/beithady/ads/cohort.test.ts`

Cairo-local ISO week boundary helper lifted from KIKA Picker Report's `resolveScope` pattern.

- [ ] **Step 1: Write the failing test**

```ts
// C:/kareemhady/src/lib/beithady/ads/cohort.test.ts
import { describe, it, expect } from 'vitest';
import {
  cairoIsoWeekStart, lagWeeksBetween, computeCohortMatrix,
  cellColorBucket, type CohortLeadInput,
} from './cohort';

describe('cairoIsoWeekStart', () => {
  it('returns Monday for a Wednesday Cairo-time date', () => {
    // 2026-05-13 Wed in Cairo → Mon May 11
    const r = cairoIsoWeekStart('2026-05-13T12:00:00+03:00');
    expect(r).toBe('2026-05-11');
  });
  it('returns same date for Monday Cairo time', () => {
    const r = cairoIsoWeekStart('2026-05-11T08:00:00+03:00');
    expect(r).toBe('2026-05-11');
  });
});

describe('lagWeeksBetween', () => {
  it('returns 0 for same week', () => expect(lagWeeksBetween('2026-05-11', '2026-05-13')).toBe(0));
  it('returns 1 for next week', () => expect(lagWeeksBetween('2026-05-04', '2026-05-12')).toBe(1));
  it('returns 4 for 4 weeks later', () => expect(lagWeeksBetween('2026-04-13', '2026-05-13')).toBe(4));
});

describe('cellColorBucket', () => {
  it('maps 0 → slate', () => expect(cellColorBucket(0)).toContain('slate'));
  it('maps 3 → emerald-50', () => expect(cellColorBucket(3)).toContain('emerald-50'));
  it('maps 15 → emerald-400/40', () => expect(cellColorBucket(15)).toContain('emerald-400/40'));
  it('maps 30 → emerald-500/40', () => expect(cellColorBucket(30)).toContain('emerald-500/40'));
});

describe('computeCohortMatrix', () => {
  it('buckets leads by Cairo-local ISO week and computes lag distribution', () => {
    const leads: CohortLeadInput[] = [
      { created_at: '2026-05-04T10:00:00+03:00', matched_at: '2026-05-12T10:00:00+03:00' },  // W18, lag 1
      { created_at: '2026-05-04T10:00:00+03:00', matched_at: '2026-05-19T10:00:00+03:00' },  // W18, lag 2
      { created_at: '2026-05-04T10:00:00+03:00', matched_at: null },                          // W18, unbooked
    ];
    const out = computeCohortMatrix(leads, { todayIso: '2026-05-13', weeksBack: 1 });
    expect(out.cohorts).toHaveLength(1);
    expect(out.cohorts[0].leads).toBe(3);
    expect(out.cohorts[0].bookings_by_lag[0]).toBe(1);   // W+1
    expect(out.cohorts[0].bookings_by_lag[1]).toBe(1);   // W+2
    expect(out.cohorts[0].conversion_pcts_by_lag[0]).toBeCloseTo(33.3, 1);
  });
  it('excludes leads from the current partial week', () => {
    const leads: CohortLeadInput[] = [
      { created_at: '2026-05-13T10:00:00+03:00', matched_at: null },   // current week
    ];
    const out = computeCohortMatrix(leads, { todayIso: '2026-05-13', weeksBack: 1 });
    expect(out.cohorts[0].leads).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/cohort.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// C:/kareemhady/src/lib/beithady/ads/cohort.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type CohortLeadInput = {
  created_at: string;
  matched_at: string | null;
};

export type CohortRow = {
  week_label: string;
  week_start: string;
  leads: number;
  bookings_by_lag: [number, number, number, number, number];
  conversion_pcts_by_lag: [number, number, number, number, number];
};

export type CohortMatrix = { cohorts: CohortRow[] };

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

// Convert any timestamp to a Cairo-local Monday (returns 'YYYY-MM-DD').
// Uses Africa/Cairo offset via the toLocaleString trick (DST-safe).
export function cairoIsoWeekStart(iso: string): string {
  const d = new Date(iso);
  // Get Cairo local Y/M/D using en-CA which formats as YYYY-MM-DD.
  const cairoYmd = d.toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
  const cairoDateMidnight = new Date(cairoYmd + 'T00:00:00Z').getTime();
  // Day-of-week in Cairo (0=Sun, 1=Mon, ..., 6=Sat).
  const cairoDow = Number(d.toLocaleString('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' })
    .match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)?.[0]
    ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(d.toLocaleString('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' }).slice(0, 3))
    : 0);
  // Monday = 1; days back from current Cairo day to Monday:
  const daysBack = (cairoDow + 6) % 7;
  const mondayMs = cairoDateMidnight - daysBack * MS_PER_DAY;
  return new Date(mondayMs).toISOString().slice(0, 10);
}

export function lagWeeksBetween(cohortStartIso: string, eventIso: string): number {
  const start = new Date(cohortStartIso + 'T00:00:00Z').getTime();
  const ev = new Date(eventIso).getTime();
  return Math.max(0, Math.floor((ev - start) / MS_PER_WEEK));
}

export function cellColorBucket(pct: number): string {
  if (pct <= 0) return 'bg-slate-100 dark:bg-slate-800';
  if (pct <= 5) return 'bg-emerald-50 dark:bg-emerald-950';
  if (pct <= 10) return 'bg-emerald-200/40 dark:bg-emerald-700/40';
  if (pct <= 20) return 'bg-emerald-400/40 dark:bg-emerald-500/40';
  return 'bg-emerald-500/40 dark:bg-emerald-400/40';
}

export function computeCohortMatrix(
  leads: CohortLeadInput[],
  opts: { todayIso: string; weeksBack?: number },
): CohortMatrix {
  const weeksBack = opts.weeksBack ?? 6;
  const todayWeekStart = cairoIsoWeekStart(opts.todayIso + 'T12:00:00+03:00');
  const todayMs = new Date(todayWeekStart + 'T00:00:00Z').getTime();

  // Build the cohort week starts: most recent N COMPLETE weeks (excluding current).
  const cohortStarts: string[] = [];
  for (let n = 1; n <= weeksBack; n++) {
    cohortStarts.push(new Date(todayMs - n * MS_PER_WEEK).toISOString().slice(0, 10));
  }

  const byCohort = new Map<string, { leads: number; bookingsByLag: [number, number, number, number, number] }>();
  for (const start of cohortStarts) byCohort.set(start, { leads: 0, bookingsByLag: [0,0,0,0,0] });

  for (const lead of leads) {
    const cohortStart = cairoIsoWeekStart(lead.created_at);
    if (!byCohort.has(cohortStart)) continue;  // outside our window OR current week
    const slot = byCohort.get(cohortStart)!;
    slot.leads += 1;
    if (lead.matched_at) {
      const lag = lagWeeksBetween(cohortStart, lead.matched_at);
      const idx = Math.min(4, Math.max(0, lag - 1));   // lag 1→idx 0; lag 5+ → idx 4
      slot.bookingsByLag[idx] += 1;
    }
  }

  const cohorts: CohortRow[] = cohortStarts.map(start => {
    const slot = byCohort.get(start)!;
    const wkNum = Math.ceil(
      ((new Date(start + 'T00:00:00Z').getTime() - new Date(`${start.slice(0, 4)}-01-01T00:00:00Z`).getTime()) / MS_PER_DAY + 1) / 7
    );
    const startDate = new Date(start + 'T00:00:00Z');
    const month = startDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = startDate.getUTCDate();
    return {
      week_label: `W${wkNum} (${month} ${day})`,
      week_start: start,
      leads: slot.leads,
      bookings_by_lag: slot.bookingsByLag,
      conversion_pcts_by_lag: slot.bookingsByLag.map(b =>
        slot.leads > 0 ? Math.round((b / slot.leads) * 1000) / 10 : 0
      ) as [number, number, number, number, number],
    };
  });

  return { cohorts };
}

export async function getCohortMatrix(opts: {
  weeksBack?: number;
  buildingCode?: string;
}): Promise<CohortMatrix> {
  const sb = supabaseAdmin();
  const weeksBack = opts.weeksBack ?? 6;
  // Pull leads from the oldest cohort start + a buffer so all lag computations have data.
  const buffer = 5;
  const oldestStart = new Date(Date.now() - (weeksBack + buffer + 1) * MS_PER_WEEK).toISOString().slice(0, 10);

  const { data, error } = await sb.from('ads_leads')
    .select('id, created_at, matched_at, matched_reservation_id, building_interest')
    .gte('created_at', oldestStart);
  if (error) { console.error('[cohort] query failed:', error); return { cohorts: [] }; }
  const rows = (data as Array<{
    id: number;
    created_at: string;
    matched_at: string | null;
    matched_reservation_id: string | null;
    building_interest: string | null;
  }> | null) ?? [];

  // Per-building filter — if active, join through guesty for booked builders.
  let filtered = rows;
  if (opts.buildingCode) {
    const { attributeLeadToBuilding } = await import('./per-building');
    const { buildingMapForLeads } = await import('./funnel');
    const buildingByReservation = await buildingMapForLeads(sb, rows);
    filtered = rows.filter(r => {
      const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
      return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
    });
  }

  return computeCohortMatrix(
    filtered.map(r => ({ created_at: r.created_at, matched_at: r.matched_at })),
    { todayIso: new Date().toISOString().slice(0, 10), weeksBack },
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/cohort.test.ts
```
Expected: 9 tests PASS (2 cairoIsoWeekStart + 3 lagWeeksBetween + 4 cellColorBucket + 2 computeCohortMatrix).

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/cohort.ts src/lib/beithady/ads/cohort.test.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): add cohort.ts — weekly cohort matrix (Cairo TZ DST-safe)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 8: Extend V1's `query*Rollup` to accept `buildingCode?` filter

**Files:**
- Modify: `C:/kareemhady/src/lib/beithady/ads/insights-geo.ts` (queryGeoRollup)
- Modify: `C:/kareemhady/src/lib/beithady/ads/insights-demo.ts` (queryDemoRollup)
- Modify: `C:/kareemhady/src/lib/beithady/ads/insights-device.ts` (queryDeviceRollup)
- Modify: existing tests if any assert prop shapes

The 3 V1 rollups need to honor a `buildingCode?` filter. The implementation: for each query, after fetching breakdown rows, if `buildingCode` is set, join through `ads_leads` → `attributeLeadToBuilding` to find which `campaign_id` set has any leads belonging to that building, then filter the breakdown rows to that campaign set.

NOTE: This is approximate. Breakdown tables (`ads_insights_*`) don't have per-lead granularity — they have per-campaign-per-day. So the filter is "show breakdowns for campaigns that have at least one lead attributable to this building in the window". This is a known simplification documented in the spec (Funnel tab hint applies the same caveat).

- [ ] **Step 1: Add a failing test to insights-geo.test.ts**

Append at end of `C:/kareemhady/src/lib/beithady/ads/insights-geo.test.ts`:

```ts
import { queryGeoRollup } from './insights-geo';

describe('queryGeoRollup buildingCode filter (shape only)', () => {
  it('accepts buildingCode in opts type', () => {
    // Type-level check: this should compile.
    const _shape: Parameters<typeof queryGeoRollup>[0] = {
      from: '2026-05-01', to: '2026-05-16', buildingCode: 'BH-26',
    };
    expect(_shape.buildingCode).toBe('BH-26');
  });
});
```

(The DB-side filter is exercised via integration smoke later; this just locks the public API.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/insights-geo.test.ts
```
Expected: FAIL — `buildingCode` not in opts type.

- [ ] **Step 3: Add `buildingCode?` to each query function**

In `insights-geo.ts`, change `queryGeoRollup` opts type from:
```ts
export async function queryGeoRollup(opts: {
  campaignId?: number;
  accountId?: number;
  from: string;
  to: string;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
}): Promise<GeoRollupRow[]>
```
to:
```ts
export async function queryGeoRollup(opts: {
  campaignId?: number;
  accountId?: number;
  from: string;
  to: string;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
}): Promise<GeoRollupRow[]>
```

Inside the function, after the existing `let q = ...`, before `const { data } = await q;`, add:

```ts
if (opts.buildingCode) {
  // Find campaigns whose leads attribute to this building within the window.
  const campaignIds = await campaignsAttributableToBuilding({ from: opts.from, to: opts.to, buildingCode: opts.buildingCode });
  if (campaignIds.length === 0) return [];
  q = q.in('campaign_id', campaignIds);
}
```

Add helper at module bottom:

```ts
async function campaignsAttributableToBuilding(opts: {
  from: string; to: string; buildingCode: string;
}): Promise<number[]> {
  const sb = supabaseAdmin();
  const { attributeLeadToBuilding } = await import('./per-building');
  const { buildingMapForLeads } = await import('./funnel');
  const { data: leads } = await sb.from('ads_leads')
    .select('id, campaign_id, matched_reservation_id, building_interest')
    .gte('created_at', opts.from).lte('created_at', opts.to + 'T23:59:59');
  const leadRows = (leads as Array<{ id: number; campaign_id: number | null; matched_reservation_id: string | null; building_interest: string | null }> | null) ?? [];
  const buildingByReservation = await buildingMapForLeads(sb, leadRows);
  const set = new Set<number>();
  for (const l of leadRows) {
    if (l.campaign_id == null) continue;
    const bookedBuilding = l.matched_reservation_id ? buildingByReservation.get(l.matched_reservation_id) ?? null : null;
    if (attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: l.building_interest }) === opts.buildingCode) {
      set.add(l.campaign_id);
    }
  }
  return Array.from(set);
}
```

Apply the IDENTICAL change to `insights-demo.ts` (queryDemoRollup) and `insights-device.ts` (queryDeviceRollup): add `buildingCode?` to opts, add the filter block, and define the same `campaignsAttributableToBuilding` helper at module bottom.

- [ ] **Step 4: Run all 3 rollup tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/lib/beithady/ads/insights-geo.test.ts src/lib/beithady/ads/insights-demo.test.ts src/lib/beithady/ads/insights-device.test.ts
```
Expected: existing 16 tests + 1 new shape test = 17 PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/lib/beithady/ads/insights-geo.ts src/lib/beithady/ads/insights-geo.test.ts src/lib/beithady/ads/insights-demo.ts src/lib/beithady/ads/insights-device.ts
git commit -m "$(cat <<'EOF'
feat(bh-ads): query*Rollup accepts buildingCode? filter (V2 C4 integration)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 9: Close V1 polish — backfill action checks res.ok + log Supabase errors

**Files:**
- Modify: `C:/kareemhady/src/app/admin/integrations/backfill-ads-breakdowns-action.ts`
- Modify: `C:/kareemhady/src/lib/beithady/ads/insights-geo.ts` (queryGeoRollup error logging)
- Modify: `C:/kareemhady/src/lib/beithady/ads/insights-demo.ts` (queryDemoRollup)
- Modify: `C:/kareemhady/src/lib/beithady/ads/insights-device.ts` (queryDeviceRollup)

V1 final-review MIN-2 + MIN-3. No new tests (changes are defensive logging + error handling).

- [ ] **Step 1: Update `backfillAdsBreakdownsAction` to check res.ok**

Replace the body of `C:/kareemhady/src/app/admin/integrations/backfill-ads-breakdowns-action.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';

export async function backfillAdsBreakdownsAction(): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.CRON_SECRET || '';
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 86400e3).toISOString().slice(0, 10);
  const url = `${base}/api/cron/beithady-ads-breakdowns?force=1&secret=${encodeURIComponent(secret)}&from=${from}&to=${today}`;
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[backfill-ads-breakdowns] cron returned', res.status, text);
      return { ok: false, error: `cron_returned_${res.status}` };
    }
    revalidatePath('/admin/integrations');
    revalidatePath('/beithady/ads');
    revalidatePath('/beithady/ads/audience');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[backfill-ads-breakdowns] fetch failed:', msg);
    return { ok: false, error: msg };
  }
}
```

- [ ] **Step 2: Update existing test to reflect new return type**

Edit `C:/kareemhady/src/app/admin/integrations/backfill-ads-breakdowns-action.test.ts`. Append a second test:

```ts
it('returns ok=false on cron failure', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));
  const { backfillAdsBreakdownsAction } = await import('./backfill-ads-breakdowns-action');
  const r = await backfillAdsBreakdownsAction();
  expect(r.ok).toBe(false);
  expect(r.error).toContain('500');
});
```

- [ ] **Step 3: Add Supabase error logging to query*Rollup**

In each of `insights-{geo,demo,device}.ts`, find the existing line:
```ts
const { data } = await q;
```
Change to:
```ts
const { data, error } = await q;
if (error) console.error(`[insights-rollup] query failed:`, error);
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npm run test 2>&1 | tail -10
```
Expected: full suite still green (now ~830+ tests).

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/admin/integrations/backfill-ads-breakdowns-action.ts src/app/admin/integrations/backfill-ads-breakdowns-action.test.ts src/lib/beithady/ads/insights-geo.ts src/lib/beithady/ads/insights-demo.ts src/lib/beithady/ads/insights-device.ts
git commit -m "$(cat <<'EOF'
fix(bh-ads): close V1 polish — backfill checks res.ok + rollups log errors

Closes V1 final-review MIN-2 (silent backfill failures) and MIN-3 (silent
rollup DB errors).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 10: `<PerBuildingFilter />` — chip row component

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/_components/per-building-filter.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/_components/per-building-filter.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// C:/kareemhady/src/app/beithady/ads/_components/per-building-filter.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PerBuildingFilter } from './per-building-filter';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/beithady/ads',
  useSearchParams: () => new URLSearchParams(''),
}));

describe('PerBuildingFilter', () => {
  it('renders All + 5 BH codes + Unattributed', () => {
    render(<PerBuildingFilter />);
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('BH-26')).toBeTruthy();
    expect(screen.getByText('BH-73')).toBeTruthy();
    expect(screen.getByText('BH-435')).toBeTruthy();
    expect(screen.getByText('BH-OK')).toBeTruthy();
    expect(screen.getByText('BH-34')).toBeTruthy();
    expect(screen.getByText('Unattributed')).toBeTruthy();
  });
  it('clicking BH-26 pushes ?building=BH-26', () => {
    push.mockClear();
    render(<PerBuildingFilter />);
    fireEvent.click(screen.getByText('BH-26'));
    const last = push.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain('building=BH-26');
  });
  it('clicking All clears the building param', () => {
    push.mockClear();
    render(<PerBuildingFilter />);
    fireEvent.click(screen.getByText('All'));
    const last = push.mock.calls.at(-1)?.[0] as string;
    expect(last).not.toContain('building=');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/per-building-filter.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/_components/per-building-filter.tsx
'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { BH_BUILDINGS, UNATTRIBUTED } from '@/lib/beithady/buildings';

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

export function PerBuildingFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get('building') ?? '';

  function push(building: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (building) params.set('building', building);
    else params.delete('building');
    router.push(`${pathname}?${params.toString()}`);
  }

  function chip(label: string, value: string | null) {
    const isActive = (value === null && current === '') || current === value;
    return (
      <button
        key={label}
        type="button"
        onClick={() => push(value)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${isActive ? ACTIVE : INACTIVE}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">Building</span>
      {chip('All', null)}
      {BH_BUILDINGS.map(b => chip(b.code, b.code))}
      {chip(UNATTRIBUTED, UNATTRIBUTED)}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/per-building-filter.test.tsx
```
Expected: 3 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/_components/per-building-filter.tsx src/app/beithady/ads/_components/per-building-filter.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <PerBuildingFilter /> chip row (URL ?building=)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 11: `<FrtCard />` — compact FRT card for main dashboard

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/_components/frt-card.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/_components/frt-card.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// C:/kareemhady/src/app/beithady/ads/_components/frt-card.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/frt', () => ({
  getFrtSummary: vi.fn().mockResolvedValue({
    total_leads: 22, responded_leads: 21, unresponded_count: 1,
    median_minutes: 12, p95_minutes: 47,
    over_1h_count: 3, over_1h_pct: 14,
  }),
  getFrtPerCampaign: vi.fn().mockResolvedValue([
    { campaign_id: 42, campaign_name: 'CTWA EG May', total_leads: 18, responded_leads: 17,
      unresponded_count: 1, median_minutes: 14, p95_minutes: 52, over_1h_count: 3, over_1h_pct: 17 },
  ]),
}));

describe('FrtCard', () => {
  it('renders median + p95 + SLA % + worst-campaign link', async () => {
    const { FrtCard } = await import('./frt-card');
    const ui = await FrtCard({ range: { from: '2026-05-09', to: '2026-05-16' } });
    render(ui);
    expect(screen.getByText(/12m/)).toBeTruthy();
    expect(screen.getByText(/47m/)).toBeTruthy();
    expect(screen.getByText(/14%/)).toBeTruthy();
    expect(screen.getByText(/CTWA EG May/)).toBeTruthy();
  });

  it('returns null when total_leads = 0', async () => {
    const frtMod = await import('@/lib/beithady/ads/frt');
    vi.mocked(frtMod.getFrtSummary).mockResolvedValueOnce({
      total_leads: 0, responded_leads: 0, unresponded_count: 0,
      median_minutes: null, p95_minutes: null, over_1h_count: 0, over_1h_pct: 0,
    });
    vi.mocked(frtMod.getFrtPerCampaign).mockResolvedValueOnce([]);
    const { FrtCard } = await import('./frt-card');
    const ui = await FrtCard({ range: { from: '2026-05-09', to: '2026-05-16' } });
    const { container } = render(ui);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/frt-card.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/_components/frt-card.tsx
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { getFrtSummary, getFrtPerCampaign } from '@/lib/beithady/ads/frt';

function slaTone(pct: number): string {
  if (pct < 10) return 'text-emerald-700 dark:text-emerald-300';
  if (pct < 20) return 'text-slate-700 dark:text-slate-200';
  return 'text-rose-700 dark:text-rose-300';
}

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
  if (summary.total_leads === 0) return null;

  // Worst campaign = highest over_1h_pct with at least 1 lead.
  const worst = [...perCampaign]
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
      {worst && worst.over_1h_pct > 10 && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Worst campaign: <strong className="text-slate-700 dark:text-slate-200">{worst.campaign_name}</strong>
          {' '}({worst.over_1h_pct}% over SLA){' '}
          <Link
            href={`/beithady/ads/audience?tab=quality&campaign=${worst.campaign_id}`}
            className="ix-link"
          >view in Quality →</Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/_components/frt-card.test.tsx
```
Expected: 2 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/_components/frt-card.tsx src/app/beithady/ads/_components/frt-card.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <FrtCard /> compact FRT card for main dashboard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 12: Wire `<PerBuildingFilter />` + `<FrtCard />` into /beithady/ads main

**Files:**
- Modify: `C:/kareemhady/src/app/beithady/ads/page.tsx`

- [ ] **Step 1: Read the file**

Read `C:/kareemhady/src/app/beithady/ads/page.tsx` to confirm current structure.

- [ ] **Step 2: Add the wires**

Add imports near existing ones at top:
```tsx
import { PerBuildingFilter } from './_components/per-building-filter';
import { FrtCard } from './_components/frt-card';
```

Extend `searchParams` type to add `building?: string`:
```tsx
searchParams: Promise<{
  building?: string; date?: string; signal?: string;
  from?: string; to?: string; preset?: string; compare?: string;
}>;
```

(The `building?` field was already in the existing type for a different building context — confirm it's still there, leave it.)

After `const sp = await searchParams;` and the existing `const range = parseDateRange(...)`, ensure `sp.building` is read separately for the BH-ads filter (different from the existing `sp.building` which targets the new-campaign flow). The simplest approach: introduce a new param name `?bh=` to avoid collision, OR reuse `?building=` since the existing usage is restricted to the New Campaign link href and won't conflict on the dashboard render.

After inspection, the simplest plan is to KEEP using `?building=` because:
1. The existing usage on this page only reads `sp.building` to forward to the New Campaign create form
2. The PerBuildingFilter writes `?building=BH-26` which doesn't conflict (BH codes don't match the existing new-campaign building IDs)
3. Down-stream queries will receive a BH code and ignore unknowns

Add the components in the JSX. Insertion order:

```tsx
<AdsTabs active="overview" />
<DateRangeFilter />
<PerBuildingFilter />     {/* NEW */}
{/* existing per-platform connection status row */}
{/* existing warning banners */}
<FrtCard
  range={{ from: range.from, to: range.to }}
  buildingCode={sp.building}
/>                        {/* NEW — between the warnings and the audience widget */}
<AudienceSummaryWidget range={{ from: range.from, to: range.to }} />
{/* existing KPIs */}
```

Also extend `<AudienceSummaryWidget>` call to pass `buildingCode`:
```tsx
<AudienceSummaryWidget range={{ from: range.from, to: range.to }} campaignId={undefined} />
```

→ becomes:
```tsx
<AudienceSummaryWidget range={{ from: range.from, to: range.to }} />
```

(AudienceSummaryWidget doesn't take `buildingCode` yet — that's a follow-on; the widget will just continue showing all-buildings. UI for per-building widget filtering can land in V2.5.)

- [ ] **Step 3: Run tsc + visual smoke**

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

Visual smoke (optional, manual): `npm run dev` → `http://localhost:3000/beithady/ads/?preset=7d` → confirm `<PerBuildingFilter />` chip row renders below `<DateRangeFilter />`, `<FrtCard />` renders between warnings and audience widget.

- [ ] **Step 4: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/page.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): wire PerBuildingFilter + FrtCard into /beithady/ads main page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 13: `<FunnelTab />` — server component

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/funnel-tab.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/funnel-tab.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// C:/kareemhady/src/app/beithady/ads/audience/_components/funnel-tab.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/funnel', () => ({
  getFunnelStages: vi.fn().mockResolvedValue({
    stages: [
      { key: 'impressions', label: 'Impressions', count: 124500, conversion_pct_from_prev: null, conversion_pct_from_top: null },
      { key: 'reach',       label: 'Reach',       count: 89200,  conversion_pct_from_prev: 71.6, conversion_pct_from_top: 71.6 },
      { key: 'clicks',      label: 'Clicks',      count: 7488,   conversion_pct_from_prev: 8.4,  conversion_pct_from_top: 6 },
      { key: 'leads',       label: 'Leads',       count: 45,     conversion_pct_from_prev: 0.6,  conversion_pct_from_top: 0 },
      { key: 'bookings',    label: 'Bookings',    count: 14,     conversion_pct_from_prev: 31.1, conversion_pct_from_top: 0 },
    ],
  }),
}));

describe('FunnelTab', () => {
  it('renders 5 stages with counts + drop-off labels', async () => {
    const { FunnelTab } = await import('./funnel-tab');
    const ui = await FunnelTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getAllByText(/Impressions/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/124,500/)).toBeTruthy();
    expect(screen.getByText(/89,200/)).toBeTruthy();
    expect(screen.getByText(/71.6%/)).toBeTruthy();
  });

  it('shows hint when buildingCode is active', async () => {
    const { FunnelTab } = await import('./funnel-tab');
    const ui = await FunnelTab({
      range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false },
      buildingCode: 'BH-26',
    });
    render(ui);
    expect(screen.getByText(/campaign-aggregate/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/funnel-tab.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/audience/_components/funnel-tab.tsx
import { getFunnelStages } from '@/lib/beithady/ads/funnel';

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
            <div className="grid grid-cols-[120px_1fr_120px] items-center gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">{s.label}</span>
              <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full bg-slate-400/70 dark:bg-slate-500/70"
                  style={{ width: `${(s.count / max) * 100}%` }}
                  title={`${s.count.toLocaleString()}`}
                />
              </div>
              <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">
                {s.count.toLocaleString()}
              </span>
            </div>
            {i < stages.length - 1 && s.conversion_pct_from_prev != null && (
              <div className="grid grid-cols-[120px_1fr_120px] gap-3 text-[10px] text-slate-400 my-0.5">
                <span />
                <span className="text-center">↓ {stages[i + 1].conversion_pct_from_prev}%</span>
                <span />
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
                <td className="py-1.5 text-right">{s.conversion_pct_from_top != null ? `${s.conversion_pct_from_top}%` : '—'}</td>
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
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/funnel-tab.test.tsx
```
Expected: 2 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/audience/_components/funnel-tab.tsx src/app/beithady/ads/audience/_components/funnel-tab.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <FunnelTab /> — 5-stage horizontal funnel + summary table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 14: `<QualityTab />` — server component with C2 + C3 tables

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/quality-tab.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/quality-tab.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// C:/kareemhady/src/app/beithady/ads/audience/_components/quality-tab.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/lead-quality', () => ({
  getLeadQualityPerCampaign: vi.fn().mockResolvedValue([
    { campaign_id: 1, campaign_name: 'CTWA EG May', platform: 'meta', leads: 18, booked: 5, quality_pct: 27.8 },
    { campaign_id: 2, campaign_name: 'Search SA',  platform: 'google', leads: 4,  booked: 1, quality_pct: 25.0 },
  ]),
}));

vi.mock('@/lib/beithady/ads/frt', () => ({
  getFrtPerCampaign: vi.fn().mockResolvedValue([
    { campaign_id: 1, campaign_name: 'CTWA EG May', total_leads: 18, responded_leads: 17, unresponded_count: 1,
      median_minutes: 14, p95_minutes: 52, over_1h_count: 3, over_1h_pct: 17 },
  ]),
}));

describe('QualityTab', () => {
  it('renders quality % table + response speed table', async () => {
    const { QualityTab } = await import('./quality-tab');
    const ui = await QualityTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getAllByText(/CTWA EG May/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/27.8%/)).toBeTruthy();
    expect(screen.getByText(/14m/)).toBeTruthy();
    expect(screen.getByText(/52m/)).toBeTruthy();
    expect(screen.getByText(/17%/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/quality-tab.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/audience/_components/quality-tab.tsx
import { getLeadQualityPerCampaign } from '@/lib/beithady/ads/lead-quality';
import { getFrtPerCampaign } from '@/lib/beithady/ads/frt';

function slaTone(pct: number): string {
  if (pct < 10) return 'text-emerald-700 dark:text-emerald-300';
  if (pct < 20) return 'text-slate-700 dark:text-slate-200';
  return 'text-rose-700 dark:text-rose-300';
}

export async function QualityTab({
  range, buildingCode,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
}) {
  const [quality, frt] = await Promise.all([
    getLeadQualityPerCampaign({ from: range.from, to: range.to, buildingCode }),
    getFrtPerCampaign({ from: range.from, to: range.to, buildingCode }),
  ]);

  if (quality.length === 0 && frt.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No lead activity yet for this range.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Lead quality % per campaign</h3>
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Campaign</th>
              <th className="py-2 text-right">Leads</th>
              <th className="py-2 text-right">Booked</th>
              <th className="py-2 text-right">Quality %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {quality.map(r => (
              <tr key={r.campaign_id} className="text-slate-700 dark:text-slate-200">
                <td className="py-1.5 font-medium">{r.campaign_name}</td>
                <td className="py-1.5 text-right">{r.leads.toLocaleString()}</td>
                <td className="py-1.5 text-right">{r.booked.toLocaleString()}</td>
                <td className="py-1.5 text-right text-emerald-700 dark:text-emerald-300">{r.quality_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ix-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Response speed per campaign</h3>
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Campaign</th>
              <th className="py-2 text-right">Leads</th>
              <th className="py-2 text-right">Median</th>
              <th className="py-2 text-right">p95</th>
              <th className="py-2 text-right">% over 1h SLA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {frt.map(r => (
              <tr key={r.campaign_id} className="text-slate-700 dark:text-slate-200">
                <td className="py-1.5 font-medium">{r.campaign_name}</td>
                <td className="py-1.5 text-right">{r.total_leads.toLocaleString()}</td>
                <td className="py-1.5 text-right">{r.median_minutes != null ? `${r.median_minutes}m` : '—'}</td>
                <td className="py-1.5 text-right">{r.p95_minutes != null ? `${r.p95_minutes}m` : '—'}</td>
                <td className={`py-1.5 text-right ${slaTone(r.over_1h_pct)}`}>
                  {r.over_1h_pct}% ({r.over_1h_count})
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

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/quality-tab.test.tsx
```
Expected: 1 test PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/audience/_components/quality-tab.tsx src/app/beithady/ads/audience/_components/quality-tab.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <QualityTab /> — lead quality % + response speed per campaign

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 15: `<CohortTab />` — 6×5 cohort matrix

**Files:**
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/cohort-tab.tsx`
- Create: `C:/kareemhady/src/app/beithady/ads/audience/_components/cohort-tab.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// C:/kareemhady/src/app/beithady/ads/audience/_components/cohort-tab.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/cohort', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/beithady/ads/cohort')>();
  return {
    ...actual,
    getCohortMatrix: vi.fn().mockResolvedValue({
      cohorts: [
        { week_label: 'W19 (May 5)', week_start: '2026-05-04', leads: 61,
          bookings_by_lag: [7, 4, 0, 0, 0],
          conversion_pcts_by_lag: [11.5, 6.6, 0, 0, 0] as [number, number, number, number, number] },
        { week_label: 'W18 (Apr 28)', week_start: '2026-04-28', leads: 48,
          bookings_by_lag: [7, 5, 2, 0, 0],
          conversion_pcts_by_lag: [14.6, 10.4, 4.2, 0, 0] as [number, number, number, number, number] },
      ],
    }),
  };
});

describe('CohortTab', () => {
  it('renders matrix with cohort labels + lag headers', async () => {
    const { CohortTab } = await import('./cohort-tab');
    const ui = await CohortTab({ range: { from: '', to: '', preset: '', compare: false } });
    render(ui);
    expect(screen.getByText(/W19/)).toBeTruthy();
    expect(screen.getByText(/W18/)).toBeTruthy();
    expect(screen.getByText(/\+1w/)).toBeTruthy();
    expect(screen.getByText(/\+5w\+/)).toBeTruthy();
  });

  it('shows empty state when no cohorts', async () => {
    const mod = await import('@/lib/beithady/ads/cohort');
    vi.mocked(mod.getCohortMatrix).mockResolvedValueOnce({ cohorts: [] });
    const { CohortTab } = await import('./cohort-tab');
    const ui = await CohortTab({ range: { from: '', to: '', preset: '', compare: false } });
    render(ui);
    expect(screen.getByText(/Not enough lead history/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/cohort-tab.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// C:/kareemhady/src/app/beithady/ads/audience/_components/cohort-tab.tsx
import { getCohortMatrix, cellColorBucket } from '@/lib/beithady/ads/cohort';

export async function CohortTab({
  range: _range, buildingCode,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
}) {
  // Cohort tab ignores date filter (inherently rolling); honors per-building.
  const { cohorts } = await getCohortMatrix({ weeksBack: 6, buildingCode });

  if (cohorts.length === 0 || cohorts.every(c => c.leads === 0)) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Not enough lead history yet for cohort analysis.
        <div className="mt-2 text-xs">Need at least 6 complete weeks of leads.</div>
      </div>
    );
  }

  const lagHeaders = ['+1w', '+2w', '+3w', '+4w', '+5w+'];
  const totalsByLag = lagHeaders.map((_, i) =>
    cohorts.reduce((s, c) => s + c.bookings_by_lag[i], 0)
  );

  return (
    <div className="ix-card p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Lead → booking conversion by week</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Each row = a cohort of leads from that week. Columns = % of those leads who booked N weeks later.
        </p>
      </div>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-2"></th>
            {lagHeaders.map(h => <th key={h} className="py-2 text-center">{h}</th>)}
            <th className="py-2 text-right">Leads</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {cohorts.map(c => (
            <tr key={c.week_start} className="text-slate-700 dark:text-slate-200">
              <td className="py-1.5 font-medium">{c.week_label}</td>
              {c.conversion_pcts_by_lag.map((pct, i) => (
                <td
                  key={i}
                  className={`py-1.5 text-center ${cellColorBucket(pct)}`}
                  title={`${c.bookings_by_lag[i]} bookings of ${c.leads} leads`}
                >
                  {c.leads === 0 ? '—' : `${pct}%`}
                </td>
              ))}
              <td className="py-1.5 text-right">{c.leads.toLocaleString()}</td>
            </tr>
          ))}
          <tr className="text-[11px] text-slate-500 dark:text-slate-400">
            <td className="py-2 font-medium">Totals</td>
            {totalsByLag.map((n, i) => <td key={i} className="py-2 text-center">{n}</td>)}
            <td className="py-2 text-right">{cohorts.reduce((s, c) => s + c.leads, 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd C:/kareemhady && npx vitest run src/app/beithady/ads/audience/_components/cohort-tab.test.tsx
```
Expected: 2 tests PASS.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/audience/_components/cohort-tab.tsx src/app/beithady/ads/audience/_components/cohort-tab.test.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): add <CohortTab /> — 6×5 weekly cohort × lag matrix

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 16: Wire 3 new tabs + per-building filter into audience/page.tsx

**Files:**
- Modify: `C:/kareemhady/src/app/beithady/ads/audience/page.tsx`

- [ ] **Step 1: Add imports + extend TABS + render filter + new tab content**

Read the file first. Then:

1. Add imports:
```tsx
import { FunnelTab } from './_components/funnel-tab';
import { QualityTab } from './_components/quality-tab';
import { CohortTab } from './_components/cohort-tab';
import { PerBuildingFilter } from '../_components/per-building-filter';
```

2. Extend the `TABS` array:
```tsx
const TABS: Array<{ key: 'geo' | 'demo' | 'device' | 'funnel' | 'quality' | 'cohort'; label: string }> = [
  { key: 'geo', label: 'Geo' },
  { key: 'demo', label: 'Demographics' },
  { key: 'device', label: 'Device & Placement' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'quality', label: 'Quality' },
  { key: 'cohort', label: 'Cohort' },
];
```

3. Add `building?` to the `searchParams` Promise type:
```tsx
searchParams: Promise<{
  tab?: string; from?: string; to?: string; preset?: string; compare?: string;
  campaign?: string; platforms?: string;
  building?: string;   // NEW
}>;
```

4. Update the tab union literal in the cast:
```tsx
const tab = (sp.tab as 'geo' | 'demo' | 'device' | 'funnel' | 'quality' | 'cohort') ?? 'geo';
```

5. Extract building param:
```tsx
const buildingCode = sp.building || undefined;
```

6. Include `building` in `baseQs` (so tab nav preserves it):
```tsx
if (sp.building) baseQs.set('building', sp.building);
```

7. Render `<PerBuildingFilter />` between `<AudienceFilters>` and the sub-tab strip:
```tsx
<AudienceFilters campaigns={campaigns} />
<PerBuildingFilter />
<div className="ix-card p-2 ...">
  {TABS.map(t => (...))}
</div>
```

8. Add the new conditional renders below the existing ones:
```tsx
{tab === 'funnel' && <FunnelTab range={range} campaignId={campaignId} buildingCode={buildingCode} />}
{tab === 'quality' && <QualityTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
{tab === 'cohort' && <CohortTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
```

9. Pass `buildingCode` to the existing V1 tabs:
```tsx
{tab === 'geo' && <GeoTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
{tab === 'demo' && <DemoTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
{tab === 'device' && <DeviceTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
```

- [ ] **Step 2: Extend existing V1 tab signatures (GeoTab/DemoTab/DeviceTab) to accept buildingCode + pass through**

For each of `geo-tab.tsx`, `demo-tab.tsx`, `device-tab.tsx`, extend the props type:

Before:
```tsx
{ range: ...; campaignId?: number; platforms?: Array<'meta' | 'google' | 'tiktok'> }
```

After:
```tsx
{ range: ...; campaignId?: number; platforms?: Array<'meta' | 'google' | 'tiktok'>; buildingCode?: string }
```

Pass through to the `query*Rollup` calls:
```tsx
const [current, prior] = await Promise.all([
  queryGeoRollup({ from: range.from, to: range.to, campaignId, platforms, buildingCode }),
  range.compare
    ? queryGeoRollup({ ...derivePriorPeriod(range), campaignId, platforms, buildingCode })
    : Promise.resolve([]),
]);
```

Apply identical change in demo-tab and device-tab.

- [ ] **Step 3: Run full suite + tsc**

```bash
cd C:/kareemhady && npm run test 2>&1 | tail -10
```
Expected: all green.

```bash
cd C:/kareemhady && npx tsc --noEmit 2>&1 | head -5
```
Expected: 0 errors.

- [ ] **Step 4: Commit + push**

```bash
cd C:/kareemhady && git add src/app/beithady/ads/audience/page.tsx src/app/beithady/ads/audience/_components/geo-tab.tsx src/app/beithady/ads/audience/_components/demo-tab.tsx src/app/beithady/ads/audience/_components/device-tab.tsx
git commit -m "$(cat <<'EOF'
feat(bh-ads): wire 3 new audience tabs + per-building filter, extend V1 tabs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Task 17: Manual smoke + final handoff

No code in this task — verification + handoff.

- [ ] **Step 1: Full test suite**

```bash
cd C:/kareemhady && npm run test
```
Expected: ~825 passing / 22 skipped / 0 failures.

Test count breakdown (estimate):
- Task 1 buildings: 4
- Task 2 insights-utils: 8
- Task 3 per-building: 5
- Task 4 funnel: 3
- Task 5 lead-quality: 3
- Task 6 frt: 7
- Task 7 cohort: 9
- Task 8 rollup buildingCode: 1
- Task 9 backfill action: 1 (extra)
- Task 10 PerBuildingFilter: 3
- Task 11 FrtCard: 2
- Task 13 FunnelTab: 2
- Task 14 QualityTab: 1
- Task 15 CohortTab: 2

= +51 new tests → target **~846 passing** (we estimated 30; actual is higher because the helpers got more thorough coverage). Document the actual count in handoff.

- [ ] **Step 2: tsc clean**

```bash
cd C:/kareemhady && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Manual smoke checklist on live prod (after GitHub auto-deploy)**

Walk the app at `https://app.limeinc.cc`:

1. `/beithady/ads/?preset=7d` — `<FrtCard />` renders with median/p95/SLA if leads exist; hides if zero.
2. Click `[BH-26]` chip → URL `?building=BH-26`. KPI cards stay (V2 doesn't filter the dashboard KPIs by building), audience widget unchanged (V2 doesn't filter the widget either).
3. `/beithady/ads/audience` → 6 tabs visible. Click `Funnel` → 5-stage bars render. Toggle `?building=BH-26` → leads/bookings shrink, hint appears.
4. Click `Quality` → both tables render. SLA cells tinted per tone.
5. Click `Cohort` → 6×5 grid renders. Cells tinted slate→emerald by percentage. Tooltip shows raw counts on hover.
6. `/beithady/ads/audience?tab=geo&building=BH-26` → V1 Geo tab honors the filter (campaigns filtered to those with BH-26-attributable leads).
7. `<FrtCard />` worst-campaign link → `/beithady/ads/audience?tab=quality&campaign=<id>` — confirm row visible.

- [ ] **Step 4: Update SESSION_HANDOFF.md + final commit**

Prepend to `SESSION_HANDOFF.md`:

```
## 2026-05-16 — SHIPPED: BH Ads Insights V2 (17/17 tasks complete) ✅

**Status:** All 17 V2 plan tasks shipped to main. Vercel auto-deploys via GitHub.
Tests: ~846 passing / 22 skipped / 0 failures. tsc clean.

**Plan:** docs/superpowers/plans/2026-05-16-bh-ads-insights-v2.md
**Spec:** docs/superpowers/specs/2026-05-16-bh-ads-v2-funnel-quality-design.md

**What's live:**
- `<FrtCard />` on /beithady/ads main (median/p95/SLA% + worst-campaign link)
- `<PerBuildingFilter />` chip row on main + audience page
- /beithady/ads/audience: 3 new tabs (Funnel / Quality / Cohort)
- V1 tabs (Geo/Demo/Device) now honor `?building=` filter
- Per-building attribution: booked → reservation; unbooked → interest; else Unattributed
- V1 polish closed: shared insights-utils (MIN-1), backfill checks res.ok (MIN-2), rollup logs DB errors (MIN-3)
- NO new tables, NO new crons, NO migrations

**Next:** V3 (Time/Patterns + Optimization) — 7 features, ~20 tasks per roadmap.
```

```bash
cd C:/kareemhady && git add SESSION_HANDOFF.md
git commit -m "$(cat <<'EOF'
chore(handoff): SHIPPED BH Ads Insights V2 (17/17 tasks)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

---

## Self-review notes

(Performed inline by author; recorded here for traceability.)

**Spec coverage check** — every locked decision in the spec maps to a task:
- Q1 (3 new tabs + FRT card + building filter chip): Tasks 10-16
- Q2 (per-building attribution rule): Task 3 (`attributeLeadToBuilding`)
- Q3 (FRT median+p95+SLA card + per-campaign table): Tasks 6 (logic), 11 (card), 14 (table)
- Q4 (weekly cohorts, 6 rolling): Tasks 7 (logic), 15 (UI)
- Approach 2 (pure TS aggregators): All Phase-B tasks (4-7)
- V1 polish (MIN-1/2/3): Tasks 2 (MIN-1) + 9 (MIN-2 + MIN-3)
- "No new tables/crons/migrations": confirmed — no migration or vercel.json edits anywhere

**Type consistency** — `range: { from, to, preset, compare }` matches across every tab. `buildingCode?` shape consistent in every helper and component. `attributeLeadToBuilding` signature stable across funnel/lead-quality/frt/cohort/per-building. `FrtSummary` shape used by `<FrtCard />` and `<QualityTab />` matches what `frt.ts` returns.

**No placeholders** — every step has runnable code or commands. The handoff message in Task 17 is a TEMPLATE that should be customized with actual test counts on ship day (the engineer fills in the real number from step 1).

**Open footguns flagged**:
- **Task 4 `cairoIsoWeekStart`** — the day-of-week parsing is brittle. Tests exercise it, but if `en-US` weekday locale ever changes format, tests catch it.
- **Task 8** — the per-building filter on V1 rollups is APPROXIMATE (filters to campaigns that have ≥1 attributable lead in the window, then the rollup shows ALL that campaign's geo/demo/device rows). This is documented in the spec's funnel tab hint pattern and is acceptable for V2; deeper per-row filtering would need extending the breakdown tables (V3 territory).
- **Task 12** — the existing `?building=` param in `/beithady/ads/page.tsx` is also used by the New Campaign link forward. We're piggybacking on it. If the New Campaign flow ever needs to distinguish "filter the dashboard" from "preselect for create form", we'll split into `?bh=` and `?build_for=`. For V2 the overlap is harmless because:
  - The PerBuildingFilter only writes BH-* codes
  - The New Campaign form's existing handling treats unknown values as no-selection
  - kareem won't see two different semantics on the same key in practice

**Estimated final test count:** ~846 passing (51 new tests added in V2). Spec estimated 30; actual is higher because aggregator helpers got fuller coverage. Either way, target is "all green, zero regressions."
