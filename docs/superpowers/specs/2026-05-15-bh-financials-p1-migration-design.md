# BH Financials P1 Migration — Landing + Performance + Balance Sheet

**Date:** 2026-05-15
**Author:** kareem (via brainstorming session)
**Status:** Draft — pending review
**Scope:** Migrate three Beithady Financials pages onto the just-shipped `BHDashboardShell` package and onto `BeithadyShell + BeithadyLauncher` for the cockpit landing. Adds a real month picker on Performance (the user's loudest complaint from the audit). No data-layer changes.
**Parent audit:** [docs/superpowers/specs/2026-05-15-bh-design-audit-design.md](2026-05-15-bh-design-audit-design.md) §8 rows #3, #4, #5.
**Depends on:** [docs/superpowers/specs/2026-05-15-bh-dashboard-shell-design.md](2026-05-15-bh-dashboard-shell-design.md) (P0-2, shipped).

---

## 1. Goal & scope

Three pages migrate in one PR:

1. **Financials landing** (`/beithady/financials`) — swap raw `<TopNav>` for `<BeithadyShell + BeithadyHeader + BeithadyLauncher>` (matches analytics/operations/communication landings). Re-theme the 3-card status pre-strip with BH brand vars (currently raw `bg-indigo-50/40` / `bg-red-50/40` / `bg-yellow-50/40` chrome).
2. **Financials Performance** (`/beithady/financials/performance`) — adopt `<BHDashboardShell>`. Add a real month picker. Filter rail = Scope + Period + Building.
3. **Financials Balance Sheet** (`/beithady/financials/balance-sheet`) — adopt `<BHDashboardShell>`. Filter rail = Scope + As-of date + Building.

Out of scope (deferred to P2 #6): Payables, Ledgers, Snapshots, Reconciliation, Import. `FinancialsFilterStrip.tsx` is **kept alive** because Payables still uses it.

## 2. TL;DR

- Three pages migrate. Data layer (`buildPnlReport`, `buildBalanceSheet`, `resolveFinancePeriod`, `scopeCompanyIds`) is untouched.
- Two new typed URL-state hooks: `usePerfPnlUrlState` and `useBSUrlState`, both thin wrappers around the shared `useBHUrlState<T>`.
- Discriminated-union period type lets Performance treat preset pills and the month picker as mutually-exclusive states without juggling string sentinels.
- Status-card brand violations on the landing get re-themed using BH vars where they exist, or inherit hex literals with the same `§7.2 sweep follow-up` comment pattern P0-2 established.
- A1 stays in scope-pill type guards and underlying `CompanyScope` union per P0-1's UI-hide-only strategy. Direct `?scope=a1` URL bookmarks continue to resolve.

## 3. Per-page architecture

### 3.1 Financials landing

```
<BeithadyShell breadcrumbs=[{label: 'Financials'}]>
  <BeithadyHeader
    eyebrow="Beit Hady · Financials"
    title="Financials"
    subtitle="Snapshots · Performance · Payables · Reconciliation"
  />
  {reminders.length > 0 && <RemindersBanner reminders={reminders} />}
  <StatusPreStrip active={active} openVariance={…} openVarCount={…} next={next} />
  <BeithadyLauncher tiles=[…] columns={3} />
</BeithadyShell>
```

The 7 launcher tiles map 1:1 to today's `<CockpitTile>` grid (Performance, Balance Sheet, Payables Aging, Partner Ledgers, Snapshots, Reconciliation, Import). Existing icons + `badge`/`variant` props translate to `LauncherTile.icon` + `LauncherTile.badge`. The bespoke `CockpitTile.tsx` component gets deleted.

`StatusPreStrip` is a small new local component (`_components/StatusPreStrip.tsx`) that renders the 3-card row with **BH-themed semantic accents**:
- Active snapshot card: `border` + `background` from `var(--bh-mute)` + `var(--bh-cream)`, accent text `var(--bh-gold)`.
- Open variance card: keep red as a semantic danger accent, but use the project's documented inheritance pattern (`#9a2828` / `#fdecec` / `#f1bcbc` already used by the perf dashboard's compare-missing banner). Same `§7.2 brand-var sweep follow-up` comment block at the top of the file.
- Next snapshot due card: keep amber as semantic warn accent. Document hex literals the same way.

### 3.2 Financials Performance

```
<BHDashboardShell
  railCollapsed={rail.collapsed}
  onRailEnter={rail.handleEnter}
  onRailLeave={rail.handleLeave}
  titleBar={
    <BHTitleBar
      eyebrow="Beit Hady · Financials"
      title={`Performance · ${scopeLabel(scope)}`}
      subtitle={periodLabel}
      chips={[
        { icon: Calendar, label: periodChipLabel },
        { icon: Building2, label: buildingChipLabel },
      ]}
      actions={<Link href="/beithady/financials" className="ix-link text-xs">← Back to Financials</Link>}
      onMobileFilterClick={() => setMobileFilterOpen(true)}
    />
  }
  rail={
    <BHLeftRail
      sections={railSections}
      collapsed={rail.collapsed}
      collapsedIcons={[
        { emoji: '🎯', title: `Scope: ${scope}` },
        { emoji: '📅', title: periodChipLabel },
        { emoji: '🏢', title: `Building: ${building}` },
      ]}
      pinned={rail.pinned}
      onTogglePin={rail.togglePinned}
    />
  }
  mobileFilterSheet={
    <BHMobileFilterSheet open={mobileFilterOpen} onClose={…}>
      <BHLeftRail sections={railSections} />
    </BHMobileFilterSheet>
  }
>
  <div className="col-span-12">
    <PnlSection pnl={pnl} scopeLbl={scopeLabel(scope)} buildingCode={…} lobLabel={…} />
    {pnl.unclassified.length > 0 && <UnclassifiedPanel pnl={pnl} />}
  </div>
</BHDashboardShell>
```

Rail sections (composed using `<BHRailPill>`):

- **Scope** — 3 pills: Consolidated / Egypt / Dubai.
- **Period** — 6 preset pills (This month / Last month / This quarter / Last quarter / This year / Last year) + a `<input type="month">` (styled per §5 below). Picking a month sets `period.kind = 'month'` and clears the preset highlight; picking a preset sets `period.kind = 'preset'` and clears the month picker's value.
- **Building** — 6 pills: All / BH-26 / BH-73 / BH-435 / BH-OK / Other.

The page is a **server component** (matches the current implementation — `export default async function PerformancePage`). URL state is parsed from `searchParams` on the server and passed into the client `DashboardShell` wrapper (a new thin client component that handles the rail interactivity).

### 3.3 Financials Balance Sheet

```
<BHDashboardShell
  railCollapsed={…} onRailEnter={…} onRailLeave={…}
  titleBar={
    <BHTitleBar
      eyebrow="Beit Hady · Financials"
      title={`Balance Sheet · ${scopeLabel(scope)}`}
      subtitle={`As of ${asOf}`}
      chips={[{ icon: Calendar, label: asOf }, { icon: Building2, label: buildingChipLabel }]}
      actions={<Link href="/beithady/financials" className="ix-link text-xs">← Back to Financials</Link>}
      onMobileFilterClick={…}
    />
  }
  rail={<BHLeftRail sections={railSections} … />}
  mobileFilterSheet={<BHMobileFilterSheet …><BHLeftRail sections={railSections} /></BHMobileFilterSheet>}
>
  <div className="col-span-12">
    <BalanceSheetSection bs={bs} />
  </div>
</BHDashboardShell>
```

Rail sections:
- **Scope** — same 3 pills.
- **As of** — `<input type="date">` styled with `--bh-*` vars. Defaults to today on parse.
- **Building** — same 6 pills.

Same client-wrapper pattern: server component does the data fetch, client wrapper renders the shell with rail interactivity.

## 4. URL state shapes

### 4.1 `FinPerfUrlState`

```ts
export type FinPerfPeriod =
  | { kind: 'preset'; id: 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' }
  | { kind: 'month'; ym: string };  // 'YYYY-MM'

export type FinPerfUrlState = {
  scope: 'consolidated' | 'egypt' | 'dubai' | 'a1';  // 'a1' kept per P0-1 URL backward-compat
  period: FinPerfPeriod;
  building: 'all' | 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';
  lob?: string;  // URL-only; no UI in this PR
};

const FIN_PERF_DEFAULTS: FinPerfUrlState = {
  scope: 'consolidated',
  period: { kind: 'preset', id: 'last_month' },
  building: 'all',
};
```

### Serialization rules
- `scope`: omitted when `'consolidated'` (default).
- `period`: emit `?preset=<id>` when `kind === 'preset'`, `?month=<YYYY-MM>` when `kind === 'month'`. Never both. Default (`{ kind: 'preset', id: 'last_month' }`) emits nothing.
- `building`: omitted when `'all'`.
- `lob`: emitted verbatim when set.
- Legacy hand-crafted `?from=YYYY-MM-DD&to=YYYY-MM-DD` URLs continue to **parse** (resolved by the existing `resolveFinancePeriod`), but `usePerfPnlUrlState.serialize()` never emits them — operators who hand-craft date ranges still get matching data.

### 4.2 `FinBSUrlState`

```ts
export type FinBSUrlState = {
  scope: 'consolidated' | 'egypt' | 'dubai' | 'a1';
  asof: string;  // 'YYYY-MM-DD', defaults to today on parse
  building: 'all' | 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';
};
```

Serialization: same rules — defaults omitted; `asof` always written (since "today" relative to render time is what the user sees).

### 4.3 Hook stability

Both hooks declare `parse`, `serialize`, and `basePath` at module scope (stable references) per the contract documented in `use-bh-url-state.ts`. The hook returns `{ state, update }`; consumers pass `state` into the page render and `update(patch)` into rail callbacks.

### 4.4 Data-layer adapter

The existing `buildPnlReport({ fromDate, toDate, label, companyIds, buildingCode, lobLabel })` signature stays unchanged. A small inline helper in `performance/page.tsx`:

```ts
function resolveFromState(state: FinPerfUrlState) {
  const period = state.period.kind === 'preset'
    ? resolveFinancePeriod(state.period.id, undefined, undefined)
    : resolveFinancePeriod(`month:${state.period.ym}`, undefined, undefined);
  return {
    fromDate: period.fromDate,
    toDate: period.toDate,
    label: period.label,
    companyIds: scopeCompanyIds(state.scope),
    buildingCode: state.building === 'all' ? undefined : state.building,
    lobLabel: state.lob,
  };
}
```

`resolveFinancePeriod()` today already accepts the `month:YYYY-MM` string format (per current page.tsx line 35). No new helper required.

## 5. Month picker styling

```tsx
<input
  type="month"
  value={state.period.kind === 'month' ? state.period.ym : ''}
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
```

Preset pills render with `active=true` only when `state.period.kind === 'preset' && state.period.id === pillId`. Month picker shows empty value when `kind === 'preset'`.

## 6. File structure

### New files
| Path | Responsibility |
|---|---|
| `src/app/beithady/financials/_components/StatusPreStrip.tsx` | 3-card status row (Active snapshot / Open variance / Next snapshot due) with BH-themed semantic accents |
| `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts` | `usePerfPnlUrlState()` typed URL hook |
| `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.test.ts` | Pure URL builder round-trip (~6 assertions) |
| `src/app/beithady/financials/_hooks/use-bs-url-state.ts` | `useBSUrlState()` typed URL hook |
| `src/app/beithady/financials/_hooks/use-bs-url-state.test.ts` | Round-trip (~4 assertions) |
| `src/app/beithady/financials/performance/_components/PerformanceShell.tsx` | Client component wrapping `<BHDashboardShell>` + rail composition (consumed by `performance/page.tsx`) |
| `src/app/beithady/financials/balance-sheet/_components/BalanceSheetShell.tsx` | Client wrapper for Balance Sheet |

### Modified
| Path | Change |
|---|---|
| `src/app/beithady/financials/page.tsx` | Migrate to `BeithadyShell + BeithadyHeader + BeithadyLauncher`. Render `<StatusPreStrip>`. Drop bespoke status-card markup + `<CockpitTile>` grid. |
| `src/app/beithady/financials/performance/page.tsx` | Server component: parse URL state, fetch P&L, render `<PerformanceShell>` with the result. |
| `src/app/beithady/financials/balance-sheet/page.tsx` | Same pattern for Balance Sheet. |

### Deleted
| Path | Reason |
|---|---|
| `src/app/beithady/financials/_components/CockpitTile.tsx` | Replaced by `<BeithadyLauncher>` |
| `src/app/beithady/financials/_components/PeriodControls.tsx` | Only used by perf; logic absorbed into rail composition |

### Untouched on purpose
- `FinancialsFilterStrip.tsx` — Payables still uses it. Migration is P2 #6.
- `PnlSection.tsx`, `BalanceSheetSection.tsx`, `PayablesBlock.tsx`, `PartnerLedgerTable.tsx`, `PayablesDetailModal.tsx` — body components.
- `src/lib/financials-pnl.ts` — data layer, type unions, type guards all preserved.

## 7. Cleanup & re-theming

### Brand-var sweep on the landing
The 3 status cards in today's `financials/page.tsx` (lines ~84–127) use raw Tailwind palette on chrome surfaces:

- `border-indigo-200 bg-indigo-50/40 text-indigo-700` (Active snapshot) → `border-[var(--bh-mute)]` + cream background + `text-[var(--bh-gold)]` accent.
- `border-red-200 bg-red-50/40 text-red-700` (Open variance) → keep red as semantic danger; document the hex literals as `§7.2 sweep` inheritance per the P0-2 pattern.
- `border-yellow-200 bg-yellow-50/40 text-yellow-700` (Next snapshot due) → keep amber/gold as semantic warn; inherit pattern.

The new `StatusPreStrip.tsx` will carry the same comment-block at its top:
```
// Note: red/amber hex literals on the variance + due cards are used
// semantically for danger/warn accents — preserved byte-for-byte from
// the previous bespoke implementation. Brand-var migration tracked
// under audit §7.2 brand-var sweep follow-up.
```

### What stays semantic (intentional)
- The `<RemindersBanner>` for overdue snapshots stays red — that's a real danger signal.
- Active-snapshot KPI tile keeps its gold accent.

## 8. Testing strategy

### New unit tests
- `use-perf-pnl-url-state.test.ts` (~6 assertions): preset → URL round-trip, month → URL round-trip, default state omits scope/building, A1 scope still parses, building filter writes/parses, mutual exclusion between preset and month.
- `use-bs-url-state.test.ts` (~4 assertions): scope round-trip, asof round-trip, building round-trip, A1 backward-compat.

### Existing tests preserved
- `FinancialsFilterStrip.test.tsx` (3 assertions) — keeps passing because the strip stays alive for Payables.
- All P0-2 dashboard-shell tests continue to pass (Performance + Balance Sheet are net-new consumers of those primitives).

### Manual smoke checklist
- **Landing:** opens at `/beithady/financials`. Status pre-strip renders the 3 cards with BH-themed colors (no raw indigo/red/yellow on card backgrounds). Reminders banner renders only when overdue. Launcher tiles render in a 3-column grid with the same labels + icons + badges as before.
- **Performance:** scope pills work, preset pills work, month picker accepts `2026-02` and triggers a re-fetch with the right `fromDate`/`toDate`, building pills filter the P&L, rail collapses after 3s of mouse-out, pin button persists across reload, mobile filter sheet opens via the `☰` button.
- **Backward-compat:** `?scope=a1` still loads (data scoped to A1HOSPITALITY; no scope pill highlighted). `?from=2026-01-01&to=2026-03-31` (legacy range URL) still parses and renders the right period.
- **Balance Sheet:** scope + as-of date input + building filters all work. As-of defaults to today. Date change triggers re-fetch.
- **Type-check + full vitest suite** stays green.

## 9. Migration mechanics

This work ships as **one PR with 3 commits**:

1. `feat(bh-financials): migrate landing to BeithadyShell + BeithadyLauncher; re-theme status cards`
2. `feat(bh-financials): migrate Performance to BHDashboardShell + add month picker (real)`
3. `feat(bh-financials): migrate Balance Sheet to BHDashboardShell`

Effort estimate: **M** (~400–600 LOC net change). The data-layer adapters are small; the bulk of the work is rail composition, URL-state hooks, and the StatusPreStrip extraction.

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Server-component / client-component boundary mistake (shell needs client; data fetch needs server) | Medium | Same pattern as analytics/performance — server `page.tsx` fetches data + parses search params, passes payload + URL state into a `'use client'` Shell wrapper. Reference implementation already exists in `analytics/performance/`. |
| Hand-crafted `?from/?to` URLs stop parsing after migration | Low | Keep `resolveFinancePeriod()` call accepting legacy params; just don't surface them in the rail UI. Smoke check covers this. |
| Status-card re-theme drift looks different from operator memory | Low | Keep red/amber semantic colors (danger/warn). Only the indigo "Active snapshot" card visually changes — switches from indigo accent to BH gold accent, which matches the rest of the platform. |
| Mobile filter sheet stacking on Balance Sheet's date picker (sheet + native date picker overlay) | Low | The `<BHMobileFilterSheet>` z-index is `z-40`; native date picker overlays render above. Validated by Analytics Performance manual smoke. |

## 11. Open questions

1. **Building section labels in the rail** — current `BUILDING_LABEL` map (Performance dashboard) labels `OTHER` as "Other". The page-level `BUILDING_CODE_SET` accepts `'OTHER'` as a code. Confirm: pill label for `OTHER` is "Other"?
2. **As-of date in URL** — should default-day on the URL be omitted (URL always shorter) or always written (URL always reproducible)? Spec defaults to "always written" because the user expects "today" to mean "today the URL was bookmarked".
3. **A1 scope filter** — same UI-hide-only treatment as P0-1 (don't render the pill, type guard accepts the URL). Confirm.

Defaults are reasonable; flag for human review.

---

*Generated 2026-05-15 during BH audit P1 brainstorming session. Parent audit: docs/superpowers/specs/2026-05-15-bh-design-audit-design.md §8 rows #3, #4, #5.*
