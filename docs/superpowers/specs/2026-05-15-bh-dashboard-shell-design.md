# BH Dashboard Shell — Extraction & Fees-Audit Outer-Shell Adoption

**Date:** 2026-05-15
**Author:** kareem (via brainstorming session)
**Status:** Draft — pending review
**Scope:** Internal refactor of two existing data-dashboard pages onto a new shared primitive package. No new features, no behavior changes intended.
**Parent audit:** [docs/superpowers/specs/2026-05-15-bh-design-audit-design.md](2026-05-15-bh-design-audit-design.md) — §7.3, §8 row #2 (P0-2 enabler).

---

## 1. Goal & scope

Extract the data-dashboard chrome (title bar, filter rail, mobile sheet, customize drawer, URL-state hook) from `src/app/beithady/analytics/performance/_components/` into a shared package at `src/app/beithady/_components/dashboard-shell/`. Migrate two consumers in the same PR:

- **Analytics Performance** (`/beithady/analytics/performance`) — full happy-path consumer. Must produce a **byte-near-identical DOM** post-migration. Zero behavior change.
- **Fees Audit** (`/beithady/analytics/reports/fees-audit`) — adopts the shared **outer shell** (`<BHDashboardShell>` + `<BHTitleBar>` + `<BHMobileFilterSheet>`) while **keeping its bespoke `Sidebar.tsx`** in the `rail` slot. Its current TitleBar is deleted.

Out of scope: Financials Performance migration, downstream consumers, A1 work (already shipped P0-1), brand-var sweeps.

**Why now:** the parent audit identified 14 migration backlog items. Every "Major" data-dashboard migration depends on this primitive existing. Shipping it first as a paper extraction with two consumers proves the API on a real second-page case (different rail shape, different state model) before downstream pages adopt it.

## 2. TL;DR

- New package: `src/app/beithady/_components/dashboard-shell/` (8 component/hook files + colocated tests).
- New shared API: `<BHDashboardShell>`, `<BHTitleBar>`, `<BHLeftRail>`, `<BHRailPill>`, `<BHMobileFilterSheet>`, `<BHCustomizeDrawer>`, `useBHUrlState<T>(opts)`, `useRailCollapse()`.
- **Composition wins:** the shell is layout-only; pages provide `titleBar`, `rail`, `mobileFilterSheet`, `drawer`, and `children` as JSX slots. URL state is opt-in via `useBHUrlState<T>` — not a contract.
- **Fees-audit Sidebar stays bespoke** because it's not a filter rail — it's a filter rail + 9-group fee-category navigation tree + auto-collapse/open-on-hover UX. Trying to fit it into `<BHLeftRail>` would force a schema that doesn't match. Composition slot accepts it as-is.
- Existing `usePerfUrlState` becomes a 6-line typed wrapper around `useBHUrlState<PerfUrlState>`. No behavior change at the call site.

## 3. Architecture approach

**Approach A — composition + optional URL-state helper** (picked over config-driven and mandatory-hook variants).

The shell is a thin layout wrapper. It dictates:
- Where the title bar goes (top, full width).
- Where the rail goes (left column, collapsible width, hidden on mobile).
- Where the main grid goes (right column, consumer-owned).
- Where the customize drawer goes (overlay, controlled by consumer).
- How mobile swaps rail → bottom sheet.

It does NOT dictate:
- What filters look like (consumer composes pills with `<BHRailPill>` or substitutes a custom rail).
- Whether filter state lives in URL params (`useBHUrlState<T>`) or local state (`useState`/`useReducer`).
- What goes in the title bar's `actions` slot (Export PDF, Customize button, etc. — page-specific).
- What goes in the customize drawer (panel-visibility checkboxes are perf-specific).

This is deliberate: BH has 14 data-dashboard surfaces in the audit backlog with genuinely different filter shapes, state needs, and action sets. Composition over configuration when the consumers differ.

## 4. Package layout

```
src/app/beithady/_components/dashboard-shell/
  index.ts                       // barrel re-exports for ergonomic imports
  bh-dashboard-shell.tsx         // <BHDashboardShell> responsive grid wrapper
  bh-title-bar.tsx               // <BHTitleBar> navy gradient header
  bh-left-rail.tsx               // <BHLeftRail> default filter rail
  bh-rail-pill.tsx               // <BHRailPill> pill button helper
  bh-mobile-filter-sheet.tsx     // <BHMobileFilterSheet> bottom sheet
  bh-customize-drawer.tsx        // <BHCustomizeDrawer> right overlay
  use-bh-url-state.ts            // useBHUrlState<T> typed hook
  use-rail-collapse.ts           // useRailCollapse() hover/pin state
  // Colocated tests:
  bh-dashboard-shell.test.tsx
  bh-title-bar.test.tsx
  bh-left-rail.test.tsx
  bh-mobile-filter-sheet.test.tsx
  bh-customize-drawer.test.tsx
  use-bh-url-state.test.ts
```

### Files moved from `analytics/performance/_components/` and `_hooks/`

- `dashboard-shell.tsx` → `bh-dashboard-shell.tsx` (with API generalization)
- `title-bar.tsx` → `bh-title-bar.tsx` (with prop generalization)
- `left-rail.tsx` → `bh-left-rail.tsx` + `bh-rail-pill.tsx` (Pill helper split out)
- `mobile-filter-sheet.tsx` → `bh-mobile-filter-sheet.tsx`
- `customize-drawer.tsx` → `bh-customize-drawer.tsx`
- `_hooks/use-url-state.ts` → `use-bh-url-state.ts` (generic) + a re-exported `usePerfUrlState` wrapper that stays in `_hooks/` for backward-compat
- `_hooks/use-rail-collapse.ts` → `use-rail-collapse.ts`
- `top-bar.tsx` — deleted (was the predecessor to `title-bar.tsx`, already unused in the consumer)

### Files moved or deleted from `analytics/reports/fees-audit/_components/`

- `TitleBar.tsx` — **deleted**, replaced by `<BHTitleBar>` at the call site.
- `Sidebar.tsx` — **kept as-is**, plugged into `<BHDashboardShell rail={…}>`.

### Analytics Performance after migration

- `analytics/performance/_components/dashboard-shell.tsx` — keeps the file name, but its content shrinks from ~600 lines to ~200 lines. It composes `<BHDashboardShell>` with its specific `titleBar={<BHTitleBar/>}`, `rail={<BHLeftRail sections=[…] />}`, `mobileFilterSheet={<BHMobileFilterSheet>…</>}`, `drawer={<BHCustomizeDrawer>…</>}`, and its 24-panel grid as `children`.
- `analytics/performance/_components/panels/`, `panel-frame.tsx`, `empty-snapshot.tsx`, `manual-rebuild-button.tsx` — untouched. Panel registry and visibility logic stay in this consumer.
- `_hooks/use-url-state.ts` — re-exports `usePerfUrlState` as a 6-line typed wrapper around `useBHUrlState`. The existing `use-url-state.test.ts` continues to pass.

## 5. Component & hook APIs

### 5.1 `<BHDashboardShell>` — layout-only wrapper

```tsx
type Props = {
  titleBar: React.ReactNode;            // typically <BHTitleBar/>
  rail: React.ReactNode;                // <BHLeftRail/> or any custom (e.g. fees-audit Sidebar)
  mobileFilterSheet?: React.ReactNode;  // rendered as sibling; opens via TitleBar's mobile button
  drawer?: React.ReactNode;             // overlay, controlled by consumer
  children: React.ReactNode;            // the main 12-col grid lives here (consumer's responsibility)
  railCollapsed?: boolean;              // optional override; defaults to useRailCollapse internal state
};
```

Internal behavior:
- Renders `titleBar` full-width at top.
- Below: CSS grid with `grid-template-columns: ${railColWidth}px 1fr` (collapsed 44px, expanded 200px on desktop; 0 on mobile).
- Listens to `window.matchMedia('(max-width: 767px)')` to flip `isMobile`. On mobile the rail column collapses to 0; the consumer's mobile filter button (in `<BHTitleBar>`) opens `mobileFilterSheet`.
- `drawer` is rendered as a sibling sheet/overlay; visibility is consumer-controlled.

### 5.2 `<BHTitleBar>` — navy gradient header

```tsx
type ChipDef = { icon: LucideIcon; label: string };
type Props = {
  eyebrow?: string;                          // small uppercase line, e.g. "Performance Dashboard"
  title: string;                             // main heading
  subtitle?: string;                         // optional second line
  chips?: ChipDef[];                         // scope chips row (e.g. "Cairo time · BH-26 · vs Yesterday")
  actions?: React.ReactNode;                 // right-side button slot
  onMobileFilterClick?: () => void;          // shows ☰ Filters button on mobile only
};
```

Page-specific buttons (Export PDF, Customize, Manual Rebuild, etc.) live in `actions`. The shell doesn't know about them.

### 5.3 `<BHLeftRail>` — default filter rail

```tsx
type Section = { title: string; children: React.ReactNode };
type CollapsedIcon = { emoji: string; title: string };
type Props = {
  sections: Section[];
  collapsedIcons?: CollapsedIcon[];          // shown when rail is ≤44px wide
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
};
```

The rail doesn't know what filters exist. Consumer composes pills (with `<BHRailPill>`) inside `Section.children`. Today's Period/Building/Compare sections in `analytics/performance` are exactly this shape — they map 1:1.

### 5.4 `<BHRailPill>` — pill button helper

```tsx
type Props = {
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
};
```

Standard BH ink/cream/mute theming lifted from the current `LeftRail`'s inline `Pill` helper.

### 5.5 `<BHMobileFilterSheet>` — bottom sheet

```tsx
type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;                 // typically the same section structure as the rail
};
```

### 5.6 `<BHCustomizeDrawer>` — right-side overlay

```tsx
type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;                 // panel-visibility checkboxes (consumer-owned content)
};
```

Pure container. Visibility logic stays in the consumer (perf has 24 toggleable panels via `useVisibility()`; fees-audit doesn't need a drawer at all).

### 5.7 `useBHUrlState<T>` — typed URL-state hook (optional)

```tsx
type Opts<T> = {
  defaults: T;
  parse: (search: URLSearchParams) => T;
  serialize: (state: T) => URLSearchParams;
  basePath: string;
};
function useBHUrlState<T>(opts: Opts<T>): {
  state: T;
  update: (patch: Partial<T>) => void;       // router.push(serialize(merged), { scroll: false })
};
```

Today's `usePerfUrlState` becomes:

```tsx
// src/app/beithady/analytics/performance/_hooks/use-url-state.ts
export const usePerfUrlState = () => useBHUrlState<PerfUrlState>({
  defaults: { date: undefined, building: 'all', compare: 'yesterday' },
  parse,
  serialize,
  basePath: '/beithady/analytics/performance',
});
```

The hook's contract: `parse` MUST be total — it must return a sensible default for any input, not throw on unknown values. Documented in the file header. Same implicit contract as today's `usePerfUrlState`.

### 5.8 `useRailCollapse()` — relocated

Same API as today — `{ collapsed, pinned, togglePinned, handleEnter, handleLeave }`. Moves into the package, no internal changes.

## 6. Data flow

### URL-state path (Analytics Performance after migration)
```
URL ?date=…&building=…&compare=…
  → useSearchParams() inside useBHUrlState
  → parse(search) → typed state T = PerfUrlState
  → consumer composes <BHLeftRail sections={[…]}> with <BHRailPill onClick={() => update({…})}>
  → user clicks pill → update(patch)
  → router.push(serialize(merged), { scroll: false })
  → URL changes → Next refetches server data → re-render
```

### Local-state path (Fees Audit, unchanged)
```
useState<FeeAuditConfig>(initial) in the page
  → consumer renders <BHDashboardShell rail={<Sidebar config={config} onConfigChange={setConfig}/>}>
  → user changes a filter in Sidebar → setConfig(next)
  → React re-renders, Sidebar refilters in-memory data
  → no URL change, no router push
```

The shell doesn't know which path the page uses. Both render through the same `<BHDashboardShell>` slots.

### Responsive swap
```
useEffect(() => {
  const mq = window.matchMedia('(max-width: 767px)');
  setIsMobile(mq.matches);
  mq.addEventListener('change', e => setIsMobile(e.matches));
}, []);
```
Lives inside `<BHDashboardShell>`. Today's identical block in `dashboard-shell.tsx` moves with the file.

## 7. Error handling

Minimal — these are pure UI components with no async lifecycle.

- `useBHUrlState`: `parse` is consumer-owned. Contract: must be total. If it throws on malformed input, the page errors — same as today.
- `<BHDashboardShell>`: no async, no fetch, no failure modes of its own.
- `<BHTitleBar>` chips: empty array renders nothing (no defensive `chips?.length &&` checks needed at call sites).
- `<BHCustomizeDrawer>` / `<BHMobileFilterSheet>`: `open=false` renders nothing.

## 8. Testing strategy

### 8.1 Behavior preservation (primary risk)

Analytics Performance must produce a **byte-near-identical DOM** post-migration. This is the load-bearing risk because:
- Many consumers will eventually compose from these primitives, so the canonical implementation must be tight.
- The migration moves ~600 lines of layout code across file boundaries — easy to drop a wrapper div, change a class, or break a CSS grid.

Verification:
- Existing `use-url-state.test.ts` continues to pass (moved with the hook + new adapter test for the wrapper).
- `npm run build` succeeds (catches type / import errors).
- Manual smoke: load `/beithady/analytics/performance` on the deployed URL, compare with a pre-PR screenshot. Spot-check: rail collapse/pin, mobile filter sheet open/close, customize drawer toggles, scope chips, date stepper, all 24 panels render.

### 8.2 New unit tests for the shared package

| Test file | Coverage |
|---|---|
| `use-bh-url-state.test.ts` | Typed `T = { foo: string; bar: number }` parse/serialize round-trip; defaults handling; `update(patch)` mutates URL; `scroll: false` passed to `router.push`. |
| `bh-left-rail.test.tsx` | Renders supplied sections; collapsed mode shows collapsed icons; pin toggle invokes callback with current state. |
| `bh-title-bar.test.tsx` | Renders title / eyebrow / subtitle / chips; `actions` slot renders children verbatim; mobile filter button shown only on mobile media-query; clicking it invokes `onMobileFilterClick`. |
| `bh-mobile-filter-sheet.test.tsx` | Opens when `open=true`; `onClose` fires from close button + backdrop click. |
| `bh-customize-drawer.test.tsx` | Opens when `open=true`; `onClose` fires; children render. |
| `bh-dashboard-shell.test.tsx` | Composes slots in the right places; rail column hidden under mobile media query; drawer renders only when prop present. |

### 8.3 Fees-audit adoption verification

- The fees-audit page has no existing tests today. The migration is verified by `npm run build` + manual smoke.
- Manual smoke: load `/beithady/analytics/reports/fees-audit`, confirm Sidebar still expands/collapses, filter buttons still apply, fee-category nav groups still toggle, Tax Tester / Vendor Export dialogs still open, KpiStrip + Heatmap + CrossRefTable still render correctly under the new outer shell.

### 8.4 Baseline & target

- **Current:** 559 pass / 22 skipped (post-P0-1).
- **Target:** baseline + new unit tests for the shared package (~6 test files, ~15–25 new tests). Zero regressions on existing suite. `tsc --noEmit` clean.

## 9. Migration mechanics & PR shape

This work ships as **one PR**:

1. Create the new package files. Run new unit tests green.
2. Migrate `analytics/performance/_components/dashboard-shell.tsx` to compose from `<BHDashboardShell>` + `<BHTitleBar>` + `<BHLeftRail>` + `<BHMobileFilterSheet>` + `<BHCustomizeDrawer>`.
3. Rewrite `_hooks/use-url-state.ts` as a `useBHUrlState<PerfUrlState>` wrapper. Existing tests stay green.
4. Delete the now-unused source files in `analytics/performance/_components/` (the original `dashboard-shell.tsx` content shrinks; `top-bar.tsx` deletes entirely).
5. Migrate `analytics/reports/fees-audit/page.tsx` outer composition to `<BHDashboardShell>` + `<BHTitleBar>`. Delete `analytics/reports/fees-audit/_components/TitleBar.tsx`.
6. Plug fees-audit's existing `Sidebar.tsx` into the shell's `rail` slot. No internal Sidebar changes.
7. Run full suite, `tsc --noEmit`, manual smoke on both pages.
8. Commit + push. Vercel auto-deploy. Final smoke on prod URL.

Estimated effort: **M** (≤600 LOC net change across both consumers + new package). The bulk of LOC moves rather than rewrites.

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| DOM diverges from current Analytics Performance | Medium | Manual screenshot diff after migration; tests cover slot composition; behavior preservation is the explicit gate. |
| Fees-audit Sidebar interaction breaks (auto-collapse, open-on-hover) | Low | Sidebar internals are unchanged; only the outer composition changes. Smoke test on its own page confirms. |
| `useBHUrlState<T>` generic doesn't compose with `usePerfUrlState`'s existing call sites | Low | Wrapper preserves the public API exactly. No call-site changes in `dashboard-shell.tsx` or its descendants. |
| New `<BHTitleBar>` chips API doesn't capture the current scope-chips data flow on performance | Medium | The current TitleBar reads `state.building` and `state.compare` directly and maps via `BUILDING_LABEL`/`COMPARE_LABEL` constants. After migration, perf dashboard does the mapping outside and passes the resulting `ChipDef[]` in. Verify the chips array matches today's rendered output. |

## 11. Open questions

1. **Should `useBHUrlState<T>` provide a `clear()` method** (resets to defaults) in addition to `update(patch)`? Today's perf dashboard does `update({ date: undefined })` to clear; explicit `clear()` would be slightly nicer ergonomics. **Default for spec: not in initial API.** Add later if a consumer needs it.
2. **Should `<BHLeftRail>` provide a built-in "Clear all filters" button** at the bottom of all sections? Today's perf rail doesn't have one. **Default for spec: no.** Out of scope; revisit when a consumer asks.
3. **Should the package live at `src/app/beithady/_components/dashboard-shell/` (under app/) or `src/lib/beithady/dashboard-shell/` (under lib/)?** Lib is the convention for non-route code in this repo. App-components live next to routes. Since these are React components used only by routes under `/beithady`, app-components is the right call. **Default for spec: app-components.**
4. **`use-bh-url-state.ts` file extension** — `.ts` (no JSX) or `.tsx` (in case future tests need JSX in fixtures)? **Default for spec: `.ts`** because the hook has no JSX. Tests get `.tsx`.

These defaults are reasonable; flag for human review.

---

*Generated 2026-05-15 during BH audit P0-2 brainstorming session. Parent audit: docs/superpowers/specs/2026-05-15-bh-design-audit-design.md §7.3 + §8 row #2.*
