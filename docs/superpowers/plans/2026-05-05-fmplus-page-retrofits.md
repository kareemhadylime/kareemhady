# FM+ Page Retrofits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the wrong amber-* utility classes used across FM+ module pages to the real FM+ brand tokens. The shared components (`<FmplusHero>`, `<FmplusLogo>`) were already retrofitted in Phase A, so most of this work is finding and replacing per-page amber utility classes that bypass the shared components.

**Architecture:** Mechanical token swap — all amber-50/amber-500/amber-700 etc. classes used in FM+ pages get replaced with `fmplus-yellow/`, `fmplus-gold/` equivalents from Phase A. No structural / functional changes.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 (utility classes only)

**Reference spec:** `docs/superpowers/specs/2026-05-05-fmplus-project-report-design.md` §11 Phase B

**Prerequisites:** Phase A (brand foundation) MUST be merged before starting. Tasks reference `fmplus-yellow`, `fmplus-gold` tokens that only exist after Phase A Task A3.

---

## Discovery — find every amber utility class in FM+ pages

Before starting per-page tasks, locate the scope.

```bash
# Run this to enumerate every amber-* utility class still in /fmplus pages
grep -rEn "(text|bg|border|from|to|via|ring|fill)-amber-[0-9]+" src/app/fmplus/ src/lib/fmplus/ --include="*.tsx" --include="*.ts" | grep -v test
```

Expected result is roughly:
- `src/app/fmplus/page.tsx` — landing page launcher cards
- `src/app/fmplus/financials/page.tsx` — tab strip
- `src/app/fmplus/financial/budget/_components/budget-tab-strip.tsx` — tab strip
- (Anything else that turns up gets folded into the relevant task below.)

The shared components were already done in Phase A and should NOT contain any remaining amber tokens.

---

## File Structure (this plan)

| Path | Action | Token swaps needed |
|---|---|---|
| `src/app/fmplus/page.tsx` | Modify | Launcher card hover/icon-box amber → fmplus-yellow/gold |
| `src/app/fmplus/financials/page.tsx` | Modify | Tab strip active-state amber → fmplus-yellow underline + fmplus-gold text |
| `src/app/fmplus/financial/budget/_components/budget-tab-strip.tsx` | Modify | Tab strip active-state amber → fmplus-yellow underline + fmplus-gold text |
| `public/brand/beithady/logo-fmplus.jpg` | No action (file remains) | Just remove any imports/references in code |

---

## Task B1: Retrofit `/fmplus` landing page tokens

**Files:**
- Modify: `src/app/fmplus/page.tsx`

The landing page already uses `<FmplusHero>` (which inherits from Phase A) so the hero is already correct. Remaining amber tokens are on the launcher cards (Financials, Project Budget, Operations).

- [ ] **Step 1: Find the amber tokens currently in this file**

Run: `grep -nE "amber-[0-9]+" src/app/fmplus/page.tsx`
Expected: ~8-10 matches around the launcher card hover states + icon box backgrounds.

- [ ] **Step 2: Replace with FM+ tokens**

For each match, apply this mapping:

| Current | Replace with | Where |
|---|---|---|
| `bg-amber-50 dark:bg-amber-950` | `bg-fmplus-yellow/15 dark:bg-fmplus-gold/20` | launcher card icon box backgrounds |
| `text-amber-700 dark:text-amber-300` | `text-fmplus-black dark:text-fmplus-yellow` | launcher card icons (allowed combo: black-on-yellow / yellow-on-dark) |
| `hover:border-amber-300 dark:hover:border-amber-700` | `hover:border-fmplus-yellow dark:hover:border-fmplus-gold` | launcher card hover state |

Use `Edit` tool with `replace_all=false` for each token mapping. If the same string appears multiple times AND should always be replaced uniformly, you can use `replace_all=true` BUT verify the expected count first via grep.

Example for the icon box:

```bash
# Verify count first
grep -c "bg-amber-50 dark:bg-amber-950" src/app/fmplus/page.tsx
# If it returns 2, match the count when reviewing the edit
```

- [ ] **Step 3: TypeScript check + visual smoke test**

Run: `npx tsc --noEmit 2>&1 | grep "src/app/fmplus/page" | head -5`
Expected: no errors.

Open `http://localhost:3000/fmplus` and visually confirm:
- Launcher cards (Financials, Project Budget, Operations) — icon boxes are tinted yellow, not amber.
- Hover state borders go yellow (light) / gold (dark), not amber.
- Hero (already retrofitted in Phase A) uses real brand.

- [ ] **Step 4: Run all tests**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: same green count as before (no test relies on amber classes).

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/page.tsx
git commit -m "style(fmplus-brand): retrofit /fmplus landing page launcher cards to FM+ tokens"
```

---

## Task B2: Retrofit `/fmplus/financials` tab strip + per-page accents

**Files:**
- Modify: `src/app/fmplus/financials/page.tsx`

Phase A already retrofitted the `<FmplusHero>` (used by financials), so the hero is correct. Financials has its own inline tab strip (Dashboard / P&L / BS / Projects) using amber-500 underline — that needs the swap.

- [ ] **Step 1: Find the amber tokens**

Run: `grep -nE "amber-[0-9]+" src/app/fmplus/financials/page.tsx`
Expected: ~3-5 matches in the tab strip nav.

- [ ] **Step 2: Apply the tab-strip token mapping**

| Current | Replace with | Where |
|---|---|---|
| `border-amber-500` | `border-fmplus-yellow` | active tab underline |
| `text-amber-700 dark:text-amber-300` | `text-fmplus-gold dark:text-fmplus-yellow` | active tab text color |

The inactive-tab styles (`border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100`) stay as-is since they don't reference amber.

- [ ] **Step 3: TypeScript check + visual smoke test**

Run: `npx tsc --noEmit 2>&1 | grep "src/app/fmplus/financials" | head -5`
Expected: no errors.

Open `http://localhost:3000/fmplus/financials`. Click each tab (Dashboard / P&L / BS / Projects). The active tab underline should be yellow `#FDCF00` (NOT amber), text color in gold `#EEB91D` (light) or yellow (dark).

- [ ] **Step 4: Run tests**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: same green count.

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/financials/page.tsx
git commit -m "style(fmplus-brand): retrofit /fmplus/financials tab strip to FM+ tokens"
```

---

## Task B3: Retrofit `BudgetTabStrip` (`/fmplus/financial/budget`)

**Files:**
- Modify: `src/app/fmplus/financial/budget/_components/budget-tab-strip.tsx`

The 8 budget tabs (Overview / Project Hub / Editor / Catalog / Import / Variance / Compare / Settings) use the same amber underline pattern as Financials. Same mapping.

- [ ] **Step 1: Find the amber tokens**

Run: `grep -nE "amber-[0-9]+" src/app/fmplus/financial/budget/_components/budget-tab-strip.tsx`
Expected: ~2 matches in the Tailwind `cn(...)` ternary that picks active vs. inactive style.

- [ ] **Step 2: Apply the same tab-strip mapping as Task B2**

| Current | Replace with |
|---|---|
| `border-amber-500` | `border-fmplus-yellow` |
| `text-amber-700 dark:text-amber-300` | `text-fmplus-gold dark:text-fmplus-yellow` |

- [ ] **Step 3: TypeScript check + visual smoke test**

Run: `npx tsc --noEmit 2>&1 | grep "budget-tab-strip" | head -5`
Expected: no errors.

Open `http://localhost:3000/fmplus/financial/budget`. Click through all 8 tabs. Each active tab should show yellow underline + gold/yellow text.

- [ ] **Step 4: Run tests**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: same green count.

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/financial/budget/_components/budget-tab-strip.tsx
git commit -m "style(fmplus-brand): retrofit BudgetTabStrip to FM+ tokens"
```

---

## Phase B Acceptance

After completing all 3 tasks:

- [ ] All 3 tasks committed.
- [ ] `grep -rEn "amber-[0-9]+" src/app/fmplus/ src/lib/fmplus/ --include="*.tsx" --include="*.ts" | grep -v test` returns ZERO matches. (Test files may still reference amber for legacy reasons — that's fine; the user-facing code is clean.)
- [ ] `npm test -- --run` shows full green test suite (no regressions).
- [ ] `npx tsc --noEmit` clean for FM+ paths.
- [ ] Visual inspection: `/fmplus`, `/fmplus/financials` (4 tabs), `/fmplus/financial/budget` (8 tabs) all show the FM+ yellow/gold brand consistently. No amber visible anywhere.
- [ ] Final push: `git fetch origin main && git rebase origin/main && git push origin HEAD:main`. Vercel auto-deploys. SESSION_HANDOFF.md updated noting Phase B complete.

This phase ships the FM+ module on real brand. Phase C (Project Report tab) can run in parallel with this phase since it depends only on Phase A.
