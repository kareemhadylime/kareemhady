# BH Financials P2 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 7 remaining `/beithady/financials/*` page.tsx files onto canonical BH shells (Payables/Ledgers/Reconciliation onto `<BHDashboardShell>`, Snapshots×2 and Import×2 onto `<BeithadyShell>`). After all 7 land, delete `FinancialsFilterStrip.tsx`. Closes the audit's wrong-shell financials block.

**Architecture:** Reuse the pattern proven by P1: each `<BHDashboardShell>` consumer = thin server `page.tsx` + `'use client'` Shell wrapper + typed `useBHUrlState<T>` hook (parse/serialize/basePath at module scope). Each `<BeithadyShell>` consumer = shell-swap only (replace raw `<TopNav>` with `<BeithadyShell + BeithadyHeader>`, body preserved). Shared `FinScope` type extracted from per-hook duplicates.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Vitest + jsdom for hook tests, Tailwind v4 with BH brand CSS vars.

**Source spec:** [docs/superpowers/specs/2026-05-15-bh-financials-p2-cleanup-design.md](../specs/2026-05-15-bh-financials-p2-cleanup-design.md). **Depends on:** P0-2 + P1 (shipped). Reuses `<BHDashboardShell>` from `src/app/beithady/_components/dashboard-shell/`.

**Reference implementations (read before coding):**
- `src/app/beithady/financials/balance-sheet/_components/BalanceSheetShell.tsx` — model for `PayablesShell` (scope + asof + body)
- `src/app/beithady/financials/performance/_components/PerformanceShell.tsx` — model for `LedgersShell` (multi-section rail)
- `src/app/beithady/financials/_hooks/use-bs-url-state.ts` — model for `use-payables-url-state.ts`
- `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts` — model for `use-ledgers-url-state.ts`
- `src/app/beithady/analytics/page.tsx` — model for the 4 BeithadyShell-only pages

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/app/beithady/financials/_hooks/url-state-types.ts` | Shared `FinScope` type + `VALID_FIN_SCOPES` set |
| `src/app/beithady/financials/_hooks/use-payables-url-state.ts` + `.test.ts` | Payables URL hook (4 assertions) |
| `src/app/beithady/financials/_hooks/use-ledgers-url-state.ts` + `.test.ts` | Ledgers URL hook (5 assertions) |
| `src/app/beithady/financials/_hooks/use-reconciliation-url-state.ts` + `.test.ts` | Reconciliation URL hook (3 assertions) |
| `src/app/beithady/financials/payables/_components/PayablesShell.tsx` | Client Shell wrapper |
| `src/app/beithady/financials/ledgers/_components/LedgersShell.tsx` | Client Shell wrapper |
| `src/app/beithady/financials/reconciliation/_components/ReconciliationShell.tsx` | Client Shell wrapper |

### Modified

| Path | Change |
|---|---|
| `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts` | Import `FinScope` from new shared types module |
| `src/app/beithady/financials/_hooks/use-bs-url-state.ts` | Same |
| `src/app/beithady/financials/payables/page.tsx` | Thin server component → renders `<PayablesShell>` |
| `src/app/beithady/financials/ledgers/page.tsx` | Thin server component → renders `<LedgersShell>` |
| `src/app/beithady/financials/reconciliation/page.tsx` | Server component fetches frozen-snapshot list → renders `<ReconciliationShell>` |
| `src/app/beithady/financials/snapshots/page.tsx` | Shell swap: TopNav → BeithadyShell + BeithadyHeader |
| `src/app/beithady/financials/snapshots/[id]/page.tsx` | Shell swap |
| `src/app/beithady/financials/import/page.tsx` | Shell swap |
| `src/app/beithady/financials/import/[upload_id]/page.tsx` | Shell swap |

### Deleted

| Path | Reason |
|---|---|
| `src/app/beithady/financials/_components/FinancialsFilterStrip.tsx` | Payables was the last consumer |
| `src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx` | Test file for the deleted component |

### Untouched on purpose

- All body components: `PayablesBlock.tsx`, `PartnerLedgerTable.tsx`, plus the inline bodies for reconciliation/snapshots/import pages.
- Data layer: `buildPayablesReport`, `buildLedgerReport`, `buildReconciliation`, `listSnapshots`, `getSnapshot`, all `scopeCompanyIds`/`scopeLabel`/`isCompanyScope` helpers (A1 stays in type union per P0-1).
- `_components/`: PnlSection, BalanceSheetSection, StatusPreStrip — untouched.

---

## Task 1: Extract shared `FinScope` types

**Files:**
- Create: `src/app/beithady/financials/_hooks/url-state-types.ts`
- Modify: `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts`
- Modify: `src/app/beithady/financials/_hooks/use-bs-url-state.ts`

- [ ] **Step 1: Create the shared types file**

Create `src/app/beithady/financials/_hooks/url-state-types.ts`:

```ts
// Shared types for the typed URL hooks under /beithady/financials/_hooks.
//
// `FinScope` is the BH-financials operating scope. `'a1'` stays in the union
// for URL backward-compat per P0-1's UI-hide-only strategy — direct
// ?scope=a1 URLs continue to resolve, but no UI surface renders the pill.

export type FinScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';

export const VALID_FIN_SCOPES = new Set<string>(['consolidated', 'egypt', 'dubai', 'a1']);
```

- [ ] **Step 2: Update `use-perf-pnl-url-state.ts` to import the shared types**

Open `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts`. Replace the local `FinPerfScope` declaration block with imports from the shared module.

Find:
```ts
export type FinPerfScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';
```

Replace with:
```ts
import type { FinScope } from './url-state-types';
import { VALID_FIN_SCOPES } from './url-state-types';

// Re-export under the legacy alias to preserve backward-compat with consumers
// that imported FinPerfScope directly.
export type FinPerfScope = FinScope;
```

Place the `import` lines near the top of the file (after the existing `useBHUrlState` import). Remove the local `VALID_SCOPES` const lower down and replace its usages with `VALID_FIN_SCOPES`.

Find:
```ts
const VALID_SCOPES = new Set(['consolidated', 'egypt', 'dubai', 'a1']);
```

Delete that line. Then in `parseFinPerfState`, find:
```ts
const scope: FinPerfScope = scopeRaw && VALID_SCOPES.has(scopeRaw)
```

Replace with:
```ts
const scope: FinPerfScope = scopeRaw && VALID_FIN_SCOPES.has(scopeRaw)
```

- [ ] **Step 3: Update `use-bs-url-state.ts` the same way**

Open `src/app/beithady/financials/_hooks/use-bs-url-state.ts`. Replace:
```ts
export type FinBSScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';
```

With:
```ts
import type { FinScope } from './url-state-types';
import { VALID_FIN_SCOPES } from './url-state-types';

export type FinBSScope = FinScope;
```

Delete the local `VALID_SCOPES` set. Update the `parseFinBSState` reference from `VALID_SCOPES` to `VALID_FIN_SCOPES`.

- [ ] **Step 4: Type-check + run existing hook tests**

```bash
npx tsc --noEmit
npx vitest run src/app/beithady/financials/_hooks/
```

Expected: `tsc` clean. 11 tests pass (7 perf + 4 bs) — the same tests that ran in P1. Type aliases preserve backward compat.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/financials/_hooks/url-state-types.ts src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts src/app/beithady/financials/_hooks/use-bs-url-state.ts
git commit -m "refactor(bh-financials): extract shared FinScope type to url-state-types.ts (DRY across hooks)"
```

Do NOT push — controller pushes after all phases.

---

## Task 2: Payables URL hook (TDD)

**Files:**
- Create: `src/app/beithady/financials/_hooks/use-payables-url-state.ts`
- Create: `src/app/beithady/financials/_hooks/use-payables-url-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/financials/_hooks/use-payables-url-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFinPayablesUrl, type FinPayablesUrlState } from './use-payables-url-state';

describe('buildFinPayablesUrl', () => {
  function makeDefaults(today: string): FinPayablesUrlState {
    return { scope: 'consolidated', asof: today };
  }

  it('writes asof always (since today changes daily)', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinPayablesUrl(defaults, {});
    expect(url).toBe('/beithady/financials/payables?asof=2026-05-15');
  });

  it('omits scope when consolidated, writes when not', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinPayablesUrl(defaults, { scope: 'egypt' });
    expect(url).toBe('/beithady/financials/payables?asof=2026-05-15&scope=egypt');
  });

  it('preserves A1 scope for URL backward-compat', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinPayablesUrl(defaults, { scope: 'a1' });
    expect(url).toBe('/beithady/financials/payables?asof=2026-05-15&scope=a1');
  });

  it('respects an overridden asof in the patch', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinPayablesUrl(defaults, { asof: '2026-03-31' });
    expect(url).toBe('/beithady/financials/payables?asof=2026-03-31');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-payables-url-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

Create `src/app/beithady/financials/_hooks/use-payables-url-state.ts`:

```ts
'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';
import type { FinScope } from './url-state-types';
import { VALID_FIN_SCOPES } from './url-state-types';

export type FinPayablesUrlState = {
  scope: FinScope;
  asof: string;  // 'YYYY-MM-DD'
};

const BASE_PATH = '/beithady/financials/payables';

const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseFinPayablesState(search: URLSearchParams): FinPayablesUrlState {
  const scopeRaw = search.get('scope');
  const scope: FinScope = scopeRaw && VALID_FIN_SCOPES.has(scopeRaw)
    ? (scopeRaw as FinScope)
    : 'consolidated';

  const asofRaw = search.get('asof');
  const asof = asofRaw && ASOF_PATTERN.test(asofRaw) ? asofRaw : todayYmd();

  return { scope, asof };
}

export function serializeFinPayablesState(state: FinPayablesUrlState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('asof', state.asof);
  if (state.scope !== 'consolidated') params.set('scope', state.scope);
  return params;
}

export function buildFinPayablesUrl(
  current: FinPayablesUrlState,
  patch: Partial<FinPayablesUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinPayablesState,
    basePath: BASE_PATH,
  });
}

// `defaults` is built per-call (NOT module-scope) so `asof` reflects today
// at hook invocation, not at module load. `useBHUrlState` only reads
// parse/serialize/basePath for memo deps, so the per-call object is harmless.
function makePayablesDefaults(): FinPayablesUrlState {
  return { scope: 'consolidated', asof: todayYmd() };
}

export function usePayablesUrlState() {
  return useBHUrlState<FinPayablesUrlState>({
    defaults: makePayablesDefaults(),
    parse: parseFinPayablesState,
    serialize: serializeFinPayablesState,
    basePath: BASE_PATH,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-payables-url-state.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Don't commit yet — Task 3 wires the consumer**

---

## Task 3: PayablesShell + page rewrite, commit Phase 2

**Files:**
- Create: `src/app/beithady/financials/payables/_components/PayablesShell.tsx`
- Modify: `src/app/beithady/financials/payables/page.tsx`

- [ ] **Step 1: Create the Shell wrapper**

Create `src/app/beithady/financials/payables/_components/PayablesShell.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHRailPill,
  BHMobileFilterSheet,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { usePayablesUrlState, type FinPayablesUrlState } from '../../_hooks/use-payables-url-state';
import { PayablesBlock } from '../../_components/PayablesBlock';
import type { CompanyScope } from '@/lib/financials-pnl';

type Props = {
  payables: Parameters<typeof PayablesBlock>[0]['payables'];
  scope: CompanyScope;
  asOf: string;
  scopeLbl: string;
};

const SCOPES: Array<{ id: FinPayablesUrlState['scope']; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
];

export function PayablesShell({ payables, scope, asOf, scopeLbl }: Props) {
  const { state, update } = usePayablesUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

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
          className="rounded-md border px-2.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none"
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
          title={`Payables · ${scopeLbl}`}
          subtitle={`As of ${asOf}`}
          chips={[{ icon: Calendar, label: asOf }]}
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
        <PayablesBlock
          payables={payables}
          scope={scope}
          asOf={asOf}
          scopeLbl={scopeLbl}
        />
      </div>
    </BHDashboardShell>
  );
}
```

- [ ] **Step 2: Rewrite the page**

Replace the ENTIRE content of `src/app/beithady/financials/payables/page.tsx` with:

```tsx
import {
  buildPayablesReport,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { PayablesShell } from './_components/PayablesShell';
import { parseFinPayablesState } from '../_hooks/use-payables-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const urlParams = new URLSearchParams();
  if (sp.asof) urlParams.set('asof', sp.asof);
  if (sp.scope) urlParams.set('scope', sp.scope);
  const state = parseFinPayablesState(urlParams);

  const scope: CompanyScope = isCompanyScope(state.scope) ? state.scope : 'consolidated';
  const companyIds = scopeCompanyIds(scope);
  const payables = await buildPayablesReport({ asOf: state.asof, companyIds });

  return (
    <PayablesShell
      payables={payables}
      scope={scope}
      asOf={state.asof}
      scopeLbl={scopeLabel(scope)}
    />
  );
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: clean tsc, suite shows +4 new tests vs Task 1 baseline, build succeeds.

If `tsc` reports `PayablesBlock` doesn't accept the props you're passing, open `PayablesBlock.tsx` and verify the prop signature — keep the call site matching what the body component expects. Don't refactor the body.

- [ ] **Step 4: Commit Phase 2**

```bash
git add src/app/beithady/financials/_hooks/use-payables-url-state.ts src/app/beithady/financials/_hooks/use-payables-url-state.test.ts src/app/beithady/financials/payables/_components/PayablesShell.tsx src/app/beithady/financials/payables/page.tsx
git commit -m "feat(bh-financials): migrate Payables to BHDashboardShell"
```

Do NOT push.

---

## Task 4: Ledgers URL hook (TDD)

**Files:**
- Create: `src/app/beithady/financials/_hooks/use-ledgers-url-state.ts`
- Create: `src/app/beithady/financials/_hooks/use-ledgers-url-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/financials/_hooks/use-ledgers-url-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFinLedgersUrl, parseFinLedgersState, type FinLedgersUrlState } from './use-ledgers-url-state';

describe('buildFinLedgersUrl', () => {
  function makeDefaults(today: string): FinLedgersUrlState {
    return { scope: 'consolidated', kind: 'supplier', asof: today };
  }

  it('writes asof always; omits scope+kind at defaults', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinLedgersUrl(defaults, {});
    expect(url).toBe('/beithady/financials/ledgers?asof=2026-05-15');
  });

  it('serializes kind when non-default', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinLedgersUrl(defaults, { kind: 'owner' });
    expect(url).toBe('/beithady/financials/ledgers?asof=2026-05-15&kind=owner');
  });

  it('serializes scope + kind together', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinLedgersUrl(defaults, { scope: 'egypt', kind: 'customer' });
    expect(url).toBe('/beithady/financials/ledgers?asof=2026-05-15&scope=egypt&kind=customer');
  });

  it('preserves A1 scope for URL backward-compat', () => {
    const defaults = makeDefaults('2026-05-15');
    const url = buildFinLedgersUrl(defaults, { scope: 'a1' });
    expect(url).toBe('/beithady/financials/ledgers?asof=2026-05-15&scope=a1');
  });
});

describe('parseFinLedgersState', () => {
  it('falls back to supplier when ?kind= is missing', () => {
    const state = parseFinLedgersState(new URLSearchParams('asof=2026-05-15'));
    expect(state.kind).toBe('supplier');
  });

  it('falls back to supplier when ?kind= is invalid', () => {
    const state = parseFinLedgersState(new URLSearchParams('asof=2026-05-15&kind=nonsense'));
    expect(state.kind).toBe('supplier');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-ledgers-url-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

Create `src/app/beithady/financials/_hooks/use-ledgers-url-state.ts`:

```ts
'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';
import type { FinScope } from './url-state-types';
import { VALID_FIN_SCOPES } from './url-state-types';

export type LedgerKind = 'supplier' | 'owner' | 'customer' | 'landlord' | 'employee' | 'noteholder' | 'all';

export type FinLedgersUrlState = {
  scope: FinScope;
  kind: LedgerKind;
  asof: string;  // 'YYYY-MM-DD'
};

const BASE_PATH = '/beithady/financials/ledgers';

const VALID_KINDS = new Set<string>(['supplier', 'owner', 'customer', 'landlord', 'employee', 'noteholder', 'all']);
const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseFinLedgersState(search: URLSearchParams): FinLedgersUrlState {
  const scopeRaw = search.get('scope');
  const scope: FinScope = scopeRaw && VALID_FIN_SCOPES.has(scopeRaw)
    ? (scopeRaw as FinScope)
    : 'consolidated';

  const kindRaw = search.get('kind');
  const kind: LedgerKind = kindRaw && VALID_KINDS.has(kindRaw)
    ? (kindRaw as LedgerKind)
    : 'supplier';

  const asofRaw = search.get('asof');
  const asof = asofRaw && ASOF_PATTERN.test(asofRaw) ? asofRaw : todayYmd();

  return { scope, kind, asof };
}

export function serializeFinLedgersState(state: FinLedgersUrlState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('asof', state.asof);
  if (state.scope !== 'consolidated') params.set('scope', state.scope);
  if (state.kind !== 'supplier') params.set('kind', state.kind);
  return params;
}

export function buildFinLedgersUrl(
  current: FinLedgersUrlState,
  patch: Partial<FinLedgersUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinLedgersState,
    basePath: BASE_PATH,
  });
}

function makeLedgersDefaults(): FinLedgersUrlState {
  return { scope: 'consolidated', kind: 'supplier', asof: todayYmd() };
}

export function useLedgersUrlState() {
  return useBHUrlState<FinLedgersUrlState>({
    defaults: makeLedgersDefaults(),
    parse: parseFinLedgersState,
    serialize: serializeFinLedgersState,
    basePath: BASE_PATH,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-ledgers-url-state.test.ts
```

Expected: 6/6 pass.

- [ ] **Step 5: Don't commit yet — Task 5 wires the consumer**

---

## Task 5: LedgersShell + page rewrite, commit Phase 3

**Files:**
- Create: `src/app/beithady/financials/ledgers/_components/LedgersShell.tsx`
- Modify: `src/app/beithady/financials/ledgers/page.tsx`

- [ ] **Step 1: Create the Shell wrapper**

Create `src/app/beithady/financials/ledgers/_components/LedgersShell.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Users } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHRailPill,
  BHMobileFilterSheet,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { useLedgersUrlState, type FinLedgersUrlState, type LedgerKind } from '../../_hooks/use-ledgers-url-state';
import { PartnerLedgerTable } from '../../_components/PartnerLedgerTable';
import type { LedgerReport } from '@/lib/beithady/financials/ledgers';

type Props = {
  report: LedgerReport;
  scope: FinLedgersUrlState['scope'];
  kind: LedgerKind;
  asOf: string;
  scopeLbl: string;
};

const SCOPES: Array<{ id: FinLedgersUrlState['scope']; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
];

const KINDS: Array<{ id: LedgerKind; label: string }> = [
  { id: 'supplier', label: 'Suppliers' },
  { id: 'owner', label: 'Owners' },
  { id: 'customer', label: 'Customers' },
  { id: 'landlord', label: 'Landlords' },
  { id: 'employee', label: 'Employees' },
  { id: 'noteholder', label: 'Noteholders' },
  { id: 'all', label: 'All' },
];

export function LedgersShell({ report, scope, kind, asOf, scopeLbl }: Props) {
  const { state, update } = useLedgersUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const kindLabel = KINDS.find((k) => k.id === kind)?.label ?? kind;
  const sum = report.rows.reduce((s, r) => s + r.current_balance, 0);

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
      title: 'Kind',
      children: (
        <>
          {KINDS.map((k) => (
            <BHRailPill
              key={k.id}
              active={state.kind === k.id}
              onClick={() => update({ kind: k.id })}
            >
              {k.label}
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
          className="rounded-md border px-2.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none"
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
          title={`Partner Ledgers · ${kindLabel}`}
          subtitle={`${scopeLbl} · As of ${asOf}`}
          chips={[
            { icon: Calendar, label: asOf },
            { icon: Users, label: kindLabel },
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
            { emoji: '👥', title: `Kind: ${state.kind}` },
            { emoji: '📅', title: `As of: ${state.asof}` },
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
      <div className="col-span-12 space-y-4">
        <p className="text-xs" style={{ color: 'var(--bh-steel)' }}>
          Opening from snapshot{' '}
          <strong>{report.opening_period_end ?? '—'}</strong> · as of {asOf}
        </p>
        <PartnerLedgerTable rows={report.rows} />
        {report.rows.length > 0 ? (
          <p className="text-xs text-right" style={{ color: 'var(--bh-steel)' }}>
            Sum: <strong>{Math.round(sum).toLocaleString('en-US')} EGP</strong>
          </p>
        ) : null}
      </div>
    </BHDashboardShell>
  );
}
```

- [ ] **Step 2: Rewrite the page**

Replace the ENTIRE content of `src/app/beithady/financials/ledgers/page.tsx` with:

```tsx
import { buildLedgerReport } from '@/lib/beithady/financials/ledgers';
import type { CompanyScope, PartnerKind } from '@/lib/beithady/financials/types';
import { LedgersShell } from './_components/LedgersShell';
import { parseFinLedgersState } from '../_hooks/use-ledgers-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCOPE_LABEL: Record<CompanyScope, string> = {
  consolidated: 'Consolidated',
  egypt: 'Egypt',
  dubai: 'Dubai',
  a1: 'A1',
};

export default async function LedgersPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; scope?: string; asof?: string }>;
}) {
  const sp = await searchParams;
  const urlParams = new URLSearchParams();
  if (sp.kind) urlParams.set('kind', sp.kind);
  if (sp.scope) urlParams.set('scope', sp.scope);
  if (sp.asof) urlParams.set('asof', sp.asof);
  const state = parseFinLedgersState(urlParams);

  // buildLedgerReport accepts PartnerKind | 'all' — same as our state.kind.
  // The cast is safe because parseFinLedgersState already validated against
  // VALID_KINDS, which mirrors the LedgerKind union exactly.
  const dataKind = state.kind as PartnerKind | 'all';
  const dataScope = state.scope as CompanyScope;

  const report = await buildLedgerReport({
    kind: dataKind,
    scope: dataScope,
    as_of: state.asof,
  });

  return (
    <LedgersShell
      report={report}
      scope={state.scope}
      kind={state.kind}
      asOf={state.asof}
      scopeLbl={SCOPE_LABEL[dataScope]}
    />
  );
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: clean. If `LedgerReport` is not exported from `@/lib/beithady/financials/ledgers`, add the export at the bottom of that file:

```ts
export type { LedgerReport };
```

Run `grep "export.*LedgerReport" src/lib/beithady/financials/ledgers.ts` to verify.

- [ ] **Step 4: Commit Phase 3**

```bash
git add src/app/beithady/financials/_hooks/use-ledgers-url-state.ts src/app/beithady/financials/_hooks/use-ledgers-url-state.test.ts src/app/beithady/financials/ledgers/_components/LedgersShell.tsx src/app/beithady/financials/ledgers/page.tsx
# If you also added the LedgerReport export above, include it:
# git add src/lib/beithady/financials/ledgers.ts
git commit -m "feat(bh-financials): migrate Partner Ledgers to BHDashboardShell"
```

---

## Task 6: Reconciliation URL hook (TDD)

**Files:**
- Create: `src/app/beithady/financials/_hooks/use-reconciliation-url-state.ts`
- Create: `src/app/beithady/financials/_hooks/use-reconciliation-url-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/beithady/financials/_hooks/use-reconciliation-url-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFinReconciliationUrl, parseFinReconciliationState, type FinReconciliationUrlState } from './use-reconciliation-url-state';

describe('buildFinReconciliationUrl', () => {
  const defaults: FinReconciliationUrlState = { snapshot_id: undefined };

  it('omits ?snapshot= when snapshot_id is undefined', () => {
    const url = buildFinReconciliationUrl(defaults, {});
    expect(url).toBe('/beithady/financials/reconciliation');
  });

  it('writes ?snapshot=<id> when defined', () => {
    const url = buildFinReconciliationUrl(defaults, { snapshot_id: 'abc-123' });
    expect(url).toBe('/beithady/financials/reconciliation?snapshot=abc-123');
  });
});

describe('parseFinReconciliationState', () => {
  it('returns undefined when ?snapshot= is missing', () => {
    const state = parseFinReconciliationState(new URLSearchParams());
    expect(state.snapshot_id).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-reconciliation-url-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

Create `src/app/beithady/financials/_hooks/use-reconciliation-url-state.ts`:

```ts
'use client';
import { useBHUrlState, buildBHUrl } from '@/app/beithady/_components/dashboard-shell';

export type FinReconciliationUrlState = {
  snapshot_id: string | undefined;
};

const BASE_PATH = '/beithady/financials/reconciliation';

export function parseFinReconciliationState(search: URLSearchParams): FinReconciliationUrlState {
  const raw = search.get('snapshot');
  return { snapshot_id: raw ?? undefined };
}

export function serializeFinReconciliationState(state: FinReconciliationUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.snapshot_id) params.set('snapshot', state.snapshot_id);
  return params;
}

export function buildFinReconciliationUrl(
  current: FinReconciliationUrlState,
  patch: Partial<FinReconciliationUrlState>,
): string {
  return buildBHUrl({
    current,
    patch,
    serialize: serializeFinReconciliationState,
    basePath: BASE_PATH,
  });
}

const DEFAULTS: FinReconciliationUrlState = { snapshot_id: undefined };

export function useReconciliationUrlState() {
  return useBHUrlState<FinReconciliationUrlState>({
    defaults: DEFAULTS,
    parse: parseFinReconciliationState,
    serialize: serializeFinReconciliationState,
    basePath: BASE_PATH,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/beithady/financials/_hooks/use-reconciliation-url-state.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 5: Don't commit yet — Task 7 wires the consumer**

---

## Task 7: ReconciliationShell + page rewrite, commit Phase 4

**Files:**
- Create: `src/app/beithady/financials/reconciliation/_components/ReconciliationShell.tsx`
- Modify: `src/app/beithady/financials/reconciliation/page.tsx`

- [ ] **Step 1: Create the Shell wrapper**

Create `src/app/beithady/financials/reconciliation/_components/ReconciliationShell.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Snowflake, Download } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHMobileFilterSheet,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { useReconciliationUrlState } from '../../_hooks/use-reconciliation-url-state';
import type { ReconciliationReport } from '@/lib/beithady/financials/reconciliation';

type SnapshotOption = { id: string; label: string };

type Props = {
  report: ReconciliationReport;
  snapshotId: string;
  snapshotOptions: SnapshotOption[];
};

export function ReconciliationShell({ report, snapshotId, snapshotOptions }: Props) {
  const { state, update } = useReconciliationUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const currentLabel = snapshotOptions.find((o) => o.id === snapshotId)?.label ?? snapshotId;

  const railSections: BHRailSection[] = [
    {
      title: 'Snapshot',
      children: (
        <select
          value={state.snapshot_id ?? snapshotId}
          onChange={(e) => update({ snapshot_id: e.target.value })}
          className="rounded-md border px-2.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none"
          style={{
            background: 'transparent',
            color: 'var(--bh-ink)',
            borderColor: 'var(--bh-mute)',
            fontFamily: 'inherit',
          }}
          aria-label="Snapshot"
        >
          {snapshotOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ),
    },
  ];

  const titleBarActions = (
    <>
      <a
        href={`/api/beithady/financials/reconciliation/xlsx?snapshot=${snapshotId}`}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'transparent', color: 'var(--bh-gold)', borderColor: 'var(--bh-gold)' }}
      >
        <Download className="h-3.5 w-3.5" /> Export xlsx
      </a>
      <Link
        href="/beithady/financials"
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'transparent', color: 'var(--bh-gold)', borderColor: 'var(--bh-gold)' }}
      >
        ← Back to Financials
      </Link>
    </>
  );

  return (
    <BHDashboardShell
      railCollapsed={rail.collapsed}
      onRailEnter={rail.handleEnter}
      onRailLeave={rail.handleLeave}
      titleBar={
        <BHTitleBar
          eyebrow="Beit Hady · Financials"
          title="Reconciliation"
          subtitle="Account balance vs. partner ledger totals"
          chips={[{ icon: Snowflake, label: currentLabel }]}
          actions={titleBarActions}
          onMobileFilterClick={() => setMobileFilterOpen(true)}
        />
      }
      rail={
        <BHLeftRail
          sections={railSections}
          collapsed={rail.collapsed}
          collapsedIcons={[{ emoji: '❄️', title: `Snapshot: ${currentLabel}` }]}
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
      <div className="col-span-12 space-y-4">
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded px-2 py-1" style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-mute)' }}>
            With partners: <strong>{report.summary.accounts_with_partners}</strong>
          </span>
          <span className="rounded px-2 py-1" style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-mute)' }}>
            Awaiting ledger: <strong>{report.summary.accounts_awaiting_ledger}</strong>
          </span>
          <span
            className="rounded px-2 py-1"
            style={{
              background: report.summary.open_variance_count ? '#fdecec' : '#dcfce7',
              color: report.summary.open_variance_count ? '#9a2828' : '#166534',
              border: `1px solid ${report.summary.open_variance_count ? '#f1bcbc' : '#bbf7d0'}`,
            }}
          >
            Open variances: <strong>{report.summary.open_variance_count}</strong>
          </span>
          <span className="rounded px-2 py-1" style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-mute)' }}>
            Total variance: <strong>{Math.round(report.summary.total_variance).toLocaleString('en-US')} EGP</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b font-semibold" style={{ color: 'var(--bh-ink)' }}>
                <td className="py-1 pr-3">Code</td>
                <td className="pr-3">Account</td>
                <td className="text-right pr-3">Account total</td>
                <td className="text-right pr-3">Partner total</td>
                <td className="text-right pr-3">Variance</td>
                <td>Status</td>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr
                  key={i}
                  className="border-b"
                  style={{
                    background: r.variance !== 0 && r.variance_status === 'open' ? '#fdecec' : undefined,
                  }}
                >
                  <td className="py-1 pr-3">{r.account_code}</td>
                  <td className="pr-3">{r.account_name}</td>
                  <td className="text-right pr-3">
                    {Math.round(r.opening_raw).toLocaleString('en-US')}
                  </td>
                  <td className="text-right pr-3">
                    {r.partner_total == null
                      ? '—'
                      : Math.round(r.partner_total).toLocaleString('en-US')}
                  </td>
                  <td
                    className="text-right pr-3"
                    style={{
                      color: r.variance !== 0 ? '#9a2828' : undefined,
                      fontWeight: r.variance !== 0 ? 600 : undefined,
                    }}
                  >
                    {r.variance === 0 ? '0' : Math.round(r.variance).toLocaleString('en-US')}
                  </td>
                  <td>
                    {r.partner_total == null
                      ? '⏳ Awaiting'
                      : r.variance === 0
                        ? '✓ Clean'
                        : `🔴 ${r.variance_status}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </BHDashboardShell>
  );
}
```

- [ ] **Step 2: Rewrite the page**

Replace the ENTIRE content of `src/app/beithady/financials/reconciliation/page.tsx` with:

```tsx
import Link from 'next/link';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { buildReconciliation } from '@/lib/beithady/financials/reconciliation';
import { supabaseAdmin } from '@/lib/supabase';
import { ReconciliationShell } from './_components/ReconciliationShell';
import { parseFinReconciliationState } from '../_hooks/use-reconciliation-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const sp = await searchParams;
  const urlParams = new URLSearchParams();
  if (sp.snapshot) urlParams.set('snapshot', sp.snapshot);
  const state = parseFinReconciliationState(urlParams);

  const sb = supabaseAdmin();

  // Fetch all frozen consolidated snapshots for the rail picker.
  const { data: allSnaps } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end, version')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen')
    .order('period_end', { ascending: false });

  const snapshotOptions = (allSnaps ?? []).map((s) => ({
    id: s.id as string,
    label: `${s.period_end} v${s.version}`,
  }));

  // Resolve snapshot: explicit URL → use it; else latest frozen.
  const snapshotId = state.snapshot_id ?? snapshotOptions[0]?.id;

  if (!snapshotId) {
    return (
      <BeithadyShell breadcrumbs={[{ label: 'Financials', href: '/beithady/financials' }, { label: 'Reconciliation' }]}>
        <BeithadyHeader
          eyebrow="Beit Hady · Financials"
          title="Reconciliation"
          subtitle="No frozen snapshot found"
        />
        <p className="text-sm" style={{ color: 'var(--bh-steel)' }}>
          No frozen snapshot found.{' '}
          <Link href="/beithady/financials/import" className="underline">
            Import a ledger
          </Link>{' '}
          to create one.
        </p>
      </BeithadyShell>
    );
  }

  const report = await buildReconciliation({ snapshot_id: snapshotId });

  return (
    <ReconciliationShell
      report={report}
      snapshotId={snapshotId}
      snapshotOptions={snapshotOptions}
    />
  );
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: clean. If `ReconciliationReport` is not exported from `@/lib/beithady/financials/reconciliation`, add `export type { ReconciliationReport };` at the bottom of that file.

- [ ] **Step 4: Commit Phase 4**

```bash
git add src/app/beithady/financials/_hooks/use-reconciliation-url-state.ts src/app/beithady/financials/_hooks/use-reconciliation-url-state.test.ts src/app/beithady/financials/reconciliation/_components/ReconciliationShell.tsx src/app/beithady/financials/reconciliation/page.tsx
# Include the ReconciliationReport export if you added it:
# git add src/lib/beithady/financials/reconciliation.ts
git commit -m "feat(bh-financials): migrate Reconciliation to BHDashboardShell"
```

---

## Task 8: Migrate Snapshots list + detail to BeithadyShell, commit Phase 5

**Files:**
- Modify: `src/app/beithady/financials/snapshots/page.tsx`
- Modify: `src/app/beithady/financials/snapshots/[id]/page.tsx`

- [ ] **Step 1: Rewrite snapshots list page**

Open `src/app/beithady/financials/snapshots/page.tsx`. The body (the `byPeriod` grouping + the list rendering) is preserved verbatim. Only the chrome changes.

Replace the imports + return statement to wrap the existing body in `<BeithadyShell>`:

```tsx
import Link from 'next/link';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listSnapshots } from '@/lib/beithady/financials/snapshots';

export const dynamic = 'force-dynamic';

export default async function SnapshotsPage() {
  const snaps = await listSnapshots({ scope: 'consolidated' });
  const byPeriod = new Map<string, typeof snaps>();
  for (const s of snaps) {
    const arr = byPeriod.get(s.period_end) ?? [];
    arr.push(s);
    byPeriod.set(s.period_end, arr);
  }

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Financials', href: '/beithady/financials' }, { label: 'Snapshots' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Financials"
        title="Snapshots · Consolidated"
        subtitle="Frozen opening-balance snapshots by period"
      />

      {byPeriod.size === 0 ? (
        <p className="text-sm" style={{ color: 'var(--bh-steel)' }}>
          No snapshots found. Import a ledger to create the first one.
        </p>
      ) : (
        <div className="space-y-4">
          {[...byPeriod.entries()]
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .map(([period, versions]) => (
              <div
                key={period}
                className="rounded-lg p-4"
                style={{ border: '1px solid var(--bh-mute)' }}
              >
                <div className="text-sm font-semibold mb-2">{period}</div>
                <ul className="space-y-1">
                  {versions
                    .sort((a, b) => b.version - a.version)
                    .map((v) => (
                      <li key={v.id} className="text-sm flex items-center gap-3">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            background:
                              v.status === 'frozen' ? '#dcfce7' :
                              v.status === 'draft' ? '#fef3c7' :
                              'var(--bh-cream)',
                            color:
                              v.status === 'frozen' ? '#166534' :
                              v.status === 'draft' ? '#854d0e' :
                              'var(--bh-steel)',
                          }}
                        >
                          {v.status}
                        </span>
                        <span>v{v.version}</span>
                        <span style={{ color: 'var(--bh-steel)' }}>
                          {v.frozen_at ? `frozen ${v.frozen_at.slice(0, 10)}` : ''}
                        </span>
                        <Link
                          href={`/beithady/financials/snapshots/${v.id}`}
                          className="ml-auto text-xs hover:underline"
                          style={{ color: 'var(--bh-steel)' }}
                        >
                          View detail →
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </BeithadyShell>
  );
}
```

Note: status pill colors use the same documented hex inheritance pattern as P1 (`#dcfce7`/`#166534` for frozen-green, `#fef3c7`/`#854d0e` for draft-amber). These are semantic accents preserved from the original code.

- [ ] **Step 2: Rewrite snapshots [id] detail page**

Open `src/app/beithady/financials/snapshots/[id]/page.tsx`. Read the file (~166 lines) to preserve the body verbatim.

Replace the imports + outer return wrapper. The body of the original page (everything inside the `<main className="...">` block from the `<header>` down through the end) is preserved. The only changes:
- Replace `import { TopNav } from '@/app/_components/brand';` with `import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';`.
- Replace the `<TopNav>...</TopNav>` block + `<main>` opening with `<BeithadyShell breadcrumbs=[…]>` and `<BeithadyHeader title=... right=...>`.
- The `← Back to Snapshots` link inside the original body can be removed since the breadcrumb covers it.
- Close `</BeithadyShell>` at the bottom instead of `</main></>`.

Specifically: change the top of the file's imports from:

```tsx
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { notFound } from 'next/navigation';
import { TopNav } from '@/app/_components/brand';
import { getSnapshot } from '@/lib/beithady/financials/snapshots';
import { supabaseAdmin } from '@/lib/supabase';
```

to:

```tsx
import Link from 'next/link';
import { Download } from 'lucide-react';
import { notFound } from 'next/navigation';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { getSnapshot } from '@/lib/beithady/financials/snapshots';
import { supabaseAdmin } from '@/lib/supabase';
```

(Drop `ChevronLeft`/`ChevronRight` since they were only used by the deleted TopNav + back-link.)

Then replace the `return ( <> <TopNav>...</TopNav> <main className="..."> <Link ...>Back...</Link> <header>...` block with:

```tsx
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Financials', href: '/beithady/financials' },
        { label: 'Snapshots', href: '/beithady/financials/snapshots' },
        { label: `${snap.period_end} v${snap.version}` },
      ]}
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Financials"
        title={`Snapshot · ${snap.period_end} v${snap.version}`}
        subtitle={`Status: ${snap.status}${snap.frozen_at ? ' · frozen ' + snap.frozen_at.slice(0, 10) : ''}`}
      />
      {/* ... preserve everything from the original <header>'s siblings (the existing detail body) ... */}
    </BeithadyShell>
  );
}
```

The bulk of the original detail body (accounts table, partners table, action buttons, etc.) stays verbatim. Replace the outer `<header>` block since we're using `<BeithadyHeader>` now, but keep everything below it.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: clean. Build should compile both snapshot pages successfully.

- [ ] **Step 4: Commit Phase 5**

```bash
git add src/app/beithady/financials/snapshots/page.tsx src/app/beithady/financials/snapshots/[id]/page.tsx
git commit -m "feat(bh-financials): migrate Snapshots list + detail to BeithadyShell"
```

---

## Task 9: Migrate Import + Import [upload_id] to BeithadyShell, commit Phase 6

**Files:**
- Modify: `src/app/beithady/financials/import/page.tsx`
- Modify: `src/app/beithady/financials/import/[upload_id]/page.tsx`

- [ ] **Step 1: Rewrite import wizard page**

Open `src/app/beithady/financials/import/page.tsx`. The body (the upload form, target-account picker, snapshot caption) is preserved verbatim. Only chrome changes.

At the top of the file, replace:

```tsx
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
```

With:

```tsx
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
```

(Drop `Link`, `ChevronLeft`, `ChevronRight` only if they're not used elsewhere in the body — verify by reading the file. The body might use `Link` for target-account links; if so, keep that import.)

Replace the outer `return ( <> <TopNav>...</TopNav> <main className="..."> <Link ...>Back...</Link> ...`  with:

```tsx
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Financials', href: '/beithady/financials' },
        { label: 'Import' },
      ]}
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Financials"
        title="Import ledgers"
        subtitle={snap ? `Target snapshot: ${snap.period_end}` : 'No frozen snapshot — import will create one'}
      />
      {/* ... preserve the existing target-accounts picker + upload form body ... */}
    </BeithadyShell>
  );
}
```

The existing `<header>` block (if any) inside the body gets replaced by `<BeithadyHeader>` above; everything else (target-account picker grid, upload form, instructions) stays verbatim.

- [ ] **Step 2: Rewrite import [upload_id] review page**

Open `src/app/beithady/financials/import/[upload_id]/page.tsx`. Same pattern as Step 1.

Replace the imports of `TopNav`/`ChevronLeft`/`ChevronRight` (where they're TopNav-only) with `BeithadyShell` + `BeithadyHeader` import.

Replace the outer `return ( <> <TopNav>...</TopNav> <main>...` with:

```tsx
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Financials', href: '/beithady/financials' },
        { label: 'Import', href: '/beithady/financials/import' },
        { label: uploadId.slice(0, 8) + '…' },
      ]}
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Financials"
        title={`Review · ${parseResult.target_account_code} (${parseResult.target_account_name})`}
        subtitle={`Account ${parseResult.target_account_code} · ${parseResult.rows.length} rows`}
      />
      {/* ... preserve the existing per-kind chips + commit form body ... */}
    </BeithadyShell>
  );
}
```

(`uploadId`, `parseResult` etc. come from the existing page logic — preserve verbatim.)

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit Phase 6**

```bash
git add src/app/beithady/financials/import/page.tsx src/app/beithady/financials/import/[upload_id]/page.tsx
git commit -m "feat(bh-financials): migrate Import wizard + detail to BeithadyShell"
```

---

## Task 10: Delete FinancialsFilterStrip, commit Phase 7

**Files:**
- Delete: `src/app/beithady/financials/_components/FinancialsFilterStrip.tsx`
- Delete: `src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx`

- [ ] **Step 1: Confirm no remaining references**

```bash
grep -rn "FinancialsFilterStrip" src/
```

Expected: zero matches. If any caller still imports `FinancialsFilterStrip`, STOP and migrate that caller (likely a page that didn't get rewritten correctly above).

- [ ] **Step 2: Delete both files**

```bash
git rm src/app/beithady/financials/_components/FinancialsFilterStrip.tsx
git rm src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: clean. Test count drops by 3 (FinancialsFilterStrip.test.tsx had 3 assertions per P0-1) but the 14 new tests from this PR more than make up: 628 baseline + 14 new − 3 deleted = ~639.

- [ ] **Step 4: Commit Phase 7**

```bash
git commit -m "chore(bh-financials): delete FinancialsFilterStrip — all callers migrated to BHDashboardShell"
```

---

## Task 11: Final verification + push

**Files:** none (verification + git only)

- [ ] **Step 1: Full sweep**

```bash
npm run test
npx tsc --noEmit
npm run build
```

Expected: all three exit 0. Test count ~639 passing / 22 skipped.

- [ ] **Step 2: Manual smoke (dev server)**

```bash
npm run dev
```

Open each migrated page in a browser:
- `http://localhost:3000/beithady/financials/payables` — TitleBar shows "Payables · Consolidated · As of {today}"; rail has Scope + As of; scope pill switch refilters; as-of date input triggers re-fetch.
- `http://localhost:3000/beithady/financials/ledgers` — TitleBar shows "Partner Ledgers · Suppliers · Consolidated · As of {today}"; rail has Scope + Kind + As of; switching kind to "Owners" refilters; sum-line footer updates.
- `http://localhost:3000/beithady/financials/reconciliation` — TitleBar shows "Reconciliation · {latest snapshot label}"; rail has Snapshot dropdown; Export xlsx link works.
- `http://localhost:3000/beithady/financials/snapshots` — Lists frozen snapshots grouped by period; each "View detail →" link navigates to the detail page.
- `http://localhost:3000/beithady/financials/snapshots/{id}` — Detail page renders with BeithadyShell breadcrumb, body preserved.
- `http://localhost:3000/beithady/financials/import` — Upload form renders; target-account picker shows.
- `http://localhost:3000/beithady/financials/import/{uploadId}` (after uploading a file) — Review page shows kind chips and commit form.
- `http://localhost:3000/beithady/financials/payables?scope=a1` — Page still loads (data scoped to A1HOSPITALITY; no UI pill highlighted).
- `http://localhost:3000/beithady/financials/ledgers?kind=owner&scope=egypt&asof=2026-03-31` — Hand-crafted URL parses correctly; Owners kind pill highlighted, scope Egypt active, as-of date input shows 2026-03-31.

Stop the dev server with `Ctrl+C`.

- [ ] **Step 3: Push all commits**

```bash
git push origin main
```

This pushes 7 commits in one push:
1. `refactor(bh-financials): extract shared FinScope type to url-state-types.ts`
2. `feat(bh-financials): migrate Payables to BHDashboardShell`
3. `feat(bh-financials): migrate Partner Ledgers to BHDashboardShell`
4. `feat(bh-financials): migrate Reconciliation to BHDashboardShell`
5. `feat(bh-financials): migrate Snapshots list + detail to BeithadyShell`
6. `feat(bh-financials): migrate Import wizard + detail to BeithadyShell`
7. `chore(bh-financials): delete FinancialsFilterStrip`

Vercel auto-deploys via GitHub integration.

- [ ] **Step 4: Update SESSION_HANDOFF.md**

Prepend a new dated entry summarizing what shipped (7 commit SHAs, test count delta to 639, manual-smoke results). Commit + push that too.

---

## Self-Review (run after writing the plan)

**Spec coverage:**
- §1 Goal & scope (7 pages + FinancialsFilterStrip deletion): Tasks 1–10 cover all of it.
- §2 Per-page architecture: Tasks 2–7 (3 dashboard-shell consumers), Tasks 8–9 (4 beithady-shell consumers).
- §3 URL state shapes: Tasks 2, 4, 6 create the 3 new typed hooks.
- §4 File structure: every "New", "Modified", "Deleted" row maps to a task.
- §5 Testing strategy: Tasks 2, 4, 6 add the 13 new hook assertions; FinancialsFilterStrip.test.tsx deletes in Task 10.
- §6 PR shape: 7 commits match the 7-phase task structure.
- §7 Risks: addressed by reference implementations cited at the top + manual smoke in Task 11.
- §8 Open questions: defaults applied (Ledgers default kind = 'supplier'; Reconciliation uses LeftRail single-section).

**Placeholder scan:** no TBD / TODO / "implement details" patterns. Three places use "preserve verbatim" or "preserve the existing X body" — these refer to existing on-disk file content the engineer reads verbatim, not to undefined behavior to be filled in later. Acceptable per the plan's "shell swap" pattern where the body is by design unchanged.

**Type consistency:** `FinScope` (from `url-state-types.ts`) is consumed by all 3 new hooks AND the existing 2 hooks (after Task 1). `LedgerKind`, `FinPayablesUrlState`, `FinLedgersUrlState`, `FinReconciliationUrlState` are each defined once in their owning hook file and consumed by the matching Shell + page. `LedgerReport` / `ReconciliationReport` types may need to be exported — Task 3 / Task 7 flag this.

---

## Future work (out of scope for this plan)

- **Audit P2 #7: Analytics data dashboards** — calendar-heatmap, market-intel, reports/fees-audit (the fees-audit already uses the outer shell from P0-2; only `analytics/calendar-heatmap` and `analytics/market-intel` still need LeftRail adoption).
- **Audit P2 #8–11: Non-financials data dashboards** — inventory/dashboard, inventory/stock, ads/performance, ops surfaces, hr dashboards. All use the same `<BHDashboardShell>` pattern proven across 6+ consumers now.
- **Audit P2 #12: Communication inbox** — `communication/unified` has 4 filter dimensions (channel × status × assignee × date); will be the most complex consumer. Separate plan recommended.
- **Audit §7.2: Brand-var sweep** — replace inherited hex literals in `StatusPreStrip.tsx`, `BHTitleBar.tsx`, `BHCustomizeDrawer.tsx`, `BHMobileFilterSheet.tsx`, the new `LedgersShell` sum-footer, and any other semantic-accent surfaces with proper BH brand tokens once the brand designer commits a final palette.
- **Audit P3: `/setup` + `/pricing`** — last 2 wrong-shell pages in the audit (low traffic).
- **A1 type removal** — separate plan referenced from P0-1's plan file.
