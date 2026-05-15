# Remove A1 from BH Scope Filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "A1" pill from the Beithady Financials scope filter so BH module users only see Consolidated / Egypt / Dubai. URL `?scope=a1` still resolves (no functional removal yet).

**Architecture:** UI-hide-only change. One file edit (`FinancialsFilterStrip.tsx` — drop one row from the `SCOPES` array), plus a vitest component test that asserts the filter strip renders only the three Beithady scopes. The underlying `CompanyScope` type union in `src/lib/financials-pnl.ts` keeps `'a1'` so direct URL access continues to work; `scopeCompanyIds('a1')` still returns the A1 company id. If kareem later picks the "full type removal" path (audit spec §9 Q1), that's a follow-up plan — flagged at the end of this one.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript strict, Vitest 1.x + @testing-library/react + jsdom for component tests, Tailwind v4.

**Source spec:** [docs/superpowers/specs/2026-05-15-bh-design-audit-design.md](../specs/2026-05-15-bh-design-audit-design.md) §8 row #1, §7.1.

**Project memory:** [beithady_scope_filter_no_a1.md](file://C:/Users/karee/.claude/projects/C--kareemhady/memory/beithady_scope_filter_no_a1.md) — BH module scope filters render `consolidated / egypt / dubai` only.

---

## File Structure

| Operation | File | Responsibility |
|---|---|---|
| Modify | `src/app/beithady/financials/_components/FinancialsFilterStrip.tsx` | Drop the A1 entry from the local `SCOPES` array. |
| Create | `src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx` | Vitest component test asserting only 3 scopes render and "A1" is never in the DOM. |

**Unchanged on purpose (do not touch):**
- `src/lib/financials-pnl.ts` — `CompanyScope` type union keeps `'a1'`.
- `src/lib/beithady/financials/types.ts` — same.
- `src/app/beithady/financials/actions.ts` — same.
- Type guards in `financials/performance`, `balance-sheet`, `payables`, `ledgers`, `import` page files — they include `'a1'` in the OR-chain. Leaving them means `?scope=a1` URLs still load. Removing them is part of the follow-up "full A1 removal" plan, not this one.

---

## Task 1: Verify pre-conditions

**Files:** none (read-only).

- [ ] **Step 1: Read the current SCOPES array**

```bash
# Inspect FinancialsFilterStrip.tsx for the SCOPES constant.
# Expected: an Array<{id, label}> with 4 entries (consolidated, egypt, dubai, a1).
```

Read `src/app/beithady/financials/_components/FinancialsFilterStrip.tsx`. Confirm lines around the `SCOPES` declaration contain `{ id: 'a1', label: 'A1' }` as the 4th entry. If the array already has only 3 entries, **STOP** — this plan is already done.

- [ ] **Step 2: Confirm no inline scope pills exist outside the filter strip**

Run:

```bash
grep -rn "id: 'a1'" src/app/beithady/financials/
```

Expected output: exactly one match, in `FinancialsFilterStrip.tsx`. If you see additional matches in any `page.tsx` (inline pill arrays bypassing the filter strip), they need to be edited too — add a step to drop A1 from those arrays the same way. As of the audit (2026-05-15) only the filter strip surfaces an A1 pill in the UI.

- [ ] **Step 3: Run the existing test suite to establish a green baseline**

Run:

```bash
npm run test
```

Expected: all tests pass (~556 passing / ~22 skipped as of 2026-05-15). Note the exact pass/fail count — you'll compare against it after your change. If the baseline isn't green, **STOP** and fix or report before touching anything else.

---

## Task 2: Write the failing test

**Files:**
- Create: `src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx`

- [ ] **Step 1: Create the test file with three assertions**

Write the file exactly as below:

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { FinancialsFilterStrip } from './FinancialsFilterStrip';

describe('FinancialsFilterStrip — Beithady scope row', () => {
  test('renders Consolidated, Egypt, and Dubai pills', () => {
    const { container } = render(
      <FinancialsFilterStrip
        basePath="/beithady/financials/performance"
        activeScope="consolidated"
      />,
    );
    const labels = Array.from(container.querySelectorAll('nav a')).map(
      (a) => a.textContent?.trim() ?? '',
    );
    expect(labels).toContain('Consolidated');
    expect(labels).toContain('Egypt');
    expect(labels).toContain('Dubai');
  });

  test('does NOT render an A1 pill (Beithady scope filters exclude A1)', () => {
    const { container } = render(
      <FinancialsFilterStrip
        basePath="/beithady/financials/performance"
        activeScope="consolidated"
      />,
    );
    const labels = Array.from(container.querySelectorAll('nav a')).map(
      (a) => a.textContent?.trim() ?? '',
    );
    expect(labels).not.toContain('A1');
  });

  test('the scope row contains exactly 3 pills', () => {
    const { container } = render(
      <FinancialsFilterStrip
        basePath="/beithady/financials/performance"
        activeScope="consolidated"
      />,
    );
    // The first <nav> in the strip is the scope row (period presets are a
    // second <nav> rendered only when showPeriodPresets is true).
    const scopeNav = container.querySelector('nav');
    expect(scopeNav).not.toBeNull();
    expect(scopeNav!.querySelectorAll('a').length).toBe(3);
  });
});
```

- [ ] **Step 2: Run the new test and confirm it FAILS**

Run:

```bash
npx vitest run src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx
```

Expected output: tests 2 and 3 FAIL (test 1 may pass already, since Consolidated/Egypt/Dubai are still present). Failure messages should include either `expected [ ... 'A1' ... ] not to contain 'A1'` or `expected 4 to be 3`.

If the test file itself errors (e.g., "FinancialsFilterStrip is not a function", `next/link` import error), fix the import or environment before moving on — do NOT proceed to Task 3 with a broken test file.

---

## Task 3: Drop A1 from the SCOPES array

**Files:**
- Modify: `src/app/beithady/financials/_components/FinancialsFilterStrip.tsx`

- [ ] **Step 1: Remove the A1 entry from `SCOPES`**

Find this block in `FinancialsFilterStrip.tsx`:

```ts
const SCOPES: Array<{ id: CompanyScope; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
  { id: 'a1', label: 'A1' },
];
```

Replace with:

```ts
const SCOPES: Array<{ id: CompanyScope; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
];
```

Leave the type union `type CompanyScope = 'consolidated' | 'egypt' | 'dubai' | 'a1'` (declared near the top of the file) **untouched** — that's intentional, see the Architecture note. Removing `'a1'` from the type would force changes in 5 page-file type guards and `src/lib/financials-pnl.ts`, which is out of scope for this plan.

- [ ] **Step 2: Re-run the test and confirm it PASSES**

Run:

```bash
npx vitest run src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx
```

Expected: 3/3 tests pass.

- [ ] **Step 3: Run the full test suite to confirm zero regressions**

Run:

```bash
npm run test
```

Expected: total pass count = (baseline from Task 1 Step 3) + 3 new tests. Zero new failures. If anything broke, the most likely cause is a stale type cache — `rm -rf node_modules/.cache && npm run test` to force a fresh compile.

- [ ] **Step 4: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: clean. The `CompanyScope` type union still includes `'a1'`, so all type guards continue to compile.

---

## Task 4: Manual UI smoke test

**Files:** none.

- [ ] **Step 1: Start the dev server**

Run:

```bash
npm run dev
```

Wait for "Ready in" log line.

- [ ] **Step 2: Visit each financials page that surfaces the filter strip and confirm A1 is gone**

Open each URL in a browser, confirm the scope row shows **Consolidated · Egypt · Dubai** and NOT A1:

- http://localhost:3000/beithady/financials/performance
- http://localhost:3000/beithady/financials/balance-sheet
- http://localhost:3000/beithady/financials/payables

- [ ] **Step 3: Confirm backward-compat — direct `?scope=a1` URL still loads**

Open: http://localhost:3000/beithady/financials/performance?scope=a1

Expected: the page **renders** (P&L for A1HOSPITALITY) without crashing. The scope row will show Consolidated as visually active (since A1 isn't in the pill list), but the underlying data is correctly scoped to A1. This is intentional — UI-hide-only means any old bookmarks still work.

If this URL 500s or crashes, **STOP**. That means a type guard or `scopeCompanyIds` no longer accepts `'a1'`, which is a regression in this plan's scope. Roll back and investigate.

- [ ] **Step 4: Stop the dev server**

`Ctrl+C` in the terminal running `npm run dev`.

---

## Task 5: Commit, push, deploy

**Files:** none (git only).

- [ ] **Step 1: Stage the two files**

Run:

```bash
git add src/app/beithady/financials/_components/FinancialsFilterStrip.tsx src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx
```

- [ ] **Step 2: Commit with a clear message**

Run:

```bash
git commit -m "$(cat <<'EOF'
feat(bh-financials): drop A1 from scope filter (UI-hide only)

A1HOSPITALITY is partner ownership, not a Beithady operating scope.
Per the 2026-05-15 BH design audit, Beithady module scope filters
render Consolidated/Egypt/Dubai only. The CompanyScope type union
still includes 'a1' so direct ?scope=a1 URLs continue to resolve
for any old bookmarks — full type removal is a follow-up plan.
EOF
)"
```

- [ ] **Step 3: Push to main**

Run:

```bash
git push origin main
```

Expected: GitHub → Vercel auto-deploy kicks off. Per CLAUDE.md, no need to also run `vercel --prod`.

- [ ] **Step 4: Update SESSION_HANDOFF.md**

Prepend a new dated section to the top of `SESSION_HANDOFF.md` summarising what shipped (commit SHA, what changed, manual verification). Commit + push that too.

---

## Self-Review (run after writing the plan)

**Spec coverage:**
- §8 row #1 ("Remove A1 from BH scope filters") → covered by Tasks 1–5.
- §7.1 lists 5 type-guard files and `actions.ts` as source-of-truth. This plan deliberately leaves them alone (UI-hide-only path, see Architecture + Task 3 Step 1). Documented in "Unchanged on purpose" section.
- §9 Q1 (A1 type removal vs UI-hide) → resolved as UI-hide-only by default; full removal explicitly out of scope.

**Placeholder scan:** None — every step has a concrete file path, command, or full code block.

**Type consistency:** `CompanyScope` referenced in the test file, in `FinancialsFilterStrip.tsx`, and in the unchanged type-guard files. The plan does not modify the type — consistency holds.

---

## Future work (out of scope for this plan)

If kareem picks "full removal" (audit §9 Q1, the more aggressive path):
1. **Consolidate the six duplicate `isCompanyScope()` copies** in `financials/performance/page.tsx`, `balance-sheet/page.tsx`, `payables/page.tsx`, `ledgers/page.tsx`, `import/page.tsx`, and `actions.ts` into a single shared export in `src/lib/beithady/financials/types.ts` (or `src/lib/financials-pnl.ts`). Six identical functions today; one change tomorrow.
2. Remove `'a1'` from the `CompanyScope` union in `src/lib/financials-pnl.ts` and `src/lib/beithady/financials/types.ts`.
3. Remove `'a1'` from the now-single `isCompanyScope()` guard (and any other switches that still branch on it).
4. Remove the `a1` case from `scopeCompanyIds()` in `financials-pnl.ts`.
5. Decide what happens when `?scope=a1` is supplied: fall back to `consolidated` (silent), 404, or redirect.
6. Add a separate test asserting `isCompanyScope('a1') === false`.
7. Audit `'custom'` variant divergence: `src/lib/financials-pnl.ts` `CompanyScope` includes `'custom'`, but the local type in `FinancialsFilterStrip.tsx` and all six page-level guards omit it — silent fallback to `consolidated` when `?scope=custom` is hit. Decide whether `'custom'` is supported (extend guards + scope filter) or remove from the canonical type.

That's a separate plan because it touches 7+ files and changes a public URL contract.

## Addendum (2026-05-15)

After commit `2e3060d` shipped, the final code review caught a missed UI surface: the import wizard at `src/app/beithady/financials/import/page.tsx` rendered a separate `<select>` with `<option value="a1">A1</option>` that this plan's Task 1 Step 2 grep (`id: 'a1'`) didn't match (pattern was SCOPES-array shape only, not HTML attribute shape). Patched in follow-up commit `6f970a9` — UI-hide only, consistent with the rest of P0-1.

**Lesson for future audit plans:** the pre-condition grep should use a broader regex covering both `id: 'a1'`, `value="a1"`, and `>A1<` (text node) to catch every UI surface.
