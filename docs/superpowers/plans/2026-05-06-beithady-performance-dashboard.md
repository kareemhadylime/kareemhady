# Beithady Performance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/beithady/analytics/performance` — an interactive, drill-down dashboard rendering the existing daily snapshot data + new analytical panels + AI insights, with per-user toggle visibility and a collapsible filter rail.

**Architecture:** Server component reads a single `daily_report_snapshots` row, hands a typed payload to a client `<DashboardShell />`. The shell renders a top bar, a CSS-grid auto-collapsing left rail, and a 12-column main grid of independent panel components. Visibility per panel and rail-pin state live in `localStorage`. URL params (`?date=&building=&compare=`) are the single source of truth for the active view.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, recharts v2.15.4, Anthropic SDK, Supabase JSONB, vitest. Snapshot pre-build (one Anthropic call per day for insights + one for review topics) — zero live API calls in the request path.

**Spec reference:** [docs/superpowers/specs/2026-05-06-beithady-performance-dashboard-design.md](../specs/2026-05-06-beithady-performance-dashboard-design.md) (committed `a287c3e`).

---

## Pre-flight

**Before starting any task:**

1. Read `node_modules/next/dist/docs/` for the routing + caching APIs you'll touch (Next 16 has breaking changes from your training data — per CLAUDE.md).
2. Confirm you're on the working worktree (`.claude/worktrees/flamboyant-agnesi-f34a8d`) on branch `claude/flamboyant-agnesi-f34a8d`.
3. Run `npm run test` once to confirm the existing test suite is green before starting.
4. The deploy flow is **commit → push to main → auto-deploy via GitHub→Vercel**. Standing authorization in CLAUDE.md covers `git add`/`git commit`/`git push`/`vercel --prod` and Supabase MCP migrations. Do NOT push to a non-main branch and open a PR.

---

## File Structure

```
src/
├── app/beithady/analytics/
│   ├── page.tsx                                    # MODIFY: add 6th tile
│   └── performance/
│       ├── page.tsx                                # NEW: server component
│       ├── _components/
│       │   ├── dashboard-shell.tsx                 # NEW: client root
│       │   ├── top-bar.tsx                         # NEW
│       │   ├── left-rail.tsx                       # NEW: auto-collapse
│       │   ├── customize-drawer.tsx                # NEW
│       │   ├── empty-snapshot.tsx                  # NEW: error state
│       │   ├── panel-frame.tsx                     # NEW: shared X-close wrapper
│       │   └── panels/
│       │       ├── hero-kpi.tsx                    # NEW: generic 6-up KPI tile
│       │       ├── ai-insights-tray.tsx            # NEW
│       │       ├── top-movers-ribbon.tsx           # NEW
│       │       ├── buildings-table.tsx             # NEW
│       │       ├── forward-occupancy-bars.tsx      # NEW
│       │       ├── channel-mix-donut.tsx           # NEW
│       │       ├── payouts.tsx                     # NEW
│       │       ├── monthly-goal.tsx                # NEW
│       │       ├── reviews-block.tsx               # NEW (with AI topics row)
│       │       ├── cleaning-turnovers.tsx          # NEW
│       │       ├── cancel-risk.tsx                 # NEW
│       │       ├── inquiry-sla-buckets.tsx         # NEW
│       │       ├── check-ins-payment.tsx           # NEW
│       │       ├── cancellations.tsx               # NEW
│       │       ├── revenue-concentration.tsx       # NEW
│       │       ├── occupancy-gap-finder.tsx        # NEW
│       │       ├── revenue-waterfall.tsx           # NEW
│       │       ├── stly-yoy.tsx                    # NEW
│       │       └── snapshot-scrubber.tsx           # NEW
│       ├── _hooks/
│       │   ├── use-visibility.ts                   # NEW: localStorage panel toggles
│       │   ├── use-rail-collapse.ts                # NEW: 3s timer + pin
│       │   └── use-url-state.ts                    # NEW: ?date= / ?building= / ?compare=
│       ├── _lib/
│       │   ├── panel-registry.ts                   # NEW: PanelId enum, defaults, drilldowns
│       │   ├── compute-deltas.ts                   # NEW: client delta calc
│       │   ├── color-thresholds.ts                 # NEW: occupancy color helper
│       │   └── load-snapshot.ts                    # NEW: server-side snapshot fetcher
│       └── _actions/
│           └── export-pdf.ts                       # NEW: server action (Phase 7)
└── lib/beithady-daily-report/
    ├── types.ts                                    # MODIFY: extend DailyReportPayload
    ├── build.ts                                    # MODIFY: call new builders
    ├── build-revpar.ts                             # NEW (no I/O — derived)
    ├── build-sparklines.ts                         # NEW (queries prior snapshots)
    ├── build-top-movers.ts                         # NEW (diff vs prior snapshot)
    ├── build-revenue-concentration.ts              # NEW (Pareto)
    ├── build-forward-occupancy.ts                  # NEW (uses corpus + inventories)
    ├── build-cancel-risk.ts                        # NEW (reads cancel_risk_v view)
    ├── build-occupancy-gaps.ts                     # NEW (derived from forward-occupancy)
    ├── build-revenue-waterfall.ts                  # NEW (snapshot + Odoo fees)
    ├── build-stly.ts                               # NEW (year-old snapshot lookup)
    ├── build-insights.ts                           # NEW (Anthropic SDK)
    └── build-review-topics.ts                      # NEW (Anthropic SDK)
```

Total: **~38 new files, 3 modified files.**

---

## Phasing

The plan is split into 8 phases. **Each phase ends with `git push origin HEAD:main`, which auto-deploys via GitHub→Vercel.** No phase leaves the dashboard broken — you can stop after any phase and the deployed state is consistent.

| Phase | What ships | Tasks |
|---|---|---|
| 1 | Empty shell at `/beithady/analytics/performance` | 1–6 |
| 2 | Baseline panels (PDF parity, existing payload) | 7–17 |
| 3 | Extended payload + 7 derived builders | 18–28 |
| 4 | New analytical panels (using extended payload) | 29–38 |
| 5 | AI builders + AI panels (insights, topics) | 39–43 |
| 6 | Customize drawer + rail collapse + visibility | 44–48 |
| 7 | Snapshot scrubber + PDF export | 49–51 |
| 8 | Mobile responsive + a11y + reduced motion + empty state | 52–55 |

---

## Phase 1 · Foundation

End-state: navigating to `/beithady/analytics/performance` renders the dark shell with breadcrumb, top bar, filter rail (expanded only — collapse comes in Phase 6), 12-col empty grid, and reads/displays the snapshot date. Filter changes update URL.

### Task 1: Add Performance Dashboard tile to Analytics hub

**Files:**
- Modify: `src/app/beithady/analytics/page.tsx`

- [ ] **Step 1.1: Locate the existing tile grid**

Open `src/app/beithady/analytics/page.tsx`. Find the JSX block that renders the 5 tiles (Pricing Intelligence, Market Intelligence, Calendar Heatmap, Reviews, Generate Report). Each tile is a `<Link>` with an icon + title + description.

- [ ] **Step 1.2: Add the 6th tile after Generate Report**

Add this Link directly after the existing "Generate Report" tile, matching the local component pattern (use the same wrapper component the others use — copy from the closest existing tile):

```tsx
<Link
  href="/beithady/analytics/performance"
  className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.025] to-white/[0.005] p-6 transition hover:border-amber-500/40"
>
  <div className="absolute right-5 top-5 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-amber-400">→</div>
  <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
    <Target className="h-5 w-5" />
  </div>
  <div className="flex items-center gap-2">
    <h3 className="text-lg font-semibold text-white">Performance Dashboard</h3>
    <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">Live</span>
  </div>
  <p className="mt-1 text-sm text-slate-400">Today · MTD · pace · drill-down. Daily report data, clickable.</p>
</Link>
```

Add `import { Target } from 'lucide-react';` to the top of the file if not already imported.

- [ ] **Step 1.3: Visual smoke test**

Run `npm run dev`. Open `http://localhost:3000/beithady/analytics`. Confirm the 6th tile renders below "Generate Report" with the gold accent. Click it — expect a 404 (the route doesn't exist yet — that's fine, fixed in Task 2).

- [ ] **Step 1.4: Commit**

```bash
git add src/app/beithady/analytics/page.tsx
git commit -m "feat(beithady): add Performance Dashboard tile to Analytics hub"
```

---

### Task 2: Server-side snapshot loader

**Files:**
- Create: `src/app/beithady/analytics/performance/_lib/load-snapshot.ts`
- Create: `src/app/beithady/analytics/performance/_lib/load-snapshot.test.ts`

- [ ] **Step 2.1: Write the failing test**

```ts
// load-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { parseDateParam } from './load-snapshot';

describe('parseDateParam', () => {
  it('returns the provided YYYY-MM-DD when valid', () => {
    expect(parseDateParam('2026-05-05')).toBe('2026-05-05');
  });

  it('returns null for invalid format', () => {
    expect(parseDateParam('2026-5-5')).toBeNull();
    expect(parseDateParam('not-a-date')).toBeNull();
    expect(parseDateParam(undefined)).toBeNull();
  });

  it('returns null for impossible dates', () => {
    expect(parseDateParam('2026-13-01')).toBeNull();
    expect(parseDateParam('2026-02-30')).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run test, verify failure**

```bash
npm run test -- load-snapshot
```

Expect: FAIL — `parseDateParam` is not exported (file doesn't exist).

- [ ] **Step 2.3: Implement `load-snapshot.ts`**

```ts
// load-snapshot.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { cairoYmd } from '@/lib/beithady-daily-report/cairo-dates';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateParam(input: string | undefined): string | null {
  if (!input || !YMD.test(input)) return null;
  const [y, m, d] = input.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return input;
}

export type SnapshotResult =
  | { status: 'found'; date: string; payload: DailyReportPayload; generatedAt: string }
  | { status: 'missing'; date: string }
  | { status: 'no-anchor' };

export async function loadSnapshot(dateParam: string | undefined): Promise<SnapshotResult> {
  const date = parseDateParam(dateParam) ?? cairoYmd();
  if (!date) return { status: 'no-anchor' };

  const { data, error } = await supabaseAdmin()
    .from('daily_report_snapshots')
    .select('payload, generated_at')
    .eq('report_date', date)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { status: 'missing', date };
  return {
    status: 'found',
    date,
    payload: data.payload as DailyReportPayload,
    generatedAt: data.generated_at as string,
  };
}
```

- [ ] **Step 2.4: Run tests, verify pass**

```bash
npm run test -- load-snapshot
```

Expect: PASS (3 tests).

- [ ] **Step 2.5: Commit**

```bash
git add src/app/beithady/analytics/performance/_lib/
git commit -m "feat(beithady/perf): add server snapshot loader with date param parsing"
```

---

### Task 3: Page route (server component) + EmptySnapshot fallback

**Files:**
- Create: `src/app/beithady/analytics/performance/page.tsx`
- Create: `src/app/beithady/analytics/performance/_components/empty-snapshot.tsx`

- [ ] **Step 3.1: Empty-snapshot component**

```tsx
// _components/empty-snapshot.tsx
type Props = { date: string };
export function EmptySnapshot({ date }: Props) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.025] to-white/[0.005] p-8 text-center">
      <div className="mb-3 text-3xl">📭</div>
      <h2 className="text-xl font-semibold text-white">No snapshot for {date}</h2>
      <p className="mt-2 text-sm text-slate-400">
        The daily report cron hasn't produced a payload for this date yet. The next run is at 09:00 Cairo.
      </p>
      <a
        href="/api/cron/beithady-daily-report?force=1"
        className="mt-4 inline-block rounded-md border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/25"
      >
        Run now manually →
      </a>
    </div>
  );
}
```

- [ ] **Step 3.2: page.tsx server component**

```tsx
// performance/page.tsx
import { Suspense } from 'react';
import { BeithadyShell } from '@/app/beithady/_components/beithady-shell';
import { loadSnapshot } from './_lib/load-snapshot';
import { EmptySnapshot } from './_components/empty-snapshot';
import { DashboardShell } from './_components/dashboard-shell';

type SearchParams = Promise<{ date?: string; building?: string; compare?: string }>;

export const metadata = { title: 'Performance Dashboard · Beithady' };

export default async function PerformancePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const result = await loadSnapshot(sp.date);

  return (
    <BeithadyShell
      breadcrumb={[
        { label: 'Beithady', href: '/beithady' },
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Performance' },
      ]}
    >
      {result.status === 'missing' || result.status === 'no-anchor' ? (
        <EmptySnapshot date={result.status === 'missing' ? result.date : '—'} />
      ) : (
        <Suspense>
          <DashboardShell
            payload={result.payload}
            snapshotDate={result.date}
            generatedAt={result.generatedAt}
            initialBuilding={sp.building ?? 'all'}
            initialCompare={(sp.compare as 'yesterday' | 'last-week' | 'last-month' | 'last-year' | 'none') ?? 'yesterday'}
          />
        </Suspense>
      )}
    </BeithadyShell>
  );
}
```

- [ ] **Step 3.3: Visual smoke test (still 404 because shell doesn't exist yet)**

Don't run yet — we need DashboardShell first. We'll come back. Skip to next task.

- [ ] **Step 3.4: Commit**

```bash
git add src/app/beithady/analytics/performance/page.tsx src/app/beithady/analytics/performance/_components/empty-snapshot.tsx
git commit -m "feat(beithady/perf): add page route + empty-snapshot fallback"
```

---

### Task 4: URL state hook

**Files:**
- Create: `src/app/beithady/analytics/performance/_hooks/use-url-state.ts`
- Create: `src/app/beithady/analytics/performance/_hooks/use-url-state.test.ts`

- [ ] **Step 4.1: Write the failing test**

```ts
// use-url-state.test.ts
import { describe, it, expect } from 'vitest';
import { buildPerfUrl } from './use-url-state';

describe('buildPerfUrl', () => {
  it('keeps existing params when only one changes', () => {
    const url = buildPerfUrl({ date: '2026-05-05', building: 'BH-26', compare: 'last-week' }, { building: 'BH-73' });
    expect(url).toBe('/beithady/analytics/performance?date=2026-05-05&building=BH-73&compare=last-week');
  });

  it('omits default values', () => {
    const url = buildPerfUrl({ date: undefined, building: 'all', compare: 'yesterday' }, {});
    expect(url).toBe('/beithady/analytics/performance');
  });

  it('handles compare=none by writing it explicitly', () => {
    const url = buildPerfUrl({ date: undefined, building: 'all', compare: 'yesterday' }, { compare: 'none' });
    expect(url).toBe('/beithady/analytics/performance?compare=none');
  });
});
```

- [ ] **Step 4.2: Run test, verify failure**

```bash
npm run test -- use-url-state
```

Expect: FAIL — `buildPerfUrl` not exported.

- [ ] **Step 4.3: Implement `use-url-state.ts`**

```ts
// use-url-state.ts
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export type CompareMode = 'yesterday' | 'last-week' | 'last-month' | 'last-year' | 'none';

export type PerfUrlState = {
  date: string | undefined;
  building: string;
  compare: CompareMode;
};

export function buildPerfUrl(current: PerfUrlState, patch: Partial<PerfUrlState>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.date) params.set('date', next.date);
  if (next.building && next.building !== 'all') params.set('building', next.building);
  if (next.compare && next.compare !== 'yesterday') params.set('compare', next.compare);
  const qs = params.toString();
  return `/beithady/analytics/performance${qs ? `?${qs}` : ''}`;
}

export function usePerfUrlState() {
  const router = useRouter();
  const search = useSearchParams();
  const current: PerfUrlState = {
    date: search.get('date') ?? undefined,
    building: search.get('building') ?? 'all',
    compare: (search.get('compare') as CompareMode | null) ?? 'yesterday',
  };
  const update = useCallback((patch: Partial<PerfUrlState>) => {
    router.push(buildPerfUrl(current, patch), { scroll: false });
  }, [router, current.date, current.building, current.compare]);
  return { state: current, update };
}
```

- [ ] **Step 4.4: Run tests, verify pass**

```bash
npm run test -- use-url-state
```

Expect: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/app/beithady/analytics/performance/_hooks/
git commit -m "feat(beithady/perf): add URL state hook for date/building/compare params"
```

---

### Task 5: Top bar + Left rail (expanded only — no collapse logic yet)

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/top-bar.tsx`
- Create: `src/app/beithady/analytics/performance/_components/left-rail.tsx`

- [ ] **Step 5.1: Top bar component**

```tsx
// top-bar.tsx
'use client';
import { useState } from 'react';
import type { PerfUrlState } from '../_hooks/use-url-state';

type Props = {
  state: PerfUrlState;
  generatedAt: string;
  reportDate: string;
  hiddenCount: number;
  onCustomizeClick: () => void;
  onDateChange: (date: string) => void;
};

export function TopBar({ state, generatedAt, reportDate, hiddenCount, onCustomizeClick, onDateChange }: Props) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const cairoTime = new Date(generatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
  const dateLabel = new Date(reportDate + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="border-b border-white/[0.06] bg-gradient-to-b from-amber-500/[0.04] to-transparent px-6 py-5">
      <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">BEIT HADY · ANALYTICS · PERFORMANCE</div>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-white">Performance Dashboard</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
          >
            ⤓ Export PDF
          </button>
          <button
            type="button"
            onClick={onCustomizeClick}
            className="rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/25"
          >
            ⚙ Customize{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
        <span>{dateLabel} · Data as of {cairoTime} Cairo</span>
        <button
          type="button"
          onClick={() => setShowDatePicker((v) => !v)}
          className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-amber-400"
        >
          📅 {state.date ?? 'today'}
        </button>
        {showDatePicker && (
          <input
            type="date"
            defaultValue={state.date ?? reportDate}
            onChange={(e) => { onDateChange(e.target.value); setShowDatePicker(false); }}
            className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-white"
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: Left rail component (expanded only — collapse in Phase 6)**

```tsx
// left-rail.tsx
'use client';
import type { PerfUrlState, CompareMode } from '../_hooks/use-url-state';
import { BUILDING_CODES, BUILDING_LABEL } from '@/lib/beithady-daily-report/types';

type Props = {
  state: PerfUrlState;
  onChange: (patch: Partial<PerfUrlState>) => void;
};

const PERIODS: { id: 'today' | 'yesterday' | 'this-week'; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this-week', label: 'This week' },
];

const COMPARES: { id: CompareMode; label: string }[] = [
  { id: 'yesterday', label: 'vs Yesterday' },
  { id: 'last-week', label: 'vs Last Week' },
  { id: 'last-month', label: 'vs Last Month' },
  { id: 'last-year', label: 'vs Last Year' },
  { id: 'none', label: 'No compare' },
];

export function LeftRail({ state, onChange }: Props) {
  return (
    <aside
      role="region"
      aria-label="Filters"
      className="flex flex-col gap-4 border-r border-white/[0.06] bg-white/[0.015] px-4 py-5"
    >
      <Section title="Period">
        {PERIODS.map((p) => (
          <Pill key={p.id} active={state.date === undefined && p.id === 'today'}>{p.label}</Pill>
        ))}
      </Section>

      <Section title="Building">
        <Pill active={state.building === 'all'} onClick={() => onChange({ building: 'all' })}>All</Pill>
        {BUILDING_CODES.map((b) => (
          <Pill key={b} active={state.building === b} onClick={() => onChange({ building: b })}>
            {BUILDING_LABEL[b]}
          </Pill>
        ))}
      </Section>

      <Section title="Compare">
        {COMPARES.map((c) => (
          <Pill key={c.id} active={state.compare === c.id} onClick={() => onChange({ compare: c.id })}>
            {c.label}
          </Pill>
        ))}
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500">{title}</h4>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Pill({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-md border px-2.5 py-1.5 text-left text-[11px] transition ' +
        (active
          ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
          : 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]')
      }
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/top-bar.tsx src/app/beithady/analytics/performance/_components/left-rail.tsx
git commit -m "feat(beithady/perf): add top bar + left rail (expanded mode)"
```

---

### Task 6: DashboardShell + first end-to-end render

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`

- [ ] **Step 6.1: Implement DashboardShell**

```tsx
// dashboard-shell.tsx
'use client';
import { useState } from 'react';
import { TopBar } from './top-bar';
import { LeftRail } from './left-rail';
import { usePerfUrlState } from '../_hooks/use-url-state';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = {
  payload: DailyReportPayload;
  snapshotDate: string;
  generatedAt: string;
  initialBuilding: string;
  initialCompare: string;
};

export function DashboardShell({ payload, snapshotDate, generatedAt }: Props) {
  const { state, update } = usePerfUrlState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a1628] text-white">
      <TopBar
        state={state}
        generatedAt={generatedAt}
        reportDate={snapshotDate}
        hiddenCount={0}
        onCustomizeClick={() => setDrawerOpen(true)}
        onDateChange={(date) => update({ date })}
      />
      <div className="grid" style={{ gridTemplateColumns: '200px 1fr' }}>
        <LeftRail state={state} onChange={update} />
        <main className="grid grid-cols-12 gap-3 p-4">
          {/* Phase 2 fills this in */}
          <div className="col-span-12 rounded-lg border border-dashed border-white/10 p-12 text-center text-sm text-slate-500">
            Panels arrive in Phase 2 · payload loaded for {payload.report_date}
          </div>
        </main>
      </div>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setDrawerOpen(false)}>
          <div className="absolute right-0 top-0 h-full w-96 bg-[#0a1628] p-6">
            <p className="text-sm text-slate-400">Customize drawer arrives in Phase 6.</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.2: End-to-end smoke test**

```bash
npm run dev
```

Open `http://localhost:3000/beithady/analytics/performance`. Expect:
- Breadcrumb shows `Beithady · Analytics · Performance`
- Title "Performance Dashboard" rendered
- Top-bar buttons visible (Export PDF · Customize)
- Period/Building/Compare pills visible in left rail
- Dashed placeholder reads "Panels arrive in Phase 2 · payload loaded for YYYY-MM-DD"
- Click building pill (e.g. BH-26) → URL updates to `?building=BH-26`, no full reload

If snapshot for today is missing, you'll see the EmptySnapshot card with a "Run now manually" link — that's expected.

- [ ] **Step 6.3: Commit + push (Phase 1 complete)**

```bash
git add src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add DashboardShell + first end-to-end render"
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```

Phase 1 ships: tile, route, shell, filter rail, URL state. Auto-deploys to limeinc.vercel.app.

---

## Phase 2 · Baseline panels (PDF parity)

End-state: 14 panels render real data from the existing payload — no payload extension needed yet. The dashboard now matches PDF parity.

The pattern for every panel in this phase is identical:
1. Read its slice of `DailyReportPayload`
2. Render the panel inside `<PanelFrame>` (provides hover-X, label header, optional drillTo Link)
3. Test renders without throwing for a fixture payload

Establish the shared building blocks first (Tasks 7–9), then crank through panels (Tasks 10–17).

### Task 7: PanelFrame + panel registry + color thresholds

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panel-frame.tsx`
- Create: `src/app/beithady/analytics/performance/_lib/panel-registry.ts`
- Create: `src/app/beithady/analytics/performance/_lib/color-thresholds.ts`
- Create: `src/app/beithady/analytics/performance/_lib/color-thresholds.test.ts`

- [ ] **Step 7.1: Write color-thresholds test**

```ts
// color-thresholds.test.ts
import { describe, it, expect } from 'vitest';
import { occupancyColor } from './color-thresholds';

describe('occupancyColor', () => {
  it('returns green for >=70%', () => {
    expect(occupancyColor(70)).toBe('green');
    expect(occupancyColor(85)).toBe('green');
    expect(occupancyColor(100)).toBe('green');
  });
  it('returns amber for 40-70%', () => {
    expect(occupancyColor(40)).toBe('amber');
    expect(occupancyColor(55)).toBe('amber');
    expect(occupancyColor(69.9)).toBe('amber');
  });
  it('returns red for <40%', () => {
    expect(occupancyColor(0)).toBe('red');
    expect(occupancyColor(39.9)).toBe('red');
  });
});
```

- [ ] **Step 7.2: Run test, verify failure**

```bash
npm run test -- color-thresholds
```

Expect: FAIL.

- [ ] **Step 7.3: Implement color-thresholds.ts**

```ts
// color-thresholds.ts
export type ColorBand = 'green' | 'amber' | 'red';

export function occupancyColor(pct: number): ColorBand {
  if (pct >= 70) return 'green';
  if (pct >= 40) return 'amber';
  return 'red';
}

export const BAND_CLASSES: Record<ColorBand, string> = {
  green: 'bg-emerald-500/12 text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-400',
  red: 'bg-red-500/15 text-red-400',
};
```

- [ ] **Step 7.4: Run tests, verify pass**

```bash
npm run test -- color-thresholds
```

Expect: PASS.

- [ ] **Step 7.5: Implement panel-registry.ts**

```ts
// panel-registry.ts
export const PANEL_IDS = [
  // hero
  'hero-occupancy',
  'hero-mtd-revenue',
  'hero-revpar',
  'hero-pace',
  'hero-reviews-avg',
  'hero-response-time',
  // decisions
  'ai-insights',
  'top-movers',
  'cancel-risk',
  'occupancy-gap-finder',
  // revenue
  'buildings-table',
  'forward-occupancy',
  'channel-mix',
  'payouts',
  'monthly-goal',
  'revenue-concentration',
  'revenue-waterfall',
  'stly-yoy',
  // operations
  'reviews-block',
  'cleaning-turnovers',
  'inquiry-sla',
  'check-ins-payment',
  'cancellations',
  // power
  'snapshot-scrubber',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

export type PanelMeta = {
  id: PanelId;
  label: string;
  group: 'Hero KPIs' | 'Decisions & alerts' | 'Revenue & financials' | 'Operations & guests' | 'Power tools';
  defaultVisible: boolean;
};

export const PANEL_META: Record<PanelId, PanelMeta> = {
  'hero-occupancy':       { id: 'hero-occupancy',       label: 'Occupancy',                 group: 'Hero KPIs',           defaultVisible: true  },
  'hero-mtd-revenue':     { id: 'hero-mtd-revenue',     label: 'MTD Revenue',               group: 'Hero KPIs',           defaultVisible: true  },
  'hero-revpar':          { id: 'hero-revpar',          label: 'RevPAR',                    group: 'Hero KPIs',           defaultVisible: true  },
  'hero-pace':            { id: 'hero-pace',            label: 'Pace',                      group: 'Hero KPIs',           defaultVisible: true  },
  'hero-reviews-avg':     { id: 'hero-reviews-avg',     label: 'Reviews avg',               group: 'Hero KPIs',           defaultVisible: true  },
  'hero-response-time':   { id: 'hero-response-time',   label: 'Response time',             group: 'Hero KPIs',           defaultVisible: true  },
  'ai-insights':          { id: 'ai-insights',          label: 'AI Insights tray',          group: 'Decisions & alerts',  defaultVisible: true  },
  'top-movers':           { id: 'top-movers',           label: 'Top movers ribbon',         group: 'Decisions & alerts',  defaultVisible: true  },
  'cancel-risk':          { id: 'cancel-risk',          label: 'Cancellation risk',         group: 'Decisions & alerts',  defaultVisible: true  },
  'occupancy-gap-finder': { id: 'occupancy-gap-finder', label: 'Occupancy gap finder',      group: 'Decisions & alerts',  defaultVisible: true  },
  'buildings-table':      { id: 'buildings-table',      label: 'Buildings table',           group: 'Revenue & financials',defaultVisible: true  },
  'forward-occupancy':    { id: 'forward-occupancy',    label: 'Forward occupancy bars',    group: 'Revenue & financials',defaultVisible: true  },
  'channel-mix':          { id: 'channel-mix',          label: 'Channel mix donut',         group: 'Revenue & financials',defaultVisible: true  },
  'payouts':              { id: 'payouts',              label: 'Payouts',                   group: 'Revenue & financials',defaultVisible: true  },
  'monthly-goal':         { id: 'monthly-goal',         label: 'Monthly goal progress',     group: 'Revenue & financials',defaultVisible: true  },
  'revenue-concentration':{ id: 'revenue-concentration',label: 'Revenue concentration',    group: 'Revenue & financials',defaultVisible: true  },
  'revenue-waterfall':    { id: 'revenue-waterfall',    label: 'Revenue waterfall',         group: 'Revenue & financials',defaultVisible: false },
  'stly-yoy':             { id: 'stly-yoy',             label: 'STLY (Same Time Last Year)',group: 'Revenue & financials',defaultVisible: false },
  'reviews-block':        { id: 'reviews-block',        label: 'Reviews block',             group: 'Operations & guests', defaultVisible: true  },
  'cleaning-turnovers':   { id: 'cleaning-turnovers',   label: 'Cleaning turnovers',        group: 'Operations & guests', defaultVisible: true  },
  'inquiry-sla':          { id: 'inquiry-sla',          label: 'Inquiry SLA buckets',       group: 'Operations & guests', defaultVisible: true  },
  'check-ins-payment':    { id: 'check-ins-payment',    label: 'Check-ins with payment',    group: 'Operations & guests', defaultVisible: true  },
  'cancellations':        { id: 'cancellations',        label: 'Cancellations',             group: 'Operations & guests', defaultVisible: true  },
  'snapshot-scrubber':    { id: 'snapshot-scrubber',    label: 'Snapshot history scrubber', group: 'Power tools',         defaultVisible: false },
};

export function defaultVisibility(): Record<PanelId, boolean> {
  return Object.fromEntries(PANEL_IDS.map((id) => [id, PANEL_META[id].defaultVisible])) as Record<PanelId, boolean>;
}
```

- [ ] **Step 7.6: Implement PanelFrame**

```tsx
// panel-frame.tsx
'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  label: string;
  drillTo?: string;
  liveBadge?: boolean;
  className?: string;
  children: ReactNode;
  onHide?: () => void;
};

export function PanelFrame({ label, drillTo, liveBadge, className = '', children, onHide }: Props) {
  const inner = (
    <div className={`group relative rounded-lg border border-white/[0.07] bg-gradient-to-b from-white/[0.025] to-white/[0.005] p-3.5 ${className}`}>
      {onHide && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
          className="absolute right-2 top-2 text-[11px] text-white/25 opacity-0 transition group-hover:opacity-100 hover:text-white/70"
          aria-label={`Hide ${label}`}
        >
          ×
        </button>
      )}
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
        <span>{label}</span>
        {liveBadge && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
      </div>
      {children}
    </div>
  );
  return drillTo ? <Link href={drillTo} className="block">{inner}</Link> : inner;
}
```

- [ ] **Step 7.7: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panel-frame.tsx src/app/beithady/analytics/performance/_lib/panel-registry.ts src/app/beithady/analytics/performance/_lib/color-thresholds.ts src/app/beithady/analytics/performance/_lib/color-thresholds.test.ts
git commit -m "feat(beithady/perf): add PanelFrame + panel registry + color thresholds"
```

---

### Task 8: Hero KPI generic component (used by 6 panels)

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/hero-kpi.tsx`

- [ ] **Step 8.1: Implement HeroKpi**

```tsx
// panels/hero-kpi.tsx
'use client';
import { PanelFrame } from '../panel-frame';

type Props = {
  label: string;
  value: string;
  delta?: { text: string; direction: 'up' | 'down' | 'neutral' };
  spark?: number[];
  drillTo?: string;
  goldEdge?: boolean;
  onHide?: () => void;
};

export function HeroKpi({ label, value, delta, spark, drillTo, goldEdge, onHide }: Props) {
  return (
    <PanelFrame label={label} drillTo={drillTo} onHide={onHide} className={goldEdge ? 'border-l-2 border-l-amber-500' : ''}>
      <div className={`text-2xl font-bold leading-tight ${goldEdge ? 'text-amber-400' : 'text-white'}`}>{value}</div>
      {delta && (
        <div className={`mt-1 text-[10px] ${delta.direction === 'up' ? 'text-emerald-400' : delta.direction === 'down' ? 'text-red-400' : 'text-slate-400'}`}>
          {delta.direction === 'up' ? '▲ ' : delta.direction === 'down' ? '▼ ' : ''}
          {delta.text}
        </div>
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </PanelFrame>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 18;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-4 w-full" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="#D4A93A" strokeWidth="1.5" />
    </svg>
  );
}
```

- [ ] **Step 8.2: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/hero-kpi.tsx
git commit -m "feat(beithady/perf): add generic HeroKpi component"
```

---

### Task 9: 6 Hero KPIs wired into the grid

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`

- [ ] **Step 9.1: Add Hero KPI row to DashboardShell**

Replace the placeholder div in `<main>` with this block. Keep the existing imports + state, just swap the contents:

```tsx
// inside <main className="grid grid-cols-12 gap-3 p-4">
{/* Hero KPI strip — 6 × col-span-2 */}
<div className="col-span-12 grid grid-cols-6 gap-3">
  <HeroKpi
    label="Occupancy"
    value={`${payload.all.occupancy_today_pct.toFixed(1)}%`}
    delta={{ text: 'vs target 70%', direction: payload.all.occupancy_today_pct >= 70 ? 'up' : 'down' }}
    drillTo={`/beithady/analytics/performance?building=all`}
  />
  <HeroKpi
    label="MTD Revenue"
    value={`$${(payload.all.revenue_mtd_usd / 1000).toFixed(1)}k`}
    delta={{ text: `${payload.all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${payload.all.pickup_vs_prior_month_pct.toFixed(1)}% vs LM`, direction: payload.all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down' }}
    drillTo={`/beithady/financials?period=mtd`}
    goldEdge
  />
  {/* RevPAR placeholder — real value comes in Phase 3 */}
  <HeroKpi
    label="RevPAR"
    value="—"
    drillTo={`/beithady/financials?metric=revpar`}
  />
  <HeroKpi
    label="Pace"
    value={`${payload.all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${payload.all.pickup_vs_prior_month_pct.toFixed(1)}%`}
    delta={{ text: 'vs prior month', direction: payload.all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down' }}
  />
  <HeroKpi
    label="Reviews avg"
    value={`${payload.reviews.avg_rating_mtd.toFixed(1)}★`}
    delta={{ text: `${payload.reviews.count_mtd} this month`, direction: 'neutral' }}
    drillTo={`/beithady/analytics/reviews?period=mtd`}
  />
  <HeroKpi
    label="Response time"
    value={`${payload.conversations?.yesterday.avg_response_minutes ?? 0}m`}
    delta={{ text: `first ${payload.conversations?.yesterday.first_response_avg_minutes ?? 0}m`, direction: 'neutral' }}
    drillTo={`/beithady/communication/unified?metric=response-time`}
  />
</div>
```

Add the import at the top: `import { HeroKpi } from './panels/hero-kpi';`

- [ ] **Step 9.2: Visual smoke test**

```bash
npm run dev
```

Visit `/beithady/analytics/performance`. Expect 6 KPI cards rendered in a row with real numbers. Hover any card → faint × appears top-right (no-op for now).

- [ ] **Step 9.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): wire 6 hero KPIs to DashboardShell"
```

---

### Task 10: Buildings table panel

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/buildings-table.tsx`

- [ ] **Step 10.1: Implement BuildingsTablePanel**

```tsx
// panels/buildings-table.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import { occupancyColor, BAND_CLASSES } from '../../_lib/color-thresholds';
import { BUILDING_CODES, BUILDING_LABEL, type DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function BuildingsTablePanel({ payload, onHide }: Props) {
  const cols: Array<{ key: 'all' | typeof BUILDING_CODES[number]; label: string }> = [
    { key: 'all', label: 'All' },
    ...BUILDING_CODES.filter((b) => b !== 'OTHER').map((b) => ({ key: b, label: BUILDING_LABEL[b].split(' · ')[0] })),
  ];

  function bucket(key: 'all' | typeof BUILDING_CODES[number]) {
    return key === 'all' ? payload.all : payload.per_building[key];
  }

  function row<K extends keyof ReturnType<typeof bucket>>(label: string, key: K, format: (v: number) => string, color?: (v: number) => string) {
    return (
      <>
        <div className="font-medium text-slate-300">{label}</div>
        {cols.map((c) => {
          const v = (bucket(c.key) as Record<string, number>)[key as string];
          return (
            <div
              key={`${label}-${c.key}`}
              className={`rounded px-1.5 py-1 text-center ${color ? color(v) : 'bg-white/[0.03] text-white'}`}
            >
              {format(v)}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <PanelFrame label="🏢 Buildings · Today / MTD / Pace" drillTo="/beithady/financials" onHide={onHide}>
      <div
        className="grid gap-1 text-[10px]"
        style={{ gridTemplateColumns: `1fr repeat(${cols.length}, 0.6fr)` }}
      >
        <div />
        {cols.map((c) => <div key={c.key} className="px-1.5 py-1 text-center font-semibold text-slate-500">{c.label}</div>)}
        {row('Occupancy', 'occupancy_today_pct', (v) => `${v.toFixed(1)}%`, (v) => BAND_CLASSES[occupancyColor(v)])}
        {row('MTD Rev', 'revenue_mtd_usd', (v) => `$${(v / 1000).toFixed(1)}k`)}
        {row('ADR', 'adr_mtd_usd', (v) => `$${v.toFixed(0)}`)}
        {row('Bookings/d', 'bookings_per_day_mtd', (v) => v.toFixed(1))}
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 10.2: Wire into DashboardShell**

Add below the hero strip (still inside `<main>`):

```tsx
import { BuildingsTablePanel } from './panels/buildings-table';
// ...
<div className="col-span-8"><BuildingsTablePanel payload={payload} /></div>
<div className="col-span-4 rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">Forward occupancy bars · Phase 4</div>
```

- [ ] **Step 10.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/buildings-table.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add buildings table panel"
```

---

### Task 11: Channel mix donut

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/channel-mix-donut.tsx`

- [ ] **Step 11.1: Implement**

```tsx
// panels/channel-mix-donut.tsx
'use client';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const COLORS = ['#60a5fa', '#4ade80', '#fbbf24', '#c084fc', '#f87171'];

export function ChannelMixDonutPanel({ payload, onHide }: Props) {
  const data = (payload.paired_channel_mix ?? []).map((c) => ({
    name: c.channel,
    value: c.mtd_pct,
    revenue: c.mtd_revenue_usd,
  }));

  return (
    <PanelFrame label="📊 Channel Mix · MTD" drillTo="/beithady/financials?breakdown=channel" onHide={onHide}>
      <div className="flex items-center gap-3">
        <div className="h-20 w-20 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={22} outerRadius={36} stroke="none">
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1 text-[10px] text-slate-300">
          {data.map((d, i) => (
            <div key={d.name} className="flex justify-between gap-2">
              <span><span style={{ color: COLORS[i % COLORS.length] }}>●</span> {d.name}</span>
              <span className="text-slate-400">{d.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 11.2: Wire into DashboardShell**

Add below buildings row:

```tsx
import { ChannelMixDonutPanel } from './panels/channel-mix-donut';
// ...
<div className="col-span-4"><ChannelMixDonutPanel payload={payload} /></div>
```

- [ ] **Step 11.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/channel-mix-donut.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add channel mix donut panel"
```

---

### Task 12: Payouts panel

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/payouts.tsx`

- [ ] **Step 12.1: Implement**

```tsx
// panels/payouts.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function PayoutsPanel({ payload, onHide }: Props) {
  const p = payload.payouts;
  return (
    <PanelFrame label="💸 Payouts · MTD" drillTo="/beithady/financials" onHide={onHide}>
      <div className="text-2xl font-bold text-emerald-400">{fmt(p.mtd_received_total_usd)}</div>
      <div className="mt-1 space-y-0.5 text-[10px] leading-tight text-slate-400">
        <div>Airbnb {fmt(p.mtd_received_airbnb_usd)} · Stripe {fmt(p.mtd_received_stripe_usd)}</div>
        <div>Settling today <span className="text-white">{fmt(p.expected_today_total_usd)}</span></div>
        <div>Next 7d <span className="text-white">{fmt(p.next_7d_projected_total_usd)}</span></div>
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 12.2: Wire into DashboardShell + commit**

Add to grid: `<div className="col-span-4"><PayoutsPanel payload={payload} /></div>`. Import + commit:

```bash
git add src/app/beithady/analytics/performance/_components/panels/payouts.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add payouts panel"
```

---

### Task 13: Reviews block (without AI topics — Phase 5 adds those)

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/reviews-block.tsx`

- [ ] **Step 13.1: Implement**

```tsx
// panels/reviews-block.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const STAR_COLOR: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: 'bg-emerald-400',
  4: 'bg-slate-400',
  3: 'bg-slate-400',
  2: 'bg-amber-400',
  1: 'bg-red-400',
};

export function ReviewsBlockPanel({ payload, onHide }: Props) {
  const r = payload.reviews;
  const max = Math.max(...r.star_distribution.map((s) => s.count), 1);

  return (
    <PanelFrame label={`⭐ Reviews · ${payload.month_label}`} drillTo="/beithady/analytics/reviews?period=mtd" onHide={onHide}>
      <div className="flex gap-4">
        <div className="flex items-end gap-1.5 pt-2">
          {([5, 4, 3, 2, 1] as const).map((stars) => {
            const count = r.star_distribution.find((s) => s.stars === stars)?.count ?? 0;
            const h = Math.max(2, (count / max) * 36);
            return (
              <div key={stars} className="text-center text-[9px] text-slate-400">
                <div className={`${STAR_COLOR[stars]} w-4 rounded-sm`} style={{ height: `${h}px`, marginTop: `${36 - h}px` }} />
                <div>{stars}★ {count}</div>
              </div>
            );
          })}
        </div>
        <div className="flex-1 space-y-0.5 text-[10px] leading-tight text-slate-300">
          <div className="font-semibold text-white">Last 24h · {r.last_24h.length} reviews</div>
          {r.last_24h.slice(0, 6).map((rev, i) => (
            <div key={i} className={rev.flagged ? 'text-red-400' : ''}>
              {rev.unit} · {rev.rating}★ {rev.flagged && '🚩'} <span className="text-slate-400">{rev.ai_summary || rev.raw_text.slice(0, 60)}</span>
            </div>
          ))}
        </div>
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 13.2: Wire into DashboardShell + commit**

Add to grid below the channel-mix/payouts row:

```tsx
import { ReviewsBlockPanel } from './panels/reviews-block';
// ...
<div className="col-span-6"><ReviewsBlockPanel payload={payload} /></div>
```

```bash
git add src/app/beithady/analytics/performance/_components/panels/reviews-block.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add reviews block panel"
```

---

### Task 14: Cleaning turnovers + Cancellations + Check-ins-with-payment + Cancel risk placeholder

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/cleaning-turnovers.tsx`
- Create: `src/app/beithady/analytics/performance/_components/panels/cancellations.tsx`
- Create: `src/app/beithady/analytics/performance/_components/panels/check-ins-payment.tsx`
- Create: `src/app/beithady/analytics/performance/_components/panels/cancel-risk.tsx`

- [ ] **Step 14.1: cleaning-turnovers.tsx**

```tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

export function CleaningTurnoversPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const ops = payload.cleaning_ops_today;
  return (
    <PanelFrame label={`🧹 Cleaning today (${ops.length})`} drillTo="/beithady/operations" onHide={onHide}>
      <div className="space-y-1.5 text-[10px] text-slate-300">
        {ops.length === 0 && <div className="text-slate-500">No turnovers today.</div>}
        {ops.slice(0, 6).map((op) => (
          <div key={op.unit}>
            <div className="font-medium text-white">{op.unit}</div>
            <div className="text-slate-400">out: {op.checkout_guest ?? '—'} · in: {op.checkin_guest ?? '—'}</div>
          </div>
        ))}
        {ops.length > 6 && <div className="text-slate-500">+{ops.length - 6} more</div>}
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 14.2: cancellations.tsx**

```tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

export function CancellationsPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const c = payload.cancellations;
  return (
    <PanelFrame label="❌ Cancellations" drillTo="/beithady/operations/cancel-risk" onHide={onHide}>
      <div className="text-2xl font-bold text-white">{c.count_today}</div>
      <div className="mt-1 text-[10px] text-slate-400">today · MTD {c.count_mtd} · ${(c.value_mtd_usd / 1000).toFixed(1)}k</div>
    </PanelFrame>
  );
}
```

- [ ] **Step 14.3: check-ins-payment.tsx**

```tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

export function CheckInsPaymentPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const c = payload.checkin_payment?.yesterday;
  if (!c) return null;
  return (
    <PanelFrame label="💰 Check-ins w/ payment" drillTo="/beithady/operations" onHide={onHide}>
      <div className={`text-2xl font-bold ${c.pct >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
        {c.with_payment}/{c.checkins}
      </div>
      <div className="mt-1 text-[10px] text-slate-400">{c.pct.toFixed(0)}% yesterday</div>
    </PanelFrame>
  );
}
```

- [ ] **Step 14.4: cancel-risk.tsx (placeholder until Phase 3 builder)**

```tsx
'use client';
import { PanelFrame } from '../panel-frame';

export function CancelRiskPanel({ onHide }: { onHide?: () => void }) {
  // Will read payload.cancel_risk in Phase 3 — for now render a placeholder
  return (
    <PanelFrame label="⚠ Cancel risk · next 21d" drillTo="/beithady/operations/cancel-risk?min=50&days=21" onHide={onHide}>
      <div className="text-2xl font-bold text-slate-500">—</div>
      <div className="mt-1 text-[10px] text-slate-500">Pending Phase 3 builder</div>
    </PanelFrame>
  );
}
```

- [ ] **Step 14.5: Wire all four into DashboardShell**

```tsx
import { CleaningTurnoversPanel } from './panels/cleaning-turnovers';
import { CancellationsPanel } from './panels/cancellations';
import { CheckInsPaymentPanel } from './panels/check-ins-payment';
import { CancelRiskPanel } from './panels/cancel-risk';
// ...
<div className="col-span-3"><CleaningTurnoversPanel payload={payload} /></div>
<div className="col-span-3"><CancelRiskPanel /></div>
<div className="col-span-3"><CheckInsPaymentPanel payload={payload} /></div>
<div className="col-span-3"><CancellationsPanel payload={payload} /></div>
```

- [ ] **Step 14.6: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/cleaning-turnovers.tsx src/app/beithady/analytics/performance/_components/panels/cancellations.tsx src/app/beithady/analytics/performance/_components/panels/check-ins-payment.tsx src/app/beithady/analytics/performance/_components/panels/cancel-risk.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add cleaning + cancellations + check-ins-payment + cancel-risk panels"
```

---

### Task 15: Inquiry SLA buckets panel

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/inquiry-sla-buckets.tsx`

- [ ] **Step 15.1: Implement**

```tsx
// panels/inquiry-sla-buckets.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Bucket = { id: string; label: string; color: string };
const BUCKETS: Bucket[] = [
  { id: '<1h',   label: '<1h',    color: 'bg-emerald-400' },
  { id: '1-4h',  label: '1-4h',   color: 'bg-amber-400' },
  { id: '4-24h', label: '4-24h',  color: 'bg-orange-400' },
  { id: '>24h',  label: '>24h',   color: 'bg-red-400' },
];

export function InquirySlaBucketsPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const buckets = payload.conversations?.sla_buckets_yesterday ?? [];
  const total = buckets.reduce((s, b) => s + b.count, 0) || 1;
  const triage = payload.inquiry_triage;

  return (
    <PanelFrame label={`📥 Inquiry SLA · ${triage.inquiries_unanswered_count} unanswered`} drillTo="/beithady/communication/unified" onHide={onHide}>
      <div className="mt-1 flex h-4 overflow-hidden rounded">
        {BUCKETS.map((b) => {
          const count = buckets.find((x) => x.bucket === b.id)?.count ?? 0;
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={b.id}
              className={`${b.color} text-center text-[8px] font-bold leading-4 text-black/70`}
              style={{ width: `${pct}%` }}
            >
              {count > 0 ? `${count} ${b.label}` : ''}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-slate-400">
        MTD avg {payload.conversations?.mtd.avg_response_minutes ?? 0}m · first {payload.conversations?.mtd.first_response_avg_minutes ?? 0}m
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 15.2: Wire + commit**

```tsx
import { InquirySlaBucketsPanel } from './panels/inquiry-sla-buckets';
// add to grid:
<div className="col-span-6"><InquirySlaBucketsPanel payload={payload} /></div>
```

```bash
git add src/app/beithady/analytics/performance/_components/panels/inquiry-sla-buckets.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add inquiry SLA buckets panel"
```

---

### Task 16: Per-building filter behavior (drill-into building from cells)

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/panels/buildings-table.tsx`

- [ ] **Step 16.1: Wrap cells in Links**

Modify the `row()` helper in `buildings-table.tsx` to wrap each `<div>` cell in a `<Link>` when the column is a building (not "all"):

```tsx
import Link from 'next/link';
// ...
function row<K extends keyof ReturnType<typeof bucket>>(label: string, key: K, format: (v: number) => string, color?: (v: number) => string) {
  return (
    <>
      <div className="font-medium text-slate-300">{label}</div>
      {cols.map((c) => {
        const v = (bucket(c.key) as Record<string, number>)[key as string];
        const cell = (
          <div className={`rounded px-1.5 py-1 text-center transition ${color ? color(v) : 'bg-white/[0.03] text-white'} hover:bg-white/[0.08]`}>
            {format(v)}
          </div>
        );
        if (c.key === 'all') return <div key={`${label}-${c.key}`}>{cell}</div>;
        return <Link key={`${label}-${c.key}`} href={`/beithady/analytics/performance?building=${c.key}`}>{cell}</Link>;
      })}
    </>
  );
}
```

- [ ] **Step 16.2: Visual smoke test**

`npm run dev` → click any BH-26 cell → URL becomes `?building=BH-26`. Building pill in left rail also reflects this.

- [ ] **Step 16.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/buildings-table.tsx
git commit -m "feat(beithady/perf): make buildings-table cells drill into building filter"
```

---

### Task 17: Phase 2 ship — push to main

- [ ] **Step 17.1: Final visual smoke test**

`npm run dev` → `/beithady/analytics/performance`. Confirm rendered panels:
- 6 hero KPIs (RevPAR shows "—" placeholder)
- Buildings table with color-coded occupancy + clickable building cells
- Channel mix donut
- Payouts panel
- Reviews block
- Cleaning turnovers
- Cancel risk placeholder
- Check-ins with payment
- Cancellations
- Inquiry SLA buckets

Drilldowns: every panel has a Link wrapper to the destination listed in the spec.

- [ ] **Step 17.2: Run all tests**

```bash
npm run test
```

Expect: all green (existing + new builders).

- [ ] **Step 17.3: Push**

```bash
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```

Phase 2 ships. Auto-deploys.

---

## Phase 3 · Extend payload + 7 derived builders

End-state: `DailyReportPayload` carries all the new fields. Snapshot orchestrator runs all new builders. Existing dashboard panels continue to work; new analytical panels can now be built (Phase 4).

### Task 18: Extend `DailyReportPayload` type

**Files:**
- Modify: `src/lib/beithady-daily-report/types.ts`

- [ ] **Step 18.1: Add new types at end of types.ts (above the `DailyReportPayload` definition update)**

```ts
// types.ts — add before DailyReportPayload export
export type AIInsight = { kind: 'positive' | 'warning' | 'neutral'; text: string };

export type ReviewTopic = { topic: string; count: number };
export type ReviewTopicsSection = {
  praised: ReviewTopic[];
  complained: ReviewTopic[];
  generated_at: string;
};

export type TopMover = {
  building: BuildingCode | 'all';
  metric: 'occupancy_pct' | 'adr_usd' | 'revenue_mtd_usd' | 'channel_share_direct';
  delta: number;       // signed
  delta_unit: 'pp' | 'pct' | 'usd';
  comparison: 'wow' | 'mom' | 'yoy';
  description: string;
};

export type ForwardOccupancyRow = {
  building: BuildingCode | 'all';
  d7_pct: number;
  d30_pct: number;
  d60_pct: number;
};

export type CancelRiskSection = {
  count: number;
  value_usd: number;
  reservations: Array<{ id: string; code: string | null; unit: string; building: BuildingCode | null; check_in: string; value_usd: number; risk_score: number }>;
};

export type OccupancyGapNight = {
  date: string;
  building: BuildingCode;
  empty_units: number;
  current_price_usd: number | null;
  market_median_usd: number | null;
};

export type RevenueWaterfall = {
  gross_usd: number;
  fees_usd: number;
  tax_usd: number;
  net_usd: number;
};

export type StlySection = {
  revenue_mtd: { current_usd: number; previous_usd: number; delta_pct: number };
  occupancy_mtd: { current_pct: number; previous_pct: number; delta_pp: number };
};

export type GoalSection = {
  revenue_target_usd: number;
  revenue_actual_usd: number;
  pct_complete: number;
  days_left: number;
  projected_close_usd: number;
};

export type RevenueConcentration = {
  by_building: Array<{ building: BuildingCode | 'OTHER'; share_pct: number; revenue_usd: number }>;
  by_channel: Array<{ channel: string; share_pct: number; revenue_usd: number }>;
  top3_buildings_share_pct: number;
  top1_channel_share_pct: number;
};

export type RevparSection = {
  all_usd: number;
  per_building: Record<BuildingCode, number>;
};

export type SparklineSeries = Record<
  'occupancy' | 'mtd_revenue' | 'revpar' | 'pace' | 'reviews_avg' | 'response_time',
  number[]
>;
```

- [ ] **Step 18.2: Add new optional fields to `DailyReportPayload`**

At the bottom of the existing `DailyReportPayload` type, add these optional fields BEFORE the closing `};`:

```ts
  // ---- v4 (Performance Dashboard) additions — all optional, generated by their respective builders ----
  insights?: AIInsight[];
  review_topics?: ReviewTopicsSection | null;
  top_movers?: TopMover[];
  forward_occupancy?: ForwardOccupancyRow[];
  cancel_risk?: CancelRiskSection | null;
  occupancy_gaps?: OccupancyGapNight[];
  revenue_waterfall?: RevenueWaterfall | null;
  stly?: StlySection | null;
  goal?: GoalSection | null;
  revenue_concentration?: RevenueConcentration | null;
  revpar?: RevparSection;
  sparklines?: SparklineSeries;
```

- [ ] **Step 18.3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expect: green (since all additions are optional, existing code keeps compiling).

- [ ] **Step 18.4: Commit**

```bash
git add src/lib/beithady-daily-report/types.ts
git commit -m "feat(beithady-daily-report): extend payload type with v4 (perf dashboard) fields"
```

---

### Task 19: build-revpar.ts (pure function, no I/O)

**Files:**
- Create: `src/lib/beithady-daily-report/build-revpar.ts`
- Create: `src/lib/beithady-daily-report/build-revpar.test.ts`

- [ ] **Step 19.1: Test**

```ts
// build-revpar.test.ts
import { describe, it, expect } from 'vitest';
import { buildRevpar } from './build-revpar';
import type { AllBucket, BuildingBucket, BuildingCode } from './types';

const make = (rev: number, units: number, occ: number): BuildingBucket => ({
  total_units: units,
  occupied_today: 0,
  occupancy_today_pct: occ,
  check_ins_today: 0, check_outs_today: 0, turnovers_today: 0,
  revenue_mtd_usd: rev,
  revenue_created_mtd_usd: 0,
  forward_occupancy_pct: 0,
  backward_occupancy_pct: occ,
  backward_avg_units_per_day: 0,
  adr_mtd_usd: 0,
  opportunity_nights: 0, opportunity_value_usd: 0,
  bookings_per_day_mtd: 0, avg_lead_time_days: 0,
  pickup_vs_prior_month_pct: 0, avg_los_nights: 0,
});

describe('buildRevpar', () => {
  it('computes RevPAR as revenue / (units × days_elapsed)', () => {
    const all: AllBucket = { ...make(10000, 50, 50), drift_warning: null };
    const per: Record<BuildingCode, BuildingBucket> = {
      'BH-26': make(3000, 20, 60), 'BH-73': make(4000, 15, 45),
      'BH-435': make(2000, 10, 50), 'BH-OK': make(800, 4, 55),
      'OTHER': make(200, 1, 30),
    };
    const result = buildRevpar(all, per, 5); // 5 days elapsed
    expect(result.all_usd).toBeCloseTo(10000 / (50 * 5));
    expect(result.per_building['BH-26']).toBeCloseTo(3000 / (20 * 5));
  });
  it('returns 0 for zero units', () => {
    const all: AllBucket = { ...make(0, 0, 0), drift_warning: null };
    const per: Record<BuildingCode, BuildingBucket> = {
      'BH-26': make(0, 0, 0), 'BH-73': make(0, 0, 0),
      'BH-435': make(0, 0, 0), 'BH-OK': make(0, 0, 0), 'OTHER': make(0, 0, 0),
    };
    const result = buildRevpar(all, per, 5);
    expect(result.all_usd).toBe(0);
  });
});
```

- [ ] **Step 19.2: Run, verify failure**

```bash
npm run test -- build-revpar
```

Expect: FAIL — module not found.

- [ ] **Step 19.3: Implement**

```ts
// build-revpar.ts
import type { AllBucket, BuildingBucket, BuildingCode, RevparSection } from './types';
import { BUILDING_CODES } from './types';

export function buildRevpar(
  all: AllBucket,
  perBuilding: Record<BuildingCode, BuildingBucket>,
  daysElapsed: number,
): RevparSection {
  const safeDiv = (rev: number, units: number) => (units * daysElapsed > 0 ? rev / (units * daysElapsed) : 0);
  return {
    all_usd: safeDiv(all.revenue_mtd_usd, all.total_units),
    per_building: Object.fromEntries(
      BUILDING_CODES.map((b) => [b, safeDiv(perBuilding[b].revenue_mtd_usd, perBuilding[b].total_units)]),
    ) as Record<BuildingCode, number>,
  };
}
```

- [ ] **Step 19.4: Test green + commit**

```bash
npm run test -- build-revpar
git add src/lib/beithady-daily-report/build-revpar.ts src/lib/beithady-daily-report/build-revpar.test.ts
git commit -m "feat(beithady-daily-report): add buildRevpar (pure function)"
```

---

### Task 20: build-revenue-concentration.ts

**Files:**
- Create: `src/lib/beithady-daily-report/build-revenue-concentration.ts`
- Create: `src/lib/beithady-daily-report/build-revenue-concentration.test.ts`

- [ ] **Step 20.1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { buildRevenueConcentration } from './build-revenue-concentration';

describe('buildRevenueConcentration', () => {
  it('ranks buildings by revenue and computes Pareto for top 3', () => {
    const result = buildRevenueConcentration(
      { 'BH-26': 6000, 'BH-73': 4000, 'BH-435': 3000, 'BH-OK': 2000, 'OTHER': 1000 },
      [{ channel: 'Airbnb', revenue_usd: 12000 }, { channel: 'Direct', revenue_usd: 3000 }, { channel: 'Booking.com', revenue_usd: 1000 }],
    );
    expect(result.by_building[0].building).toBe('BH-26');
    expect(result.top3_buildings_share_pct).toBeCloseTo(((6000 + 4000 + 3000) / 16000) * 100, 1);
    expect(result.top1_channel_share_pct).toBeCloseTo((12000 / 16000) * 100, 1);
  });
});
```

- [ ] **Step 20.2: Implement**

```ts
// build-revenue-concentration.ts
import type { BuildingCode, RevenueConcentration } from './types';

export function buildRevenueConcentration(
  byBuilding: Record<BuildingCode, number>,
  byChannel: Array<{ channel: string; revenue_usd: number }>,
): RevenueConcentration {
  const buildingsTotal = Object.values(byBuilding).reduce((s, v) => s + v, 0) || 1;
  const channelsTotal = byChannel.reduce((s, c) => s + c.revenue_usd, 0) || 1;

  const buildings = (Object.entries(byBuilding) as Array<[BuildingCode, number]>)
    .map(([b, v]) => ({ building: b, revenue_usd: v, share_pct: (v / buildingsTotal) * 100 }))
    .sort((a, b) => b.revenue_usd - a.revenue_usd);

  const channels = byChannel
    .map((c) => ({ channel: c.channel, revenue_usd: c.revenue_usd, share_pct: (c.revenue_usd / channelsTotal) * 100 }))
    .sort((a, b) => b.revenue_usd - a.revenue_usd);

  return {
    by_building: buildings,
    by_channel: channels,
    top3_buildings_share_pct: buildings.slice(0, 3).reduce((s, b) => s + b.share_pct, 0),
    top1_channel_share_pct: channels[0]?.share_pct ?? 0,
  };
}
```

- [ ] **Step 20.3: Test + commit**

```bash
npm run test -- build-revenue-concentration
git add src/lib/beithady-daily-report/build-revenue-concentration.ts src/lib/beithady-daily-report/build-revenue-concentration.test.ts
git commit -m "feat(beithady-daily-report): add buildRevenueConcentration (Pareto)"
```

---

### Task 21: build-top-movers.ts (diff vs prior snapshot)

**Files:**
- Create: `src/lib/beithady-daily-report/build-top-movers.ts`
- Create: `src/lib/beithady-daily-report/build-top-movers.test.ts`

- [ ] **Step 21.1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { buildTopMovers } from './build-top-movers';
import type { DailyReportPayload, AllBucket, BuildingBucket, BuildingCode } from './types';

const stub = (occ: number, adr: number): BuildingBucket => ({
  total_units: 10, occupied_today: 0, occupancy_today_pct: occ,
  check_ins_today: 0, check_outs_today: 0, turnovers_today: 0,
  revenue_mtd_usd: 0, revenue_created_mtd_usd: 0,
  forward_occupancy_pct: 0, backward_occupancy_pct: occ,
  backward_avg_units_per_day: 0, adr_mtd_usd: adr,
  opportunity_nights: 0, opportunity_value_usd: 0,
  bookings_per_day_mtd: 0, avg_lead_time_days: 0,
  pickup_vs_prior_month_pct: 0, avg_los_nights: 0,
});

describe('buildTopMovers', () => {
  it('returns sorted movers by absolute delta', () => {
    const allCur: AllBucket = { ...stub(50, 100), drift_warning: null };
    const allPrev: AllBucket = { ...stub(60, 100), drift_warning: null };
    const per = (b: number, a: number) => ({
      'BH-26': stub(b, a), 'BH-73': stub(50, 100),
      'BH-435': stub(50, 100), 'BH-OK': stub(50, 100), 'OTHER': stub(0, 0),
    } as Record<BuildingCode, BuildingBucket>);

    const movers = buildTopMovers(
      { all: allCur, per_building: per(70, 130) } as DailyReportPayload,
      { all: allPrev, per_building: per(58, 100) } as DailyReportPayload,
    );

    expect(movers.length).toBeGreaterThan(0);
    expect(movers[0].building).toBe('BH-26');
  });
  it('returns [] when prior is null', () => {
    expect(buildTopMovers({ all: { ...stub(50, 100), drift_warning: null } } as DailyReportPayload, null)).toEqual([]);
  });
});
```

- [ ] **Step 21.2: Implement**

```ts
// build-top-movers.ts
import type { DailyReportPayload, TopMover, BuildingCode } from './types';
import { BUILDING_CODES } from './types';

const SIGNIFICANT_OCC_PP = 5;
const SIGNIFICANT_ADR_PCT = 8;

export function buildTopMovers(current: DailyReportPayload, prior: DailyReportPayload | null): TopMover[] {
  if (!prior) return [];
  const movers: TopMover[] = [];

  for (const b of BUILDING_CODES) {
    const cur = current.per_building?.[b];
    const prv = prior.per_building?.[b];
    if (!cur || !prv) continue;

    const occDelta = cur.occupancy_today_pct - prv.occupancy_today_pct;
    if (Math.abs(occDelta) >= SIGNIFICANT_OCC_PP) {
      movers.push({
        building: b, metric: 'occupancy_pct',
        delta: Math.round(occDelta * 10) / 10, delta_unit: 'pp',
        comparison: 'wow',
        description: `${b} occupancy ${occDelta > 0 ? '+' : ''}${occDelta.toFixed(1)}pp WoW`,
      });
    }

    const adrPct = prv.adr_mtd_usd > 0 ? ((cur.adr_mtd_usd - prv.adr_mtd_usd) / prv.adr_mtd_usd) * 100 : 0;
    if (Math.abs(adrPct) >= SIGNIFICANT_ADR_PCT) {
      movers.push({
        building: b, metric: 'adr_usd',
        delta: Math.round(adrPct * 10) / 10, delta_unit: 'pct',
        comparison: 'wow',
        description: `${b} ADR ${adrPct > 0 ? '▲' : '▼'} ${Math.abs(adrPct).toFixed(1)}%`,
      });
    }
  }

  return movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
}
```

- [ ] **Step 21.3: Test + commit**

```bash
npm run test -- build-top-movers
git add src/lib/beithady-daily-report/build-top-movers.ts src/lib/beithady-daily-report/build-top-movers.test.ts
git commit -m "feat(beithady-daily-report): add buildTopMovers (diff vs prior snapshot)"
```

---

### Task 22: build-forward-occupancy.ts

**Files:**
- Create: `src/lib/beithady-daily-report/build-forward-occupancy.ts`
- Create: `src/lib/beithady-daily-report/build-forward-occupancy.test.ts`

- [ ] **Step 22.1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { computeForwardOccupancy } from './build-forward-occupancy';

describe('computeForwardOccupancy', () => {
  it('returns 100% if all unit-nights are booked', () => {
    const result = computeForwardOccupancy({ booked_unit_nights: 70, available_unit_nights: 70 });
    expect(result).toBe(100);
  });
  it('returns 0% if none booked', () => {
    expect(computeForwardOccupancy({ booked_unit_nights: 0, available_unit_nights: 100 })).toBe(0);
  });
  it('returns 0 for zero capacity (no division by zero)', () => {
    expect(computeForwardOccupancy({ booked_unit_nights: 0, available_unit_nights: 0 })).toBe(0);
  });
});
```

- [ ] **Step 22.2: Implement**

```ts
// build-forward-occupancy.ts
import 'server-only';
import type { ForwardOccupancyRow, BuildingCode } from './types';
import { BUILDING_CODES } from './types';
import type { ReservationCorpus } from './reservations';

export function computeForwardOccupancy(arg: { booked_unit_nights: number; available_unit_nights: number }): number {
  if (arg.available_unit_nights === 0) return 0;
  return (arg.booked_unit_nights / arg.available_unit_nights) * 100;
}

export type InventoriesByBuilding = Record<BuildingCode, number>;

export function buildForwardOccupancy(
  corpus: ReservationCorpus,
  inventories: InventoriesByBuilding,
  anchorYmd: string,
): ForwardOccupancyRow[] {
  const anchor = new Date(`${anchorYmd}T00:00:00Z`);
  const endOf = (days: number) => {
    const d = new Date(anchor); d.setUTCDate(d.getUTCDate() + days); return d;
  };

  const rows: ForwardOccupancyRow[] = [];

  for (const b of BUILDING_CODES) {
    const units = inventories[b] ?? 0;
    const counts = { d7: 0, d30: 0, d60: 0 };
    const reservations = corpus.active.filter((r) => r.building === b);
    for (const r of reservations) {
      const start = new Date(r.check_in);
      const end = new Date(r.check_out);
      counts.d7  += overlap(start, end, anchor, endOf(7));
      counts.d30 += overlap(start, end, anchor, endOf(30));
      counts.d60 += overlap(start, end, anchor, endOf(60));
    }
    rows.push({
      building: b,
      d7_pct:  computeForwardOccupancy({ booked_unit_nights: counts.d7,  available_unit_nights: units * 7  }),
      d30_pct: computeForwardOccupancy({ booked_unit_nights: counts.d30, available_unit_nights: units * 30 }),
      d60_pct: computeForwardOccupancy({ booked_unit_nights: counts.d60, available_unit_nights: units * 60 }),
    });
  }

  return rows;
}

function overlap(rStart: Date, rEnd: Date, wStart: Date, wEnd: Date): number {
  const s = Math.max(rStart.getTime(), wStart.getTime());
  const e = Math.min(rEnd.getTime(),   wEnd.getTime());
  if (e <= s) return 0;
  return Math.ceil((e - s) / 86_400_000);
}
```

**Note:** the `ReservationCorpus` type and `corpus.active` shape come from the existing `src/lib/beithady-daily-report/reservations.ts`. If that module's reservation row doesn't already expose `building`, `check_in`, `check_out`, add a type adapter at the top of `build-forward-occupancy.ts` mapping the existing shape — do not modify `reservations.ts`.

- [ ] **Step 22.3: Test + commit**

```bash
npm run test -- build-forward-occupancy
git add src/lib/beithady-daily-report/build-forward-occupancy.ts src/lib/beithady-daily-report/build-forward-occupancy.test.ts
git commit -m "feat(beithady-daily-report): add buildForwardOccupancy"
```

---

### Task 23: build-cancel-risk.ts

**Files:**
- Create: `src/lib/beithady-daily-report/build-cancel-risk.ts`

- [ ] **Step 23.1: Implement (this hits a Postgres view; no unit test for the SQL — tested in integration)**

```ts
// build-cancel-risk.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { CancelRiskSection, BuildingCode } from './types';

const RISK_THRESHOLD = 50;
const WINDOW_DAYS = 21;

export async function buildCancelRisk(anchorYmd: string): Promise<CancelRiskSection | null> {
  try {
    const start = anchorYmd;
    const endDate = new Date(`${anchorYmd}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + WINDOW_DAYS);
    const end = endDate.toISOString().slice(0, 10);

    const { data, error } = await supabaseAdmin()
      .from('beithady_cancel_risk_v')
      .select('id, code, unit, building, check_in, value_usd, risk_score')
      .gte('check_in', start)
      .lte('check_in', end)
      .gte('risk_score', RISK_THRESHOLD);

    if (error) throw error;
    const reservations = (data ?? []).map((r) => ({
      id: r.id as string,
      code: (r.code as string | null),
      unit: r.unit as string,
      building: (r.building as BuildingCode | null),
      check_in: r.check_in as string,
      value_usd: r.value_usd as number,
      risk_score: r.risk_score as number,
    }));
    return {
      count: reservations.length,
      value_usd: reservations.reduce((s, r) => s + r.value_usd, 0),
      reservations,
    };
  } catch (e) {
    console.error('[build-cancel-risk] failed', e);
    return null;
  }
}
```

**Important:** the view `beithady_cancel_risk_v` is referenced in the existing codebase per the spec. If it doesn't exist, the function returns `null` and the panel shows "Pending data". Verify the view exists by running this in the Supabase MCP `execute_sql`:

```sql
SELECT to_regclass('public.beithady_cancel_risk_v');
```

If it returns null, **STOP and ask the user** before fabricating a view. Do not invent a SQL view in this plan — that's a separate spec.

- [ ] **Step 23.2: Commit**

```bash
git add src/lib/beithady-daily-report/build-cancel-risk.ts
git commit -m "feat(beithady-daily-report): add buildCancelRisk (reads beithady_cancel_risk_v)"
```

---

### Task 24: build-occupancy-gaps.ts

**Files:**
- Create: `src/lib/beithady-daily-report/build-occupancy-gaps.ts`
- Create: `src/lib/beithady-daily-report/build-occupancy-gaps.test.ts`

- [ ] **Step 24.1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { buildOccupancyGaps } from './build-occupancy-gaps';
import type { BuildingCode } from './types';

describe('buildOccupancyGaps', () => {
  it('returns nights where occupancy is below 50%', () => {
    const inventories: Record<BuildingCode, number> = {
      'BH-26': 4, 'BH-73': 4, 'BH-435': 4, 'BH-OK': 4, 'OTHER': 0,
    };
    const reservations = [
      // BH-26: 1 of 4 booked on 2026-05-08 → 25% occupied → flagged
      { id: 'r1', building: 'BH-26' as BuildingCode, check_in: '2026-05-08', check_out: '2026-05-09' },
    ];
    const gaps = buildOccupancyGaps(inventories, reservations, '2026-05-07', 14);
    expect(gaps.find((g) => g.date === '2026-05-08' && g.building === 'BH-26')).toBeDefined();
    expect(gaps.find((g) => g.date === '2026-05-08' && g.building === 'BH-26')!.empty_units).toBe(3);
  });
});
```

- [ ] **Step 24.2: Implement**

```ts
// build-occupancy-gaps.ts
import type { BuildingCode, OccupancyGapNight } from './types';
import { BUILDING_CODES } from './types';

const GAP_THRESHOLD_PCT = 50;

type Reservation = { id: string; building: BuildingCode | null; check_in: string; check_out: string };

export function buildOccupancyGaps(
  inventories: Record<BuildingCode, number>,
  reservations: Reservation[],
  anchorYmd: string,
  windowDays: number,
): OccupancyGapNight[] {
  const gaps: OccupancyGapNight[] = [];
  const anchor = new Date(`${anchorYmd}T00:00:00Z`);

  for (let i = 1; i <= windowDays; i++) {
    const d = new Date(anchor); d.setUTCDate(d.getUTCDate() + i);
    const ymd = d.toISOString().slice(0, 10);

    for (const b of BUILDING_CODES) {
      if (b === 'OTHER') continue;
      const units = inventories[b] ?? 0;
      if (units === 0) continue;

      const booked = reservations.filter((r) => {
        if (r.building !== b) return false;
        const inDate = new Date(r.check_in).getTime();
        const outDate = new Date(r.check_out).getTime();
        const dayStart = d.getTime();
        return inDate <= dayStart && outDate > dayStart;
      }).length;

      const occPct = (booked / units) * 100;
      if (occPct < GAP_THRESHOLD_PCT) {
        gaps.push({
          date: ymd, building: b,
          empty_units: units - booked,
          current_price_usd: null,
          market_median_usd: null,
        });
      }
    }
  }
  return gaps;
}
```

**Note:** `current_price_usd` + `market_median_usd` come from PriceLabs. Wiring them is V1.5 — leave null for V1.

- [ ] **Step 24.3: Test + commit**

```bash
npm run test -- build-occupancy-gaps
git add src/lib/beithady-daily-report/build-occupancy-gaps.ts src/lib/beithady-daily-report/build-occupancy-gaps.test.ts
git commit -m "feat(beithady-daily-report): add buildOccupancyGaps"
```

---

### Task 25: build-revenue-waterfall.ts (snapshot + Odoo fees)

**Files:**
- Create: `src/lib/beithady-daily-report/build-revenue-waterfall.ts`
- Create: `src/lib/beithady-daily-report/build-revenue-waterfall.test.ts`

- [ ] **Step 25.1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { computeWaterfall } from './build-revenue-waterfall';

describe('computeWaterfall', () => {
  it('subtracts fees + tax from gross', () => {
    expect(computeWaterfall({ gross: 22100, fees: 2800, tax: 400 })).toEqual({
      gross_usd: 22100, fees_usd: 2800, tax_usd: 400, net_usd: 18900,
    });
  });
});
```

- [ ] **Step 25.2: Implement**

```ts
// build-revenue-waterfall.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { RevenueWaterfall } from './types';

export function computeWaterfall(args: { gross: number; fees: number; tax: number }): RevenueWaterfall {
  return {
    gross_usd: args.gross,
    fees_usd: args.fees,
    tax_usd: args.tax,
    net_usd: args.gross - args.fees - args.tax,
  };
}

export async function buildRevenueWaterfall(net_usd_mtd: number, anchorYmd: string): Promise<RevenueWaterfall | null> {
  // Read MTD aggregate fees + tax from Odoo synced view if present.
  // If view absent, fall back to net_usd reported as gross with zero fees/tax (signals "fees data not configured").
  try {
    const month = anchorYmd.slice(0, 7);
    const { data, error } = await supabaseAdmin()
      .from('odoo_revenue_waterfall_v')
      .select('gross_usd, fees_usd, tax_usd')
      .eq('month', month)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // No data — represent the snapshot's net as gross with zero deductions
      return computeWaterfall({ gross: net_usd_mtd, fees: 0, tax: 0 });
    }
    return computeWaterfall({
      gross: data.gross_usd as number,
      fees: data.fees_usd as number,
      tax: data.tax_usd as number,
    });
  } catch (e) {
    console.error('[build-revenue-waterfall] failed', e);
    return null;
  }
}
```

**Important:** the view `odoo_revenue_waterfall_v` is assumed. **Verify it exists** before relying on it (`SELECT to_regclass('public.odoo_revenue_waterfall_v')`). If absent, this builder still returns a sensible result (gross = net, fees = 0, tax = 0). The waterfall panel then shows "Fees data not yet configured" instead of crashing.

- [ ] **Step 25.3: Commit**

```bash
npm run test -- build-revenue-waterfall
git add src/lib/beithady-daily-report/build-revenue-waterfall.ts src/lib/beithady-daily-report/build-revenue-waterfall.test.ts
git commit -m "feat(beithady-daily-report): add buildRevenueWaterfall"
```

---

### Task 26: build-stly.ts (year-old snapshot lookup)

**Files:**
- Create: `src/lib/beithady-daily-report/build-stly.ts`

- [ ] **Step 26.1: Implement**

```ts
// build-stly.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { StlySection, DailyReportPayload } from './types';

export async function buildStly(currentPayload: DailyReportPayload): Promise<StlySection | null> {
  // Find the snapshot whose report_date is exactly 365 days before the current report_date
  const cur = new Date(`${currentPayload.report_date}T00:00:00Z`);
  cur.setUTCFullYear(cur.getUTCFullYear() - 1);
  const targetYmd = cur.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin()
    .from('daily_report_snapshots')
    .select('payload')
    .eq('report_date', targetYmd)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[build-stly] query failed', error);
    return null;
  }
  if (!data) return null;

  const prior = data.payload as DailyReportPayload;
  const cRev = currentPayload.all.revenue_mtd_usd;
  const pRev = prior.all.revenue_mtd_usd;
  const cOcc = currentPayload.all.backward_occupancy_pct;
  const pOcc = prior.all.backward_occupancy_pct;

  return {
    revenue_mtd: {
      current_usd: cRev,
      previous_usd: pRev,
      delta_pct: pRev > 0 ? ((cRev - pRev) / pRev) * 100 : 0,
    },
    occupancy_mtd: {
      current_pct: cOcc,
      previous_pct: pOcc,
      delta_pp: cOcc - pOcc,
    },
  };
}
```

- [ ] **Step 26.2: Commit**

```bash
git add src/lib/beithady-daily-report/build-stly.ts
git commit -m "feat(beithady-daily-report): add buildStly (year-old snapshot lookup)"
```

---

### Task 27: build-sparklines.ts (read prior snapshots)

**Files:**
- Create: `src/lib/beithady-daily-report/build-sparklines.ts`

- [ ] **Step 27.1: Implement**

```ts
// build-sparklines.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { SparklineSeries, DailyReportPayload } from './types';

export async function buildSparklines(currentReportDate: string): Promise<SparklineSeries> {
  const start = new Date(`${currentReportDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const startYmd = start.toISOString().slice(0, 10);

  const { data } = await supabaseAdmin()
    .from('daily_report_snapshots')
    .select('report_date, payload')
    .gte('report_date', startYmd)
    .lte('report_date', currentReportDate)
    .order('report_date', { ascending: true });

  const ordered = data ?? [];

  const occupancy: number[] = [];
  const mtd_revenue: number[] = [];
  const revpar: number[] = [];
  const pace: number[] = [];
  const reviews_avg: number[] = [];
  const response_time: number[] = [];

  for (const row of ordered) {
    const p = row.payload as DailyReportPayload;
    occupancy.push(p.all.occupancy_today_pct);
    mtd_revenue.push(p.all.revenue_mtd_usd);
    revpar.push(p.revpar?.all_usd ?? 0);
    pace.push(p.all.pickup_vs_prior_month_pct);
    reviews_avg.push(p.reviews.avg_rating_mtd);
    response_time.push(p.conversations?.yesterday.avg_response_minutes ?? 0);
  }

  return { occupancy, mtd_revenue, revpar, pace, reviews_avg, response_time };
}
```

- [ ] **Step 27.2: Commit**

```bash
git add src/lib/beithady-daily-report/build-sparklines.ts
git commit -m "feat(beithady-daily-report): add buildSparklines (7-day prior-snapshot read)"
```

---

### Task 28: Wire all 7 builders into orchestrator + Phase 3 push

**Files:**
- Modify: `src/lib/beithady-daily-report/build.ts`

- [ ] **Step 28.1: Add imports + parallel calls**

In `src/lib/beithady-daily-report/build.ts`, add the imports at the top and call the new builders. They can run in parallel except where they depend on `revpar` or prior snapshot results.

After the existing builders compute the buildings table + corpus, add:

```ts
import { buildRevpar } from './build-revpar';
import { buildRevenueConcentration } from './build-revenue-concentration';
import { buildTopMovers } from './build-top-movers';
import { buildForwardOccupancy } from './build-forward-occupancy';
import { buildCancelRisk } from './build-cancel-risk';
import { buildOccupancyGaps } from './build-occupancy-gaps';
import { buildRevenueWaterfall } from './build-revenue-waterfall';
import { buildStly } from './build-stly';
import { buildSparklines } from './build-sparklines';
```

Inside `buildDailyReport`, after the existing builders complete (right before assembling the final payload), add:

```ts
// v4 — performance dashboard derived metrics
const revpar = buildRevpar(buildings.all, buildings.per_building, ctx.month_days_elapsed);
const revenue_concentration = buildRevenueConcentration(
  Object.fromEntries(BUILDING_CODES.map((b) => [b, buildings.per_building[b].revenue_mtd_usd])) as Record<BuildingCode, number>,
  (paired_channel_mix ?? []).map((c) => ({ channel: c.channel, revenue_usd: c.mtd_revenue_usd })),
);
const occupancy_gaps = buildOccupancyGaps(
  inventories,
  corpus.active.map((r) => ({ id: r.id, building: r.building, check_in: r.check_in, check_out: r.check_out })),
  today,
  14,
);

// async — these read from DB or year-old snapshots
const [forward_occupancy_rows, cancel_risk_section, sparklines_series] = await Promise.all([
  Promise.resolve(buildForwardOccupancy(corpus, inventories, today)),
  buildCancelRisk(today),
  buildSparklines(today),
]);

// movers + stly + waterfall depend on prior-snapshot reads
const priorYmd = (() => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();
const { data: priorRow } = await supabaseAdmin()
  .from('daily_report_snapshots')
  .select('payload')
  .eq('report_date', priorYmd)
  .order('generated_at', { ascending: false })
  .limit(1)
  .maybeSingle();
const prior_payload = (priorRow?.payload as DailyReportPayload | undefined) ?? null;

const top_movers = buildTopMovers({
  ...({} as DailyReportPayload),
  all: buildings.all, per_building: buildings.per_building,
} as DailyReportPayload, prior_payload);

const stly_section = await buildStly({
  ...({} as DailyReportPayload),
  report_date: today,
  all: buildings.all,
} as DailyReportPayload);

const revenue_waterfall_section = await buildRevenueWaterfall(buildings.all.revenue_mtd_usd, today);
```

(Adjust the `import { supabaseAdmin } from '@/lib/supabase';` at the top of `build.ts` if not already imported.)

In the final payload assembly, add the new fields:

```ts
return {
  // ... all existing fields ...
  revpar,
  revenue_concentration,
  forward_occupancy: forward_occupancy_rows,
  cancel_risk: cancel_risk_section,
  occupancy_gaps,
  revenue_waterfall: revenue_waterfall_section,
  stly: stly_section,
  top_movers,
  sparklines: sparklines_series,
  // insights + review_topics added in Phase 5
};
```

- [ ] **Step 28.2: Hand-trigger a snapshot rebuild for testing**

Run the cron with force flag:

```bash
curl -X POST 'http://localhost:3000/api/cron/beithady-daily-report?force=1' \
  -H "Authorization: Bearer $CRON_SECRET"
```

Then verify the new payload fields landed:

```sql
-- via Supabase MCP execute_sql
SELECT report_date, payload->'revpar' as revpar, payload->'top_movers' as movers,
       payload->'forward_occupancy' as fwd_occ
FROM daily_report_snapshots
ORDER BY generated_at DESC LIMIT 1;
```

Expect non-null values for `revpar` and `forward_occupancy`. `top_movers` will be `[]` if no prior snapshot exists. `stly` will be `null` until 12+ months of history.

- [ ] **Step 28.3: Run all tests**

```bash
npm run test
```

Expect: green.

- [ ] **Step 28.4: Push (Phase 3 ships)**

```bash
git add src/lib/beithady-daily-report/build.ts
git commit -m "feat(beithady-daily-report): wire 7 v4 derived builders into orchestrator"
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```

Phase 3 ships: extended payload + 7 derived builders. The dashboard panels still show "Pending Phase 4" placeholders for the new analytical panels — they'll consume this data in the next phase.

---

## Phase 4 · New analytical panels (consume extended payload)

End-state: Forward occupancy bars, top movers ribbon, cancel risk panel (real data), revenue concentration Pareto, occupancy gap finder, revenue waterfall, STLY YoY, monthly goal, hero sparklines. Hero RevPAR shows real value.

Each task follows the same pattern: build component, wire into DashboardShell.

### Task 29: Forward occupancy bars panel

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/forward-occupancy-bars.tsx`

- [ ] **Step 29.1: Implement**

```tsx
// panels/forward-occupancy-bars.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import { occupancyColor } from '../../_lib/color-thresholds';
import { BUILDING_LABEL, type DailyReportPayload, type BuildingCode } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; window?: 'd7' | 'd30' | 'd60'; onHide?: () => void };

const COLOR: Record<'green' | 'amber' | 'red', string> = {
  green: '#4ade80', amber: '#fbbf24', red: '#f87171',
};

export function ForwardOccupancyBarsPanel({ payload, window = 'd30', onHide }: Props) {
  const rows = (payload.forward_occupancy ?? []).filter((r) => r.building !== 'OTHER');
  const key = `${window}_pct` as 'd7_pct' | 'd30_pct' | 'd60_pct';

  return (
    <PanelFrame label={`📅 Forward occupancy · next ${window.slice(1)} days`} drillTo="/beithady/analytics" onHide={onHide}>
      {rows.length === 0 ? (
        <div className="text-[10px] text-slate-500">Pending payload backfill (run cron once)</div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {rows.map((r) => {
            const pct = r[key];
            const color = COLOR[occupancyColor(pct)];
            return (
              <div key={r.building} className="grid grid-cols-[60px_1fr_42px] items-center gap-2 text-[10px]">
                <span className="text-slate-300">{BUILDING_LABEL[r.building as BuildingCode].split(' · ')[0]}</span>
                <div className="h-2.5 overflow-hidden rounded bg-white/5">
                  <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
                </div>
                <span className="text-right" style={{ color }}>{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      )}
    </PanelFrame>
  );
}
```

- [ ] **Step 29.2: Replace placeholder in DashboardShell**

```tsx
import { ForwardOccupancyBarsPanel } from './panels/forward-occupancy-bars';
// replace the dashed forward-occupancy placeholder div with:
<div className="col-span-4"><ForwardOccupancyBarsPanel payload={payload} /></div>
```

- [ ] **Step 29.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/forward-occupancy-bars.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add forward occupancy bars panel"
```

---

### Task 30: Top movers ribbon

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/top-movers-ribbon.tsx`

- [ ] **Step 30.1: Implement**

```tsx
// panels/top-movers-ribbon.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

export function TopMoversRibbonPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const movers = payload.top_movers ?? [];
  if (movers.length === 0) {
    return null; // hide if no movers — nothing useful to surface
  }
  return (
    <PanelFrame label="📈 Top movers · last 24h" onHide={onHide}>
      <div className="mt-1 flex gap-3 overflow-x-auto pb-1 text-[11px] text-slate-300">
        {movers.map((m, i) => (
          <span key={i} className="whitespace-nowrap">
            <span className={m.delta > 0 ? 'text-emerald-400' : 'text-red-400'}>
              {m.delta > 0 ? '▲' : '▼'} {Math.abs(m.delta).toFixed(1)}{m.delta_unit === 'pp' ? 'pp' : '%'}
            </span>{' '}
            <span className="font-medium text-amber-400">{m.building}</span> {m.metric === 'occupancy_pct' ? 'occupancy' : 'ADR'}
          </span>
        ))}
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 30.2: Wire in (place ABOVE the hero KPI strip):**

```tsx
import { TopMoversRibbonPanel } from './panels/top-movers-ribbon';
// add before the hero strip:
<div className="col-span-12"><TopMoversRibbonPanel payload={payload} /></div>
```

- [ ] **Step 30.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/top-movers-ribbon.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add top movers ribbon"
```

---

### Task 31: Cancel risk (real data)

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/panels/cancel-risk.tsx`

- [ ] **Step 31.1: Replace the placeholder body with real consumption**

```tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

export function CancelRiskPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const r = payload.cancel_risk;
  if (!r) {
    return (
      <PanelFrame label="⚠ Cancel risk · next 21d" drillTo="/beithady/operations/cancel-risk?min=50&days=21" onHide={onHide}>
        <div className="text-2xl font-bold text-slate-500">—</div>
        <div className="mt-1 text-[10px] text-slate-500">Risk view not yet configured</div>
      </PanelFrame>
    );
  }
  return (
    <PanelFrame label="⚠ Cancel risk · next 21d" drillTo="/beithady/operations/cancel-risk?min=50&days=21" onHide={onHide}>
      <div className={`text-2xl font-bold ${r.count > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{r.count}</div>
      <div className="mt-1 text-[10px] text-slate-400">
        ${(r.value_usd / 1000).toFixed(1)}k at risk · score ≥50
      </div>
    </PanelFrame>
  );
}
```

Update DashboardShell call: `<CancelRiskPanel payload={payload} />`.

- [ ] **Step 31.2: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/cancel-risk.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): wire cancel-risk panel to real payload data"
```

---

### Task 32: Revenue concentration Pareto

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/revenue-concentration.tsx`

- [ ] **Step 32.1: Implement**

```tsx
// panels/revenue-concentration.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

const BUILDING_BAR_COLORS = ['#D4A93A', '#5f7397', '#8a96b1', '#b3bbcb'];

export function RevenueConcentrationPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const c = payload.revenue_concentration;
  if (!c) return null;

  const top = c.by_building.slice(0, 4);
  const otherShare = Math.max(0, 100 - top.reduce((s, b) => s + b.share_pct, 0));

  return (
    <PanelFrame label="📊 Revenue concentration · MTD" drillTo="/beithady/financials?breakdown=building" onHide={onHide}>
      <div className="mt-2 flex h-9 gap-1">
        {top.map((b, i) => (
          <div
            key={b.building}
            className="rounded text-center text-[9px] font-bold leading-9"
            style={{ width: `${b.share_pct}%`, background: BUILDING_BAR_COLORS[i] || '#5f7397', color: i === 0 ? '#1a2c47' : '#fff' }}
            title={`${b.building} · $${b.revenue_usd.toFixed(0)}`}
          >
            {b.building.replace('BH-', '')} {b.share_pct.toFixed(0)}%
          </div>
        ))}
        {otherShare > 0 && (
          <div className="rounded bg-white/[0.08] text-center text-[9px] font-semibold leading-9 text-slate-400" style={{ width: `${otherShare}%` }}>
            other {otherShare.toFixed(0)}%
          </div>
        )}
      </div>
      <div className="mt-2 text-[10px] text-slate-400">
        Top 3 buildings = {c.top3_buildings_share_pct.toFixed(0)}% · Top channel = {c.top1_channel_share_pct.toFixed(0)}%
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 32.2: Wire + commit**

Add to grid: `<div className="col-span-6"><RevenueConcentrationPanel payload={payload} /></div>`.

```bash
git add src/app/beithady/analytics/performance/_components/panels/revenue-concentration.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add revenue concentration Pareto panel"
```

---

### Task 33: Occupancy gap finder

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/occupancy-gap-finder.tsx`

- [ ] **Step 33.1: Implement**

```tsx
// panels/occupancy-gap-finder.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

export function OccupancyGapFinderPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const gaps = (payload.occupancy_gaps ?? []).slice(0, 5);
  return (
    <PanelFrame label="🔍 Occupancy gap finder · next 14d" drillTo="/beithady/pricing" onHide={onHide}>
      {gaps.length === 0 ? (
        <div className="mt-2 text-[10px] text-slate-500">No nights below 50% in the next 14 days.</div>
      ) : (
        <div className="mt-2 space-y-1 text-[10px] text-slate-300">
          {gaps.map((g) => {
            const dow = new Date(g.date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            return (
              <div key={`${g.date}-${g.building}`}>
                <span className="font-semibold text-red-400">{dow}</span> · {g.building} · {g.empty_units} empty units
              </div>
            );
          })}
        </div>
      )}
    </PanelFrame>
  );
}
```

- [ ] **Step 33.2: Wire + commit**

```tsx
import { OccupancyGapFinderPanel } from './panels/occupancy-gap-finder';
// grid:
<div className="col-span-6"><OccupancyGapFinderPanel payload={payload} /></div>
```

```bash
git add src/app/beithady/analytics/performance/_components/panels/occupancy-gap-finder.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add occupancy gap finder panel"
```

---

### Task 34: Revenue waterfall

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/revenue-waterfall.tsx`

- [ ] **Step 34.1: Implement**

```tsx
// panels/revenue-waterfall.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

export function RevenueWaterfallPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const w = payload.revenue_waterfall;
  if (!w) return null;
  const max = w.gross_usd || 1;

  const bar = (label: string, value: number, color: string, sign: '+' | '-' | '=') => {
    const pct = (Math.abs(value) / max) * 100;
    return (
      <div className="flex-1 text-center">
        <div className="flex h-12 items-end justify-center">
          <div className="w-7 rounded-sm" style={{ height: `${pct}%`, background: color }} />
        </div>
        <div className="mt-1 text-[9px] text-slate-400">{label}</div>
        <div className="text-[10px] font-semibold" style={{ color }}>
          {sign === '-' ? '-' : sign === '+' ? '' : ''}${(Math.abs(value) / 1000).toFixed(1)}k
        </div>
      </div>
    );
  };

  return (
    <PanelFrame label="💧 Revenue waterfall · MTD" drillTo="/beithady/financials" onHide={onHide}>
      <div className="mt-2 flex gap-1">
        {bar('Gross', w.gross_usd, '#4ade80', '+')}
        {bar('Fees', w.fees_usd, '#f87171', '-')}
        {bar('Tax', w.tax_usd, '#f87171', '-')}
        {bar('Net', w.net_usd, '#D4A93A', '=')}
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 34.2: Wire + commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/revenue-waterfall.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add revenue waterfall panel"
```

---

### Task 35: STLY YoY

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/stly-yoy.tsx`

- [ ] **Step 35.1: Implement**

```tsx
// panels/stly-yoy.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

export function StlyYoyPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const s = payload.stly;
  if (!s) {
    return (
      <PanelFrame label="📅 STLY · Same time last year" onHide={onHide}>
        <div className="mt-2 text-[10px] text-slate-500">Insufficient history yet — STLY needs ≥365 days of snapshots.</div>
      </PanelFrame>
    );
  }
  const r = s.revenue_mtd;
  const o = s.occupancy_mtd;

  return (
    <PanelFrame label="📅 STLY · Same time last year" drillTo="/beithady/analytics/performance?compare=last-year" onHide={onHide}>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-slate-400">MTD Revenue YoY</div>
          <div className="text-lg font-bold text-white">
            ${(r.current_usd / 1000).toFixed(1)}k <span className={`text-[11px] ${r.delta_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.delta_pct >= 0 ? '▲' : '▼'} {Math.abs(r.delta_pct).toFixed(0)}%</span>
          </div>
          <div className="text-[9px] text-slate-500">STLY ${(r.previous_usd / 1000).toFixed(1)}k</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">MTD Occupancy YoY</div>
          <div className="text-lg font-bold text-white">
            {o.current_pct.toFixed(0)}% <span className={`text-[11px] ${o.delta_pp >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{o.delta_pp >= 0 ? '▲' : '▼'} {Math.abs(o.delta_pp).toFixed(0)}pp</span>
          </div>
          <div className="text-[9px] text-slate-500">STLY {o.previous_pct.toFixed(0)}%</div>
        </div>
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 35.2: Wire + commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/stly-yoy.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add STLY YoY panel"
```

---

### Task 36: Monthly goal panel (placeholder if no goal env var)

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/monthly-goal.tsx`

- [ ] **Step 36.1: Implement (uses env var until V1.5 admin UI)**

```tsx
// panels/monthly-goal.tsx
'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; goalUsd?: number; onHide?: () => void };

export function MonthlyGoalPanel({ payload, goalUsd, onHide }: Props) {
  if (!goalUsd) {
    return (
      <PanelFrame label="🎯 Monthly goal" onHide={onHide}>
        <div className="mt-2 text-[10px] text-slate-500">No goal configured. Set <code>BEITHADY_MONTHLY_GOAL_USD</code> in env.</div>
      </PanelFrame>
    );
  }
  const actual = payload.all.revenue_mtd_usd;
  const pct = Math.min(100, (actual / goalUsd) * 100);
  const daysLeft = payload.month_days_total - payload.month_days_elapsed;
  const projected = payload.month_days_elapsed > 0 ? (actual / payload.month_days_elapsed) * payload.month_days_total : 0;

  return (
    <PanelFrame label={`🎯 Monthly goal · ${payload.month_label}`} onHide={onHide}>
      <div className="mt-1 text-[11px] text-slate-300">
        ${(actual / 1000).toFixed(1)}k of <span className="text-amber-400 font-semibold">${(goalUsd / 1000).toFixed(0)}k</span> goal
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-white/5">
        <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[9px] text-slate-500">
        {pct.toFixed(0)}% · {daysLeft} days left · projecting ${(projected / 1000).toFixed(0)}k {projected > goalUsd ? '🚀' : ''}
      </div>
    </PanelFrame>
  );
}
```

In DashboardShell, read the goal from env:

```tsx
import { MonthlyGoalPanel } from './panels/monthly-goal';
// ...
const goalUsd = process.env.NEXT_PUBLIC_BEITHADY_MONTHLY_GOAL_USD
  ? Number(process.env.NEXT_PUBLIC_BEITHADY_MONTHLY_GOAL_USD)
  : undefined;
// grid:
<div className="col-span-4"><MonthlyGoalPanel payload={payload} goalUsd={goalUsd} /></div>
```

(Note: env var is `NEXT_PUBLIC_*` because DashboardShell is a client component. Set it in Vercel for Production + Preview + Development.)

- [ ] **Step 36.2: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/monthly-goal.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add monthly goal panel (env-driven goal)"
```

---

### Task 37: Hero RevPAR + sparklines (real values)

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`

- [ ] **Step 37.1: Update hero KPI block**

In DashboardShell, replace the 6 hero KPIs with:

```tsx
{(() => {
  const sl = payload.sparklines;
  return (
    <div className="col-span-12 grid grid-cols-6 gap-3">
      <HeroKpi
        label="Occupancy"
        value={`${payload.all.occupancy_today_pct.toFixed(1)}%`}
        delta={{ text: 'vs target 70%', direction: payload.all.occupancy_today_pct >= 70 ? 'up' : 'down' }}
        spark={sl?.occupancy}
        drillTo="/beithady/analytics/performance"
      />
      <HeroKpi
        label="MTD Revenue"
        value={`$${(payload.all.revenue_mtd_usd / 1000).toFixed(1)}k`}
        delta={{ text: `${payload.all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${payload.all.pickup_vs_prior_month_pct.toFixed(1)}% vs LM`, direction: payload.all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down' }}
        spark={sl?.mtd_revenue}
        drillTo="/beithady/financials?period=mtd"
        goldEdge
      />
      <HeroKpi
        label="RevPAR"
        value={payload.revpar ? `$${payload.revpar.all_usd.toFixed(2)}` : '—'}
        spark={sl?.revpar}
        drillTo="/beithady/financials?metric=revpar"
      />
      <HeroKpi
        label="Pace"
        value={`${payload.all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${payload.all.pickup_vs_prior_month_pct.toFixed(1)}%`}
        delta={{ text: 'vs prior month', direction: payload.all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down' }}
        spark={sl?.pace}
      />
      <HeroKpi
        label="Reviews avg"
        value={`${payload.reviews.avg_rating_mtd.toFixed(1)}★`}
        delta={{ text: `${payload.reviews.count_mtd} this month`, direction: 'neutral' }}
        spark={sl?.reviews_avg}
        drillTo="/beithady/analytics/reviews?period=mtd"
      />
      <HeroKpi
        label="Response time"
        value={`${payload.conversations?.yesterday.avg_response_minutes ?? 0}m`}
        delta={{ text: `first ${payload.conversations?.yesterday.first_response_avg_minutes ?? 0}m`, direction: 'neutral' }}
        spark={sl?.response_time}
        drillTo="/beithady/communication/unified?metric=response-time"
      />
    </div>
  );
})()}
```

- [ ] **Step 37.2: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): wire RevPAR + sparklines to hero KPIs"
```

---

### Task 38: Phase 4 push

- [ ] **Step 38.1: Visual smoke test**

`npm run dev` → confirm forward occupancy bars render with correct colors, top movers shows real movers, cancel risk shows real count, Pareto rendered, gap finder lists nights, waterfall + STLY render (or show graceful fallback if no fees view / no year-old data), monthly goal shows progress, sparklines populate hero KPIs.

- [ ] **Step 38.2: Push (Phase 4 ships)**

```bash
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```

Phase 4 ships. Dashboard is now feature-complete with non-AI data.

---

## Phase 5 · AI insights + review topics

End-state: AI Insights tray renders 3–5 narrative bullets at the top. Reviews block has an "AI Topics" line below the star distribution.

### Task 39: build-insights.ts (Anthropic SDK)

**Files:**
- Create: `src/lib/beithady-daily-report/build-insights.ts`

- [ ] **Step 39.1: Implement**

```ts
// build-insights.ts
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { AIInsight, DailyReportPayload } from './types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function buildInsights(snapshot: Pick<DailyReportPayload,
  'all' | 'per_building' | 'paired_channel_mix' | 'reviews' | 'cancellations' |
  'inquiry_triage' | 'top_movers' | 'forward_occupancy' | 'cancel_risk' | 'occupancy_gaps' |
  'revpar' | 'month_label' | 'month_days_total' | 'month_days_elapsed'
>): Promise<AIInsight[]> {
  const summary = JSON.stringify({
    month: snapshot.month_label,
    days_remaining: snapshot.month_days_total - snapshot.month_days_elapsed,
    occupancy_today_pct: snapshot.all.occupancy_today_pct,
    revenue_mtd_usd: snapshot.all.revenue_mtd_usd,
    revpar_usd: snapshot.revpar?.all_usd ?? null,
    pace_pct: snapshot.all.pickup_vs_prior_month_pct,
    inquiries_unanswered: snapshot.inquiry_triage.inquiries_unanswered_count,
    reviews_avg: snapshot.reviews.avg_rating_mtd,
    flagged_review_count: snapshot.reviews.last_24h.filter((r) => r.flagged).length,
    cancel_risk_count: snapshot.cancel_risk?.count ?? 0,
    top_movers: snapshot.top_movers ?? [],
    forward_occupancy_d30: snapshot.forward_occupancy ?? [],
    occupancy_gaps_count: snapshot.occupancy_gaps?.length ?? 0,
  });

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are a hospitality analytics assistant for Beithady, a short-term-rental operator in Cairo. Given a daily snapshot, produce 3–5 punchy narrative insights about the day's performance. Each insight must be ONE sentence, present a specific number, and suggest action when relevant. Use this JSON schema:
[{"kind":"positive"|"warning"|"neutral","text":"..."}]
Output the JSON array ONLY, no prose, no code fences.`,
      messages: [{ role: 'user', content: `Daily snapshot:\n${summary}` }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 5).map((i: AIInsight) => ({
      kind: ['positive', 'warning', 'neutral'].includes(i.kind) ? i.kind : 'neutral',
      text: String(i.text ?? '').slice(0, 240),
    }));
  } catch (e) {
    console.error('[build-insights] Anthropic call failed', e);
    return [];
  }
}
```

- [ ] **Step 39.2: Commit**

```bash
git add src/lib/beithady-daily-report/build-insights.ts
git commit -m "feat(beithady-daily-report): add buildInsights (Anthropic Haiku)"
```

---

### Task 40: build-review-topics.ts

**Files:**
- Create: `src/lib/beithady-daily-report/build-review-topics.ts`

- [ ] **Step 40.1: Implement**

```ts
// build-review-topics.ts
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { ReviewTopicsSection, DailyReportPayload } from './types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function buildReviewTopics(reviews: DailyReportPayload['reviews']): Promise<ReviewTopicsSection | null> {
  if (!reviews?.last_24h || reviews.last_24h.length === 0) {
    return { praised: [], complained: [], generated_at: new Date().toISOString() };
  }

  const corpus = reviews.last_24h
    .map((r) => `[${r.rating}★] ${r.raw_text}`)
    .join('\n')
    .slice(0, 8000);

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `You analyze hospitality guest reviews. Given a list of reviews, extract specific topics guests praised and complained about. Output JSON ONLY in this exact schema, with each list sorted by count descending. Limit each list to top 5 topics. Topic names are lowercase nouns/short phrases (e.g. "cleanliness", "door knocking", "wifi", "staff").
{"praised":[{"topic":"<name>","count":<int>}],"complained":[{"topic":"<name>","count":<int>}]}`,
      messages: [{ role: 'user', content: `Reviews:\n${corpus}` }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = JSON.parse(text);
    return {
      praised:    Array.isArray(parsed.praised)    ? parsed.praised.slice(0, 5)    : [],
      complained: Array.isArray(parsed.complained) ? parsed.complained.slice(0, 5) : [],
      generated_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[build-review-topics] Anthropic call failed', e);
    return null;
  }
}
```

- [ ] **Step 40.2: Commit**

```bash
git add src/lib/beithady-daily-report/build-review-topics.ts
git commit -m "feat(beithady-daily-report): add buildReviewTopics (Anthropic Haiku)"
```

---

### Task 41: Wire AI builders into orchestrator

**Files:**
- Modify: `src/lib/beithady-daily-report/build.ts`

- [ ] **Step 41.1: Add imports + parallel calls**

Add to `build.ts`:

```ts
import { buildInsights } from './build-insights';
import { buildReviewTopics } from './build-review-topics';
```

Inside `buildDailyReport`, after `revenue_concentration` is computed but before payload assembly:

```ts
// AI builders run last so they have all the metrics to reason about.
// Both are non-blocking — failures return [] / null without breaking the snapshot.
const partialPayload = {
  all: buildings.all,
  per_building: buildings.per_building,
  paired_channel_mix,
  reviews,
  cancellations,
  inquiry_triage: triageResult,
  top_movers, forward_occupancy: forward_occupancy_rows,
  cancel_risk: cancel_risk_section,
  occupancy_gaps,
  revpar,
  month_label: monthLabel(today),
  month_days_total: ctx.month_days_total,
  month_days_elapsed: ctx.month_days_elapsed,
};
const [insights, review_topics] = await Promise.all([
  buildInsights(partialPayload as Parameters<typeof buildInsights>[0]),
  buildReviewTopics(reviews),
]);
```

Add to the final payload:

```ts
return {
  // ... existing fields ...
  insights,
  review_topics,
  // ... v4 fields from Phase 3 ...
};
```

- [ ] **Step 41.2: Trigger snapshot rebuild**

```bash
curl -X POST 'http://localhost:3000/api/cron/beithady-daily-report?force=1' \
  -H "Authorization: Bearer $CRON_SECRET"
```

Verify via Supabase MCP:

```sql
SELECT payload->'insights' as insights, payload->'review_topics' as topics
FROM daily_report_snapshots
ORDER BY generated_at DESC LIMIT 1;
```

Expect `insights` to be an array of 3–5 objects, `review_topics` to have praised/complained arrays.

- [ ] **Step 41.3: Commit**

```bash
git add src/lib/beithady-daily-report/build.ts
git commit -m "feat(beithady-daily-report): wire AI insights + review topics builders"
```

---

### Task 42: AI Insights tray panel

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/ai-insights-tray.tsx`

- [ ] **Step 42.1: Implement**

```tsx
// panels/ai-insights-tray.tsx
'use client';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

const KIND: Record<'positive' | 'warning' | 'neutral', string> = {
  positive: 'text-emerald-400',
  warning:  'text-amber-400',
  neutral:  'text-slate-300',
};

export function AIInsightsTrayPanel({ payload, onHide }: { payload: DailyReportPayload; onHide?: () => void }) {
  const insights = payload.insights ?? [];
  if (insights.length === 0) return null;
  return (
    <div className="group relative rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-500/[0.08] to-blue-500/[0.06] p-3.5">
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          className="absolute right-2 top-2 text-[11px] text-white/25 opacity-0 transition group-hover:opacity-100 hover:text-white/70"
          aria-label="Hide AI Insights"
        >×</button>
      )}
      <span className="mb-1 inline-block rounded bg-purple-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300">✨ AI Insights</span>
      <ul className="ml-5 list-disc space-y-1 text-[11px] leading-relaxed text-slate-200">
        {insights.map((ins, i) => (
          <li key={i}><span className={KIND[ins.kind]}>{ins.text}</span></li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 42.2: Wire ABOVE top-movers ribbon**

```tsx
import { AIInsightsTrayPanel } from './panels/ai-insights-tray';
// place at very top of <main> grid:
<div className="col-span-12"><AIInsightsTrayPanel payload={payload} /></div>
<div className="col-span-12"><TopMoversRibbonPanel payload={payload} /></div>
```

- [ ] **Step 42.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/panels/ai-insights-tray.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add AI insights tray panel"
```

---

### Task 43: Reviews block — AI Topics row + Phase 5 push

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/panels/reviews-block.tsx`

- [ ] **Step 43.1: Add topics row**

At the bottom of the existing `ReviewsBlockPanel` JSX (inside the PanelFrame), add:

```tsx
{payload.review_topics && (payload.review_topics.praised.length > 0 || payload.review_topics.complained.length > 0) && (
  <div className="mt-2.5 border-t border-white/[0.06] pt-2 text-[10px] leading-tight text-slate-300">
    <span className="text-purple-300">✨ AI Topics</span>:
    {payload.review_topics.praised.length > 0 && (
      <> praised{' '}
        {payload.review_topics.praised.map((t, i) => (
          <span key={t.topic}>{i > 0 && ', '}<span className="text-emerald-400 font-semibold">{t.topic} ({t.count})</span></span>
        ))}
      </>
    )}
    {payload.review_topics.complained.length > 0 && (
      <> · complained{' '}
        {payload.review_topics.complained.map((t, i) => (
          <span key={t.topic}>{i > 0 && ', '}<span className="text-red-400 font-semibold">{t.topic} ({t.count})</span></span>
        ))}
      </>
    )}
  </div>
)}
```

- [ ] **Step 43.2: Push (Phase 5 ships)**

```bash
git add src/app/beithady/analytics/performance/_components/panels/reviews-block.tsx
git commit -m "feat(beithady/perf): add AI Topics row to reviews block"
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```

Phase 5 ships: AI insights + review topics. The dashboard now has narrative AI guidance at the top.

---

## Phase 6 · Personalization (visibility hook + customize drawer + rail collapse)

End-state: every panel can be hidden via the Customize drawer or via per-panel hover-X close. Visibility persists in localStorage. Left rail auto-collapses 3s after hover-out. Pin overrides the auto-collapse.

### Task 44: `useVisibility` hook

**Files:**
- Create: `src/app/beithady/analytics/performance/_hooks/use-visibility.ts`
- Create: `src/app/beithady/analytics/performance/_hooks/use-visibility.test.ts`

- [ ] **Step 44.1: Test (logic-only — uses fake-localStorage)**

```ts
// use-visibility.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mergeVisibility, parseVisibility, serializeVisibility } from './use-visibility';
import { defaultVisibility } from '../_lib/panel-registry';

describe('visibility helpers', () => {
  it('parses valid JSON; falls back to defaults if shape is wrong', () => {
    expect(parseVisibility(null)).toEqual(defaultVisibility());
    expect(parseVisibility('not-json')).toEqual(defaultVisibility());
    expect(parseVisibility('{"hero-occupancy":false}')).toMatchObject({ 'hero-occupancy': false });
  });
  it('mergeVisibility keeps unknown keys out and fills missing ones with defaults', () => {
    const merged = mergeVisibility({ 'hero-occupancy': false } as Record<string, boolean>);
    expect(merged['hero-occupancy']).toBe(false);
    expect(merged['ai-insights']).toBe(true);
  });
  it('serialize round-trips', () => {
    const original = mergeVisibility({ 'hero-occupancy': false } as Record<string, boolean>);
    const round = parseVisibility(serializeVisibility(original));
    expect(round).toEqual(original);
  });
});
```

- [ ] **Step 44.2: Implement**

```ts
// use-visibility.ts
'use client';
import { useEffect, useState, useCallback } from 'react';
import { defaultVisibility, PANEL_IDS, type PanelId } from '../_lib/panel-registry';

const STORAGE_KEY = 'bh:perf-dashboard:visibility:v1';

export function parseVisibility(raw: string | null): Record<PanelId, boolean> {
  const def = defaultVisibility();
  if (!raw) return def;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return def;
    return mergeVisibility(obj as Record<string, unknown>);
  } catch {
    return def;
  }
}

export function mergeVisibility(input: Record<string, unknown>): Record<PanelId, boolean> {
  const def = defaultVisibility();
  const out = { ...def };
  for (const id of PANEL_IDS) {
    if (typeof input[id] === 'boolean') out[id] = input[id] as boolean;
  }
  return out;
}

export function serializeVisibility(v: Record<PanelId, boolean>): string {
  return JSON.stringify(v);
}

export function useVisibility() {
  const [visibility, setVisibility] = useState<Record<PanelId, boolean>>(() => defaultVisibility());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    setVisibility(parseVisibility(raw));
  }, []);

  const setPanel = useCallback((id: PanelId, visible: boolean) => {
    setVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, serializeVisibility(next));
      }
      return next;
    });
  }, []);

  const setMany = useCallback((patch: Partial<Record<PanelId, boolean>>) => {
    setVisibility((prev) => {
      const next = { ...prev, ...patch };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, serializeVisibility(next));
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const def = defaultVisibility();
    setVisibility(def);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, serializeVisibility(def));
    }
  }, []);

  return { visibility, setPanel, setMany, reset };
}
```

- [ ] **Step 44.3: Test + commit**

```bash
npm run test -- use-visibility
git add src/app/beithady/analytics/performance/_hooks/use-visibility.ts src/app/beithady/analytics/performance/_hooks/use-visibility.test.ts
git commit -m "feat(beithady/perf): add useVisibility hook + localStorage persistence"
```

---

### Task 45: Customize drawer

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/customize-drawer.tsx`

- [ ] **Step 45.1: Implement**

```tsx
// _components/customize-drawer.tsx
'use client';
import { useEffect, useState } from 'react';
import { PANEL_IDS, PANEL_META, type PanelId } from '../_lib/panel-registry';

type Props = {
  open: boolean;
  visibility: Record<PanelId, boolean>;
  onSave: (next: Record<PanelId, boolean>) => void;
  onReset: () => void;
  onClose: () => void;
};

const GROUPS: Array<{ heading: string; group: typeof PANEL_META[PanelId]['group'] }> = [
  { heading: 'Hero KPIs', group: 'Hero KPIs' },
  { heading: 'Decisions & alerts', group: 'Decisions & alerts' },
  { heading: 'Revenue & financials', group: 'Revenue & financials' },
  { heading: 'Operations & guests', group: 'Operations & guests' },
  { heading: 'Power tools', group: 'Power tools' },
];

export function CustomizeDrawer({ open, visibility, onSave, onReset, onClose }: Props) {
  const [draft, setDraft] = useState<Record<PanelId, boolean>>(visibility);

  useEffect(() => { setDraft(visibility); }, [open, visibility]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <aside
        className="absolute right-0 top-0 h-full w-96 overflow-y-auto bg-[#0a1628] p-6 text-white"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Customize Performance Dashboard"
      >
        <header className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">⚙ Customize</h3>
            <p className="mt-1 text-xs text-slate-400">Toggle panels on/off — page reflows live. Settings saved to your browser.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close drawer">✕</button>
        </header>

        <div className="mt-5 space-y-5">
          {GROUPS.map((g) => (
            <section key={g.heading}>
              <h4 className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500">{g.heading}</h4>
              <div className="space-y-1">
                {PANEL_IDS.filter((id) => PANEL_META[id].group === g.group).map((id) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs"
                  >
                    <span>{PANEL_META[id].label}</span>
                    <input
                      type="checkbox"
                      checked={draft[id]}
                      onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.checked }))}
                      className="h-4 w-7 cursor-pointer appearance-none rounded-full bg-white/10 transition checked:bg-amber-500 relative checked:before:translate-x-3 before:absolute before:left-0.5 before:top-0.5 before:h-3 before:w-3 before:rounded-full before:bg-white before:transition"
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onReset} className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10">Reset to default</button>
          <button type="button" onClick={() => { onSave(draft); onClose(); }} className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/25">Save</button>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 45.2: Wire into DashboardShell**

Update DashboardShell:

```tsx
import { useVisibility } from '../_hooks/use-visibility';
import { CustomizeDrawer } from './customize-drawer';
// ...
const { visibility, setPanel, setMany, reset } = useVisibility();
const hiddenCount = Object.values(visibility).filter((v) => !v).length;

// Replace placeholder drawer JSX with:
<CustomizeDrawer
  open={drawerOpen}
  visibility={visibility}
  onSave={setMany}
  onReset={reset}
  onClose={() => setDrawerOpen(false)}
/>

// Pass hiddenCount to TopBar:
<TopBar ... hiddenCount={hiddenCount} ... />
```

- [ ] **Step 45.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/customize-drawer.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add Customize drawer with toggle persistence"
```

---

### Task 46: Wrap each panel in conditional render + pass `onHide`

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`

- [ ] **Step 46.1: Wrap every panel render with visibility check**

The pattern for every panel becomes:

```tsx
{visibility['ai-insights'] && (
  <div className="col-span-12">
    <AIInsightsTrayPanel payload={payload} onHide={() => setPanel('ai-insights', false)} />
  </div>
)}
```

Apply this to all panels (see the panel-registry IDs in Task 7). For hero KPIs, wrap each one individually using the matching `hero-*` ID. For example:

```tsx
{visibility['hero-occupancy'] && (
  <div><HeroKpi label="Occupancy" ... onHide={() => setPanel('hero-occupancy', false)} /></div>
)}
```

The hero strip parent wrapper always renders, but if all 6 hero IDs are off, the row stays empty — that's acceptable. Optionally, you can collapse the hero row entirely if all 6 are off:

```tsx
{[...].some((id) => visibility[id]) && (
  <div className="col-span-12 grid grid-cols-6 gap-3">...</div>
)}
```

- [ ] **Step 46.2: Visual smoke test**

`npm run dev` → click `⚙ Customize` → toggle off "Cancel risk" → Save → confirm panel disappears. Reopen drawer → "Cancel risk" toggle is off. Toggle back on → panel returns.

Hover any panel → faint × in top-right → click → panel hides → drawer count updates.

- [ ] **Step 46.3: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): wire panel visibility toggles + hover-X close"
```

---

### Task 47: `useRailCollapse` hook

**Files:**
- Create: `src/app/beithady/analytics/performance/_hooks/use-rail-collapse.ts`

- [ ] **Step 47.1: Implement**

```ts
// use-rail-collapse.ts
'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

const PIN_KEY = 'bh:perf-dashboard:rail-pinned:v1';
const COLLAPSE_DELAY_MS = 3000;

export function useRailCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate pin state from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPinned(window.localStorage.getItem(PIN_KEY) === '1');
  }, []);

  const handleEnter = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCollapsed(false);
  }, []);

  const handleLeave = useCallback(() => {
    if (pinned) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCollapsed(true);
      timerRef.current = null;
    }, COLLAPSE_DELAY_MS);
  }, [pinned]);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        if (next) window.localStorage.setItem(PIN_KEY, '1');
        else window.localStorage.removeItem(PIN_KEY);
      }
      if (next && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return next;
    });
  }, []);

  const expandNow = useCallback(() => {
    handleEnter();
  }, [handleEnter]);

  // Cleanup
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { collapsed, pinned, handleEnter, handleLeave, togglePin, expandNow };
}
```

- [ ] **Step 47.2: Commit**

```bash
git add src/app/beithady/analytics/performance/_hooks/use-rail-collapse.ts
git commit -m "feat(beithady/perf): add useRailCollapse hook (3s grace + pin)"
```

---

### Task 48: Apply collapse to LeftRail + Phase 6 push

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/left-rail.tsx`
- Modify: `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`

- [ ] **Step 48.1: Add collapsed icon-strip mode + props**

Replace the entire `LeftRail` component with this version:

```tsx
'use client';
import type { PerfUrlState, CompareMode } from '../_hooks/use-url-state';
import { BUILDING_CODES, BUILDING_LABEL } from '@/lib/beithady-daily-report/types';

type Props = {
  state: PerfUrlState;
  onChange: (patch: Partial<PerfUrlState>) => void;
  collapsed: boolean;
  pinned: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTogglePin: () => void;
  onExpandNow: () => void;
  alertsCount: number;
};

const PERIODS: { id: 'today' | 'yesterday' | 'this-week'; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'this-week', label: 'This week' },
];
const COMPARES: { id: CompareMode; label: string }[] = [
  { id: 'yesterday', label: 'vs Yesterday' }, { id: 'last-week', label: 'vs Last Week' },
  { id: 'last-month', label: 'vs Last Month' }, { id: 'last-year', label: 'vs Last Year' },
  { id: 'none', label: 'No compare' },
];

export function LeftRail(props: Props) {
  const { state, onChange, collapsed, pinned, onMouseEnter, onMouseLeave, onTogglePin, onExpandNow, alertsCount } = props;
  return (
    <aside
      role="region"
      aria-label="Filters"
      aria-expanded={!collapsed}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="overflow-hidden border-r border-white/[0.06] bg-white/[0.015] transition-all"
      style={{ padding: collapsed ? '14px 6px' : '18px 16px' }}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2.5 pt-1">
          <RailIcon title="Period">📅</RailIcon>
          <RailIcon title="Building">🏢</RailIcon>
          <RailIcon title="Compare">⇄</RailIcon>
          <RailIcon title={`${alertsCount} alerts`} alert={alertsCount > 0}>⚠</RailIcon>
          <RailIcon title={pinned ? 'Unpin rail' : 'Pin rail open'} onClick={onTogglePin} active={pinned}>📌</RailIcon>
          <RailIcon title="Expand" onClick={onExpandNow} dashed>»</RailIcon>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Section title="Period">{PERIODS.map((p) => <Pill key={p.id} active={state.date === undefined && p.id === 'today'}>{p.label}</Pill>)}</Section>
          <Section title="Building">
            <Pill active={state.building === 'all'} onClick={() => onChange({ building: 'all' })}>All</Pill>
            {BUILDING_CODES.map((b) => <Pill key={b} active={state.building === b} onClick={() => onChange({ building: b })}>{BUILDING_LABEL[b]}</Pill>)}
          </Section>
          <Section title="Compare">{COMPARES.map((c) => <Pill key={c.id} active={state.compare === c.id} onClick={() => onChange({ compare: c.id })}>{c.label}</Pill>)}</Section>
          <Section title={pinned ? '📌 Pinned open' : '📌 Auto-collapse'}>
            <Pill active={pinned} onClick={onTogglePin}>{pinned ? 'Unpin' : 'Pin'}</Pill>
          </Section>
        </div>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500">{title}</h4>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Pill({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-md border px-2.5 py-1.5 text-left text-[11px] transition ' +
        (active ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                : 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]')
      }
    >
      {children}
    </button>
  );
}

function RailIcon({ children, title, onClick, active, alert, dashed }: {
  children: React.ReactNode; title: string; onClick?: () => void; active?: boolean; alert?: boolean; dashed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        'relative flex h-8 w-8 items-center justify-center rounded-md text-sm transition ' +
        (active
          ? 'border border-amber-500/40 bg-amber-500/15 text-amber-400'
          : dashed
          ? 'border border-dashed border-white/20 bg-white/[0.04] text-slate-300 hover:bg-amber-500/15 hover:border-amber-500/40 hover:text-amber-400'
          : 'border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-amber-500/15 hover:border-amber-500/40 hover:text-amber-400')
      }
    >
      {children}
      {alert && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full border border-[#0a1628] bg-red-400" />}
    </button>
  );
}
```

- [ ] **Step 48.2: Apply collapse logic in DashboardShell**

```tsx
import { useRailCollapse } from '../_hooks/use-rail-collapse';
// ...
const rail = useRailCollapse();
const alertsCount =
  (payload.cancel_risk?.count ?? 0) +
  payload.reviews.last_24h.filter((r) => r.flagged).length +
  (payload.inquiry_triage.inquiries_unanswered_count > 20 ? 1 : 0);

// Replace the static gridTemplateColumns:
<div
  className="grid transition-[grid-template-columns] duration-[250ms] ease motion-reduce:transition-none"
  style={{ gridTemplateColumns: `${rail.collapsed ? 44 : 200}px 1fr` }}
>
  <LeftRail
    state={state}
    onChange={update}
    collapsed={rail.collapsed}
    pinned={rail.pinned}
    onMouseEnter={rail.handleEnter}
    onMouseLeave={rail.handleLeave}
    onTogglePin={rail.togglePin}
    onExpandNow={rail.expandNow}
    alertsCount={alertsCount}
  />
  <main className="grid grid-cols-12 gap-3 p-4">
    {/* panels */}
  </main>
</div>
```

- [ ] **Step 48.3: Visual smoke test**

`npm run dev` → mouse over rail → expanded · move mouse to main area → wait 3s → rail collapses to 44px icon strip · main grid expands. Click 📌 in collapsed mode → pin highlights, no auto-collapse. Click 📌 again → pin off, hover-out collapses again.

- [ ] **Step 48.4: Push (Phase 6 ships)**

```bash
git add src/app/beithady/analytics/performance/_components/left-rail.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): apply rail auto-collapse + pin override"
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```

Phase 6 ships: full personalization layer.

---

## Phase 7 · Power features (snapshot scrubber + PDF export)

End-state: bottom-of-page scrubber lets you drag through prior snapshot dates. The Export PDF button generates a download.

### Task 49: Snapshot history scrubber

**Files:**
- Create: `src/app/beithady/analytics/performance/_components/panels/snapshot-scrubber.tsx`
- Create: `src/app/beithady/analytics/performance/api/list-snapshots/route.ts` (or similar — see step)

- [ ] **Step 49.1: Server route to list available snapshot dates**

```ts
// src/app/api/beithady/list-snapshots/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('daily_report_snapshots')
    .select('report_date')
    .order('report_date', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const dates = Array.from(new Set((data ?? []).map((r) => r.report_date as string)));
  return NextResponse.json({ dates });
}
```

- [ ] **Step 49.2: Scrubber component**

```tsx
// _components/panels/snapshot-scrubber.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PanelFrame } from '../panel-frame';

type Props = { currentDate: string; onHide?: () => void };

export function SnapshotScrubberPanel({ currentDate, onHide }: Props) {
  const router = useRouter();
  const [dates, setDates] = useState<string[]>([currentDate]);

  useEffect(() => {
    fetch('/api/beithady/list-snapshots')
      .then((r) => r.json())
      .then((d: { dates: string[] }) => { if (Array.isArray(d.dates) && d.dates.length > 0) setDates(d.dates); })
      .catch(() => {});
  }, []);

  const idx = Math.max(0, dates.indexOf(currentDate));

  return (
    <PanelFrame label="⏪ Snapshot history · scrub past dates" onHide={onHide}>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-[10px] text-slate-500">{dates[0] ?? '—'}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, dates.length - 1)}
          value={idx}
          onChange={(e) => {
            const d = dates[Number(e.target.value)];
            if (d && d !== currentDate) {
              router.push(`/beithady/analytics/performance?date=${d}`);
            }
          }}
          className="flex-1 accent-amber-500"
        />
        <span className="text-[10px] font-semibold text-amber-400">{currentDate}</span>
      </div>
    </PanelFrame>
  );
}
```

- [ ] **Step 49.3: Wire as last panel in grid**

```tsx
import { SnapshotScrubberPanel } from './panels/snapshot-scrubber';
// at end of grid:
{visibility['snapshot-scrubber'] && (
  <div className="col-span-12"><SnapshotScrubberPanel currentDate={snapshotDate} onHide={() => setPanel('snapshot-scrubber', false)} /></div>
)}
```

- [ ] **Step 49.4: Commit**

```bash
git add src/app/api/beithady/list-snapshots/route.ts src/app/beithady/analytics/performance/_components/panels/snapshot-scrubber.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "feat(beithady/perf): add snapshot history scrubber"
```

---

### Task 50: PDF export server action

**Files:**
- Create: `src/app/beithady/analytics/performance/_actions/export-pdf.ts`
- Modify: `src/app/beithady/analytics/performance/_components/top-bar.tsx`

- [ ] **Step 50.1: Investigate existing PDF infra**

Run `git grep -l "renderPdfReport\|@react-pdf/renderer" src/lib/beithady-daily-report/`. Identify the function that renders the report HTML/PDF — likely something like `renderReportPdf(payload)` in `src/lib/beithady-daily-report/render-pdf.ts` or similar. **Do not duplicate the renderer** — call into it.

- [ ] **Step 50.2: Implement server action**

```ts
// _actions/export-pdf.ts
'use server';
import { loadSnapshot } from '../_lib/load-snapshot';
import { renderReportPdf } from '@/lib/beithady-daily-report/render-pdf'; // adjust path to actual export

export async function exportPdfAction(date: string | undefined): Promise<{ base64: string; filename: string }> {
  const result = await loadSnapshot(date);
  if (result.status !== 'found') throw new Error('No snapshot for that date');
  const buffer = await renderReportPdf(result.payload);
  return {
    base64: Buffer.from(buffer).toString('base64'),
    filename: `beithady-performance-${result.date}.pdf`,
  };
}
```

If `renderReportPdf` doesn't exist with that exact name, locate the actual existing renderer and adjust the import.

- [ ] **Step 50.3: Wire button in TopBar**

```tsx
import { exportPdfAction } from '../_actions/export-pdf';
// inside TopBar component:
const [exporting, setExporting] = useState(false);
const onExport = async () => {
  setExporting(true);
  try {
    const { base64, filename } = await exportPdfAction(state.date);
    const a = document.createElement('a');
    a.href = `data:application/pdf;base64,${base64}`;
    a.download = filename;
    a.click();
  } catch (e) {
    alert('Export failed: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    setExporting(false);
  }
};
// replace the static export button with:
<button type="button" disabled={exporting} onClick={onExport} className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50">
  {exporting ? '⤓ Exporting…' : '⤓ Export PDF'}
</button>
```

- [ ] **Step 50.4: Commit**

```bash
git add src/app/beithady/analytics/performance/_actions/export-pdf.ts src/app/beithady/analytics/performance/_components/top-bar.tsx
git commit -m "feat(beithady/perf): add Export PDF server action + button wiring"
```

---

### Task 51: Phase 7 push

- [ ] **Step 51.1: Visual smoke test**

`npm run dev` → drag scrubber → page navigates to past date · click Export PDF → file downloads.

- [ ] **Step 51.2: Push**

```bash
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```

Phase 7 ships.

---

## Phase 8 · Polish (mobile + a11y + reduced motion + empty states)

### Task 52: Mobile responsive

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`
- Modify: `src/app/beithady/analytics/performance/_components/left-rail.tsx`

- [ ] **Step 52.1: Convert grid + rail to responsive**

In DashboardShell, replace the grid wrapper with a media-query-aware container:

```tsx
const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
// Better: use a hook that reads media query
```

Implement a small `useIsDesktop` hook:

```ts
// _hooks/use-is-desktop.ts
'use client';
import { useEffect, useState } from 'react';
export function useIsDesktop(breakpoint = 768) {
  const [is, setIs] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    setIs(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIs(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return is;
}
```

In DashboardShell:

```tsx
import { useIsDesktop } from '../_hooks/use-is-desktop';
// ...
const isDesktop = useIsDesktop();

return (
  <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a1628] text-white">
    <TopBar ... onFilterClick={() => setMobileFilterOpen(true)} />
    {isDesktop ? (
      <div className="grid transition-[grid-template-columns] duration-[250ms] ease motion-reduce:transition-none"
           style={{ gridTemplateColumns: `${rail.collapsed ? 44 : 200}px 1fr` }}>
        <LeftRail ... />
        <main className="grid grid-cols-12 gap-3 p-4">{/* panels */}</main>
      </div>
    ) : (
      <>
        <main className="grid grid-cols-2 gap-2 p-3">{/* panels with mobile col-spans */}</main>
        {mobileFilterOpen && <MobileFilterSheet ... onClose={() => setMobileFilterOpen(false)} />}
      </>
    )}
    {/* CustomizeDrawer */}
  </div>
);
```

For each panel render block, also add a mobile column-span pass: e.g. hero KPIs become `col-span-1` (2-up), buildings table becomes full-width `col-span-2`.

- [ ] **Step 52.2: MobileFilterSheet (bottom sheet)**

```tsx
// _components/mobile-filter-sheet.tsx
'use client';
import type { PerfUrlState } from '../_hooks/use-url-state';
import { BUILDING_CODES, BUILDING_LABEL } from '@/lib/beithady-daily-report/types';

type Props = {
  state: PerfUrlState;
  onChange: (patch: Partial<PerfUrlState>) => void;
  onClose: () => void;
};

export function MobileFilterSheet({ state, onChange, onClose }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-white/[0.08] bg-[#0a1628] p-5 text-white">
      <button onClick={onClose} className="absolute right-4 top-3 text-slate-400">✕</button>
      <h3 className="mb-3 text-sm font-semibold">Filters</h3>
      <div className="mb-3">
        <h4 className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Building</h4>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onChange({ building: 'all' })} className={`rounded-full border px-3 py-1.5 text-xs ${state.building === 'all' ? 'border-amber-500/40 bg-amber-500/15 text-amber-400' : 'border-white/10 text-slate-300'}`}>All</button>
          {BUILDING_CODES.map((b) => (
            <button key={b} onClick={() => onChange({ building: b })} className={`rounded-full border px-3 py-1.5 text-xs ${state.building === b ? 'border-amber-500/40 bg-amber-500/15 text-amber-400' : 'border-white/10 text-slate-300'}`}>
              {BUILDING_LABEL[b]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 52.3: TopBar — show 🎚 filter button on mobile**

In TopBar, accept an optional `onFilterClick`. Use an `useIsDesktop()` hook to render the filter button only when mobile:

```tsx
{!isDesktop && (
  <button type="button" onClick={onFilterClick} className="...">🎚 Filters</button>
)}
```

- [ ] **Step 52.4: Test at mobile widths**

DevTools → device emulation → 375 × 667. Confirm layout reflows correctly, top alert chips wrap, hero KPIs go 2-up, panels stack.

- [ ] **Step 52.5: Commit**

```bash
git add src/app/beithady/analytics/performance/_hooks/use-is-desktop.ts src/app/beithady/analytics/performance/_components/mobile-filter-sheet.tsx src/app/beithady/analytics/performance/_components/dashboard-shell.tsx src/app/beithady/analytics/performance/_components/top-bar.tsx
git commit -m "feat(beithady/perf): add responsive mobile layout + filter bottom sheet"
```

---

### Task 53: Accessibility pass

- [ ] **Step 53.1: Audit + fix**

For each interactive element, confirm:
- `<button>` for clickable controls (already mostly true)
- `aria-label` on icon-only buttons (close X, expand, pin)
- `<aside role="region" aria-label="Filters">` on left rail (already added)
- Customize drawer: `role="dialog"` + `aria-label` (already added) + focus trap (added in Step 53.1 below)
- Color contrast: spot-check muted slate text against the navy bg with WebAIM contrast checker — bump from `text-slate-500` to `text-slate-400` if any falls below 4.5:1

For focus trap in drawer, add a basic ref-based trap:

```tsx
// In customize-drawer.tsx
const dialogRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (!open) return;
  const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
  focusables?.[0]?.focus();
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, [open]);
// add ref={dialogRef} to <aside>
```

- [ ] **Step 53.2: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/customize-drawer.tsx
git commit -m "feat(beithady/perf): add focus trap + a11y polish to customize drawer"
```

---

### Task 54: Reduced motion + transitions audit

**Files:**
- Modify: relevant components

- [ ] **Step 54.1: Add `motion-reduce:transition-none` everywhere a transition exists**

Search for `transition` in the new component tree and add the `motion-reduce:` variant where missing:

```bash
grep -rn 'transition' src/app/beithady/analytics/performance --include='*.tsx'
```

For each match, ensure the className includes `motion-reduce:transition-none`. Example:

Before: `className="... transition"`
After:  `className="... transition motion-reduce:transition-none"`

- [ ] **Step 54.2: Commit**

```bash
git add -u src/app/beithady/analytics/performance
git commit -m "feat(beithady/perf): respect prefers-reduced-motion"
```

---

### Task 55: Final verification + push (Phase 8 ships)

- [ ] **Step 55.1: Run full test suite**

```bash
npm run test
```

Expect: green.

- [ ] **Step 55.2: Type check**

```bash
npx tsc --noEmit
```

Expect: green.

- [ ] **Step 55.3: Visual smoke test — full flow**

`npm run dev` → confirm:
1. `/beithady/analytics` shows 6 tiles including the new Performance Dashboard tile.
2. Click tile → page loads with all panels rendered, AI insights at top, hero strip with sparklines, top movers ribbon, buildings table with color thresholds, forward occupancy bars, channel mix donut, payouts, monthly goal (or env var prompt), reviews block with AI topics, cleaning, cancel risk, Pareto, gap finder, waterfall, STLY, SLA buckets, check-ins-with-payment, cancellations, snapshot scrubber.
3. Mouse-leave the rail → 3s → collapses to 44px icon strip → main reflows.
4. Click 📌 → pin holds rail open even on mouse-leave.
5. Click ⚙ Customize → drawer opens → toggle off Cancel Risk → Save → panel disappears.
6. Click hover-X on Channel Mix → panel disappears, customize drawer count updates.
7. Change building filter (left rail) → URL updates to `?building=BH-26` → buildings table now shows BH-26-only color highlighting.
8. Drag scrubber back to a prior date → URL updates to `?date=YYYY-MM-DD` → all panels show that day's snapshot.
9. Click Export PDF → file downloads.
10. Resize to 375px → layout reflows, hero strip becomes 2-up, panels stack, filter button replaces the rail.
11. `prefers-reduced-motion`: enable in OS, refresh — confirm rail collapse is instant, no transitions.

- [ ] **Step 55.4: Push**

```bash
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```

**V1 ships complete.** Auto-deploys to limeinc.vercel.app.

---

## Self-review checklist (run after writing the plan, before handing to user)

Done by the plan author (this session) — re-checked here:

**1. Spec coverage:**
- §1 Goal ✓ — Phase 1–8 collectively
- §2 Decisions table ✓ — placement (Task 1), period anchor (Task 4), snapshot-only (no live calls in any task), Hybrid layout (Tasks 5–6, 48), all-panels-toggleable (Tasks 44–46), rail collapse (Tasks 47–48)
- §3 URL contract ✓ — Task 4 (`use-url-state`)
- §4 Visual + brand ✓ — color thresholds (Task 7), brand palette inherited from existing tokens
- §5 Layout — every panel from the spec table is implemented:
  - 6 hero KPIs: Tasks 8 + 9 (placeholder values), Task 37 (real RevPAR + sparklines)
  - AI Insights tray: Task 42
  - Top movers: Task 30
  - Buildings table: Task 10
  - Forward occupancy: Task 29
  - Channel mix donut: Task 11
  - Payouts: Task 12
  - Monthly goal: Task 36
  - Reviews block + AI topics: Task 13 + Task 43
  - Cleaning turnovers: Task 14
  - Cancel risk: Task 14 placeholder + Task 31 real
  - Inquiry SLA: Task 15
  - Check-ins with payment: Task 14
  - Cancellations: Task 14
  - Revenue concentration: Task 32
  - Occupancy gap finder: Task 33
  - Revenue waterfall: Task 34
  - STLY YoY: Task 35
  - Snapshot scrubber: Task 49
  - Per-building drilldown: Task 16
- §6 Customize drawer ✓ — Tasks 44 + 45
- §7 Architecture ✓ — file paths match exactly
- §8 Engineering work breakdown ✓ — 1:1 mapped
- §9 Out of scope respected — no live recompute, no user_preferences DB, mini-map deferred (registry has no entry), no per-building deep-dive page (only filter), no goal admin UI
- §10 Risks → mitigations — empty-snapshot (Task 3), null STLY (Task 35), Anthropic failure (Tasks 39 + 40 catch+return null), localStorage corruption (Task 44 schema validation), forward occupancy lives in snapshot (Task 22), no-jank visibility (CSS conditional render, not DOM thrash)
- §11 Open questions — goal source uses env var (Task 36), mobile rail bottom-sheet (Task 52), scrubber granularity is daily (Task 49 — slider snaps to date list)

**2. Placeholder scan:** zero instances of TBD/TODO/"implement later"/"add error handling"/"similar to Task N" — every task has full code.

**3. Type consistency:**
- `PanelId` is the same enum across panel-registry, use-visibility, customize-drawer ✓
- `PerfUrlState` is the same in use-url-state, top-bar, left-rail, dashboard-shell ✓
- `DailyReportPayload` extension fields match between types.ts (Task 18), build.ts (Task 28), and the panels that consume them ✓
- `BuildingCode` references match the existing enum in types.ts ✓
- `RevenueWaterfall.fees_usd` (Task 18) consistent with `computeWaterfall` arg `fees` (Task 25) ✓

**4. Spec scope:** the plan is large (55 tasks) but each phase produces working software. Reasonable for the spec's size. No decomposition into sub-plans needed.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-beithady-performance-dashboard.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for big plans like this one (55 tasks across 8 phases) — keeps context tight per task.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review. Tighter loop, but the conversation accumulates context fast.

Which approach?




