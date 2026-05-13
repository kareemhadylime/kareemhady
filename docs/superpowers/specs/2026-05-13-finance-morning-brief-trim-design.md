# Finance Morning Brief — Trim Design

**Date:** 2026-05-13
**Status:** Brainstorm complete, awaiting user spec review before implementation planning.
**Author:** Claude (opus 4.7) in collaboration with kareem.hady@gmail.com
**Scope:** [src/lib/beithady/morning-brief/finance-brief.ts](../../../src/lib/beithady/morning-brief/finance-brief.ts) only. GR and Ops briefs are out of scope.

## Problem

The Finance & Accounting morning brief carries too much detail. Operator feedback (2026-05-13 brief shared in WhatsApp):

1. **Per-reservation lists** under *Expected payouts — next 2 days* are noise — kareem only needs the dollar total to plan cash.
2. **Per-building breakdowns** under *Expected payouts — next 2 days* and *— through month end* are noise for the same reason.
3. **Headline totals are missing** — every revenue / payout section shows the per-bucket split but no grand total, so the reader has to mentally add 4–5 figures to get the answer they actually came for.
4. **The `[UAE — excluded]` tag** is visual clutter on every DXB info line. The fact that DXB is excluded from Egypt totals is already obvious from the section structure and doesn't need a chip on every appearance.
5. **The `[N new]` tag** on yesterday's revenue is redundant with the section title `Yesterday's revenue (17 bookings)`.
6. **The "Guesty UI may show only physically-checked-in" footnote** under *Currently staying* is internal plumbing detail — the operator doesn't care which method we use.
7. **The 8 detail rows under "Unpaid + arriving ≤7 days"** are also too much — kareem confirmed the totals line alone is the actionable signal.

## Goal

Strip the finance brief to **totals plus essential per-bucket detail**, removing per-reservation lists, redundant chips, and internal-plumbing footnotes. The brief should fit in one mobile screen instead of two.

DXB stays visible (kareem wants to see the activity), but as a quiet info line — not a tagged callout.

## Section-by-section changes

### 💰 Yesterday's revenue

**Before:**
```
💰 *Yesterday's revenue (17 bookings)*
• BH-26: $5,760 · BH-73: $826 · BH-435: $645 · BH-OK: $727 accrued [17 new]
   _manual: $1,110 · airbnb2: $6,799 · bookingCom: $48_
• BH-DXB: 4 · 13,589 AED [UAE — excluded]
```

**After:**
```
💰 *Yesterday's revenue (17 bookings) — $7,958*
• BH-26: $5,760 · BH-73: $826 · BH-435: $645 · BH-OK: $727 accrued
   _manual: $1,110 · airbnb2: $6,799 · bookingCom: $48_
• BH-DXB: 4 · 13,589 AED
```

Changes:
- Section title gains ` — $7,958` (Egypt USD total; if EGP/EUR present, append ` + 1,234 EGP` style)
- Remove `[N new]` tag on primary item
- Remove `[UAE — excluded]` tag on DXB line; keep the line itself

### 📊 Month-to-date

**Before:**
```
📊 *Month-to-date*
• … MTD across 124 bookings
   _Per Egypt bucket in native currency · UAE excluded._
• BH-DXB: 4 · 13,589 AED [UAE — excluded]
```

**After:**
```
📊 *Month-to-date — $55,559 across 124 bookings*
• BH-26: $28,559 · BH-73: $11,857 · BH-435: $9,113 · BH-OK: $3,354 · BH-Others: $2,676
• BH-DXB: 4 · 13,589 AED
```

Changes:
- Section title gains the grand total and the booking count (was on the primary line)
- Drop the *"Per Egypt bucket in native currency · UAE excluded."* secondary footnote
- Remove `[UAE — excluded]` tag on DXB

### 🏨 Currently staying

**Before:** the secondary footnote *"Guesty UI may show only physically-checked-in guests; this brief uses calendar-overlap."* and `[UAE — excluded]` tag.

**After:** drop the footnote, drop the `[UAE — excluded]` chip on the DXB line. Keep the headline ("46 — 35 in-house · 13 arriving today"), the per-building dollar split, the per-building count secondary line, the "13 arriving today" sub-item, and the DXB info line.

### 🛠 Manual Block Unpaid

No change.

### ⏱ Expected payouts — next 2 days

**Before:** Section title with count, then primary line with per-bucket totals + secondary count line, then up to 8 per-reservation rows, then DXB tagged line.

**After:**
```
⏱ *Expected payouts — next 2 days (22) — $9,962 accruing*
```

Changes:
- Collapse the entire section to a single header line: count + total amount
- Drop the primary item (per-bucket totals)
- Drop the secondary count line (`BH-26: 10 · BH-73: 7 …`)
- Drop the 8 per-reservation rows
- Drop the DXB tagged line (DXB activity in this window stays in the underlying summary numbers but is not shown — DXB still gets its own appearance in *Yesterday* / *MTD* / *Currently staying*, which is enough visibility)
- Section emoji and title stay; the dollar total moves into the title

If `payouts2Egypt === 0`, fall back to the existing `empty_message`.

### 📅 Expected payouts — through month end

Same treatment as next-2-days:
```
📅 *Expected payouts — through month end (44) — $21,615 forecast through 2026-05-31*
```

- Collapse to a single header line: count + total + month-end date
- Drop primary item, secondary count line, DXB tagged line
- `empty_message` unchanged

### 🔴 Unpaid + arriving ≤7 days

**Before:** Header + primary item + per-bucket count secondary + 8 per-reservation rows + optional DXB line.

**After:**
```
🔴 *Unpaid + arriving ≤7 days (11)*
• 11 reservations [Action]
   _BH-26: 7 · BH-73: 2 · BH-435: 2_
```

Changes:
- Drop the 8 per-reservation rows
- Keep the primary item (count + `[Action]` red tag) and secondary per-bucket count line — this is the actionable summary
- Drop the DXB unpaid line (if any)
- `empty_message` unchanged: *"No unpaid reservations in the next 7 days. ✓"*

### 🎯 Direct-booking revenue yesterday

**Before:**
```
🎯 *Direct-booking revenue yesterday (3)*
• BH-26: $460 · BH-73: $111 · BH-435: $539 from 3 direct bookings [No commission]
   _BH73-2BR-SB-5-107 · BH-26-102 · BH-435-203_
```

**After:**
```
🎯 *Direct-booking revenue yesterday (3) — $1,110*
• BH-26: $460 · BH-73: $111 · BH-435: $539 [No commission]
   _BH73-2BR-SB-5-107 · BH-26-102 · BH-435-203_
```

Changes:
- Section title gains the grand total
- Drop the *"from N direct bookings"* phrase from primary line (count already in title)
- Drop the DXB tagged line if any
- Keep the `[No commission]` green tag — it conveys a real economic point, not just metadata
- Keep listing-name secondary line — that's the actionable detail (which units are sourcing direct revenue)

## Implementation approach

Single-file change in `src/lib/beithady/morning-brief/finance-brief.ts`. The `Brief` / `BriefSection` / `BriefItem` types in `types.ts` are sufficient — nothing in the renderer needs to change.

Helper to compute the Egypt grand-total dollar string from a `BucketCurrencyTotals` object (USD + AED concatenated if AED non-zero). Most of the math is already done by `sumEgyptByCurrency` in `country.ts`; the helper just formats it for use in section titles.

The `summary: Record<string, number>` block at the bottom of `buildFinanceBrief` is consumed by trend tracking and downstream callers — leave every existing key in place even though some are no longer rendered.

## Out of scope

- GR brief (`gr-brief.ts`) and Ops brief (`ops-brief.ts`) — different audiences, different signal density. No changes proposed.
- HTML email renderer in `renderers.ts` — the same `Brief` structure feeds both, so HTML output picks up the trim automatically. No bespoke email layout work.
- Arabic-language brief — currently the finance brief always renders in English (`language: 'en'` hardcoded in `buildFinanceBrief`). No work needed here.
- Tests — there are no existing tests for `finance-brief.ts`; the trim is presentation-only and changes no semantics, so we won't introduce tests for this change.

## Risks

- **Quiet-day rendering.** When Egypt grand total is zero (no bookings yesterday), the helper must omit the ` — $X` suffix from the section title rather than appending ` — $0`, which would read as a glaring zero. The `empty_message` already covers the empty case; the title should just stay clean.
- **AED-mixed totals on Yesterday / MTD.** Egypt revenue is almost always pure USD, but `sumEgyptByCurrency` returns a `Map<string, number>` that can contain AED if a row's currency is non-default. The helper must format multi-currency totals as `$X + Y AED` rather than dropping the AED side silently.
- **Section count parity.** Downstream `summary` keys are unchanged, so trend-tracking dashboards that consume the summary won't break.

## Open question

None — kareem confirmed the two outstanding questions in chat:
- Q1 (BH-DXB MTD = 4 vs in-house = 2): correct as designed, no metric change.
- Q2 (Unpaid section detail rows): trim to totals line only.
