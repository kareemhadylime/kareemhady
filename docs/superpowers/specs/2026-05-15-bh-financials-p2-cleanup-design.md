# BH Financials P2 Cleanup — Payables + Ledgers + Snapshots + Reconciliation + Import

**Date:** 2026-05-15
**Author:** kareem (via brainstorming session)
**Status:** Draft — pending review
**Scope:** Migrate the 5 remaining Beithady Financials pages (7 page.tsx files including [id] details) onto canonical BH shells. Delete `FinancialsFilterStrip.tsx`. Closes the audit's wrong-shell financials block.
**Parent audit:** [docs/superpowers/specs/2026-05-15-bh-design-audit-design.md](2026-05-15-bh-design-audit-design.md) §8 row #6.
**Depends on:** P0-2 + P1 (shipped). Reuses `<BHDashboardShell>` from `src/app/beithady/_components/dashboard-shell/`.

---

## 1. Goal & scope

After P1, 3 of 10 `/beithady/financials/*` pages run on canonical shells (landing, performance, balance-sheet). This PR migrates the other 7:

- **Payables** (`/beithady/financials/payables`) — data dashboard. Last consumer of `FinancialsFilterStrip`.
- **Ledgers** (`/beithady/financials/ledgers`) — data dashboard (per-partner-kind).
- **Snapshots** (`/beithady/financials/snapshots`) — list view.
- **Snapshots [id]** (`/beithady/financials/snapshots/[id]`) — detail view.
- **Reconciliation** (`/beithady/financials/reconciliation`) — data dashboard.
- **Import** (`/beithady/financials/import`) — form/wizard.
- **Import [upload_id]** (`/beithady/financials/import/[upload_id]`) — detail view.

After all 7 land, `src/app/beithady/financials/_components/FinancialsFilterStrip.tsx` becomes unreferenced and gets **deleted in the same PR**.

**Audit milestone:** 10/12 wrong-shell offenders resolved. Only `/setup` and `/pricing` remain (P3, low traffic).

## 2. Per-page architecture

### 2.1 `<BHDashboardShell>` consumers (3 pages)

Each gets a new client `Shell` wrapper + typed URL hook + thin server `page.tsx` (same pattern as `PerformanceShell`/`BalanceSheetShell` from P1).

**Payables** (`PayablesShell.tsx`):
- Rail sections: Scope (3 pills) + As of (`<input type="date">`).
- URL hook: `usePayablesUrlState` → `{ scope: FinScope, asof: string }`.
- Body: existing `<PayablesBlock payables scope asOf scopeLbl />` unchanged.
- Title bar: `eyebrow="Beit Hady · Financials"`, `title="Payables · ${scopeLbl}"`, `subtitle="As of ${asOf}"`, chips `[asOf]`, actions `[← Back to Financials]`.

**Ledgers** (`LedgersShell.tsx`):
- Rail sections: Scope (3 pills) + Kind (7 pills: Suppliers/Owners/Customers/Landlords/Employees/Noteholders/All) + As of (`<input type="date">`).
- URL hook: `useLedgersUrlState` → `{ scope: FinScope, kind: PartnerKind | 'all', asof: string }`.
- Body: existing `<PartnerLedgerTable rows />` + the existing "Opening from snapshot {period}" caption + sum-line footer.
- Default kind: `'supplier'` (matches current behavior).

**Reconciliation** (`ReconciliationShell.tsx`):
- Rail sections: Snapshot (a `<select>` of frozen snapshots, fetched server-side and passed in as a prop list `snapshotOptions: { id: string; label: string }[]`).
- URL hook: `useReconciliationUrlState` → `{ snapshot_id: string | undefined }`. When unset, server-side resolves to latest frozen.
- Body: existing summary chips + accounts-vs-ledger variance table.
- Title bar actions: existing "Export xlsx" link.

All 3 use `useRailCollapse()` in the Shell and thread state to BOTH `<BHDashboardShell>` AND `<BHLeftRail>` per the P0-2 regression-prevention contract.

### 2.2 `<BeithadyShell>` consumers (4 pages — no rail)

Pure shell wrap; existing body content preserved.

**Snapshots** (list, no filter today):
```
<BeithadyShell breadcrumbs={[{label: 'Financials', href: '/beithady/financials'}, {label: 'Snapshots'}]}>
  <BeithadyHeader eyebrow="Beit Hady · Financials" title="Snapshots · Consolidated" subtitle="Frozen opening-balance snapshots by period" />
  {/* existing grouped-by-period list */}
</BeithadyShell>
```

**Snapshots [id]** (detail):
```
<BeithadyShell breadcrumbs={[{Financials, …}, {Snapshots, /beithady/financials/snapshots}, {label: `${period_end} v${version}`}]}>
  <BeithadyHeader title=`Snapshot · ${period_end} v${version}` subtitle=... right={<actionButtons />} />
  {/* existing detail body */}
</BeithadyShell>
```

**Import** (wizard):
```
<BeithadyShell breadcrumbs={[{Financials}, {label: 'Import'}]}>
  <BeithadyHeader title="Import ledgers" subtitle="Upload xlsx per account; auto-split by Odoo flags" />
  {/* existing upload form + target-account picker */}
</BeithadyShell>
```

**Import [upload_id]** (review-and-commit detail):
```
<BeithadyShell breadcrumbs={[{Financials}, {Import, /beithady/financials/import}, {label: <short upload id>}]}>
  <BeithadyHeader title="Review import" subtitle=... right={<commitButton />} />
  {/* existing review UI: per-kind chips, unmatched rows, commit form */}
</BeithadyShell>
```

## 3. URL state shapes (3 new hooks)

All three follow the established pattern: module-scope parse/serialize/basePath, defaults written as TypeScript const, A1 stays in scope type for URL backward-compat, pure `buildXUrl()` exported for tests.

### 3.1 `usePayablesUrlState`

```ts
export type FinScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';
export type FinPayablesUrlState = {
  scope: FinScope;
  asof: string;  // 'YYYY-MM-DD', defaults to today
};
```
Serialization: `asof` always written; `scope` omitted when `'consolidated'`. Identical to `useBSUrlState` minus `building`.

### 3.2 `useLedgersUrlState`

```ts
export type PartnerKind = 'supplier' | 'owner' | 'customer' | 'landlord' | 'employee' | 'noteholder';
export type FinLedgersUrlState = {
  scope: FinScope;
  kind: PartnerKind | 'all';
  asof: string;
};
```
Default kind: `'supplier'`. Serialization: `asof` always written; `scope` omitted when `'consolidated'`; `kind` omitted when `'supplier'`.

### 3.3 `useReconciliationUrlState`

```ts
export type FinReconciliationUrlState = {
  snapshot_id: string | undefined;  // undefined → server resolves to latest frozen
};
```
Serialization: `snapshot` (note: param name is `snapshot`, matching the existing URL contract) written only when defined.

All three reuse `FinScope` from the shared types module. Add `src/app/beithady/financials/_hooks/url-state-types.ts` exporting `FinScope` once and import from there in all 5 financials URL hooks (Performance, Balance Sheet, Payables, Ledgers, Reconciliation) — small DRY win.

## 4. File structure

### New files

| Path | Responsibility |
|---|---|
| `src/app/beithady/financials/_hooks/url-state-types.ts` | Shared `FinScope` type (DRY across 5 hooks) |
| `src/app/beithady/financials/_hooks/use-payables-url-state.ts` + `.test.ts` | Payables URL hook (~5 assertions) |
| `src/app/beithady/financials/_hooks/use-ledgers-url-state.ts` + `.test.ts` | Ledgers URL hook (~6 assertions) |
| `src/app/beithady/financials/_hooks/use-reconciliation-url-state.ts` + `.test.ts` | Reconciliation URL hook (~3 assertions) |
| `src/app/beithady/financials/payables/_components/PayablesShell.tsx` | Client Shell wrapper |
| `src/app/beithady/financials/ledgers/_components/LedgersShell.tsx` | Client Shell wrapper |
| `src/app/beithady/financials/reconciliation/_components/ReconciliationShell.tsx` | Client Shell wrapper |

### Modified files

| Path | Change |
|---|---|
| `src/app/beithady/financials/payables/page.tsx` | Thin server component → renders `<PayablesShell>` |
| `src/app/beithady/financials/ledgers/page.tsx` | Thin server component → renders `<LedgersShell>` |
| `src/app/beithady/financials/reconciliation/page.tsx` | Server component fetches frozen-snapshot list + reconciliation report → renders `<ReconciliationShell>` |
| `src/app/beithady/financials/snapshots/page.tsx` | Replace raw `<TopNav>` with `<BeithadyShell + BeithadyHeader>`; body unchanged |
| `src/app/beithady/financials/snapshots/[id]/page.tsx` | Same shell swap |
| `src/app/beithady/financials/import/page.tsx` | Same shell swap |
| `src/app/beithady/financials/import/[upload_id]/page.tsx` | Same shell swap |
| `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts` | Import `FinScope` from `url-state-types.ts` (DRY) |
| `src/app/beithady/financials/_hooks/use-bs-url-state.ts` | Import `FinScope` from `url-state-types.ts` (DRY) |

### Deleted

| Path | Reason |
|---|---|
| `src/app/beithady/financials/_components/FinancialsFilterStrip.tsx` + `.test.tsx` | Payables was the last consumer. After migration, no callers remain. |

### Untouched

- All body components: `PayablesBlock`, `PartnerLedgerTable`, plus reconciliation/snapshot/import inline bodies.
- Data layer: `buildPayablesReport`, `buildLedgerReport`, `buildReconciliation`, `listSnapshots`, etc.
- `CompanyScope` type union with `'a1'` (P0-1 strategy).

## 5. Testing strategy

### New unit tests (~14 assertions across 3 hook test files)
- `use-payables-url-state.test.ts` (~4): defaults round-trip, asof always written, scope+building omission, A1 backward-compat.
- `use-ledgers-url-state.test.ts` (~5): defaults, kind round-trip, scope+kind+asof combo, A1 backward-compat, invalid-kind falls back to `'supplier'`.
- `use-reconciliation-url-state.test.ts` (~3): undefined snapshot omits param, defined snapshot serializes, parse handles missing param.

### Behavior preservation
- `PayablesBlock`, `PartnerLedgerTable`, reconciliation table, snapshot list grouping, import form: all body components untouched. Each page's rendered body should be byte-near-identical to the pre-migration version.
- Existing `FinancialsFilterStrip.test.tsx` deletes alongside the component.

### Baseline / target
- Baseline (post-P1): 628 passing / 22 skipped.
- Target: 628 + 14 new − 3 deleted (`FinancialsFilterStrip.test.tsx` assertions) = **~639 passing**. Zero regressions on existing suite.

## 6. PR shape

One PR. Suggested commit boundaries:

1. **Shared types**: extract `FinScope` to `_hooks/url-state-types.ts`; update Performance + BS hooks to import from there.
2. **Payables migration**: hook + Shell + page rewrite.
3. **Ledgers migration**: hook + Shell + page rewrite.
4. **Reconciliation migration**: hook + Shell + page rewrite.
5. **Snapshots list + detail migration**: shell swap only.
6. **Import wizard + detail migration**: shell swap only.
7. **Delete FinancialsFilterStrip**: file + test removal; verify no callers.

7 commits, all under one PR. Effort estimate: **L** (~1,500 LOC net change; bulk is mechanical replays of the P1 pattern).

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Subtle behavior drift in Payables (since it was the last FinancialsFilterStrip consumer) | Low | The Shell pattern is now proven across 4 prior consumers. Manual smoke after migration confirms the as-of date filter still re-fetches correctly. |
| `Reconciliation` snapshot-resolution race (server resolves "latest frozen" when `?snapshot=` is absent) | Low | The existing server-side behavior is preserved verbatim — `parseFinReconciliationState` returns `{ snapshot_id: undefined }`, and the page's existing fallback to "latest frozen" handles the resolution. |
| Existing fees-audit migration's `Sidebar.tsx` could regress if `BHRailPill` styles shift | Very low | This PR doesn't touch `BHRailPill` or anything in `_components/dashboard-shell/`. Pure consumer additions. |
| `FinancialsFilterStrip.test.tsx` deletion breaks the suite | Very low | The test imports only `FinancialsFilterStrip`. When the source file deletes, the test deletes alongside it. |

## 8. Open questions

1. **Ledgers default kind** — current page defaults to `'supplier'`. Confirmed in spec (matches current behavior).
2. **Reconciliation snapshot picker** — UI is a `<select>` inside a LeftRail section. Alternative considered (top dropdown without rail) but rejected for consistency with the other 2 dashboard pages. Will revisit if the operator says the rail feels overkill for a single filter.
3. **Audit's `§7.2` brand-var sweep** — none of these 7 pages add new raw-Tailwind chrome. Existing inheritance comments (in StatusPreStrip + BHTitleBar) continue to cover the broader sweep. No new comments needed.

Defaults are reasonable; flag for human review.

---

*Generated 2026-05-15 during BH audit P2 financials brainstorming session. Parent audit: docs/superpowers/specs/2026-05-15-bh-design-audit-design.md §8 row #6.*
