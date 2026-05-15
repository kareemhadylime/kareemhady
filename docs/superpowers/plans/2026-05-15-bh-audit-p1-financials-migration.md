# BH Financials P1 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate three Beithady Financials pages (landing + Performance + Balance Sheet) onto the just-shipped `BHDashboardShell` package (Performance + BS) and onto `BeithadyShell + BeithadyLauncher` (landing). Add a real month picker on Performance. Re-theme the landing's status cards with BH brand vars.

**Architecture:** Composition over configuration. Each migrated dashboard page becomes a thin server-component `page.tsx` that parses search params + fetches data, plus a `'use client'` Shell wrapper that owns `useRailCollapse` + `useBHUrlState<T>` and composes `<BHDashboardShell>` with `<BHTitleBar>` + `<BHLeftRail>` + `<BHMobileFilterSheet>`. The landing is purely server-rendered using `<BeithadyShell>` + `<BeithadyLauncher>` + a small `StatusPreStrip` client island.

**Tech Stack:** Next.js 16 (App Router, server + client components), React 19, TypeScript strict, Vitest + @testing-library/react + jsdom for component tests, Tailwind v4 with BH brand CSS vars.

**Source spec:** [docs/superpowers/specs/2026-05-15-bh-financials-p1-migration-design.md](../specs/2026-05-15-bh-financials-p1-migration-design.md). **Depends on:** [docs/superpowers/specs/2026-05-15-bh-dashboard-shell-design.md](../specs/2026-05-15-bh-dashboard-shell-design.md) (P0-2, shipped at HEAD).

**Reference implementation to read before coding:** `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx` — the canonical consumer of `<BHDashboardShell>`. The new `PerformanceShell.tsx` and `BalanceSheetShell.tsx` follow this exact pattern (server-data + client-rail).

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/app/beithady/financials/_components/StatusPreStrip.tsx` | 3-card status row (Active snapshot / Open variance / Next snapshot due), BH-themed semantic accents |
| `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts` | Typed URL hook for Performance page (`usePerfPnlUrlState`) + `buildFinPerfUrl` helper |
| `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.test.ts` | Round-trip tests (6 assertions) |
| `src/app/beithady/financials/_hooks/use-bs-url-state.ts` | Typed URL hook for Balance Sheet (`useBSUrlState`) + `buildFinBSUrl` helper |
| `src/app/beithady/financials/_hooks/use-bs-url-state.test.ts` | Round-trip tests (4 assertions) |
| `src/app/beithady/financials/performance/_components/PerformanceShell.tsx` | `'use client'` wrapper composing `<BHDashboardShell>` for Performance |
| `src/app/beithady/financials/balance-sheet/_components/BalanceSheetShell.tsx` | `'use client'` wrapper composing `<BHDashboardShell>` for Balance Sheet |

### Modified

| Path | Change |
|---|---|
| `src/app/beithady/financials/page.tsx` | Replace raw `<TopNav>` + `<CockpitTile>` grid with `<BeithadyShell + BeithadyHeader + BeithadyLauncher>`. Render `<StatusPreStrip>` for the 3 status cards. |
| `src/app/beithady/financials/performance/page.tsx` | Thin server component: parse search params, fetch P&L, render `<PerformanceShell payload={…} urlState={…} />`. |
| `src/app/beithady/financials/balance-sheet/page.tsx` | Same pattern for Balance Sheet. |

### Deleted

| Path | Reason |
|---|---|
| `src/app/beithady/financials/_components/CockpitTile.tsx` | Replaced by `<BeithadyLauncher>` |
| `src/app/beithady/financials/_components/PeriodControls.tsx` | Was only useful for the bespoke pill bar; rail composition replaces it. Confirmed: no `/beithady/financials/*` page imports it (only an old FMPLUS-side file with the same exported names lives elsewhere). |

### Untouched on purpose

- `src/app/beithady/financials/_components/FinancialsFilterStrip.tsx` — Payables still uses it. Migration is P2 #6.
- `src/app/beithady/financials/_components/PnlSection.tsx`, `BalanceSheetSection.tsx`, `PayablesBlock.tsx`, `PartnerLedgerTable.tsx`, `PayablesDetailModal.tsx` — body components unchanged.
- `src/lib/financials-pnl.ts` — data layer, `CompanyScope` type union, type guards. `'a1'` stays in the type per P0-1.

---

## Task 1: Create `StatusPreStrip` component

**Files:**
- Create: `src/app/beithady/financials/_components/StatusPreStrip.tsx`

- [ ] **Step 1: Create the file with exact content**

```tsx
// Note: red/amber hex literals on the variance + due cards are used
// semantically for danger/warn accents — preserved byte-for-byte from
// the previous bespoke implementation in financials/page.tsx. Brand-var
// migration tracked under audit §7.2 brand-var sweep follow-up.

type Props = {
  active: { period_end: string; version: number; frozen_at: string | null } | null;
  openVariance: number;
  openVarCount: number;
  next: { period_end: string; due_by: string; is_overdue: boolean } | null;
};

export function StatusPreStrip({ active, openVariance, openVarCount, next }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Active snapshot — BH-themed (cream surface, gold accent on heading) */}
      <div
        className="rounded-lg p-3"
        style={{
          background: 'var(--bh-cream)',
          border: '1px solid var(--bh-mute)',
        }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
          style={{ color: 'var(--bh-gold)' }}
        >
          Active snapshot
        </div>
        <div className="text-base font-semibold" style={{ color: 'var(--bh-ink)' }}>
          {active ? `${active.period_end} v${active.version}` : 'No frozen snapshot'}
        </div>
        <div className="text-xs" style={{ color: 'var(--bh-steel)' }}>
          {active?.frozen_at
            ? `Consolidated · frozen ${active.frozen_at.slice(0, 10)}`
            : '—'}
        </div>
      </div>

      {/* Open variance — semantic danger accent (red), inherited hex literals */}
      <div
        className="rounded-lg p-3"
        style={{
          background: '#fdecec',
          border: '1px solid #f1bcbc',
        }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
          style={{ color: '#9a2828' }}
        >
          Open variance
        </div>
        <div className="text-base font-semibold" style={{ color: '#9a2828' }}>
          {Math.round(openVariance).toLocaleString('en-US')} EGP
        </div>
        <div className="text-xs" style={{ color: 'var(--bh-steel)' }}>
          {openVarCount} account{openVarCount === 1 ? '' : 's'}
        </div>
      </div>

      {/* Next snapshot due — semantic warn accent (amber), inherited hex literals */}
      <div
        className="rounded-lg p-3"
        style={{
          background: '#fdf3da',
          border: '1px solid #f1d889',
        }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
          style={{ color: '#7a5300' }}
        >
          Next snapshot due
        </div>
        <div className="text-base font-semibold" style={{ color: 'var(--bh-ink)' }}>
          {next ? next.period_end : 'All current'}
        </div>
        <div className="text-xs" style={{ color: 'var(--bh-steel)' }}>
          {next
            ? `${next.is_overdue ? 'Overdue · ' : ''}due by ${next.due_by}`
            : '—'}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. No consumer yet; the file is just defined.

- [ ] **Step 3: Commit (no — wait for Task 3)**

Don't commit yet. Task 2 modifies `financials/page.tsx` to consume this component; Task 3 deletes the now-obsolete CockpitTile. All three commit together as "feat(bh-financials): migrate landing".

---

## Task 2: Migrate `financials/page.tsx` to `<BeithadyShell + BeithadyLauncher>`

**Files:**
- Modify: `src/app/beithady/financials/page.tsx`

- [ ] **Step 1: Replace the file content**

Replace the ENTIRE content of `src/app/beithady/financials/page.tsx` with:

```tsx
import {
  BarChart3,
  FileText,
  Calendar,
  Users,
  Snowflake,
  Search,
  Upload,
} from 'lucide-react';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { BeithadyLauncher, type LauncherTile } from '../_components/beithady-launcher';
import { supabaseAdmin } from '@/lib/supabase';
import { nextSnapshotDue } from '@/lib/beithady/financials/cadence';
import { StatusPreStrip } from './_components/StatusPreStrip';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function loadCockpitData() {
  const sb = supabaseAdmin();

  const { data: snaps } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end, version, company_scope, status, frozen_at')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen')
    .order('period_end', { ascending: false })
    .limit(1);
  const active = snaps?.[0] ?? null;

  const { data: openVar } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('account_code, variance')
    .eq('snapshot_id', active?.id ?? '00000000-0000-0000-0000-000000000000')
    .eq('variance_status', 'open');
  const openVarRows = (openVar ?? []).filter((r) => Number(r.variance) !== 0);
  const openVariance = openVarRows.reduce((s, r) => s + Number(r.variance), 0);

  const { data: frozenAll } = await sb
    .from('bh_balance_snapshots')
    .select('period_end')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen');
  const frozenSet = new Set((frozenAll ?? []).map((r) => r.period_end as string));
  const today = new Date().toISOString().slice(0, 10);
  const next = nextSnapshotDue(today, frozenSet);

  const { data: reminders } = await sb
    .from('bh_financials_reminders')
    .select('period_end, company_scope, first_seen_at, dismissed_until')
    .is('resolved_at', null)
    .or(`dismissed_until.is.null,dismissed_until.lt.${new Date().toISOString()}`);
  return { active, openVariance, openVarCount: openVarRows.length, next, reminders: reminders ?? [] };
}

const TILES: LauncherTile[] = [
  {
    href: '/beithady/financials/performance',
    title: 'Performance',
    description: 'P&L by period · analytic · LOB',
    icon: BarChart3,
    accent: 'slate',
  },
  {
    href: '/beithady/financials/balance-sheet',
    title: 'Balance Sheet',
    description: 'Assets · liabilities · equity',
    icon: FileText,
    accent: 'slate',
  },
  {
    href: '/beithady/financials/payables',
    title: 'Payables Aging',
    description: 'Open AP buckets by partner',
    icon: Calendar,
    accent: 'slate',
  },
  {
    href: '/beithady/financials/ledgers',
    title: 'Partner Ledgers',
    description: 'Per-partner current balance',
    icon: Users,
    accent: 'emerald',
    badge: { label: 'New', tone: 'gold' },
  },
  {
    href: '/beithady/financials/snapshots',
    title: 'Snapshots',
    description: 'Frozen opening balances · versions',
    icon: Snowflake,
    accent: 'cyan',
    badge: { label: 'New', tone: 'gold' },
  },
  {
    href: '/beithady/financials/reconciliation',
    title: 'Reconciliation',
    description: 'Variance audit · account ↔ ledger',
    icon: Search,
    accent: 'rose',
    badge: { label: 'Audit', tone: 'navy' },
  },
  {
    href: '/beithady/financials/import',
    title: 'Import',
    description: 'Upload xlsx ledgers',
    icon: Upload,
    accent: 'amber',
    badge: { label: 'New', tone: 'gold' },
  },
];

export default async function FinancialsCockpit() {
  const { active, openVariance, openVarCount, next, reminders } = await loadCockpitData();

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Financials' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Financials"
        title="Financials"
        subtitle="Snapshots · Performance · Payables · Reconciliation"
      />

      {reminders.length > 0 && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: '#fdecec',
            border: '1px solid #f1bcbc',
            color: '#9a2828',
          }}
        >
          🔴 <strong>Snapshot overdue:</strong>{' '}
          {reminders.map((r) => `${r.period_end} (${r.company_scope})`).join(', ')}.{' '}
          <a href="/beithady/financials/snapshots" className="underline ml-1">
            Start draft →
          </a>
        </div>
      )}

      <StatusPreStrip
        active={active}
        openVariance={openVariance}
        openVarCount={openVarCount}
        next={next}
      />

      <BeithadyLauncher tiles={TILES} columns={3} />
    </BeithadyShell>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. `BeithadyShell`, `BeithadyHeader`, `BeithadyLauncher`, `LauncherTile`, and `StatusPreStrip` all exist (BeithadyShell+Header in `_components/beithady-shell.tsx`, launcher in `_components/beithady-launcher.tsx`, StatusPreStrip from Task 1).

- [ ] **Step 3: Manually verify the rendered structure**

The replacement preserves:
- Reminders banner (when overdue).
- 3-card status pre-strip (now via `<StatusPreStrip>`).
- 7 launcher tiles with the same hrefs/titles/icons/badges as the old `<CockpitTile>` grid.

Don't commit yet — Task 3 deletes `CockpitTile.tsx`. All three commit together.

---

## Task 3: Delete `CockpitTile.tsx` and commit the landing migration

**Files:**
- Delete: `src/app/beithady/financials/_components/CockpitTile.tsx`

- [ ] **Step 1: Confirm no remaining references**

```bash
grep -rn "from './_components/CockpitTile'\|from '../_components/CockpitTile'\|from './CockpitTile'\|CockpitTile" src/app/beithady/financials/
```

Expected: zero matches in any source file (the file itself was just deleted). If any consumer still references it, fix the consumer first.

- [ ] **Step 2: Delete the file**

```bash
git rm src/app/beithady/financials/_components/CockpitTile.tsx
```

- [ ] **Step 3: Run tests + tsc**

```bash
npm run test
npx tsc --noEmit
```

Expected: full suite passes (baseline 607 + 0 new = 607 passing). `tsc` clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/financials/_components/StatusPreStrip.tsx src/app/beithady/financials/page.tsx
git commit -m "feat(bh-financials): migrate landing to BeithadyShell + BeithadyLauncher; re-theme status cards"
```

Do NOT push — controller pushes at the end.

---

## Task 4: Create `usePerfPnlUrlState` hook with TDD

**Files:**
- Create: `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts`
- Create: `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFinPerfUrl, parseFinPerfState, type FinPerfUrlState } from './use-perf-pnl-url-state';

describe('buildFinPerfUrl', () => {
  const defaults: FinPerfUrlState = {
    scope: 'consolidated',
    period: { kind: 'preset', id: 'last_month' },
    building: 'all',
  };

  it('returns basePath alone when all values are at defaults', () => {
    const url = buildFinPerfUrl(defaults, {});
    expect(url).toBe('/beithady/financials/performance');
  });

  it('serializes a non-default preset as ?preset=...', () => {
    const url = buildFinPerfUrl(defaults, { period: { kind: 'preset', id: 'this_year' } });
    expect(url).toBe('/beithady/financials/performance?preset=this_year');
  });

  it('serializes a month-kind period as ?month=YYYY-MM (no preset)', () => {
    const url = buildFinPerfUrl(defaults, { period: { kind: 'month', ym: '2026-02' } });
    expect(url).toBe('/beithady/financials/performance?month=2026-02');
  });

  it('serializes scope+building+lob together; omits defaults', () => {
    const url = buildFinPerfUrl(defaults, {
      scope: 'egypt',
      building: 'BH-26',
      lob: 'Turnkey Egypt',
    });
    // Order: scope, preset/month (default omitted), building, lob
    expect(url).toBe('/beithady/financials/performance?scope=egypt&building=BH-26&lob=Turnkey+Egypt');
  });

  it('preserves A1 scope for URL backward-compat (UI-hide-only per P0-1)', () => {
    const url = buildFinPerfUrl(defaults, { scope: 'a1' });
    expect(url).toBe('/beithady/financials/performance?scope=a1');
  });
});

describe('parseFinPerfState', () => {
  it('returns defaults when search is empty', () => {
    const state = parseFinPerfState(new URLSearchParams());
    expect(state.scope).toBe('consolidated');
    expect(state.period).toEqual({ kind: 'preset', id: 'last_month' });
    expect(state.building).toBe('all');
  });

  it('prefers month over preset when both are present (month is the override)', () => {
    const state = parseFinPerfState(new URLSearchParams('preset=this_year&month=2026-02'));
    expect(state.period).toEqual({ kind: 'month', ym: '2026-02' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-perf-pnl-url-state.test.ts
```

Expected: FAIL — "Failed to resolve import" (file doesn't exist yet).

- [ ] **Step 3: Create the hook file**

Create `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts`:

```ts
'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';

export type FinPerfPeriod =
  | { kind: 'preset'; id: 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' }
  | { kind: 'month'; ym: string };

export type FinPerfScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';

export type FinPerfBuilding = 'all' | 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';

export type FinPerfUrlState = {
  scope: FinPerfScope;
  period: FinPerfPeriod;
  building: FinPerfBuilding;
  lob?: string;
};

const BASE_PATH = '/beithady/financials/performance';

const DEFAULTS: FinPerfUrlState = {
  scope: 'consolidated',
  period: { kind: 'preset', id: 'last_month' },
  building: 'all',
};

const VALID_PRESETS = new Set([
  'this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year',
]);

const VALID_SCOPES = new Set(['consolidated', 'egypt', 'dubai', 'a1']);
const VALID_BUILDINGS = new Set(['all', 'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'OTHER']);

export function parseFinPerfState(search: URLSearchParams): FinPerfUrlState {
  const scopeRaw = search.get('scope');
  const scope: FinPerfScope = scopeRaw && VALID_SCOPES.has(scopeRaw)
    ? (scopeRaw as FinPerfScope)
    : 'consolidated';

  // month takes precedence over preset (operator picked an arbitrary month)
  const month = search.get('month');
  let period: FinPerfPeriod;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    period = { kind: 'month', ym: month };
  } else {
    const preset = search.get('preset');
    period = preset && VALID_PRESETS.has(preset)
      ? { kind: 'preset', id: preset as FinPerfPeriod extends { kind: 'preset'; id: infer K } ? K : never }
      : { kind: 'preset', id: 'last_month' };
  }

  const buildingRaw = search.get('building');
  const building: FinPerfBuilding = buildingRaw && VALID_BUILDINGS.has(buildingRaw)
    ? (buildingRaw as FinPerfBuilding)
    : 'all';

  const lob = search.get('lob') ?? undefined;

  return { scope, period, building, lob };
}

export function serializeFinPerfState(state: FinPerfUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.scope !== 'consolidated') params.set('scope', state.scope);
  if (state.period.kind === 'month') {
    params.set('month', state.period.ym);
  } else if (state.period.id !== 'last_month') {
    params.set('preset', state.period.id);
  }
  if (state.building !== 'all') params.set('building', state.building);
  if (state.lob) params.set('lob', state.lob);
  return params;
}

// Pure helper exported for unit testing without next/navigation.
export function buildFinPerfUrl(
  current: FinPerfUrlState,
  patch: Partial<FinPerfUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinPerfState,
    basePath: BASE_PATH,
  });
}

export function usePerfPnlUrlState() {
  return useBHUrlState<FinPerfUrlState>({
    defaults: DEFAULTS,
    parse: parseFinPerfState,
    serialize: serializeFinPerfState,
    basePath: BASE_PATH,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-perf-pnl-url-state.test.ts
```

Expected: 7/7 pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit the hook (alongside its consumer in Task 5/6 — wait)**

Don't commit yet — Tasks 5 and 6 add the Shell wrapper + rewire the page. Phase 2 commits all four parts together.

---

## Task 5: Create `PerformanceShell.tsx` client wrapper

**Files:**
- Create: `src/app/beithady/financials/performance/_components/PerformanceShell.tsx`

This is the meaty Phase-2 task. Read the reference at `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx` first to see the canonical `<BHDashboardShell>` composition pattern.

- [ ] **Step 1: Create the file**

Create `src/app/beithady/financials/performance/_components/PerformanceShell.tsx` with exact content:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Building2, Target } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHRailPill,
  BHMobileFilterSheet,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { usePerfPnlUrlState, type FinPerfUrlState } from '../../_hooks/use-perf-pnl-url-state';
import { PnlSection, UnclassifiedPanel } from '../../_components/PnlSection';
import type { PnlReport } from '@/lib/financials-pnl';

type Props = {
  pnl: PnlReport;
  scopeLbl: string;
  buildingCode: string | undefined;
  lobLabel: string | undefined;
  periodLabel: string;
};

const SCOPES: Array<{ id: FinPerfUrlState['scope']; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
  // A1 intentionally omitted from UI per P0-1 (URL backward-compat preserved in the type guard)
];

const PRESETS: Array<{ id: 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year'; label: string }> = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'this_year', label: 'This year' },
  { id: 'last_year', label: 'Last year' },
];

const BUILDINGS: Array<{ id: FinPerfUrlState['building']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'BH-26', label: 'BH-26' },
  { id: 'BH-73', label: 'BH-73' },
  { id: 'BH-435', label: 'BH-435' },
  { id: 'BH-OK', label: 'BH-OK' },
  { id: 'OTHER', label: 'Other' },
];

export function PerformanceShell({ pnl, scopeLbl, buildingCode, lobLabel, periodLabel }: Props) {
  const { state, update } = usePerfPnlUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const monthValue = state.period.kind === 'month' ? state.period.ym : '';
  const periodChipLabel = state.period.kind === 'month'
    ? `Month: ${state.period.ym}`
    : `Period: ${PRESETS.find((p) => p.id === state.period.id)?.label ?? state.period.id}`;
  const buildingChipLabel = state.building === 'all' ? 'All buildings' : state.building;

  const railSections: BHRailSection[] = [
    {
      title: 'Scope',
      children: (
        <>
          {SCOPES.map((s) => (
            <BHRailPill
              key={s.id}
              active={state.scope === s.id}
              onClick={() => update({ scope: s.id })}
            >
              {s.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
    {
      title: 'Period',
      children: (
        <>
          {PRESETS.map((p) => (
            <BHRailPill
              key={p.id}
              active={state.period.kind === 'preset' && state.period.id === p.id}
              onClick={() => update({ period: { kind: 'preset', id: p.id } })}
            >
              {p.label}
            </BHRailPill>
          ))}
          <input
            type="month"
            value={monthValue}
            onChange={(e) => {
              if (e.target.value) {
                update({ period: { kind: 'month', ym: e.target.value } });
              }
            }}
            className="rounded-md border px-2.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none"
            style={{
              background: 'transparent',
              color: 'var(--bh-ink)',
              borderColor: 'var(--bh-mute)',
              fontFamily: 'inherit',
            }}
            aria-label="Pick month"
          />
        </>
      ),
    },
    {
      title: 'Building',
      children: (
        <>
          {BUILDINGS.map((b) => (
            <BHRailPill
              key={b.id}
              active={state.building === b.id}
              onClick={() => update({ building: b.id })}
            >
              {b.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
  ];

  const titleBarActions = (
    <Link
      href="/beithady/financials"
      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ background: 'transparent', color: 'var(--bh-gold)', borderColor: 'var(--bh-gold)' }}
    >
      ← Back to Financials
    </Link>
  );

  return (
    <BHDashboardShell
      railCollapsed={rail.collapsed}
      onRailEnter={rail.handleEnter}
      onRailLeave={rail.handleLeave}
      titleBar={
        <BHTitleBar
          eyebrow="Beit Hady · Financials"
          title={`Performance · ${scopeLbl}`}
          subtitle={periodLabel}
          chips={[
            { icon: Calendar, label: periodChipLabel },
            { icon: Building2, label: buildingChipLabel },
          ]}
          actions={titleBarActions}
          onMobileFilterClick={() => setMobileFilterOpen(true)}
        />
      }
      rail={
        <BHLeftRail
          sections={railSections}
          collapsed={rail.collapsed}
          collapsedIcons={[
            { emoji: '🎯', title: `Scope: ${state.scope}` },
            { emoji: '📅', title: periodChipLabel },
            { emoji: '🏢', title: `Building: ${state.building}` },
          ]}
          pinned={rail.pinned}
          onTogglePin={rail.togglePinned}
        />
      }
      mobileFilterSheet={
        <BHMobileFilterSheet open={mobileFilterOpen} onClose={() => setMobileFilterOpen(false)}>
          <BHLeftRail sections={railSections} />
        </BHMobileFilterSheet>
      }
    >
      <div className="col-span-12">
        <PnlSection
          pnl={pnl}
          scopeLbl={scopeLbl}
          buildingCode={buildingCode}
          lobLabel={lobLabel}
        />
        {pnl.unclassified.length > 0 && <UnclassifiedPanel pnl={pnl} />}
      </div>
      {/* Suppress unused-import lint for Target — kept for parity with eyebrow icon use elsewhere */}
      <Target style={{ display: 'none' }} />
    </BHDashboardShell>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. If there are issues, the most likely sources are:
- `PnlReport` type not exported from `@/lib/financials-pnl` — verify with `grep "export.*PnlReport" src/lib/financials-pnl.ts`. If not exported, add it: `export type { PnlReport }`.
- `BHRailSection` not exported from the barrel — confirm by reading `src/app/beithady/_components/dashboard-shell/index.ts`.

If any import doesn't resolve, fix the export at its source rather than working around it.

- [ ] **Step 3: Don't commit yet — Task 6 wires the consumer**

---

## Task 6: Rewrite `performance/page.tsx` to use `<PerformanceShell>`

**Files:**
- Modify: `src/app/beithady/financials/performance/page.tsx`

- [ ] **Step 1: Replace the file with the server-component wrapper**

Replace the ENTIRE content of `src/app/beithady/financials/performance/page.tsx` with:

```tsx
import {
  buildPnlReport,
  resolveFinancePeriod,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { PerformanceShell } from './_components/PerformanceShell';
import { parseFinPerfState } from '../_hooks/use-perf-pnl-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    month?: string;
    scope?: string;
    building?: string;
    lob?: string;
  }>;
}) {
  const sp = await searchParams;

  // Build a URLSearchParams to feed our typed parser. The parser is the source
  // of truth for which params we honor and how — page.tsx just glues data fetch
  // to the URL state.
  const urlParams = new URLSearchParams();
  if (sp.preset) urlParams.set('preset', sp.preset);
  if (sp.month) urlParams.set('month', sp.month);
  if (sp.scope) urlParams.set('scope', sp.scope);
  if (sp.building) urlParams.set('building', sp.building);
  if (sp.lob) urlParams.set('lob', sp.lob);
  const state = parseFinPerfState(urlParams);

  // Legacy ?from=&to= URL params still resolve via the existing helper. The
  // shell UI never emits these, but old bookmarks continue to work.
  const presetStr = state.period.kind === 'month'
    ? `month:${state.period.ym}`
    : state.period.id;
  const period = resolveFinancePeriod(presetStr, sp.from, sp.to);

  const scope: CompanyScope = isCompanyScope(state.scope) ? state.scope : 'consolidated';
  const companyIds = scopeCompanyIds(scope);
  const buildingCode = state.building !== 'all' ? state.building : undefined;
  const lobLabel = state.lob && state.lob !== 'all' ? state.lob : undefined;

  const pnl = await buildPnlReport({
    fromDate: period.fromDate,
    toDate: period.toDate,
    label: period.label,
    companyIds,
    buildingCode,
    lobLabel,
  });

  return (
    <PerformanceShell
      pnl={pnl}
      scopeLbl={scopeLabel(scope)}
      buildingCode={buildingCode}
      lobLabel={lobLabel}
      periodLabel={period.label}
    />
  );
}
```

- [ ] **Step 2: Run type-check + tests + build**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected:
- `tsc`: clean.
- vitest: 607 baseline + 7 new (from Task 4) = 614 passing.
- build: succeeds.

- [ ] **Step 3: Commit Phase 2**

```bash
git add src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts src/app/beithady/financials/_hooks/use-perf-pnl-url-state.test.ts src/app/beithady/financials/performance/_components/PerformanceShell.tsx src/app/beithady/financials/performance/page.tsx
git commit -m "feat(bh-financials): migrate Performance to BHDashboardShell + add month picker"
```

Do NOT push.

---

## Task 7: Create `useBSUrlState` hook with TDD

**Files:**
- Create: `src/app/beithady/financials/_hooks/use-bs-url-state.ts`
- Create: `src/app/beithady/financials/_hooks/use-bs-url-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/financials/_hooks/use-bs-url-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFinBSUrl, type FinBSUrlState } from './use-bs-url-state';

describe('buildFinBSUrl', () => {
  function makeDefaults(today: string): FinBSUrlState {
    return { scope: 'consolidated', asof: today, building: 'all' };
  }

  it('writes asof always (since today changes daily)', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinBSUrl(defaults, {});
    expect(url).toBe('/beithady/financials/balance-sheet?asof=2026-05-15');
  });

  it('omits scope when consolidated, writes when not', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinBSUrl(defaults, { scope: 'egypt' });
    expect(url).toBe('/beithady/financials/balance-sheet?asof=2026-05-15&scope=egypt');
  });

  it('writes building when not all', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinBSUrl(defaults, { building: 'BH-73' });
    expect(url).toBe('/beithady/financials/balance-sheet?asof=2026-05-15&building=BH-73');
  });

  it('preserves A1 scope for URL backward-compat', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinBSUrl(defaults, { scope: 'a1' });
    expect(url).toBe('/beithady/financials/balance-sheet?asof=2026-05-15&scope=a1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-bs-url-state.test.ts
```

Expected: FAIL — "Failed to resolve import".

- [ ] **Step 3: Create the hook**

Create `src/app/beithady/financials/_hooks/use-bs-url-state.ts`:

```ts
'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';

export type FinBSScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';

export type FinBSBuilding = 'all' | 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';

export type FinBSUrlState = {
  scope: FinBSScope;
  asof: string;  // 'YYYY-MM-DD'
  building: FinBSBuilding;
};

const BASE_PATH = '/beithady/financials/balance-sheet';

const VALID_SCOPES = new Set(['consolidated', 'egypt', 'dubai', 'a1']);
const VALID_BUILDINGS = new Set(['all', 'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'OTHER']);
const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseFinBSState(search: URLSearchParams): FinBSUrlState {
  const scopeRaw = search.get('scope');
  const scope: FinBSScope = scopeRaw && VALID_SCOPES.has(scopeRaw)
    ? (scopeRaw as FinBSScope)
    : 'consolidated';

  const asofRaw = search.get('asof');
  const asof = asofRaw && ASOF_PATTERN.test(asofRaw) ? asofRaw : todayYmd();

  const buildingRaw = search.get('building');
  const building: FinBSBuilding = buildingRaw && VALID_BUILDINGS.has(buildingRaw)
    ? (buildingRaw as FinBSBuilding)
    : 'all';

  return { scope, asof, building };
}

export function serializeFinBSState(state: FinBSUrlState): URLSearchParams {
  const params = new URLSearchParams();
  // asof is always written so the URL is reproducible (today changes daily).
  params.set('asof', state.asof);
  if (state.scope !== 'consolidated') params.set('scope', state.scope);
  if (state.building !== 'all') params.set('building', state.building);
  return params;
}

export function buildFinBSUrl(
  current: FinBSUrlState,
  patch: Partial<FinBSUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinBSState,
    basePath: BASE_PATH,
  });
}

export function useBSUrlState() {
  return useBHUrlState<FinBSUrlState>({
    defaults: { scope: 'consolidated', asof: todayYmd(), building: 'all' },
    parse: parseFinBSState,
    serialize: serializeFinBSState,
    basePath: BASE_PATH,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-bs-url-state.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Don't commit yet — Tasks 8 and 9 wire the shell + page**

---

## Task 8: Create `BalanceSheetShell.tsx` client wrapper

**Files:**
- Create: `src/app/beithady/financials/balance-sheet/_components/BalanceSheetShell.tsx`

- [ ] **Step 1: Create the file**

Create `src/app/beithady/financials/balance-sheet/_components/BalanceSheetShell.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Building2 } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHRailPill,
  BHMobileFilterSheet,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { useBSUrlState, type FinBSUrlState } from '../../_hooks/use-bs-url-state';
import { BalanceSheetSection } from '../../_components/BalanceSheetSection';
import type { BalanceSheetReport } from '@/lib/financials-pnl';

type Props = {
  bs: BalanceSheetReport;
  scopeLbl: string;
  asOf: string;
};

const SCOPES: Array<{ id: FinBSUrlState['scope']; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
];

const BUILDINGS: Array<{ id: FinBSUrlState['building']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'BH-26', label: 'BH-26' },
  { id: 'BH-73', label: 'BH-73' },
  { id: 'BH-435', label: 'BH-435' },
  { id: 'BH-OK', label: 'BH-OK' },
  { id: 'OTHER', label: 'Other' },
];

export function BalanceSheetShell({ bs, scopeLbl, asOf }: Props) {
  const { state, update } = useBSUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const buildingChipLabel = state.building === 'all' ? 'All buildings' : state.building;

  const railSections: BHRailSection[] = [
    {
      title: 'Scope',
      children: (
        <>
          {SCOPES.map((s) => (
            <BHRailPill
              key={s.id}
              active={state.scope === s.id}
              onClick={() => update({ scope: s.id })}
            >
              {s.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
    {
      title: 'As of',
      children: (
        <input
          type="date"
          value={state.asof}
          onChange={(e) => {
            if (e.target.value) {
              update({ asof: e.target.value });
            }
          }}
          className="rounded-md border px-2.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{
            background: 'transparent',
            color: 'var(--bh-ink)',
            borderColor: 'var(--bh-mute)',
            fontFamily: 'inherit',
          }}
          aria-label="As-of date"
        />
      ),
    },
    {
      title: 'Building',
      children: (
        <>
          {BUILDINGS.map((b) => (
            <BHRailPill
              key={b.id}
              active={state.building === b.id}
              onClick={() => update({ building: b.id })}
            >
              {b.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
  ];

  const titleBarActions = (
    <Link
      href="/beithady/financials"
      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ background: 'transparent', color: 'var(--bh-gold)', borderColor: 'var(--bh-gold)' }}
    >
      ← Back to Financials
    </Link>
  );

  return (
    <BHDashboardShell
      railCollapsed={rail.collapsed}
      onRailEnter={rail.handleEnter}
      onRailLeave={rail.handleLeave}
      titleBar={
        <BHTitleBar
          eyebrow="Beit Hady · Financials"
          title={`Balance Sheet · ${scopeLbl}`}
          subtitle={`As of ${asOf}`}
          chips={[
            { icon: Calendar, label: asOf },
            { icon: Building2, label: buildingChipLabel },
          ]}
          actions={titleBarActions}
          onMobileFilterClick={() => setMobileFilterOpen(true)}
        />
      }
      rail={
        <BHLeftRail
          sections={railSections}
          collapsed={rail.collapsed}
          collapsedIcons={[
            { emoji: '🎯', title: `Scope: ${state.scope}` },
            { emoji: '📅', title: `As of: ${state.asof}` },
            { emoji: '🏢', title: `Building: ${state.building}` },
          ]}
          pinned={rail.pinned}
          onTogglePin={rail.togglePinned}
        />
      }
      mobileFilterSheet={
        <BHMobileFilterSheet open={mobileFilterOpen} onClose={() => setMobileFilterOpen(false)}>
          <BHLeftRail sections={railSections} />
        </BHMobileFilterSheet>
      }
    >
      <div className="col-span-12">
        <BalanceSheetSection bs={bs} />
      </div>
    </BHDashboardShell>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. If `BalanceSheetReport` type isn't exported from `@/lib/financials-pnl`, add the export there.

- [ ] **Step 3: Don't commit yet — Task 9 wires the page**

---

## Task 9: Rewrite `balance-sheet/page.tsx` and commit Phase 3

**Files:**
- Modify: `src/app/beithady/financials/balance-sheet/page.tsx`

- [ ] **Step 1: Replace the file**

Replace the ENTIRE content of `src/app/beithady/financials/balance-sheet/page.tsx` with:

```tsx
import {
  buildBalanceSheet,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { BalanceSheetShell } from './_components/BalanceSheetShell';
import { parseFinBSState } from '../_hooks/use-bs-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string; scope?: string; building?: string }>;
}) {
  const sp = await searchParams;
  const urlParams = new URLSearchParams();
  if (sp.asof) urlParams.set('asof', sp.asof);
  if (sp.scope) urlParams.set('scope', sp.scope);
  if (sp.building) urlParams.set('building', sp.building);
  const state = parseFinBSState(urlParams);

  const scope: CompanyScope = isCompanyScope(state.scope) ? state.scope : 'consolidated';
  const companyIds = scopeCompanyIds(scope);
  const bs = await buildBalanceSheet({ asOf: state.asof, companyIds });

  return (
    <BalanceSheetShell
      bs={bs}
      scopeLbl={scopeLabel(scope)}
      asOf={state.asof}
    />
  );
}
```

- [ ] **Step 2: Run full verification**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected:
- `tsc`: clean.
- vitest: 614 + 4 new = 618 passing.
- build: succeeds.

- [ ] **Step 3: Commit Phase 3**

```bash
git add src/app/beithady/financials/_hooks/use-bs-url-state.ts src/app/beithady/financials/_hooks/use-bs-url-state.test.ts src/app/beithady/financials/balance-sheet/_components/BalanceSheetShell.tsx src/app/beithady/financials/balance-sheet/page.tsx
git commit -m "feat(bh-financials): migrate Balance Sheet to BHDashboardShell"
```

---

## Task 10: Delete `PeriodControls.tsx` (cleanup)

**Files:**
- Delete: `src/app/beithady/financials/_components/PeriodControls.tsx`

- [ ] **Step 1: Confirm no `/beithady/financials/*` page imports it**

```bash
grep -rn "from.*financials/_components/PeriodControls\|from './PeriodControls'\|from '../_components/PeriodControls'" src/app/beithady/
```

Expected: zero matches. (Note: there are unrelated FMPLUS-side components with similar names — see `src/app/fmplus/financials/_components/AnalyticPicker.tsx` and `FilterBar.tsx`. Those are NOT affected.)

If any match comes back inside `src/app/beithady/`, STOP and investigate before deleting.

- [ ] **Step 2: Delete**

```bash
git rm src/app/beithady/financials/_components/PeriodControls.tsx
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run test
```

Expected: clean tsc, 618 passing.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(bh-financials): delete obsolete PeriodControls (rail composition replaces it)"
```

---

## Task 11: Final verification + push

**Files:** none (verification + git only)

- [ ] **Step 1: Full verification sweep**

```bash
npm run test
npx tsc --noEmit
npm run build
```

Expected: all three exit 0. Test count: 618 passing / 22 skipped.

- [ ] **Step 2: Manual smoke (dev server)**

```bash
npm run dev
```

Visit in browser:
- `http://localhost:3000/beithady/financials` — verify the launcher tile grid renders with 7 tiles; status pre-strip shows 3 BH-themed cards (no raw indigo/red/yellow on chrome backgrounds — variance + due cards keep semantic red/amber as expected); reminders banner renders only when overdue.
- `http://localhost:3000/beithady/financials/performance` — TitleBar shows "Performance · Consolidated"; rail has Scope/Period/Building sections; clicking a building pill refilters the P&L; clicking "Last month" preset clears any month-picker value; picking a month (e.g. 2026-02) clears the active preset.
- `http://localhost:3000/beithady/financials/performance?scope=a1` — page still loads (data scoped to A1HOSPITALITY); no scope pill is highlighted.
- `http://localhost:3000/beithady/financials/performance?from=2026-01-01&to=2026-03-31` — legacy range URL still renders the right period.
- `http://localhost:3000/beithady/financials/balance-sheet` — TitleBar shows "Balance Sheet · Consolidated · As of {today}"; rail has Scope/As of/Building; date input defaults to today; changing the date triggers a re-fetch.

Stop the dev server with `Ctrl+C`.

- [ ] **Step 3: Push all commits**

```bash
git push origin main
```

This pushes 4 commits at once:
1. `feat(bh-financials): migrate landing to BeithadyShell + BeithadyLauncher; re-theme status cards`
2. `feat(bh-financials): migrate Performance to BHDashboardShell + add month picker`
3. `feat(bh-financials): migrate Balance Sheet to BHDashboardShell`
4. `chore(bh-financials): delete obsolete PeriodControls`

GitHub triggers Vercel auto-deploy. No need to also run `vercel --prod`.

- [ ] **Step 4: Update SESSION_HANDOFF.md**

Prepend a new dated entry summarizing what shipped (commit SHAs, test count delta, manual-smoke result). Commit + push that too.

---

## Self-Review (run after writing the plan)

**Spec coverage:**
- §1 Goal & scope → Tasks 1–10 cover all three pages.
- §3 Per-page architecture → Tasks 1–9 implement the three architectures.
- §4 URL state shapes → Tasks 4 + 7 create the two typed hooks.
- §5 Month picker styling → Embedded in Task 5 (PerformanceShell).
- §6 File structure → All files in spec §6 are accounted for (created or modified or deleted).
- §7 Cleanup & re-theming → Task 1 (StatusPreStrip) + Task 10 (PeriodControls deletion).
- §8 Testing strategy → Tasks 4 + 7 add the URL-state tests; existing FinancialsFilterStrip test continues to pass (untouched, payables still uses the strip).
- §9 Migration mechanics → 3 commit boundaries match the plan (Tasks 1–3, 4–6, 7–9) + 1 cleanup commit (Task 10) + push (Task 11).
- §10 Risks → addressed by reading reference `analytics/performance/dashboard-shell.tsx` (Task 5 setup) + smoke checklist (Task 11).
- §11 Open questions → "Other" label for OTHER building, asof always-written, A1 UI-hide-only — all baked into the implementation.

**Placeholder scan:** no TBD / TODO / "implement details" patterns.

**Type consistency:** `FinPerfUrlState`, `FinPerfPeriod`, `FinPerfScope`, `FinPerfBuilding` declared in Task 4 and consumed identically in Task 5/6. `FinBSUrlState`, `FinBSScope`, `FinBSBuilding` declared in Task 7 and consumed identically in Task 8/9. `BHRailSection` from the shared package barrel, consistent in Tasks 5 + 8. `PnlReport` + `BalanceSheetReport` types are spec'd as already existing in `@/lib/financials-pnl`; if they're not exported, Tasks 5/8 say to add the export.

---

## Future work (out of scope for this plan)

- **P2 #6: Migrate Payables, Ledgers, Snapshots, Reconciliation, Import** — each becomes its own spec/plan/PR. Once Payables migrates, `FinancialsFilterStrip.tsx` can be deleted.
- **Audit §7.2 brand-var sweep** — the inherited red/amber hex literals in `StatusPreStrip.tsx` get migrated to semantic BH brand tokens. Cross-cutting cleanup PR, low priority.
- **Building filter for LOB** — currently URL-only. Add to the rail when an operator asks.
- **A1 type removal** — the larger follow-up plan documented at the bottom of `2026-05-15-bh-audit-p0-1-remove-a1-from-filters.md`.
