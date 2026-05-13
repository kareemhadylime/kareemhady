# Finance Morning Brief — Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim the Finance & Accounting morning brief so it fits on one mobile screen — section titles gain grand-total dollar figures, per-reservation lists and `[UAE — excluded]` chips are removed, and the two *Expected payouts* sections collapse to a single header line each.

**Architecture:** Two-file change. (1) `src/lib/beithady/morning-brief/country.ts` — add `formatEgyptGrandTotal` helper, simplify `formatDxbInfoLine` (drop the trailing `(excluded from totals)`). (2) `src/lib/beithady/morning-brief/finance-brief.ts` — section-by-section trim. No new tests (no existing test infrastructure; change is presentation-only and changes no semantics).

**Tech Stack:** TypeScript strict, Next.js 16 server-only module. Verification is `npx tsc --noEmit` plus a post-deploy visual check via `/beithady/operations/morning-brief?role=finance` preview panel.

**Spec:** [docs/superpowers/specs/2026-05-13-finance-morning-brief-trim-design.md](../specs/2026-05-13-finance-morning-brief-trim-design.md)

**Commit strategy:** ONE commit at the end. The brief renders atomically — committing in the middle would leave inconsistent intermediate states (some sections trimmed, others not). Each task below performs one edit; the final task verifies, commits, pushes to `main`, and lets the GitHub→Vercel integration auto-deploy.

---

## Task 1: Add `formatEgyptGrandTotal` helper + drop `(excluded from totals)` suffix from `formatDxbInfoLine`

**Files:**
- Modify: `src/lib/beithady/morning-brief/country.ts:249-266` (`formatDxbInfoLine`)
- Modify: `src/lib/beithady/morning-brief/country.ts` (append new export `formatEgyptGrandTotal`)

**Context:** `formatEgyptGrandTotal` will be used in 4 section titles (Yesterday revenue, MTD, next-2-days payouts, month-end payouts, direct bookings = 5 actually). It sums Egypt across buckets via the existing `sumEgyptByCurrency`, formats each currency, joins with `' + '`. Returns empty string when the total is zero — callers check truthiness to decide whether to append ` — $X` to the section title.

`formatDxbInfoLine` currently bakes ` (excluded from totals)` into its return string. Single caller (`finance-brief.ts`) wants the note gone — drop it from the helper directly, no `includeNote` option (YAGNI).

- [ ] **Step 1: Modify `formatDxbInfoLine` — drop the `(excluded from totals)` suffix**

Replace lines 249-266 of `src/lib/beithady/morning-brief/country.ts`:

```typescript
// Render the UAE-only "separate info line" — quiet info, no callout chip.
// Returns null if no UAE rows exist (so callers don't render an empty line).
export function formatDxbInfoLine(
  totals: BucketCurrencyTotals,
  count: number,
  language: 'en' | 'ar' = 'en',
): string | null {
  if (count === 0) return null;
  const m = totals['BH-DXB'];
  const entries = Array.from(m.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const moneyLine = entries.length > 0
    ? entries.map(([ccy, v]) => formatMoneyByCurrency(v, ccy)).join(' + ')
    : null;
  const label = language === 'ar' ? BUCKET_LABEL['BH-DXB'].ar : BUCKET_LABEL['BH-DXB'].en;
  if (moneyLine) {
    return `${label}: ${count} · ${moneyLine}`;
  }
  return `${label}: ${count} reservation${count === 1 ? '' : 's'}`;
}
```

Notes on the diff:
- Header comment shortened (no more "even though it's excluded from totals" — that framing is being retired).
- `note` local variable deleted.
- Both return branches drop `(${note})`.

- [ ] **Step 2: Append new export `formatEgyptGrandTotal` to `country.ts`**

Add at the end of the file (after the existing `bucketInventoryFromCatalog` export):

```typescript
// Sum Egypt totals across all buckets and format as a single string for
// section titles ("$7,958" or "$7,958 + 1,234 EGP"). Excludes BH-DXB.
// Returns empty string when nothing to sum — callers use truthiness to
// decide whether to append ` — $X` to a section title.
export function formatEgyptGrandTotal(
  totals: BucketCurrencyTotals,
): string {
  const sums = sumEgyptByCurrency(totals);
  const entries = Array.from(sums.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '';
  return entries.map(([ccy, v]) => formatMoneyByCurrency(v, ccy)).join(' + ');
}
```

- [ ] **Step 3: Type-check the helper module**

Run: `npx tsc --noEmit`
Expected: no new errors. (The branch already has a clean baseline; if you see errors not related to these files, that's pre-existing — flag but continue.)

---

## Task 2: Trim *Yesterday's revenue* section

**Files:**
- Modify: `src/lib/beithady/morning-brief/finance-brief.ts:238-256` (the Yesterday's revenue section in the `sections` array)

**Context:** Section title gains ` — $7,958` suffix from `formatEgyptGrandTotal(yestTotals)`. The `[N new]` green tag is removed. DXB info line stays but loses its `[UAE — excluded]` chip.

- [ ] **Step 1: Add `formatEgyptGrandTotal` to the country.ts import**

Replace lines 4-17 of `src/lib/beithady/morning-brief/finance-brief.ts` — add `formatEgyptGrandTotal` to the existing import:

```typescript
import {
  bucketForListing,
  isExcludedFromRevenue,
  sumByBucketCurrency,
  countByBucket,
  formatEgyptTotalsLine,
  formatDxbInfoLine,
  formatMoneyByCurrency,
  formatMoneyBucket,
  formatEgyptGrandTotal,
  sumEgyptByCurrency,
  BUCKET_LABEL,
  EGYPT_BUCKETS,
  type BriefBucket,
} from './country';
```

- [ ] **Step 2: Replace the Yesterday's revenue section**

Replace the section object at `src/lib/beithady/morning-brief/finance-brief.ts:239-256` (the one with `title: \`Yesterday's revenue (${yestEgypt} bookings)\``):

```typescript
    {
      title: (() => {
        const total = formatEgyptGrandTotal(yestTotals);
        return total
          ? `Yesterday's revenue (${yestEgypt} bookings) — ${total}`
          : `Yesterday's revenue (${yestEgypt} bookings)`;
      })(),
      emoji: '💰',
      items: [
        {
          primary: `${formatEgyptTotalsLine(yestTotals, 'en')} accrued`,
          secondary: yestChannelLine || (yestEgypt === 0 ? 'Quiet day' : 'Per-bucket above'),
          ...(yestEgypt === 0 ? { tag: { label: 'Quiet day', tone: 'slate' as const } } : {}),
        },
        ...(yestCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(yestTotals, yestCount['BH-DXB']) || '',
          secondary: undefined,
        }] : []),
      ],
    },
```

Notes on the diff:
- Title becomes an IIFE that appends ` — ${total}` when there's revenue, plain otherwise (handles the quiet-day risk from the spec).
- `[N new]` green tag is gone for non-quiet days; `[Quiet day]` slate chip is kept on truly empty days as a useful signal.
- DXB item drops its `tag: { label: 'UAE — excluded', tone: 'slate' as const }`.

---

## Task 3: Trim *Month-to-date* section

**Files:**
- Modify: `src/lib/beithady/morning-brief/finance-brief.ts:257-271` (the Month-to-date section)

**Context:** Move the booking count and grand total into the section title. The primary line becomes the per-bucket split. Drop the *"Per Egypt bucket in native currency · UAE excluded."* secondary footnote. DXB line loses its chip.

- [ ] **Step 1: Replace the Month-to-date section**

Replace the section object at `src/lib/beithady/morning-brief/finance-brief.ts:258-271`:

```typescript
    {
      title: (() => {
        const total = formatEgyptGrandTotal(mtdTotals);
        return total
          ? `Month-to-date — ${total} across ${mtdEgypt} bookings`
          : `Month-to-date — ${mtdEgypt} bookings`;
      })(),
      emoji: '📊',
      items: [
        {
          primary: formatEgyptTotalsLine(mtdTotals, 'en'),
        },
        ...(mtdCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(mtdTotals, mtdCount['BH-DXB']) || '',
          secondary: undefined,
        }] : []),
      ],
    },
```

Notes on the diff:
- Title carries both the total and the bookings count (was duplicated in title + primary).
- Primary item is just `formatEgyptTotalsLine(...)` — no trailing "MTD across N bookings" text (moved to title), no `[UAE — excluded]` tag.
- Secondary footnote *"Per Egypt bucket in native currency · UAE excluded."* is deleted entirely.
- DXB line keeps its info text but drops its tag.

---

## Task 4: Trim *Currently staying* section

**Files:**
- Modify: `src/lib/beithady/morning-brief/finance-brief.ts:272-293` (the Currently staying section)

**Context:** Drop the *"Guesty UI may show only physically-checked-in guests; this brief uses calendar-overlap."* secondary footnote on the "arriving today" sub-item. Drop the `[UAE — excluded]` chip from the DXB line. Keep everything else (the per-building dollar split, per-building count, in-flight tag, pending-arrival tag).

- [ ] **Step 1: Replace the Currently staying section**

Replace the section object at `src/lib/beithady/morning-brief/finance-brief.ts:273-293`:

```typescript
    {
      title: `Currently staying (${stayingEgypt})${stayingCanonical.already_arrived ? ` — ${stayingCanonical.already_arrived.length} in-house · ${stayingCanonical.arriving_today?.length || 0} arriving today` : ''}`,
      emoji: '🏨',
      items: [
        {
          primary: `${formatEgyptTotalsLine(stayingTotals, 'en')} live host-payout in flight`,
          secondary: EGYPT_BUCKETS.filter(b => stayingCount[b] > 0).map(b => `${BUCKET_LABEL[b].en}: ${stayingCount[b]}`).join(' · ') || 'No active stays',
          tag: { label: 'In-flight', tone: 'cyan' },
        },
        ...((stayingCanonical.arriving_today?.length || 0) > 0 ? [{
          primary: `${stayingCanonical.arriving_today!.length} arriving today (counted in stay total)`,
          tag: { label: 'Pending arrival', tone: 'amber' as const },
        }] : []),
        ...(stayingCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(stayingTotals, stayingCount['BH-DXB']) || '',
          secondary: undefined,
        }] : []),
      ],
      empty_message: 'No active stays today.',
    },
```

Notes on the diff:
- Title, in-flight primary/secondary, and `[In-flight]` cyan tag are unchanged.
- "Arriving today" sub-item: `secondary: 'Guesty UI may show only physically-checked-in guests; this brief uses calendar-overlap.'` is DELETED. `[Pending arrival]` amber tag is kept (it's a useful operational signal).
- DXB line drops its `tag: { label: 'UAE — excluded', tone: 'slate' as const }`.

---

## Task 5: Collapse *Expected payouts — next 2 days* section

**Files:**
- Modify: `src/lib/beithady/morning-brief/finance-brief.ts:308-335` (the Expected payouts — next 2 days section)

**Context:** Spec says collapse to a single header line: count + total amount. Drop the primary per-bucket totals item, drop the secondary per-bucket count line, drop the 8 per-reservation rows, drop the DXB tagged line. Keep `empty_message` for the zero case.

**Renderer constraint** (`src/lib/beithady/morning-brief/renderers.ts:42-48`): if `items.length === 0` and `empty_message` is falsy, the section is skipped entirely — title and all. So to render only a title-style summary, we must put the headline in ONE summary item rather than try to suppress the items array. The resulting markdown is:

```
⏱ *Expected payouts — next 2 days (22)*
• $9,962 accruing across 22 reservations [Forecast]
```

That's two lines (title + one bullet) instead of the one-liner from the spec draft, but it's the cleanest fit for the existing renderer and matches what the spec actually communicated (one headline per section, no detail rows).

- [ ] **Step 1: Replace the next-2-days section**

Replace the section object at `src/lib/beithady/morning-brief/finance-brief.ts:308-335`:

```typescript
    {
      title: `Expected payouts — next 2 days (${payouts2Egypt})`,
      emoji: '⏱',
      items: payouts2Egypt > 0 ? [
        {
          primary: (() => {
            const total = formatEgyptGrandTotal(payouts2Totals);
            return total
              ? `${total} accruing across ${payouts2Egypt} reservation${payouts2Egypt === 1 ? '' : 's'}`
              : `${payouts2Egypt} reservation${payouts2Egypt === 1 ? '' : 's'} accruing`;
          })(),
          tag: { label: 'Forecast', tone: 'cyan' },
        },
      ] : [],
      empty_message: 'No confirmed check-ins in the next 2 days.',
    },
```

Notes on the diff:
- One summary item replaces the previous primary + secondary + 8 row items + DXB line.
- `[Forecast]` cyan tag is kept — it's a useful signal that this number isn't realized yet.
- DXB block is gone entirely (no `payouts2Count['BH-DXB']` check, no `dxbLine` call). DXB info still surfaces in Yesterday / MTD / Currently-staying sections; that's enough visibility.
- `empty_message` preserved for the zero case.

---

## Task 6: Collapse *Expected payouts — through month end* section

**Files:**
- Modify: `src/lib/beithady/morning-brief/finance-brief.ts:336-352` (the Expected payouts — through month end section)

**Context:** Same treatment as Task 5 — collapse to a single summary item with count + total + month-end date. Drop primary multi-bucket item, drop secondary count line, drop DXB line.

- [ ] **Step 1: Replace the month-end section**

Replace the section object at `src/lib/beithady/morning-brief/finance-brief.ts:336-352`:

```typescript
    {
      title: `Expected payouts — through month end (${payoutsMEgypt})`,
      emoji: '📅',
      items: payoutsMEgypt > 0 ? [
        {
          primary: (() => {
            const total = formatEgyptGrandTotal(payoutsMTotals);
            return total
              ? `${total} forecast through ${monthEndIso}`
              : `${payoutsMEgypt} reservation${payoutsMEgypt === 1 ? '' : 's'} forecast through ${monthEndIso}`;
          })(),
          tag: { label: 'Forecast', tone: 'cyan' },
        },
      ] : [],
      empty_message: 'No confirmed bookings checking in this month.',
    },
```

Notes on the diff:
- Single summary item with total + month-end date.
- `[Forecast]` cyan tag kept.
- DXB block gone.

---

## Task 7: Trim *Unpaid + arriving ≤7 days* section

**Files:**
- Modify: `src/lib/beithady/morning-brief/finance-brief.ts:353-385` (the Unpaid section)
- Also: lines 229-232 (the `unpaidDxbLine` variable — becomes dead code; remove it)

**Context:** Per the spec + chat confirmation (Q2 = "Trim"), keep the count + `[Action]` red tag + per-bucket count secondary line; drop the 8 per-reservation detail rows and the DXB unpaid line.

- [ ] **Step 1: Delete the now-dead `unpaidDxbLine` variable**

Delete lines 229-232 of `src/lib/beithady/morning-brief/finance-brief.ts`:

```typescript
  const unpaidDxbCount = unpaidByBucket['BH-DXB'].count;
  const unpaidDxbLine = unpaidDxbCount > 0
    ? `BH-DXB: ${unpaidDxbCount} reservation${unpaidDxbCount === 1 ? '' : 's'} (excluded from totals)`
    : null;
```

(Both `unpaidDxbCount` and `unpaidDxbLine` are only referenced in the Unpaid section we're about to gut. Remove them.)

- [ ] **Step 2: Replace the Unpaid section**

Replace the section object at `src/lib/beithady/morning-brief/finance-brief.ts:353-385` (now at a slightly different line number after Step 1's deletion — search for `Unpaid + arriving ≤7 days`):

```typescript
    {
      title: `Unpaid + arriving ≤7 days (${unpaidEgyptCount})`,
      emoji: '🔴',
      items: unpaidEgyptCount > 0 ? [
        {
          primary: `${unpaidEgyptCount} reservation${unpaidEgyptCount === 1 ? '' : 's'}`,
          secondary: unpaidEgyptLine || 'Confirm payment with each guest before check-in',
          tag: { label: 'Action', tone: 'red' },
        },
      ] : [],
      empty_message: 'No unpaid reservations in the next 7 days. ✓',
    },
```

Notes on the diff:
- Drop the 8 per-reservation rows (the entire `...unpaid.filter(...).slice(0, 8).map(...)` block).
- Drop the DXB tagged line (`...(unpaidDxbLine ? [{ ... }] : [])`) and the bare fallback when Egypt count = 0 but DXB has rows.
- Keep the primary count + secondary per-bucket breakdown + `[Action]` red tag — that's the actionable signal kareem confirmed he wants.
- `empty_message` unchanged.

---

## Task 8: Trim *Direct-booking revenue yesterday* section

**Files:**
- Modify: `src/lib/beithady/morning-brief/finance-brief.ts:386-405` (the Direct-booking revenue section)

**Context:** Add grand total to section title. Drop the *"from N direct bookings"* phrase from the primary (count already in title). Drop the DXB tagged line. Keep `[No commission]` green tag and the listing-name secondary.

- [ ] **Step 1: Replace the Direct-booking section**

Replace the section object at `src/lib/beithady/morning-brief/finance-brief.ts:386-405`:

```typescript
    {
      title: (() => {
        const total = formatEgyptGrandTotal(directTotals);
        return total
          ? `Direct-booking revenue yesterday (${directEgypt}) — ${total}`
          : `Direct-booking revenue yesterday (${directEgypt})`;
      })(),
      emoji: '🎯',
      items: directEgypt > 0
        ? [{
            primary: formatEgyptTotalsLine(directTotals, 'en'),
            secondary: direct
              .filter(d => !isExcludedFromRevenue(bucketForListing({ building_code: d.building_code, listing_id: d.listing_id, nickname: d.listing_nickname })))
              .map(d => d.listing_nickname)
              .filter(Boolean)
              .slice(0, 5)
              .join(' · '),
            tag: { label: 'No commission', tone: 'green' },
          }]
        : [],
      empty_message: 'No direct bookings yesterday. Push the Direct funnel.',
    },
```

Notes on the diff:
- Title gains ` — ${total}` when total is non-empty.
- Primary line is now just `formatEgyptTotalsLine(...)` — no trailing `from N direct booking${...}` text (count's already in title).
- DXB block (`...(directCount['BH-DXB'] > 0 ? [...] : [])`) is dropped along with the bare `directCount['BH-DXB'] > 0` fallback when Egypt count = 0.
- `[No commission]` green tag stays — it's a real economic point, not metadata.
- Listing-name secondary line stays.

---

## Task 9: Verify, commit, push, deploy

**Files:** None (verification + deployment only).

**Context:** Run the type checker; commit all changes from Tasks 1-8 as one cohesive commit; push to `main` via the worktree-aware flow; let the GitHub→Vercel integration auto-deploy. Per kareem's standing authorization in CLAUDE.md, no approval prompts needed for any of these steps.

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors specific to `src/lib/beithady/morning-brief/finance-brief.ts` or `src/lib/beithady/morning-brief/country.ts`. (Pre-existing baseline errors are fine; the change is type-clean if it introduces no NEW errors.)

If errors appear in the modified files, STOP and fix them inline before continuing. Most likely cause: a section object missing a required `BriefItem` field, or `tag.tone` typed too loosely (must be `'red' | 'amber' | 'green' | 'violet' | 'cyan' | 'slate'` — append `as const` if the inferred type is `string`).

- [ ] **Step 2: Stage the changes**

Run: `git add src/lib/beithady/morning-brief/country.ts src/lib/beithady/morning-brief/finance-brief.ts`

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(finance-brief): trim sections and surface grand totals in titles

- Add `formatEgyptGrandTotal` helper in country.ts; sum-and-format Egypt
  totals across buckets, returning empty string when zero (callers gate
  the ` — $X` suffix on truthiness).
- Drop `(excluded from totals)` suffix from `formatDxbInfoLine` — DXB
  info lines are now quiet, no chip and no parenthetical note.

Section-by-section trim in finance-brief.ts:
- Yesterday's revenue: total in title, `[N new]` chip removed, DXB chip
  removed.
- Month-to-date: total + booking count in title, footnote dropped, DXB
  chip removed.
- Currently staying: drop the "Guesty UI may show only physically-
  checked-in" footnote and DXB chip; keep dollar split, count secondary,
  `[In-flight]` and `[Pending arrival]` tags.
- Expected payouts — next 2 days: collapse to a single summary item
  (total + count); drop per-bucket and per-reservation detail rows.
- Expected payouts — through month end: same treatment.
- Unpaid + arriving ≤7 days: drop 8 per-reservation rows and DXB
  unpaid line; keep count + per-bucket secondary + `[Action]` red tag.
- Direct-booking revenue: total in title; primary is per-bucket split;
  drop DXB block.

Presentation-only — no semantic changes; `summary` keys untouched so
downstream trend tracking continues working.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Worktree-aware push to `main`**

Per `CLAUDE.md`'s Deploy section: the worktree branch is usually behind `origin/main`. Fetch + rebase + push, with a retry path if a concurrent commit landed between fetch and push.

```bash
git fetch origin main && git rebase origin/main && git push origin HEAD:main
```

If the push is rejected (concurrent commit landed), re-run the same command. On clean push, GitHub→Vercel will start the production deploy automatically.

- [ ] **Step 5: Also push the worktree branch (tracks remote of same name)**

```bash
git push origin claude/zen-euler-d3bd5e
```

This keeps the worktree branch in sync with the local rebased history. Per CLAUDE.md, this is part of the standing forward-deploy cycle and needs no approval.

- [ ] **Step 6: Confirm verification path for the user**

Print a short note for the user:

> Trim deployed. To verify before tomorrow's 09:00 Cairo send:
> 1. Open `https://limeinc.vercel.app/beithady/operations/morning-brief?role=finance&date=2026-05-13`
> 2. Click *Preview* in the test panel — the rendered HTML should show the new shape (titles with $ totals, no `[UAE — excluded]` chips, single-line *Expected payouts* sections, no per-reservation detail under *Unpaid*).
> 3. If anything looks off, comment back — code is one commit so revert is `git revert <sha>`.

---

## Self-review notes (for plan author)

**Spec coverage check:**
- ✅ Yesterday's revenue → Task 2
- ✅ Month-to-date → Task 3
- ✅ Currently staying → Task 4
- ✅ Expected payouts — next 2 days → Task 5
- ✅ Expected payouts — through month end → Task 6
- ✅ Unpaid + arriving ≤7 days → Task 7 (plus dead-variable cleanup)
- ✅ Direct-booking revenue → Task 8
- ✅ Helper for Egypt grand total → Task 1
- ✅ `formatDxbInfoLine` `(excluded from totals)` removal → Task 1
- ✅ Quiet-day rendering risk → handled by IIFE returning bare title when total is empty
- ✅ AED-mixed totals risk → `formatEgyptGrandTotal` joins all positive currencies with `' + '`
- ✅ `summary` keys parity → Task 9 commit message explicitly notes them untouched; no task modifies the `summary` block

**Placeholder scan:** None — every step has full code, exact file paths with line ranges, and the verification command. The "Notes on the diff" subsections are intentional — they're orientation for the implementer, not placeholders.

**Type consistency:** `formatEgyptGrandTotal` signature matches its usage in 5 IIFEs. `formatDxbInfoLine` signature unchanged. `BriefItem.tag.tone` literals are kept `as const` where TypeScript widening would otherwise drop them.
