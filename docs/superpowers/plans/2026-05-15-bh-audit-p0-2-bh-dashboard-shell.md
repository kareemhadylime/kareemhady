# BH Dashboard Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the data-dashboard chrome (title bar, filter rail, mobile sheet, customize drawer, URL-state hook, rail-collapse hook) from `src/app/beithady/analytics/performance/_components/` into a shared package at `src/app/beithady/_components/dashboard-shell/`, then migrate Analytics Performance (full happy-path) and Fees Audit (outer shell only) to consume it. No behavior change on either page.

**Architecture:** Composition over configuration. `<BHDashboardShell>` is a layout-only wrapper that takes JSX slots (`titleBar`, `rail`, `mobileFilterSheet`, `drawer`, `children`). Each page wires up its own contents. URL state is opt-in via a typed generic `useBHUrlState<T>` hook — pages can use it or stick with local `useState` (fees-audit). Analytics Performance keeps its filter shape (Period / Building / Compare) via `usePerfUrlState` which becomes a 6-line wrapper around `useBHUrlState<PerfUrlState>`. Fees-audit keeps its bespoke `Sidebar.tsx` (filter rail + 9-group fee-category nav + auto-collapse/open-on-hover) and plugs it into the `rail` slot unchanged.

**Tech Stack:** Next.js 16 (App Router, server + client components), React 19, TypeScript strict, Vitest 1.x + @testing-library/react + jsdom for component tests, Tailwind v4 with BH brand CSS vars (`--bh-cream`, `--bh-ink`, `--bh-mute`, `--bh-steel`, `--bh-gold`, `--bh-heading`).

**Source spec:** [docs/superpowers/specs/2026-05-15-bh-dashboard-shell-design.md](../specs/2026-05-15-bh-dashboard-shell-design.md). **Parent audit:** [docs/superpowers/specs/2026-05-15-bh-design-audit-design.md](../specs/2026-05-15-bh-design-audit-design.md) §7.3, §8 row #2.

---

## File Structure

### New files (Phase A — shared package)

| File | Responsibility |
|---|---|
| `src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.tsx` | Layout-only responsive grid wrapper with rail/main/mobile-sheet/drawer slots |
| `src/app/beithady/_components/dashboard-shell/bh-title-bar.tsx` | Navy gradient header (eyebrow, title, subtitle, chips, actions, mobile filter button) |
| `src/app/beithady/_components/dashboard-shell/bh-left-rail.tsx` | Default filter rail taking raw `sections` array; collapsed/pinned support |
| `src/app/beithady/_components/dashboard-shell/bh-rail-pill.tsx` | Pill button helper for use inside `<BHLeftRail>` sections |
| `src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.tsx` | Bottom sheet that wraps any rail content for mobile |
| `src/app/beithady/_components/dashboard-shell/bh-customize-drawer.tsx` | Right-side overlay drawer container; children render arbitrary content |
| `src/app/beithady/_components/dashboard-shell/use-bh-url-state.ts` | Typed generic URL-state hook (`useBHUrlState<T>(opts)`) + pure `buildBHUrl<T>` helper |
| `src/app/beithady/_components/dashboard-shell/use-rail-collapse.ts` | Relocated from `analytics/performance/_hooks/`, same API |
| `src/app/beithady/_components/dashboard-shell/index.ts` | Barrel re-exports for ergonomic imports |
| `src/app/beithady/_components/dashboard-shell/bh-rail-pill.test.tsx` | jsdom test for `<BHRailPill>` |
| `src/app/beithady/_components/dashboard-shell/bh-left-rail.test.tsx` | jsdom test for `<BHLeftRail>` |
| `src/app/beithady/_components/dashboard-shell/bh-title-bar.test.tsx` | jsdom test for `<BHTitleBar>` |
| `src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.test.tsx` | jsdom test for `<BHMobileFilterSheet>` |
| `src/app/beithady/_components/dashboard-shell/bh-customize-drawer.test.tsx` | jsdom test for `<BHCustomizeDrawer>` |
| `src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.test.tsx` | jsdom test for `<BHDashboardShell>` |
| `src/app/beithady/_components/dashboard-shell/use-bh-url-state.test.ts` | node-env test for `buildBHUrl` (pure URL builder) |

### Files modified (Phase B & C — consumer migrations)

| File | Change |
|---|---|
| `src/app/beithady/analytics/performance/_hooks/use-url-state.ts` | Rewrite `usePerfUrlState` as a 6-line wrapper around `useBHUrlState<PerfUrlState>`. Keep exported `buildPerfUrl` for the existing test. |
| `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx` | Rewrite to compose from the new shared package. Drops the local layout / rail / title-bar / mobile-sheet / customize-drawer code; keeps panel rendering and delta math. Shrinks from ~590 lines to ~250 lines. |
| `src/app/beithady/analytics/reports/fees-audit/_components/FeeAuditDashboard.tsx` | Replace the outer `<div className="grid ...">` + raw `<Sidebar>` + raw `<TitleBar>` with `<BHDashboardShell titleBar={<BHTitleBar ... />} rail={<Sidebar ... />}>...</BHDashboardShell>`. |

### Files deleted

| File | Reason |
|---|---|
| `src/app/beithady/analytics/performance/_components/title-bar.tsx` | Replaced by `<BHTitleBar>` from shared package |
| `src/app/beithady/analytics/performance/_components/left-rail.tsx` | Replaced by `<BHLeftRail>` + `<BHRailPill>` from shared package |
| `src/app/beithady/analytics/performance/_components/mobile-filter-sheet.tsx` | Replaced by `<BHMobileFilterSheet>` from shared package |
| `src/app/beithady/analytics/performance/_components/customize-drawer.tsx` | Replaced by `<BHCustomizeDrawer>` from shared package |
| `src/app/beithady/analytics/performance/_components/top-bar.tsx` | Already-unused predecessor of title-bar.tsx |
| `src/app/beithady/analytics/performance/_hooks/use-rail-collapse.ts` | Relocated into shared package |
| `src/app/beithady/analytics/reports/fees-audit/_components/TitleBar.tsx` | Replaced by `<BHTitleBar>` from shared package |

### Files untouched on purpose

- `src/app/beithady/analytics/performance/_hooks/use-visibility.ts` + `.test.ts` — panel-visibility logic stays in the consumer (perf-specific).
- `src/app/beithady/analytics/performance/_lib/panel-registry.ts` — perf-specific.
- `src/app/beithady/analytics/performance/_components/panels/`, `panel-frame.tsx`, `empty-snapshot.tsx`, `manual-rebuild-button.tsx` — consumer-specific.
- `src/app/beithady/analytics/reports/fees-audit/_components/Sidebar.tsx` — bespoke filter+nav rail stays UNCHANGED; just plugged into the new shell's `rail` slot.
- All other fees-audit components (`KpiStrip`, `Heatmap`, `CrossRefTable`, `AnomalyInspector`, `QuoteCalculator`, etc.) — unchanged.

---

## Task 1: Relocate `useRailCollapse` into the shared package

**Files:**
- Create: `src/app/beithady/_components/dashboard-shell/use-rail-collapse.ts`
- (Delete later in Task 12: `src/app/beithady/analytics/performance/_hooks/use-rail-collapse.ts`)

- [ ] **Step 1: Create the relocated hook**

Create `src/app/beithady/_components/dashboard-shell/use-rail-collapse.ts` with exact content:

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Persisted across reloads so the operator's pin choice survives navigation.
// Bumped the v1 suffix only if the storage shape ever changes.
const STORAGE_KEY = 'bh:dashboard-shell:rail-pinned:v1';
const IDLE_MS = 3000;

export function useRailCollapse() {
  // SSR-safe: hydrate to defaults, sync from localStorage on mount.
  const [collapsed, setCollapsed] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === 'true') setPinned(true);
    } catch { /* swallow */ }
  }, []);

  const writePinned = useCallback((value: boolean) => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false'); } catch { /* swallow */ }
  }, []);

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      writePinned(next);
      if (next && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (next) setCollapsed(false);
      return next;
    });
  }, [writePinned]);

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
    }, IDLE_MS);
  }, [pinned]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { collapsed, pinned, togglePinned, handleEnter, handleLeave };
}
```

The only diff vs the original is the `STORAGE_KEY` value (renamed from `bh:perf-dashboard:rail-pinned:v1` to `bh:dashboard-shell:rail-pinned:v1`) — see Task 1 Step 2 for rationale.

- [ ] **Step 2: Decide on the localStorage key collision**

Issue: the original hook used `bh:perf-dashboard:rail-pinned:v1`. The relocated hook is shared, so the key should be generic. But changing the key means existing users lose their pin preference once.

Decision: **keep the original key** to preserve existing pins. Edit the new file:

Change line 5 back to:
```ts
const STORAGE_KEY = 'bh:perf-dashboard:rail-pinned:v1';
```

Add a comment above the constant:
```ts
// Legacy storage key — kept as-is to preserve existing operator pin preferences.
// Despite the "perf-dashboard" name, this hook now serves any BH dashboard.
const STORAGE_KEY = 'bh:perf-dashboard:rail-pinned:v1';
```

- [ ] **Step 3: Confirm the hook builds**

Run:

```bash
npx tsc --noEmit
```

Expected: clean (the new hook is identical to the old one type-wise, plus no consumer imports it yet).

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/_components/dashboard-shell/use-rail-collapse.ts
git commit -m "feat(bh-shell): relocate useRailCollapse to shared dashboard-shell package"
```

(The old `analytics/performance/_hooks/use-rail-collapse.ts` will be deleted in Task 12 after the consumer migrates to the new import path.)

---

## Task 2: `useBHUrlState<T>` typed generic URL-state hook

**Files:**
- Create: `src/app/beithady/_components/dashboard-shell/use-bh-url-state.ts`
- Create: `src/app/beithady/_components/dashboard-shell/use-bh-url-state.test.ts`

- [ ] **Step 1: Write the failing test for the pure URL builder**

Create `src/app/beithady/_components/dashboard-shell/use-bh-url-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBHUrl } from './use-bh-url-state';

type DemoState = { date: string | undefined; building: string; compare: string };

const defaults: DemoState = { date: undefined, building: 'all', compare: 'yesterday' };

function serialize(state: DemoState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.date) params.set('date', state.date);
  if (state.building && state.building !== 'all') params.set('building', state.building);
  if (state.compare && state.compare !== 'yesterday') params.set('compare', state.compare);
  return params;
}

describe('buildBHUrl', () => {
  it('returns basePath alone when all values are at defaults', () => {
    const url = buildBHUrl({
      current: defaults,
      patch: {},
      serialize,
      basePath: '/example',
    });
    expect(url).toBe('/example');
  });

  it('appends serialized query when at least one value diverges from defaults', () => {
    const url = buildBHUrl({
      current: defaults,
      patch: { building: 'BH-26' },
      serialize,
      basePath: '/example',
    });
    expect(url).toBe('/example?building=BH-26');
  });

  it('merges patch over current without losing existing params', () => {
    const url = buildBHUrl({
      current: { date: '2026-05-05', building: 'BH-26', compare: 'last-week' },
      patch: { building: 'BH-73' },
      serialize,
      basePath: '/example',
    });
    expect(url).toBe('/example?date=2026-05-05&building=BH-73&compare=last-week');
  });

  it('lets serialize decide which keys go in (e.g. emit explicit "none")', () => {
    const customSerialize = (s: DemoState): URLSearchParams => {
      const p = new URLSearchParams();
      if (s.compare === 'none') p.set('compare', 'none');
      return p;
    };
    const url = buildBHUrl({
      current: defaults,
      patch: { compare: 'none' },
      serialize: customSerialize,
      basePath: '/example',
    });
    expect(url).toBe('/example?compare=none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/use-bh-url-state.test.ts
```

Expected: FAIL with "Failed to resolve import" or "buildBHUrl is not a function" (file doesn't exist yet).

- [ ] **Step 3: Create the hook + builder file**

Create `src/app/beithady/_components/dashboard-shell/use-bh-url-state.ts`:

```ts
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export type BHUrlStateOpts<T> = {
  defaults: T;
  parse: (search: URLSearchParams) => T;
  serialize: (state: T) => URLSearchParams;
  basePath: string;
};

// Pure URL builder, extracted so the merge + serialize logic can be unit-tested
// without spinning up a Next router. The hook is the consumer-facing wrapper.
export function buildBHUrl<T>(args: {
  current: T;
  patch: Partial<T>;
  serialize: (state: T) => URLSearchParams;
  basePath: string;
}): string {
  const merged = { ...args.current, ...args.patch };
  const qs = args.serialize(merged).toString();
  return qs ? `${args.basePath}?${qs}` : args.basePath;
}

// Typed URL-state hook for BH data dashboards. Consumer declares the filter
// shape T and a (parse, serialize) pair; the hook handles reading from the
// URL, writing back via `router.push(url, { scroll: false })`, and exposing
// a typed `update(patch)` callback.
//
// Contract: `parse` MUST be total — return defaults for any unknown values,
// never throw. The page error boundary will not catch parse errors.
export function useBHUrlState<T>(opts: BHUrlStateOpts<T>): {
  state: T;
  update: (patch: Partial<T>) => void;
} {
  const router = useRouter();
  const search = useSearchParams();

  const state = useMemo(() => opts.parse(search), [search, opts]);

  const update = useCallback((patch: Partial<T>) => {
    const url = buildBHUrl({
      current: state,
      patch,
      serialize: opts.serialize,
      basePath: opts.basePath,
    });
    router.push(url, { scroll: false });
  }, [router, state, opts.serialize, opts.basePath]);

  return { state, update };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/use-bh-url-state.test.ts
```

Expected: 4/4 tests pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/_components/dashboard-shell/use-bh-url-state.ts src/app/beithady/_components/dashboard-shell/use-bh-url-state.test.ts
git commit -m "feat(bh-shell): add useBHUrlState<T> typed generic URL-state hook + buildBHUrl helper"
```

---

## Task 3: `<BHRailPill>` pill button helper

**Files:**
- Create: `src/app/beithady/_components/dashboard-shell/bh-rail-pill.tsx`
- Create: `src/app/beithady/_components/dashboard-shell/bh-rail-pill.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/_components/dashboard-shell/bh-rail-pill.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BHRailPill } from './bh-rail-pill';

describe('BHRailPill', () => {
  test('renders children as label', () => {
    const { getByRole } = render(<BHRailPill>Today</BHRailPill>);
    expect(getByRole('button').textContent).toBe('Today');
  });

  test('reports active state via aria-pressed', () => {
    const { getByRole } = render(<BHRailPill active>Today</BHRailPill>);
    expect(getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  test('fires onClick when not disabled', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<BHRailPill onClick={onClick}>Today</BHRailPill>);
    fireEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<BHRailPill onClick={onClick} disabled>Today</BHRailPill>);
    fireEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-rail-pill.test.tsx
```

Expected: FAIL — "Failed to resolve import './bh-rail-pill'".

- [ ] **Step 3: Create the component**

Create `src/app/beithady/_components/dashboard-shell/bh-rail-pill.tsx`:

```tsx
'use client';

type Props = {
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
};

// Pill button used inside <BHLeftRail> sections. Standard BH theming
// (ink-on-cream when active, transparent-with-mute-border when inactive,
// dim when disabled). Extracted from the original analytics/performance
// LeftRail's inline `Pill` helper so every consumer gets the same look.
export function BHRailPill({ active, children, onClick, disabled, title }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      aria-disabled={disabled}
      className="rounded-md border px-2.5 py-1.5 text-left text-[11px] transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed"
      style={
        disabled
          ? { background: 'transparent', color: 'var(--bh-steel)', borderColor: 'var(--bh-mute)', opacity: 0.6 }
          : active
            ? { background: 'var(--bh-ink)', color: 'var(--bh-cream)', borderColor: 'var(--bh-ink)' }
            : { background: 'transparent', color: 'var(--bh-ink)', borderColor: 'var(--bh-mute)' }
      }
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-rail-pill.test.tsx
```

Expected: 4/4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/_components/dashboard-shell/bh-rail-pill.tsx src/app/beithady/_components/dashboard-shell/bh-rail-pill.test.tsx
git commit -m "feat(bh-shell): add <BHRailPill> pill button helper for rail sections"
```

---

## Task 4: `<BHLeftRail>` generic filter rail

**Files:**
- Create: `src/app/beithady/_components/dashboard-shell/bh-left-rail.tsx`
- Create: `src/app/beithady/_components/dashboard-shell/bh-left-rail.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/_components/dashboard-shell/bh-left-rail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BHLeftRail } from './bh-left-rail';

describe('BHLeftRail', () => {
  test('renders supplied section titles and children', () => {
    const { getByText } = render(
      <BHLeftRail
        sections={[
          { title: 'Period', children: <span>period-content</span> },
          { title: 'Building', children: <span>building-content</span> },
        ]}
      />,
    );
    expect(getByText('Period')).toBeTruthy();
    expect(getByText('period-content')).toBeTruthy();
    expect(getByText('Building')).toBeTruthy();
    expect(getByText('building-content')).toBeTruthy();
  });

  test('renders collapsed icons (not sections) when collapsed=true', () => {
    const { queryByText, getByTitle } = render(
      <BHLeftRail
        sections={[{ title: 'Period', children: <span>period-content</span> }]}
        collapsedIcons={[{ emoji: '📅', title: 'Period' }]}
        collapsed
      />,
    );
    // Sections hidden:
    expect(queryByText('period-content')).toBeNull();
    // Icon shown:
    expect(getByTitle('Period').textContent).toBe('📅');
  });

  test('pin toggle invokes onTogglePin', () => {
    const onTogglePin = vi.fn();
    const { getByRole } = render(
      <BHLeftRail
        sections={[{ title: 'Period', children: <span>x</span> }]}
        onTogglePin={onTogglePin}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Pin rail/i }));
    expect(onTogglePin).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-left-rail.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/app/beithady/_components/dashboard-shell/bh-left-rail.tsx`:

```tsx
'use client';

export type BHRailSection = {
  title: string;
  children: React.ReactNode;
};

export type BHRailCollapsedIcon = {
  emoji: string;
  title: string;
};

type Props = {
  sections: BHRailSection[];
  collapsedIcons?: BHRailCollapsedIcon[];
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
};

// Filter rail for BH data dashboards. Doesn't know what the filters are —
// consumers compose the actual controls (typically <BHRailPill> instances)
// inside each section's `children`. When `collapsed=true` and
// `collapsedIcons` is provided, the rail shrinks to a ~44px-wide icon strip.
export function BHLeftRail({
  sections,
  collapsedIcons,
  collapsed = false,
  pinned = false,
  onTogglePin,
}: Props) {
  if (collapsed) {
    return (
      <aside
        role="region"
        aria-label="Filters (collapsed)"
        className="flex flex-col items-center gap-2 py-4"
        style={{ background: 'var(--bh-cream)', borderRight: '1px solid var(--bh-mute)' }}
      >
        {collapsedIcons?.map((icon, i) => (
          <span
            key={i}
            title={icon.title}
            className="flex h-7 w-7 items-center justify-center rounded text-xs select-none"
            style={{ color: 'var(--bh-steel)' }}
            aria-hidden="true"
          >
            {icon.emoji}
          </span>
        ))}
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? 'Unpin filters rail' : 'Pin filters rail open'}
            aria-pressed={pinned}
            className="mt-auto flex h-8 w-8 items-center justify-center rounded text-sm transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={
              pinned
                ? { background: 'var(--bh-ink)', color: 'var(--bh-cream)' }
                : { color: 'var(--bh-steel)' }
            }
          >
            📌
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside
      role="region"
      aria-label="Filters"
      className="flex flex-col gap-4 px-4 py-5"
      style={{ background: 'var(--bh-cream)', borderRight: '1px solid var(--bh-mute)' }}
    >
      {sections.map((section, i) => (
        <div key={i}>
          <h4
            className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em]"
            style={{ color: 'var(--bh-steel)' }}
          >
            {section.title}
          </h4>
          <div className="flex flex-col gap-1">{section.children}</div>
        </div>
      ))}
      {onTogglePin && (
        <div className="mt-auto pt-2" style={{ borderTop: '1px solid var(--bh-mute)' }}>
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? 'Unpin filters rail (allow auto-collapse)' : 'Pin filters rail open'}
            aria-pressed={pinned}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={
              pinned
                ? { background: 'var(--bh-ink)', color: 'var(--bh-cream)' }
                : { color: 'var(--bh-steel)' }
            }
          >
            <span>📌 Pin rail</span>
            <span aria-hidden="true">{pinned ? 'on' : 'off'}</span>
          </button>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-left-rail.test.tsx
```

Expected: 3/3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/_components/dashboard-shell/bh-left-rail.tsx src/app/beithady/_components/dashboard-shell/bh-left-rail.test.tsx
git commit -m "feat(bh-shell): add <BHLeftRail> generic filter rail with sections + collapsed icons"
```

---

## Task 5: `<BHMobileFilterSheet>` bottom sheet

**Files:**
- Create: `src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.tsx`
- Create: `src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BHMobileFilterSheet } from './bh-mobile-filter-sheet';

describe('BHMobileFilterSheet', () => {
  test('renders nothing when open=false', () => {
    const { container } = render(
      <BHMobileFilterSheet open={false} onClose={() => {}}>
        <div data-testid="content">filters</div>
      </BHMobileFilterSheet>,
    );
    expect(container.querySelector('[data-testid="content"]')).toBeNull();
  });

  test('renders children when open=true', () => {
    const { getByTestId } = render(
      <BHMobileFilterSheet open onClose={() => {}}>
        <div data-testid="content">filters</div>
      </BHMobileFilterSheet>,
    );
    expect(getByTestId('content').textContent).toBe('filters');
  });

  test('clicking the Done button fires onClose', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <BHMobileFilterSheet open onClose={onClose}>
        <div>x</div>
      </BHMobileFilterSheet>,
    );
    fireEvent.click(getByRole('button', { name: /Done/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.tsx`:

```tsx
'use client';
import { useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

// Bottom sheet wrapper for mobile filter UI. ESC + backdrop both close it.
// Locks body scroll while open. Renders nothing when closed.
export function BHMobileFilterSheet({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden" onClick={onClose} role="presentation">
      <div className="absolute inset-0 bg-[#003462]/40" />
      <div
        className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-2xl p-5 shadow-2xl"
        style={{ background: 'var(--bh-cream)', color: 'var(--bh-ink)', borderTop: '1px solid var(--bh-mute)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--bh-mute)' }} aria-hidden="true" />
        <h2 className="mb-3 text-lg font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>Filters</h2>
        {children}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md px-3 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ background: 'var(--bh-ink)', color: 'var(--bh-cream)' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.test.tsx
```

Expected: 3/3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.tsx src/app/beithady/_components/dashboard-shell/bh-mobile-filter-sheet.test.tsx
git commit -m "feat(bh-shell): add <BHMobileFilterSheet> bottom-sheet container for mobile filters"
```

---

## Task 6: `<BHCustomizeDrawer>` right-side overlay

**Files:**
- Create: `src/app/beithady/_components/dashboard-shell/bh-customize-drawer.tsx`
- Create: `src/app/beithady/_components/dashboard-shell/bh-customize-drawer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/_components/dashboard-shell/bh-customize-drawer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BHCustomizeDrawer } from './bh-customize-drawer';

describe('BHCustomizeDrawer', () => {
  test('renders nothing when open=false', () => {
    const { container } = render(
      <BHCustomizeDrawer open={false} onClose={() => {}} title="Customize">
        <div data-testid="content">panels</div>
      </BHCustomizeDrawer>,
    );
    expect(container.querySelector('[data-testid="content"]')).toBeNull();
  });

  test('renders children when open=true', () => {
    const { getByTestId } = render(
      <BHCustomizeDrawer open onClose={() => {}} title="Customize">
        <div data-testid="content">panels</div>
      </BHCustomizeDrawer>,
    );
    expect(getByTestId('content').textContent).toBe('panels');
  });

  test('clicking close (×) button fires onClose', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <BHCustomizeDrawer open onClose={onClose} title="Customize">
        <div>x</div>
      </BHCustomizeDrawer>,
    );
    fireEvent.click(getByLabelText('Close customize drawer'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-customize-drawer.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/app/beithady/_components/dashboard-shell/bh-customize-drawer.tsx`:

```tsx
'use client';
import { useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

// Right-side overlay drawer. ESC + backdrop both close it. Locks body scroll
// while open. Content is fully consumer-owned — this is just a chrome shell.
// Perf dashboard uses it for panel-visibility toggles; other pages can use it
// for any customization UI.
export function BHCustomizeDrawer({ open, onClose, title = 'Customize', footer, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose} role="presentation">
      <div className="absolute inset-0 bg-[#003462]/40" />
      <aside
        className="absolute right-0 top-0 flex h-full w-96 flex-col shadow-xl"
        style={{ background: 'var(--bh-cream)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--bh-mute)' }}
        >
          <h2
            className="text-lg font-semibold text-[#003462]"
            style={{ fontFamily: 'var(--bh-heading)' }}
          >
            ⚙ {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded text-[#6077a6] hover:text-[#003462] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
            aria-label="Close customize drawer"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <footer
            className="px-6 py-3 flex justify-between"
            style={{ borderTop: '1px solid var(--bh-mute)' }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-customize-drawer.test.tsx
```

Expected: 3/3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/_components/dashboard-shell/bh-customize-drawer.tsx src/app/beithady/_components/dashboard-shell/bh-customize-drawer.test.tsx
git commit -m "feat(bh-shell): add <BHCustomizeDrawer> right-side overlay container"
```

---

## Task 7: `<BHTitleBar>` navy gradient header

**Files:**
- Create: `src/app/beithady/_components/dashboard-shell/bh-title-bar.tsx`
- Create: `src/app/beithady/_components/dashboard-shell/bh-title-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/_components/dashboard-shell/bh-title-bar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { BHTitleBar } from './bh-title-bar';

describe('BHTitleBar', () => {
  test('renders title, eyebrow, and subtitle', () => {
    const { getByText } = render(
      <BHTitleBar
        eyebrow="Performance Dashboard"
        title="Fri, 15 May 2026 · Snapshot"
        subtitle="Data as of 09:00 Cairo"
      />,
    );
    expect(getByText('Performance Dashboard')).toBeTruthy();
    expect(getByText('Fri, 15 May 2026 · Snapshot')).toBeTruthy();
    expect(getByText('Data as of 09:00 Cairo')).toBeTruthy();
  });

  test('renders chips with their labels', () => {
    const { getByText } = render(
      <BHTitleBar
        title="x"
        chips={[
          { icon: Calendar, label: 'Cairo 09:00' },
          { icon: Calendar, label: 'BH-26' },
        ]}
      />,
    );
    expect(getByText('Cairo 09:00')).toBeTruthy();
    expect(getByText('BH-26')).toBeTruthy();
  });

  test('renders actions slot verbatim', () => {
    const { getByTestId } = render(
      <BHTitleBar
        title="x"
        actions={<button data-testid="custom-btn">Export</button>}
      />,
    );
    expect(getByTestId('custom-btn').textContent).toBe('Export');
  });

  test('mobile filter button calls onMobileFilterClick', () => {
    const onMobileFilterClick = vi.fn();
    const { getByRole } = render(
      <BHTitleBar title="x" onMobileFilterClick={onMobileFilterClick} />,
    );
    fireEvent.click(getByRole('button', { name: /Open filters/i }));
    expect(onMobileFilterClick).toHaveBeenCalledOnce();
  });

  test('mobile filter button is hidden when onMobileFilterClick is not provided', () => {
    const { queryByRole } = render(<BHTitleBar title="x" />);
    expect(queryByRole('button', { name: /Open filters/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-title-bar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/app/beithady/_components/dashboard-shell/bh-title-bar.tsx`:

```tsx
'use client';
import type { LucideIcon } from 'lucide-react';

export type BHTitleBarChip = {
  icon: LucideIcon;
  label: string;
};

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  chips?: BHTitleBarChip[];
  actions?: React.ReactNode;
  onMobileFilterClick?: () => void;
};

// Navy-gradient header for BH data dashboards. Eyebrow / title / subtitle /
// chips are all standardized; page-specific buttons (Export, Customize,
// Manual Rebuild, etc.) go in the `actions` slot. The mobile filter button
// (☰ Filters) shows on mobile only when `onMobileFilterClick` is provided.
export function BHTitleBar({
  eyebrow,
  title,
  subtitle,
  chips,
  actions,
  onMobileFilterClick,
}: Props) {
  return (
    <div
      className="rounded-xl px-5 py-4 shadow-sm"
      style={{
        background: 'linear-gradient(135deg, var(--bh-ink) 0%, #2c4d7a 100%)',
        border: '1px solid var(--bh-mute)',
      }}
    >
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <p
              className="text-[10px] uppercase tracking-[0.18em] mb-1"
              style={{ color: 'var(--bh-gold)' }}
            >
              {eyebrow}
            </p>
          )}
          <h2
            className="text-2xl font-bold leading-tight"
            style={{
              color: 'var(--bh-cream)',
              fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-xs" style={{ color: '#cbd5e1' }}>
              {subtitle}
            </p>
          )}
          {chips && chips.length > 0 && (
            <div
              className="flex items-center gap-3 mt-2 flex-wrap text-xs"
              style={{ color: '#cbd5e1' }}
            >
              {chips.map((chip, i) => {
                const Icon = chip.icon;
                return (
                  <span key={i} className="contents">
                    {i > 0 && <span style={{ color: 'var(--bh-mute)' }}>·</span>}
                    <span className="inline-flex items-center gap-1">
                      <Icon size={12} style={{ color: 'var(--bh-gold)' }} />
                      {chip.label}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onMobileFilterClick && (
            <button
              type="button"
              onClick={onMobileFilterClick}
              className="md:hidden rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                background: 'transparent',
                color: 'var(--bh-gold)',
                borderColor: 'var(--bh-gold)',
              }}
              aria-label="Open filters"
            >
              ☰ Filters
            </button>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-title-bar.test.tsx
```

Expected: 5/5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/_components/dashboard-shell/bh-title-bar.tsx src/app/beithady/_components/dashboard-shell/bh-title-bar.test.tsx
git commit -m "feat(bh-shell): add <BHTitleBar> navy gradient header with chips + actions slot"
```

---

## Task 8: `<BHDashboardShell>` responsive grid wrapper

**Files:**
- Create: `src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.tsx`
- Create: `src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { BHDashboardShell } from './bh-dashboard-shell';

// jsdom default media query is desktop (>=768px). Sets the rail visible by
// default. matchMedia('(max-width: 767px)') returns matches:false unless
// explicitly stubbed, so these tests cover desktop layout. Mobile collapse
// behaviour is covered by the in-shell useEffect, which is integration-tested
// via manual smoke in Task 15.

describe('BHDashboardShell', () => {
  test('renders titleBar, rail, and children in the right slots', () => {
    const { getByTestId } = render(
      <BHDashboardShell
        titleBar={<div data-testid="tb">title</div>}
        rail={<div data-testid="rl">rail</div>}
      >
        <div data-testid="main">main</div>
      </BHDashboardShell>,
    );
    expect(getByTestId('tb')).toBeTruthy();
    expect(getByTestId('rl')).toBeTruthy();
    expect(getByTestId('main')).toBeTruthy();
  });

  test('renders drawer when provided', () => {
    const { getByTestId } = render(
      <BHDashboardShell
        titleBar={<div>tb</div>}
        rail={<div>rl</div>}
        drawer={<div data-testid="dr">drawer</div>}
      >
        <div>main</div>
      </BHDashboardShell>,
    );
    expect(getByTestId('dr')).toBeTruthy();
  });

  test('omits drawer when prop is undefined', () => {
    const { queryByTestId } = render(
      <BHDashboardShell titleBar={<div>tb</div>} rail={<div>rl</div>}>
        <div>main</div>
      </BHDashboardShell>,
    );
    expect(queryByTestId('dr')).toBeNull();
  });

  test('renders mobileFilterSheet sibling when provided', () => {
    const { getByTestId } = render(
      <BHDashboardShell
        titleBar={<div>tb</div>}
        rail={<div>rl</div>}
        mobileFilterSheet={<div data-testid="mfs">mobile-sheet</div>}
      >
        <div>main</div>
      </BHDashboardShell>,
    );
    expect(getByTestId('mfs')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRailCollapse } from './use-rail-collapse';

type Props = {
  titleBar: React.ReactNode;
  rail: React.ReactNode;
  mobileFilterSheet?: React.ReactNode;
  drawer?: React.ReactNode;
  children: React.ReactNode;
  // Optional override for collapse state. If omitted, internal useRailCollapse
  // governs hover-collapse + pinning behavior.
  railCollapsed?: boolean;
  railPinned?: boolean;
  onRailEnter?: () => void;
  onRailLeave?: () => void;
};

// Layout-only wrapper for BH data dashboards. Title bar full-width, rail
// in a left column, children in a right column. Switches to mobile layout
// (rail hidden, mobileFilterSheet handles filters) under (max-width: 767px).
// Drawer is rendered as a sibling so it can overlay everything.
export function BHDashboardShell({
  titleBar,
  rail,
  mobileFilterSheet,
  drawer,
  children,
  railCollapsed,
  railPinned,
  onRailEnter,
  onRailLeave,
}: Props) {
  const internal = useRailCollapse();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const updateMobile = () => setIsMobile(mq.matches);
    updateMobile();
    mq.addEventListener('change', updateMobile);
    return () => mq.removeEventListener('change', updateMobile);
  }, []);

  // Caller controls collapse when railCollapsed is provided; otherwise the
  // internal hook governs. Same for hover handlers — caller can opt out by
  // passing onRailEnter/Leave={() => {}} or rely on the defaults.
  const collapsed = railCollapsed ?? internal.collapsed;
  const handleEnter = onRailEnter ?? internal.handleEnter;
  const handleLeave = onRailLeave ?? internal.handleLeave;

  const railColWidth = isMobile ? 0 : (collapsed ? 44 : 200);

  return (
    <>
      {titleBar}
      <div
        className="grid mt-6 transition-[grid-template-columns] duration-[250ms] ease motion-reduce:transition-none"
        style={{ gridTemplateColumns: `${railColWidth}px 1fr` }}
        onMouseEnter={isMobile ? undefined : handleEnter}
        onMouseLeave={isMobile ? undefined : handleLeave}
      >
        <div className={isMobile ? 'hidden' : ''}>{rail}</div>
        <main className="grid grid-cols-12 gap-3 sm:gap-4">{children}</main>
      </div>
      {drawer}
      {mobileFilterSheet}
    </>
  );
}
```

Note: the props `railPinned` is accepted but not directly used in this layout component — the consumer typically passes `pinned` directly into the `rail` slot's component (e.g. `<BHLeftRail pinned={...}>`). It's kept in the API for symmetry / future use.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.test.tsx
```

Expected: 4/4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.tsx src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.test.tsx
git commit -m "feat(bh-shell): add <BHDashboardShell> responsive grid wrapper with slot composition"
```

---

## Task 9: Barrel `index.ts`

**Files:**
- Create: `src/app/beithady/_components/dashboard-shell/index.ts`

- [ ] **Step 1: Create the barrel**

Create `src/app/beithady/_components/dashboard-shell/index.ts`:

```ts
export { BHDashboardShell } from './bh-dashboard-shell';
export { BHTitleBar, type BHTitleBarChip } from './bh-title-bar';
export { BHLeftRail, type BHRailSection, type BHRailCollapsedIcon } from './bh-left-rail';
export { BHRailPill } from './bh-rail-pill';
export { BHMobileFilterSheet } from './bh-mobile-filter-sheet';
export { BHCustomizeDrawer } from './bh-customize-drawer';
export { useBHUrlState, buildBHUrl, type BHUrlStateOpts } from './use-bh-url-state';
export { useRailCollapse } from './use-rail-collapse';
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Full suite sanity**

```bash
npm run test
```

Expected: baseline + new tests for the package (6 component test files × 3–5 tests each, plus 4 buildBHUrl tests). Roughly 559 + ~20 = ~579 passing. Zero regressions on existing tests.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/_components/dashboard-shell/index.ts
git commit -m "feat(bh-shell): add barrel index for dashboard-shell package"
```

---

## Task 10: Rewrite `usePerfUrlState` as a `useBHUrlState` wrapper

**Files:**
- Modify: `src/app/beithady/analytics/performance/_hooks/use-url-state.ts`

- [ ] **Step 1: Confirm the existing test will still pass**

The existing `use-url-state.test.ts` (3 tests) imports and exercises `buildPerfUrl`. The new file MUST keep exporting `buildPerfUrl` with the same signature and behavior so the test passes unchanged.

- [ ] **Step 2: Rewrite the file**

Replace the entire content of `src/app/beithady/analytics/performance/_hooks/use-url-state.ts` with:

```ts
'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';

export type CompareMode = 'yesterday' | 'last-week' | 'last-month' | 'last-year' | 'none';

export type PerfUrlState = {
  date: string | undefined;
  building: string;
  compare: CompareMode;
};

const BASE_PATH = '/beithady/analytics/performance';

const DEFAULTS: PerfUrlState = {
  date: undefined,
  building: 'all',
  compare: 'yesterday',
};

function parsePerf(search: URLSearchParams): PerfUrlState {
  return {
    date: search.get('date') ?? undefined,
    building: search.get('building') ?? 'all',
    compare: (search.get('compare') as CompareMode | null) ?? 'yesterday',
  };
}

function serializePerf(state: PerfUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.date) params.set('date', state.date);
  if (state.building && state.building !== 'all') params.set('building', state.building);
  if (state.compare && state.compare !== 'yesterday') params.set('compare', state.compare);
  return params;
}

// Kept as a named export for the existing test (`use-url-state.test.ts`)
// which exercises the pure URL-building path without spinning up next/navigation.
export function buildPerfUrl(current: PerfUrlState, patch: Partial<PerfUrlState>): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializePerf,
    basePath: BASE_PATH,
  });
}

export function usePerfUrlState() {
  return useBHUrlState<PerfUrlState>({
    defaults: DEFAULTS,
    parse: parsePerf,
    serialize: serializePerf,
    basePath: BASE_PATH,
  });
}
```

- [ ] **Step 3: Run the existing test to verify it still passes**

```bash
npx vitest run src/app/beithady/analytics/performance/_hooks/use-url-state.test.ts
```

Expected: 3/3 pass (same tests as before — `buildPerfUrl` behavior unchanged).

- [ ] **Step 4: Run the full suite**

```bash
npm run test
```

Expected: no new failures. The dashboard-shell tests + perf URL state test all pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. The `usePerfUrlState` consumer at `dashboard-shell.tsx` (analytics/performance) still imports the same name with the same return shape.

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/analytics/performance/_hooks/use-url-state.ts
git commit -m "refactor(perf): rewrite usePerfUrlState as a useBHUrlState<PerfUrlState> wrapper"
```

---

## Task 11: Rewrite `analytics/performance/_components/dashboard-shell.tsx` to consume shared primitives

**Files:**
- Modify: `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`

**This is the largest single task in the plan.** The file shrinks from ~590 lines to ~250 lines because layout/rail/title-bar/mobile-sheet/customize-drawer code moves to the shared package; what stays is the panel rendering + delta math + bucket selection.

- [ ] **Step 1: Open the current file and locate the four sections that move**

Open `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`. Identify:
- Imports of `TitleBar`, `LeftRail`, `CustomizeDrawer`, `MobileFilterSheet` → will be replaced.
- Import of `useRailCollapse` → will move to new package import.
- The `<TitleBar generatedAt=... reportDate=...>` block → replaced with `<BHTitleBar>`.
- The `<div className="grid mt-6 transition-[grid-template-columns]...">` + nested `<LeftRail>` block → replaced with `<BHDashboardShell rail={<BHLeftRail .../>}>`.
- The `<CustomizeDrawer onClose={...}>` block → replaced with `<BHCustomizeDrawer>` containing the perf-specific panel checkboxes.
- The `<MobileFilterSheet open={...}>` block → replaced with `<BHMobileFilterSheet>` containing a `<BHLeftRail>` (same sections as desktop).

- [ ] **Step 2: Rewrite the file**

Replace the entire content with:

```tsx
'use client';
import { useState } from 'react';
import { Calendar, Building2, ArrowLeftRight, Settings } from 'lucide-react';
import Link from 'next/link';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHRailPill,
  BHMobileFilterSheet,
  BHCustomizeDrawer,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { HeroKpi } from './panels/hero-kpi';
import { BuildingsTable } from './panels/buildings-table';
import { ChannelMixDonut } from './panels/channel-mix-donut';
import { Payouts } from './panels/payouts';
import { ReviewsBlock } from './panels/reviews-block';
import { CleaningTurnovers } from './panels/cleaning-turnovers';
import { InquirySlaBuckets } from './panels/inquiry-sla-buckets';
import { CheckInsPayment } from './panels/check-ins-payment';
import { Cancellations } from './panels/cancellations';
import { TopMoversRibbon } from './panels/top-movers-ribbon';
import { ForwardOccupancyBars } from './panels/forward-occupancy-bars';
import { CancelRisk } from './panels/cancel-risk';
import { RevenueConcentration } from './panels/revenue-concentration';
import { OccupancyGapFinder } from './panels/occupancy-gap-finder';
import { RevenueWaterfall } from './panels/revenue-waterfall';
import { StlyYoy } from './panels/stly-yoy';
import { MonthlyGoal } from './panels/monthly-goal';
import { AIInsightsTray } from './panels/ai-insights-tray';
import { DailyActivity } from './panels/daily-activity';
import { SnapshotScrubber } from './panels/snapshot-scrubber';
import { useVisibility } from '../_hooks/use-visibility';
import { usePerfUrlState, type CompareMode } from '../_hooks/use-url-state';
import { PANELS, PANEL_GROUPS, type PanelGroupId } from '../_lib/panel-registry';
import type { BuildingCode, DailyReportPayload } from '@/lib/beithady-daily-report/types';

const BUILDING_CODE_SET: ReadonlySet<string> = new Set([
  'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'OTHER',
]);

const BUILDINGS = [
  { value: 'all', label: 'All' },
  { value: 'BH-26', label: 'BH-26' },
  { value: 'BH-73', label: 'BH-73' },
  { value: 'BH-435', label: 'BH-435' },
  { value: 'BH-OK', label: 'BH-OK' },
  { value: 'OTHER', label: 'Other' },
] as const;

const COMPARES = [
  { value: 'yesterday', label: 'vs Yesterday' },
  { value: 'last-week', label: 'vs Last Week' },
  { value: 'last-month', label: 'vs Last Month' },
  { value: 'last-year', label: 'vs Last Year' },
  { value: 'none', label: 'None' },
] as const;

const COMPARE_LABEL: Record<CompareMode, string> = {
  yesterday: 'vs yesterday',
  'last-week': 'vs last week',
  'last-month': 'vs last month',
  'last-year': 'vs last year',
  none: '',
};

const BUILDING_LABEL: Record<string, string> = {
  all: 'All buildings',
  'BH-26': 'BH-26',
  'BH-73': 'BH-73',
  'BH-435': 'BH-435',
  'BH-OK': 'BH-OK',
  OTHER: 'Other',
};

const COMPARE_CHIP_LABEL: Record<CompareMode, string> = {
  yesterday: 'vs Yesterday',
  'last-week': 'vs Last Week',
  'last-month': 'vs Last Month',
  'last-year': 'vs Last Year',
  none: 'No comparison',
};

type Props = {
  payload: DailyReportPayload;
  snapshotDate: string;
  generatedAt: string;
  initialBuilding: string;
  initialCompare: CompareMode;
  earliestDate: string | null;
  latestDate: string | null;
  priorPayload: DailyReportPayload | null;
  priorDate: string | null;
  priorTargetDate: string | null;
  priorOffsetDays: number;
  dxbCounts?: { check_ins_today: number; check_outs_today: number; turnovers_today: number; occupied_today: number };
};

function ymdMinusOne(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function DashboardShell({
  payload,
  snapshotDate,
  generatedAt,
  initialBuilding: _initialBuilding,
  initialCompare: _initialCompare,
  earliestDate,
  latestDate,
  priorPayload,
  priorDate,
  priorTargetDate,
  priorOffsetDays,
  dxbCounts,
}: Props) {
  const { state, update } = usePerfUrlState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const { visibility, setPanel, hiddenCount, reset } = useVisibility();

  // ---- Bucket & filter derivations (unchanged from previous implementation) ----
  const buildingFilter: BuildingCode | 'all' =
    BUILDING_CODE_SET.has(state.building) ? (state.building as BuildingCode) : 'all';
  const bucket = buildingFilter === 'all' ? payload.all : payload.per_building[buildingFilter];
  const isFiltered = buildingFilter !== 'all';
  const filterSuffix = isFiltered ? ` · ${buildingFilter}` : '';
  const paceAccent = bucket.pickup_vs_prior_month_pct >= 0 ? 'green' : 'red';
  const revparValue =
    isFiltered && payload.revpar?.by_building
      ? payload.revpar.by_building[buildingFilter as BuildingCode] ?? null
      : payload.revpar?.all ?? null;

  const priorBucket =
    priorPayload && (buildingFilter === 'all' ? priorPayload.all : priorPayload.per_building[buildingFilter]);
  const priorRevpar = priorPayload?.revpar
    ? isFiltered && priorPayload.revpar.by_building
      ? priorPayload.revpar.by_building[buildingFilter as BuildingCode] ?? null
      : priorPayload.revpar.all ?? null
    : null;
  const compareLabel = COMPARE_LABEL[state.compare];
  const compareActive = state.compare !== 'none' && !!priorBucket;

  function ppDelta(current: number, prior: number, fallback: string) {
    if (!compareActive || prior === undefined || prior === null) {
      return { direction: 'flat' as const, text: fallback };
    }
    const d = current - prior;
    const sign = d > 0.05 ? '+' : '';
    return {
      direction: d > 0.05 ? ('up' as const) : d < -0.05 ? ('down' as const) : ('flat' as const),
      text: `${sign}${d.toFixed(1)}pp ${compareLabel}`,
    };
  }
  function pctDelta(current: number, prior: number, fallback: string) {
    if (!compareActive || !prior) {
      return { direction: 'flat' as const, text: fallback };
    }
    const pct = ((current - prior) / Math.abs(prior)) * 100;
    const sign = pct > 0.1 ? '+' : '';
    return {
      direction: pct > 0.1 ? ('up' as const) : pct < -0.1 ? ('down' as const) : ('flat' as const),
      text: `${sign}${pct.toFixed(1)}% ${compareLabel}`,
    };
  }
  function absDelta(current: number, prior: number, unit: string, fallback: string, invert = false) {
    if (!compareActive || prior === undefined || prior === null) {
      return { direction: 'flat' as const, text: fallback };
    }
    const d = current - prior;
    const sign = d > 0 ? '+' : '';
    const dir = d === 0 ? 'flat' : invert ? (d > 0 ? 'down' : 'up') : (d > 0 ? 'up' : 'down');
    return {
      direction: dir as 'up' | 'down' | 'flat',
      text: `${sign}${d.toFixed(unit === '★' ? 1 : 0)}${unit} ${compareLabel}`,
    };
  }

  // ---- Rail content (Period / Building / Compare sections, used both on desktop + mobile) ----
  const yesterdayYmd = ymdMinusOne(snapshotDate);
  const isYesterday = state.date === yesterdayYmd;
  const isToday = !state.date && !isYesterday;
  const isOtherDate = !!state.date && !isYesterday;

  const railSections: BHRailSection[] = [
    {
      title: 'Period',
      children: (
        <>
          <BHRailPill active={isToday} onClick={() => update({ date: undefined })}>Today</BHRailPill>
          <BHRailPill active={isYesterday} onClick={() => update({ date: yesterdayYmd })}>Yesterday</BHRailPill>
          <BHRailPill disabled title="Weekly aggregate not yet supported — use the snapshot scrubber for historical days.">
            This week <span style={{ opacity: 0.7 }}>· soon</span>
          </BHRailPill>
          {isOtherDate && (
            <BHRailPill active onClick={() => update({ date: undefined })} title="Click to return to latest">
              {state.date}
            </BHRailPill>
          )}
        </>
      ),
    },
    {
      title: 'Building',
      children: (
        <>
          {BUILDINGS.map((b) => (
            <BHRailPill key={b.value} active={state.building === b.value} onClick={() => update({ building: b.value })}>
              {b.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
    {
      title: 'Compare',
      children: (
        <>
          {COMPARES.map((c) => (
            <BHRailPill key={c.value} active={state.compare === c.value} onClick={() => update({ compare: c.value })}>
              {c.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
  ];

  // ---- Title bar chips + actions ----
  const cairoTime = new Date(generatedAt).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit',
  });
  const dateLabel = new Date(snapshotDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
  const titleBarChips = [
    { icon: Calendar, label: `Data as of ${cairoTime} Cairo` },
    { icon: Building2, label: BUILDING_LABEL[state.building] ?? state.building },
    { icon: ArrowLeftRight, label: COMPARE_CHIP_LABEL[state.compare] ?? state.compare },
  ];

  const titleBarActions = (
    <>
      <Link
        href={`/api/beithady/perf/export-pdf${snapshotDate ? `?date=${snapshotDate}` : ''}`}
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'transparent', color: 'var(--bh-gold)', borderColor: 'var(--bh-gold)' }}
        aria-label="Export current snapshot as PDF"
      >
        ⤓ Export PDF
      </Link>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'var(--bh-gold)', color: 'var(--bh-ink)' }}
      >
        <Settings size={11} className="inline mr-1" />
        Customize{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
      </button>
    </>
  );

  // ---- Customize drawer content (panel checkboxes) ----
  const groups = Object.keys(PANEL_GROUPS) as PanelGroupId[];
  const customizeBody = (
    <>
      {groups.map((groupId) => {
        const groupPanels = PANELS.filter((p) => p.group === groupId);
        if (groupPanels.length === 0) return null;
        return (
          <section key={groupId} className="mb-5">
            <h3 className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: 'var(--bh-steel)' }}>
              {PANEL_GROUPS[groupId]}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {groupPanels.map((p) => (
                <li key={p.id}>
                  <label
                    htmlFor={`vis-${p.id}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-[12px] cursor-pointer hover:opacity-90"
                    style={{ borderColor: 'var(--bh-mute)', background: 'var(--bh-cream)', color: 'var(--bh-ink)' }}
                  >
                    <span>{p.label}</span>
                    <span className="relative inline-flex">
                      <input
                        id={`vis-${p.id}`}
                        type="checkbox"
                        checked={visibility[p.id]}
                        onChange={(e) => setPanel(p.id, e.target.checked)}
                        className="peer h-5 w-9 cursor-pointer appearance-none rounded-full bg-[#eae9f3] outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-1 checked:bg-[#003462]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none peer-checked:translate-x-4"
                      />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );

  const customizeFooter = (
    <>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border px-3 py-1.5 text-xs hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ borderColor: 'var(--bh-mute)', background: 'var(--bh-cream)', color: 'var(--bh-ink)' }}
      >
        Reset to default
      </button>
      <button
        type="button"
        onClick={() => setDrawerOpen(false)}
        className="rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'var(--bh-ink)', color: 'var(--bh-cream)' }}
      >
        Done
      </button>
    </>
  );

  return (
    <BHDashboardShell
      titleBar={
        <BHTitleBar
          eyebrow="Performance Dashboard"
          title={`${dateLabel} · Snapshot`}
          chips={titleBarChips}
          actions={titleBarActions}
          onMobileFilterClick={() => setMobileFilterOpen(true)}
        />
      }
      rail={<BHLeftRail sections={railSections} />}
      mobileFilterSheet={
        <BHMobileFilterSheet open={mobileFilterOpen} onClose={() => setMobileFilterOpen(false)}>
          <BHLeftRail sections={railSections} />
        </BHMobileFilterSheet>
      }
      drawer={
        <BHCustomizeDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Customize"
          footer={customizeFooter}
        >
          {customizeBody}
        </BHCustomizeDrawer>
      }
    >
      {/* === BANNERS === */}
      {isFiltered && (
        <div
          className="col-span-12 rounded-md px-3 py-2 text-[11px]"
          style={{ background: '#fdf3da', color: '#7a5300', border: '1px solid #f1d889' }}
          role="status"
        >
          Filtered to <strong>{buildingFilter}</strong> — Hero KPIs and Daily activity show {buildingFilter} only.
          Channel mix, payouts, reviews, and other portfolio panels show all-portfolio data.{' '}
          <button
            type="button"
            onClick={() => update({ building: 'all' })}
            className="underline hover:opacity-80"
            style={{ color: '#7a5300' }}
          >
            Clear filter
          </button>
        </div>
      )}

      {compareActive && priorDate && (
        <div
          className="col-span-12 rounded-md px-3 py-2 text-[11px]"
          style={{ background: '#eef3fb', color: 'var(--bh-ink)', border: '1px solid var(--bh-mute)' }}
          role="status"
        >
          Comparing <strong>{snapshotDate}</strong> {compareLabel} (<strong>{priorDate}</strong>
          {priorOffsetDays !== 0 && priorTargetDate && (
            <span style={{ color: 'var(--bh-steel)' }}>
              {' '}— nearest available, {Math.abs(priorOffsetDays)} day{Math.abs(priorOffsetDays) === 1 ? '' : 's'}{' '}
              {priorOffsetDays > 0 ? 'before' : 'after'} target {priorTargetDate}
            </span>
          )}
          ) — Hero KPIs show ▲/▼ deltas.{' '}
          <button
            type="button"
            onClick={() => update({ compare: 'none' })}
            className="underline hover:opacity-80"
            style={{ color: 'var(--bh-ink)' }}
          >
            Clear compare
          </button>
        </div>
      )}
      {state.compare !== 'none' && !priorPayload && priorTargetDate && (
        <div
          className="col-span-12 rounded-md px-3 py-2 text-[11px]"
          style={{ background: '#fdecec', color: '#9a2828', border: '1px solid #f1bcbc' }}
          role="status"
        >
          Compare {COMPARE_LABEL[state.compare]}: no well-formed snapshot in the ±3-day window around{' '}
          <strong>{priorTargetDate}</strong> — deltas hidden.{' '}
          <button
            type="button"
            onClick={() => update({ compare: 'none' })}
            className="underline hover:opacity-80"
            style={{ color: '#9a2828' }}
          >
            Clear compare
          </button>
        </div>
      )}

      {/* === PANELS === */}
      {visibility['ai-insights'] && (
        <div className="col-span-12">
          <AIInsightsTray payload={payload} onHide={() => setPanel('ai-insights', false)} />
        </div>
      )}

      {visibility['daily-activity'] && (
        <div className="col-span-12">
          <DailyActivity
            payload={payload}
            snapshotDate={snapshotDate}
            buildingFilter={buildingFilter}
            latestDate={latestDate}
            dxbCounts={dxbCounts}
            onDateChange={(d) =>
              update({ date: latestDate && d === latestDate ? undefined : d })
            }
            onHide={() => setPanel('daily-activity', false)}
          />
        </div>
      )}

      <div className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5">
        {visibility['hero-occupancy'] && (
          <HeroKpi
            label={`Occupancy today${filterSuffix}`}
            value={`${bucket.occupancy_today_pct.toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta(bucket.occupancy_today_pct, priorBucket.occupancy_today_pct, 'today') : { direction: 'flat', text: 'today' }}
            spark={isFiltered ? undefined : payload.sparklines?.occupancy}
            drillTo="/beithady/analytics/performance"
            accent="ink"
            onHide={() => setPanel('hero-occupancy', false)}
          />
        )}
        {visibility['hero-mtd-occupancy'] && (
          <HeroKpi
            label={`MTD Occupancy${filterSuffix}`}
            value={`${bucket.backward_occupancy_pct.toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta(bucket.backward_occupancy_pct, priorBucket.backward_occupancy_pct, '1st → today') : { direction: 'flat', text: '1st → today' }}
            spark={isFiltered ? undefined : payload.sparklines?.mtd_occupancy}
            drillTo="/beithady/analytics/performance?metric=backward-occupancy"
            accent="steel"
            onHide={() => setPanel('hero-mtd-occupancy', false)}
          />
        )}
        {visibility['hero-month-to-end-occupancy'] && (
          <HeroKpi
            label={`Month-to-End Occupancy${filterSuffix}`}
            value={`${bucket.forward_occupancy_pct.toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta(bucket.forward_occupancy_pct, priorBucket.forward_occupancy_pct, 'today → EOM, OTB') : { direction: 'flat', text: 'today → EOM, OTB' }}
            spark={isFiltered ? undefined : payload.sparklines?.month_to_end_occupancy}
            drillTo="/beithady/analytics/performance?metric=forward-occupancy"
            accent="steel"
            onHide={() => setPanel('hero-month-to-end-occupancy', false)}
          />
        )}
        {visibility['hero-month-occupancy'] && (
          <HeroKpi
            label={`Month Occupancy${filterSuffix}`}
            value={`${(bucket.month_occupancy_pct ?? 0).toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta((bucket.month_occupancy_pct ?? 0), (priorBucket.month_occupancy_pct ?? 0), 'whole month, OTB') : { direction: 'flat', text: 'whole month, OTB' }}
            spark={isFiltered ? undefined : payload.sparklines?.month_occupancy}
            drillTo="/beithady/analytics/performance?metric=month-occupancy"
            accent="gold"
            onHide={() => setPanel('hero-month-occupancy', false)}
          />
        )}
        {visibility['hero-pace'] && (
          <HeroKpi
            label={`Pace${filterSuffix}`}
            value={`${bucket.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${bucket.pickup_vs_prior_month_pct.toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta(bucket.pickup_vs_prior_month_pct, priorBucket.pickup_vs_prior_month_pct, 'vs prior month') : { direction: bucket.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: 'vs prior month' }}
            spark={isFiltered ? undefined : payload.sparklines?.pace}
            drillTo={`/beithady/analytics/performance?date=${snapshotDate}&compare=last-month`}
            accent={paceAccent as 'green' | 'red'}
            onHide={() => setPanel('hero-pace', false)}
          />
        )}
        {visibility['hero-mtd-revenue-actual'] && (
          <HeroKpi
            label={`MTD Revenue${filterSuffix}`}
            value={`$${((bucket.revenue_mtd_actual_usd ?? 0) / 1000).toFixed(1)}k`}
            delta={compareActive && priorBucket ? pctDelta((bucket.revenue_mtd_actual_usd ?? 0), (priorBucket.revenue_mtd_actual_usd ?? 0), 'check-ins so far') : { direction: 'flat', text: 'check-ins so far' }}
            spark={isFiltered ? undefined : payload.sparklines?.mtd_revenue_actual}
            drillTo="/beithady/financials?period=mtd-actual"
            accent="gold"
            onHide={() => setPanel('hero-mtd-revenue-actual', false)}
          />
        )}
        {visibility['hero-mtd-revenue'] && (
          <HeroKpi
            label={`Month Revenue (OTB)${filterSuffix}`}
            value={`$${(bucket.revenue_mtd_usd / 1000).toFixed(1)}k`}
            delta={compareActive && priorBucket ? pctDelta(bucket.revenue_mtd_usd, priorBucket.revenue_mtd_usd, 'incl. confirmed → EOM') : { direction: bucket.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: 'incl. confirmed → EOM' }}
            spark={isFiltered ? undefined : payload.sparklines?.mtd_revenue}
            drillTo="/beithady/financials?period=month-otb"
            accent="gold"
            onHide={() => setPanel('hero-mtd-revenue', false)}
          />
        )}
        {visibility['hero-revpar'] && (
          <HeroKpi
            label={`RevPAR${filterSuffix}`}
            value={revparValue != null ? `$${revparValue.toFixed(2)}` : `$${bucket.adr_mtd_usd.toFixed(0)}`}
            delta={
              compareActive && revparValue != null && priorRevpar != null
                ? pctDelta(revparValue, priorRevpar, 'rev / available night')
                : revparValue != null
                  ? { direction: 'flat', text: 'rev / available night' }
                  : { direction: 'flat', text: 'ADR (RevPAR pending)' }
            }
            spark={isFiltered ? undefined : payload.sparklines?.revpar}
            drillTo="/beithady/financials?metric=revpar"
            accent="steel"
            onHide={() => setPanel('hero-revpar', false)}
          />
        )}
        {visibility['hero-reviews-avg'] && (
          <HeroKpi
            label="Reviews avg"
            value={`${payload.reviews.avg_rating_mtd.toFixed(1)}★`}
            delta={
              compareActive && priorPayload
                ? absDelta(payload.reviews.avg_rating_mtd, priorPayload.reviews.avg_rating_mtd, '★', `${payload.reviews.count_mtd} reviews · ${payload.reviews.last_24h.filter((r) => r.flagged).length} flagged`)
                : { direction: 'flat', text: `${payload.reviews.count_mtd} reviews · ${payload.reviews.last_24h.filter((r) => r.flagged).length} flagged` }
            }
            spark={payload.sparklines?.reviews_avg}
            drillTo="/beithady/analytics/reviews?period=mtd"
            accent="amber"
            onHide={() => setPanel('hero-reviews-avg', false)}
          />
        )}
        {visibility['hero-response-time'] && (
          <HeroKpi
            label="Response time"
            value={payload.conversations ? `${payload.conversations.yesterday.avg_response_minutes.toFixed(0)}m` : '—'}
            delta={
              compareActive && payload.conversations && priorPayload?.conversations
                ? absDelta(payload.conversations.yesterday.avg_response_minutes, priorPayload.conversations.yesterday.avg_response_minutes, 'm', `first ${payload.conversations.yesterday.first_response_avg_minutes.toFixed(0)}m`, true)
                : payload.conversations
                  ? { direction: 'flat', text: `first ${payload.conversations.yesterday.first_response_avg_minutes.toFixed(0)}m` }
                  : undefined
            }
            spark={payload.sparklines?.response_time}
            drillTo="/beithady/communication/unified?metric=response-time"
            accent="steel"
            onHide={() => setPanel('hero-response-time', false)}
          />
        )}
      </div>

      {visibility['buildings-table'] && (
        <div className="col-span-12 lg:col-span-8">
          <BuildingsTable payload={payload} onHide={() => setPanel('buildings-table', false)} />
        </div>
      )}
      {visibility['channel-mix'] && (
        <div className="col-span-12 lg:col-span-4">
          <ChannelMixDonut payload={payload} onHide={() => setPanel('channel-mix', false)} />
        </div>
      )}

      {visibility['payouts'] && (
        <div className="col-span-12 lg:col-span-4">
          <Payouts payload={payload} onHide={() => setPanel('payouts', false)} />
        </div>
      )}
      {visibility['reviews-block'] && (
        <div className="col-span-12 lg:col-span-8">
          <ReviewsBlock payload={payload} onHide={() => setPanel('reviews-block', false)} />
        </div>
      )}

      {visibility['cleaning-turnovers'] && (
        <div className="col-span-12 lg:col-span-3">
          <CleaningTurnovers payload={payload} onHide={() => setPanel('cleaning-turnovers', false)} />
        </div>
      )}
      {visibility['inquiry-sla'] && (
        <div className="col-span-12 lg:col-span-6">
          <InquirySlaBuckets payload={payload} onHide={() => setPanel('inquiry-sla', false)} />
        </div>
      )}
      {(visibility['check-ins-payment'] || visibility['cancellations']) && (
        <div className="col-span-12 lg:col-span-3 grid grid-rows-2 gap-3">
          {visibility['check-ins-payment'] && (
            <CheckInsPayment payload={payload} onHide={() => setPanel('check-ins-payment', false)} />
          )}
          {visibility['cancellations'] && (
            <Cancellations payload={payload} onHide={() => setPanel('cancellations', false)} />
          )}
        </div>
      )}

      {visibility['top-movers'] && (
        <div className="col-span-12">
          <TopMoversRibbon payload={payload} onHide={() => setPanel('top-movers', false)} />
        </div>
      )}

      {visibility['forward-occupancy'] && (
        <div className="col-span-12 lg:col-span-4">
          <ForwardOccupancyBars payload={payload} onHide={() => setPanel('forward-occupancy', false)} />
        </div>
      )}
      {visibility['cancel-risk'] && (
        <div className="col-span-12 lg:col-span-4">
          <CancelRisk payload={payload} onHide={() => setPanel('cancel-risk', false)} />
        </div>
      )}
      {visibility['monthly-goal'] && (
        <div className="col-span-12 lg:col-span-4">
          <MonthlyGoal payload={payload} onHide={() => setPanel('monthly-goal', false)} />
        </div>
      )}

      {visibility['revenue-concentration'] && (
        <div className="col-span-12 lg:col-span-6">
          <RevenueConcentration payload={payload} onHide={() => setPanel('revenue-concentration', false)} />
        </div>
      )}
      {visibility['occupancy-gap-finder'] && (
        <div className="col-span-12 lg:col-span-6">
          <OccupancyGapFinder payload={payload} onHide={() => setPanel('occupancy-gap-finder', false)} />
        </div>
      )}

      {visibility['revenue-waterfall'] && (
        <div className="col-span-12 lg:col-span-6">
          <RevenueWaterfall payload={payload} onHide={() => setPanel('revenue-waterfall', false)} />
        </div>
      )}
      {visibility['stly-yoy'] && (
        <div className="col-span-12 lg:col-span-6">
          <StlyYoy payload={payload} onHide={() => setPanel('stly-yoy', false)} />
        </div>
      )}

      {visibility['snapshot-scrubber'] && (
        <div className="col-span-12">
          <SnapshotScrubber currentDate={snapshotDate} earliestDate={earliestDate} onHide={() => setPanel('snapshot-scrubber', false)} />
        </div>
      )}
    </BHDashboardShell>
  );
}
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test
```

Expected: all existing tests + new dashboard-shell tests pass. The use-url-state tests still pass. No regressions. Roughly 559 + ~22 (package tests) = ~581 passing.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Build to catch any client/server boundary issues**

```bash
npm run build
```

Expected: build succeeds. The new `dashboard-shell/*` files all carry `'use client'` directives. The barrel `index.ts` doesn't need one (re-exports inherit).

- [ ] **Step 6: Commit**

```bash
git add src/app/beithady/analytics/performance/_components/dashboard-shell.tsx
git commit -m "refactor(perf): consume BHDashboardShell + BHTitleBar + BHLeftRail from shared package"
```

---

## Task 12: Delete obsolete files in `analytics/performance/_components/` and `_hooks/`

**Files:**
- Delete: `src/app/beithady/analytics/performance/_components/title-bar.tsx`
- Delete: `src/app/beithady/analytics/performance/_components/left-rail.tsx`
- Delete: `src/app/beithady/analytics/performance/_components/mobile-filter-sheet.tsx`
- Delete: `src/app/beithady/analytics/performance/_components/customize-drawer.tsx`
- Delete: `src/app/beithady/analytics/performance/_components/top-bar.tsx`
- Delete: `src/app/beithady/analytics/performance/_hooks/use-rail-collapse.ts`

- [ ] **Step 1: Confirm no live references remain**

Run:

```bash
grep -rn "from './title-bar'\|from './left-rail'\|from './mobile-filter-sheet'\|from './customize-drawer'\|from './top-bar'\|from './use-rail-collapse'\|from '../_hooks/use-rail-collapse'" src/app/beithady/analytics/performance/
```

Expected output: **no matches**. If any line returns, fix the consumer to import from the shared package barrel instead, then re-run.

- [ ] **Step 2: Delete the obsolete files**

```bash
git rm src/app/beithady/analytics/performance/_components/title-bar.tsx
git rm src/app/beithady/analytics/performance/_components/left-rail.tsx
git rm src/app/beithady/analytics/performance/_components/mobile-filter-sheet.tsx
git rm src/app/beithady/analytics/performance/_components/customize-drawer.tsx
git rm src/app/beithady/analytics/performance/_components/top-bar.tsx
git rm src/app/beithady/analytics/performance/_hooks/use-rail-collapse.ts
```

- [ ] **Step 3: Type-check + full suite**

```bash
npx tsc --noEmit && npm run test
```

Expected: clean tsc + suite still passes. If anything errors, a stale import was missed — fix it.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(perf): delete obsolete shell components after shared-package migration"
```

---

## Task 13: Migrate `FeeAuditDashboard.tsx` to consume `BHDashboardShell` + `BHTitleBar`

**Files:**
- Modify: `src/app/beithady/analytics/reports/fees-audit/_components/FeeAuditDashboard.tsx`

- [ ] **Step 1: Locate the outer composition**

The current outer JSX wraps a `<div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">` with `<Sidebar>` and a `<div>` containing `<TitleBar>` + report panels.

After migration: `<BHDashboardShell titleBar={<BHTitleBar .../>} rail={<Sidebar .../>}>{panels}</BHDashboardShell>`.

- [ ] **Step 2: Edit the file — replace the outer composition**

In `src/app/beithady/analytics/reports/fees-audit/_components/FeeAuditDashboard.tsx`:

**Add to the imports near the top** (after the existing imports from `./Sidebar` etc.):

```tsx
import { Calendar, Building2, Filter as FilterIcon, ToggleLeft, RefreshCw } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  type BHTitleBarChip,
} from '@/app/beithady/_components/dashboard-shell';
import { FEE_CATEGORY_LABEL } from '@/lib/beithady/fees-audit/types';
```

Some imports may already be there — keep the file's imports deduplicated; if `Calendar`/`Building2`/`Filter`/`ToggleLeft` are unused after this edit, remove them.

**Remove the import** `import { TitleBar } from './TitleBar';` — that component is being deleted in Task 14.

**Add helper functions** above the `FeeAuditDashboard` function (before line ~46, after the existing `isCountryCategory` / `isAnalyticCategory` helpers):

```tsx
const CHANNEL_LABEL: Record<string, string> = {
  airbnb: 'Airbnb',
  booking_com: 'Booking',
  other_ota: 'Other OTA',
  manual: 'Manual',
};

const PRICE_MODE_LABEL: Record<string, string> = {
  host_net: 'Host Net',
  guest_gross: 'Guest Gross',
  both: 'Both',
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function endDate(start: string, windowDays: number): string {
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + windowDays - 1);
  return fmtDate(d.toISOString().slice(0, 10));
}
```

**Replace the entire return statement** of `FeeAuditDashboard` (the `return ( <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4"> ... </div> )` block) with:

```tsx
  const buildingsLabel =
    config.buildings.length === 0
      ? 'All buildings'
      : config.buildings.length <= 3
        ? config.buildings.join(' · ')
        : `${config.buildings.length} buildings`;
  const channelsLabel =
    config.channels.length === 0
      ? 'All channels'
      : config.channels.map((c) => CHANNEL_LABEL[c] || c).join(' + ');
  const dateRangeLabel = `${fmtDate(config.startDate)} → ${endDate(config.startDate, config.windowDays)}`;

  const chips: BHTitleBarChip[] = [
    { icon: Calendar, label: dateRangeLabel },
    { icon: Building2, label: buildingsLabel },
    { icon: FilterIcon, label: channelsLabel },
    { icon: ToggleLeft, label: PRICE_MODE_LABEL[config.priceMode] },
  ];

  const titleBarActions = (
    <div className="flex flex-col items-end gap-1">
      {loading && (
        <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--bh-gold)' }} />
      )}
      {data?.totals?.physical_units != null && (
        <div className="text-right">
          <div
            className="text-3xl font-bold"
            style={{ color: 'var(--bh-gold)', fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif' }}
          >
            {data.totals.physical_units}
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: '#cbd5e1' }}>
            units in scope
          </div>
        </div>
      )}
    </div>
  );

  return (
    <BHDashboardShell
      titleBar={
        <BHTitleBar
          eyebrow="Booking-Channel Fee Audit"
          title={`${config.windowDays}-day forward · ${FEE_CATEGORY_LABEL[config.selectedFeeCategory]}`}
          chips={chips}
          actions={titleBarActions}
        />
      }
      rail={
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
          selected={config.selectedFeeCategory}
          onSelect={(cat) => {
            if (isCountryCategory(cat)) {
              const next = COUNTRY_BUILDINGS[cat];
              setConfig({
                ...config,
                selectedFeeCategory: cat,
                buildings: next === null ? [] : next,
              });
            } else {
              setConfig({ ...config, selectedFeeCategory: cat });
            }
          }}
          config={config}
          onConfigChange={setConfig}
          onOpenTaxTester={() => setShowTaxTester(true)}
          onOpenVendorExport={() => setShowVendorExport(true)}
        />
      }
    >
      <div className="col-span-12 space-y-4">
        {error ? (
          <div className="ix-card p-4 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-sm">
            Error: {error}
          </div>
        ) : null}

        {!data && loading ? (
          <div className="ix-card p-12 text-center text-slate-500 dark:text-slate-400">
            <Loader2 className="inline animate-spin" size={20} />
            <span className="ml-2">Building fee audit…</span>
          </div>
        ) : null}

        {data ? (
          <>
            {isCountryCategory(config.selectedFeeCategory) || isAnalyticCategory(config.selectedFeeCategory) ? (
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
                style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-gold)', color: 'var(--bh-ink)' }}
              >
                <Globe2 size={14} style={{ color: 'var(--bh-gold)' }} />
                <span className="font-semibold">
                  {config.selectedFeeCategory === 'country_egypt' && 'Scoped to Egypt portfolio (BH-26 · BH-73 · BH-435 · BH-OK)'}
                  {config.selectedFeeCategory === 'country_uae' && 'Scoped to UAE portfolio (BH-DXB)'}
                  {config.selectedFeeCategory === 'country_split' && 'All countries (Egypt + UAE) — see country split in cross-ref'}
                  {config.selectedFeeCategory === 'analytic_bedroom_class' && 'Pivoting cross-ref by bedroom class'}
                  {config.selectedFeeCategory === 'analytic_building' && 'Pivoting cross-ref by building'}
                  {config.selectedFeeCategory === 'analytic_channel_mix' && 'Pivoting cross-ref by channel mix'}
                  {config.selectedFeeCategory === 'analytic_capacity' && 'Pivoting cross-ref by capacity (accommodates)'}
                </span>
                <span className="ml-auto text-xs" style={{ color: 'var(--bh-steel)' }}>
                  {data.listings.length} units in scope
                </span>
              </div>
            ) : null}

            <KpiStrip data={data} />
            <QuoteCalculator listings={data.listings} />
            <Heatmap
              data={data}
              category={config.selectedFeeCategory}
              onCellClick={(listingId, date) => setDrill({ listingId, date })}
            />
            <CrossRefTable
              data={data}
              priceMode={config.priceMode}
              pivotMode={isAnalyticCategory(config.selectedFeeCategory) ? config.selectedFeeCategory : null}
              onCompareChannels={(listingId) => setCompare(listingId)}
            />
            <AnomalyInspector anomalies={data.anomalies} />
```

**Continue the existing tail** — anything below `<AnomalyInspector anomalies={data.anomalies} />` in the original file (e.g. warnings block, drill modal, channel-compare modal, vendor export dialog, tax tester) stays the same.

**Final closing:** ensure the JSX is closed properly. The outer `<BHDashboardShell>` needs to wrap the entire `<div className="col-span-12 space-y-4">...</div>` block. Then the modals (`drill`, `compare`, `showVendorExport`, `showTaxTester`) render OUTSIDE the shell as siblings of it, so they overlay everything.

Final return structure:

```tsx
  return (
    <>
      <BHDashboardShell
        titleBar={...}
        rail={...}
      >
        <div className="col-span-12 space-y-4">
          {/* all the report panels */}
        </div>
      </BHDashboardShell>

      {/* Modals — outside the shell so they overlay the whole viewport */}
      {drill && drillCell && (
        <CellDrillThroughModal cell={drillCell} onClose={() => setDrill(null)} />
      )}
      {compare && (
        <ChannelCompareModal
          listingId={compare}
          startDate={config.startDate}
          windowDays={config.windowDays}
          onClose={() => setCompare(null)}
        />
      )}
      {showVendorExport && data && (
        <VendorExportDialog data={data} config={config} onClose={() => setShowVendorExport(false)} />
      )}
      {showTaxTester && (
        <TaxStackTester onClose={() => setShowTaxTester(false)} />
      )}
    </>
  );
}
```

(Confirm the actual modal-rendering JSX matches what's in the existing file. The above is the expected end state; the existing tail of the file may have additional warnings/conditional rendering that should be preserved verbatim.)

- [ ] **Step 3: Run type-check + build**

```bash
npx tsc --noEmit && npm run build
```

Expected: clean. If `npm run build` fails on fees-audit, the most likely cause is a stray reference to the old `TitleBar` import that wasn't removed.

- [ ] **Step 4: Run full suite**

```bash
npm run test
```

Expected: no new failures. Fees-audit has no tests, but the shared-package + perf tests must still all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/analytics/reports/fees-audit/_components/FeeAuditDashboard.tsx
git commit -m "refactor(fees-audit): adopt BHDashboardShell + BHTitleBar; keep Sidebar bespoke"
```

---

## Task 14: Delete `fees-audit/_components/TitleBar.tsx`

**Files:**
- Delete: `src/app/beithady/analytics/reports/fees-audit/_components/TitleBar.tsx`

- [ ] **Step 1: Confirm no live references remain**

```bash
grep -rn "from './TitleBar'\|fees-audit/_components/TitleBar" src/
```

Expected: no matches. (FeeAuditDashboard.tsx was edited in Task 13 to remove the import.)

- [ ] **Step 2: Delete**

```bash
git rm src/app/beithady/analytics/reports/fees-audit/_components/TitleBar.tsx
```

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(fees-audit): delete bespoke TitleBar — now uses shared BHTitleBar"
```

---

## Task 15: Final verification + manual smoke + push

**Files:** none (verification and git only)

- [ ] **Step 1: Full suite + tsc + build**

```bash
npm run test && npx tsc --noEmit && npm run build
```

Expected: every command exits 0. Test counts: ~579 passing (559 baseline + ~20 new shared-package tests). Zero new failures.

- [ ] **Step 2: Start dev server and smoke-test Analytics Performance**

```bash
npm run dev
```

Open in browser:
- http://localhost:3000/beithady/analytics/performance

Verify:
- TitleBar shows the navy gradient header with "Performance Dashboard" eyebrow + dated title + three scope chips (Cairo time / building / compare).
- LeftRail shows three sections: Period (Today/Yesterday/This week·soon), Building (All/BH-26/BH-73/BH-435/BH-OK/Other), Compare (vs Yesterday/Last Week/Last Month/Last Year/None).
- Clicking a Building pill changes the URL and refilters Hero KPIs.
- Clicking a Compare pill changes the URL and changes the delta arrows on Hero KPIs.
- Hovering the rail keeps it expanded; mousing away for 3 seconds collapses it to icons.
- Clicking the pin icon (📌 at the bottom of the rail) toggles auto-collapse off (verify the pin persists across reload).
- The "Customize" button in the title bar opens the right-side drawer with panel checkboxes; toggling a panel hides/shows it; "Reset to default" restores all visible; "Done" closes the drawer.
- The "Export PDF" link still works.
- All 24 panels render correctly (Hero KPIs row, Buildings table, Channel mix donut, etc.).

- [ ] **Step 3: Resize browser to mobile (<768px wide) and verify**

- Rail is hidden.
- A "☰ Filters" button appears in the title bar (top right).
- Clicking it opens a bottom sheet with the same three rail sections.
- Selecting a pill works; "Done" closes the sheet.

- [ ] **Step 4: Smoke-test Fees Audit**

Navigate to http://localhost:3000/beithady/analytics/reports/fees-audit

Verify:
- TitleBar shows "Booking-Channel Fee Audit" eyebrow + "{N}-day forward · {Category}" title + four chips (date range / buildings / channels / price mode) + units-in-scope number on the right.
- Sidebar (left) still has the fee-category groups (Nightly Rate, Stay Fees, Taxes, Channel Cuts, Stay Rules, Discounts, Country, Analytic, Comparisons).
- Sidebar auto-collapse behavior still works (cursor leaves → 2s → collapses).
- Sidebar open-on-hover still works.
- Date input + window dropdown still update the report.
- Buildings + Channels pill toggles still work.
- Price Mode toggle still works.
- Tax Tester and Vendor CSV buttons in the sidebar still open their dialogs.
- Country categories (`country_egypt`, `country_uae`, `country_split`) auto-apply building filters.
- Heatmap cells still drill through into the modal.

- [ ] **Step 5: Stop dev server**

`Ctrl+C` in the dev server terminal.

- [ ] **Step 6: Push to main**

```bash
git push origin main
```

Vercel auto-deploys via the GitHub integration. Per CLAUDE.md, no need to run `vercel --prod` separately.

- [ ] **Step 7: Wait for Vercel deploy + post-deploy smoke**

After the Vercel deploy completes (~3–5 minutes), open https://limeinc.vercel.app/beithady/analytics/performance and https://limeinc.vercel.app/beithady/analytics/reports/fees-audit. Re-run the smoke checks from Steps 2–4 against production.

- [ ] **Step 8: Update SESSION_HANDOFF.md**

Prepend a new dated section to the top of `SESSION_HANDOFF.md` summarizing the shipped change (commit SHAs, what changed, baseline → final test count, manual smoke verification, post-deploy smoke result). Commit + push.

---

## Self-Review (run after writing the plan)

**Spec coverage:**
- §1 Goal & scope → Tasks 1–14 cover the full extraction + two-consumer migration.
- §4 Package layout → Tasks 1–9 create every file listed.
- §5 Component & hook APIs → each API in §5.1–5.8 has its own task that implements it with the exact signature from the spec.
- §6 Data flow → covered by Task 10 (URL state) and the responsive `useEffect` in Task 8 (`BHDashboardShell`).
- §7 Error handling → minimal per spec; the `parse` totality contract is documented in the `use-bh-url-state.ts` file header.
- §8 Testing strategy → Tasks 2–8 add the new unit tests; Task 10 keeps the existing `use-url-state.test.ts` passing; Task 15 covers manual smoke.
- §9 Migration mechanics → Tasks 1–15 follow the 8-step sequence laid out in the spec.
- §10 Risks → DOM divergence mitigation: Task 11 specifies the exact replacement at the file level and Task 15 includes side-by-side visual smoke.

**Placeholder scan:** no TBD / TODO / "implement details" patterns in the plan body.

**Type consistency:** `BHRailSection`, `BHRailCollapsedIcon`, `BHTitleBarChip`, `BHUrlStateOpts<T>` are declared in their owning files (Tasks 4, 4, 7, 2) and re-exported through the barrel (Task 9). Consumer code in Task 11 imports the types from the barrel and uses them with matching shapes. `PerfUrlState` and `CompareMode` are declared in Task 10's rewritten file and consumed by Task 11.

---

## Future work (out of scope for this plan)

Downstream consumers — once this lands, the following migrations from the audit backlog become unblocked:

1. Financials Performance (audit §8 row #3, P1) — adopts `<BHDashboardShell>` + `<BHTitleBar>` + `<BHLeftRail>` + adds a real month picker.
2. Financials Balance Sheet (§8 row #4, P1).
3. Analytics Calendar Heatmap (§8 row #7, P2).
4. Analytics Market Intel (§8 row #7, P2).
5. Inventory Dashboard (§8 row #8, P2).
6. Ads Performance (§8 row #9, P2).
7. Operations Calendar / Cancel-Risk / Morning-Brief (§8 row #10, P2).
8. HR Payroll / Attendance / Headcount dashboards (§8 row #11, P2).
9. Communication Unified inbox (§8 row #12, P2 — biggest of the migration set).

Each becomes its own spec → plan → PR cycle. The shared package added by this plan stays stable; subsequent PRs only modify their consumer pages.
