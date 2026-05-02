# Inventory = Procurement / Housekeeping = Consumption — Design Spec

**Date:** 2026-05-02 (revised same day after main-state audit)
**Status:** Approved (user signoff: "Approvd", 2026-05-02 + autonomous-revise authorization "Automatically and more to ship and commit to main automatically without reverting to me")
**Author:** Claude (brainstormed with Kareem)
**Branch:** target = `main` (worktree: `claude/eager-johnson-cce95a`)

## ⚠ Revision note (read before §1)

The first version of this spec assumed main was greenfield (no volumetric work shipped). That was wrong. **Main already ships migration `0066_volumetric_consumption.sql`, the `volumetric.ts` math library, item/rule form fields for `pack_volume_*` and `consumes_volume_*`, the mismatch banner, and the GRN restate workflow.** The user's screenshots showing "Pack Volume (Value) / (UoM)" fields are PROD STATE — not an experimental branch.

This revised spec narrows the scope to the **actual delta**: a UI/UX restructure that reframes what's already in prod as procurement-first, plus three genuinely-new pieces (hybrid issue lines, rule UoM auto-default, Procurement Need column). The data model from migration 0066 stays as-is — column names, math library, and shadow-column pattern all remain. We change UI labels + add a small migration for the new pieces.

## 1. Problem statement

The system shipped to prod on 2026-05-01 already correctly computes consumption math (item `pack_volume_value/uom` + rule `consumes_volume_value/uom` → fractional packs via `volumetric.ts`). The data model is right.

What's wrong is the **framing**. The Item edit modal labels the volumetric metadata as "Pack Volume (Value)" and "Pack Volume (UoM)" with a "— None (legacy count math) —" placeholder. To a procurement operator, this reads as consumption math leaking into the catalog form. Operators report (via the user) that the form mixes "what you bought" with "how it gets used".

The auto-issue cron in `src/lib/beithady/inventory/issue.ts` already converts consumption to packs at write time, but it only writes `qty` (in packs) to the issue line — it does NOT preserve the consumption-grain audit trail. So a housekeeper looking at a posted issue can see "0.025 packs" but not "100 mL", which is the unit they actually understand.

The matrix UI shows `TOTAL / CHECK-IN` and `PER GUEST` (consumption-cost views) but offers no procurement-actionable column — operators can't open the matrix to answer "how many packs of cleaner do I need to order this month".

User mandate: **Inventory module is presented as procurement-first. Housekeeping Matrix exposes both consumption math and procurement-need rollup.**

## 2. Goals

1. Item form is reorganized into 4 visual blocks that frame every field as procurement-facing.
2. Volumetric metadata stays on the item (single source of truth) but is relabeled "Pack contents" and grouped under the Procurement block alongside Brand/UoM/Cost.
3. Rule form's UoM dropdown auto-defaults from the selected item's `pack_volume_uom` (Q3) — operator can override but rarely needs to.
4. Auto-issue cron + issue-line schema record consumption grain (`consumed_qty`/`consumed_uom`) AND pack grain (`qty`) — Q5C hybrid.
5. Matrix per-config detail page renders rows procurement-first (pack info as primary, consumption math as secondary detail), and adds a **Procurement Need** column.
6. Matrix landing page adds a **Monthly Need** column summing whole-pack procurement needs across all line items per config.

## 3. Non-goals

- Renaming existing `pack_volume_*` columns to `pack_contents_*`. The DB columns keep their migration-0066 names; only UI labels change. Cosmetic rename would touch every consumer for zero functional gain.
- Adding a separate `pack_size` integer column. Multi-packs (e.g., "3-pack of sponges") use the existing `pack_volume_value=3, pack_volume_uom='pcs'` model since `'pcs'` is a valid UoM in `beithady_inventory_uoms`.
- Changing the volumetric math itself (`volumetric.ts` is correct).
- Changing the post-issue RPC (`beithady_inv_post_issue`) — already deducts `qty` from `qty_on_hand`, no change needed.
- Multi-pack profiles ("12 × 250 mL bottles" as a single SKU).
- Stock tracked at finest grain (Q5B option).
- Weighted-average-cost recompute changes.
- Owner-billable register UI (still V2).
- Asset (V2) flag behavior changes.

## 4. Design decisions (Q&A trail)

| # | Question | Choice | Why |
|---|---|---|---|
| Q1 | What stays on the item as procurement metadata? | **A** — pack contents (`pack_volume_value/uom`) only; the item form frames this as a vendor spec | Procurement clarity; "as purchased" mandate |
| Q2 | Where does "1 bottle = 4 L" live? | **A** — on the item, labeled as "Pack contents" in UI | Already shipped this way in DB; only the UI label needs procurement framing |
| Q3 | How does a rule express its consumption qty? | **A** — rule's UoM dropdown auto-defaults from item's `pack_volume_uom` | Least friction; item is source of truth; UoM compatibility validated at save |
| Q4 | Matrix line display style | **A + bonus** — procurement-first primary line, consumption math secondary, plus Monthly procurement need column | Matrix should be actionable for buying, not just costing |
| Q5 | Stock grain | **C** — hybrid: stock in packs, issue records both consumed-grain and pack-grain | Procurement-aligned stock; full audit trail of what was actually consumed |
| Approach | How to ship | **1** — narrow restructure on top of existing main state | Volumetric DB + math library already correct; only UI + Q5C hybrid + Q3 auto-default + Procurement Need are new |

## 5. Data model — what's already there vs new

### 5.1 Already shipped (no change)

- `beithady_inventory_items.pack_volume_value` (numeric, `> 0`)
- `beithady_inventory_items.pack_volume_uom` (text, FK to `beithady_inventory_uoms`)
- `beithady_inventory_items.amazon_eg_pack_volume_value/uom` (shadow columns for mismatch banner)
- `beithady_inventory_items.amazon_eg_pack_size` (int, kept as Amazon-derived multi-pack count; mismatch banner reads it)
- `beithady_inventory_consumption_rules.consumes_volume_value/uom`
- `beithady_inventory_grn_lines.received_pack_volume_value/uom` (used by restate workflow)
- `volumetric.ts` library: `convertVolume`, `parseVolumeFromText`, `unitsConsumedPerTrigger`, `packVolumeMismatch`, `uomKind`, `areUomsCompatible`

### 5.2 New schema (migration `0077_inventory_procurement_restructure.sql`)

| Table | Column | Type | Purpose |
|---|---|---|---|
| `beithady_inventory_issue_lines` | `consumed_qty` | `numeric NULL` | Q5C audit grain (100 mL, 1 piece) |
| `beithady_inventory_issue_lines` | `consumed_uom` | `text NULL` (FK `beithady_inventory_uoms`) | UoM of consumption |
| `beithady_inventory_unit_configurations` | `est_monthly_bookings` | `numeric NULL CHECK (>= 0)` | Manual override for Procurement Need calc |

`consumed_qty/consumed_uom` are nullable for back-compat with manual issues that may not have a rule trail. Auto-issues from rules always set them.

`est_monthly_bookings` defaults null; falls back to "90-day Guesty avg / 3" then to constant `4`.

## 6. Item form layout (procurement-first)

Existing modal at `src/app/beithady/inventory/items/_components/item-form-button.tsx` is reorganized in place — no rename, no new component. Field order changes; some labels change; helper text updates.

```
┌─ IDENTIFICATION ─────────────────────────────────────────┐
│ SKU · Brand · Name (EN) · Name (AR) · Barcode · Photo   │
└──────────────────────────────────────────────────────────┘
┌─ PROCUREMENT (how it's bought) ──────────────────────────┐
│ Category · UoM (pack / box / bottle / each)              │
│ Pack contents: [4] [L ▼]   ⓘ for items sold by volume or │
│   weight (cleaner, detergent, etc.); leave blank for     │
│   unitary items like sponges or towels                   │
│ Cost / pack (EGP): [6.28]                                │
│ Vendor                                                    │
└──────────────────────────────────────────────────────────┘
┌─ STOCK CONTROL ──────────────────────────────────────────┐
│ Min · Max · Reorder qty (all in packs)                   │
│ ☐ Batch tracked   ☐ Expiry tracked                       │
└──────────────────────────────────────────────────────────┘
┌─ CLASSIFICATION ─────────────────────────────────────────┐
│ ☐ Owner billable   ☐ Asset (V2)                          │
│ Description                                              │
└──────────────────────────────────────────────────────────┘
```

**UI label changes:**
- "PACK VOLUME (VALUE)" → "PACK CONTENTS" (combined header for the value + UoM pair)
- "PACK VOLUME (UOM)" → (merged into the same field as a dropdown to the right of the value)
- "— None (legacy count math) —" placeholder → removed; UoM dropdown shows actual UoMs from `beithady_inventory_uoms`, with a "— select —" placeholder when blank

**Field rules in the form (no change to logic):**
- `pack_volume_value` and `pack_volume_uom` shown together; clearing one clears the other (existing behavior preserved)
- `pack_volume_value` + `pack_volume_uom` are optional — a unitary item like a sponge leaves them blank

## 7. Matrix UI

### 7.1 Per-config detail page (`/beithady/inventory/rules/estimator/[configId]`)

Each row's primary line is procurement; secondary detail explains the consumption math.

```
┌─────────────────────────────────────────────────────────────────┐
│ Multi-purpose Cleaner   pack    25.50 EGP/pack                  │
│ ↳ Consumes 100 mL per check-in (= 0.025 packs from a 4 L pack)  │
│ ↳ Line cost: 0.64 EGP   ·   Monthly need: 1 pack                │
└─────────────────────────────────────────────────────────────────┘
```

New column on the per-config table:
- **Monthly procurement need** — `ceil(effective_qty_per_checkin × est_monthly_bookings)` rendered as whole packs

(Existing columns are kept: `Line cost`, formula details, etc.)

### 7.2 Matrix landing page (`/beithady/inventory/rules/estimator`)

Adds one column to the existing `UNIT CONFIGURATIONS` table:
- **MONTHLY NEED** — sum of whole-pack monthly needs across all items in the config (rendered as integer count of packs)

Existing columns kept: `TOTAL / CHECK-IN`, `PER GUEST`.

### 7.3 Estimated bookings source (helper)

`estMonthlyBookings(unitConfigId)`:
1. If `unit_configurations.est_monthly_bookings` is not null, use it
2. Else, query Guesty `confirmed`+`checked_out` reservations from the last 90 days, scoped to listings where `unit_config_id` = current config, then divide by 3
3. Else fallback constant `4`

Source visibility: small `ⓘ` next to the Monthly Need column header explains the source ("90-day Guesty avg" / "manual override" / "default").

Cache the per-config Guesty average for 1 hour in a small in-memory map (Next.js `unstable_cache` keyed by `unitConfigId`).

## 8. Auto-issue cron — Q5C hybrid

`src/app/api/cron/beithady-inventory-auto-issue/route.ts` and the underlying helper in `src/lib/beithady/inventory/issue.ts` currently compute one `qty` per issue line (in packs). Updated to compute both grains:

```typescript
// Pure-count item OR rule has no consumes_volume:
//   consumed_qty = rule.qty (legacy semantic = pieces if pure-count)
//   consumed_uom = item.uom (or 'pcs' for legacy rules)
//   qty = rule.qty / item.pack_volume_value (when both 'pcs')
//        OR rule.qty / item.amazon_eg_pack_size (legacy fallback)

// Volumetric item AND rule has consumes_volume_value/uom:
//   consumed_qty = rule.consumes_volume_value × multiplier × (1 + lossFactor)
//   consumed_uom = rule.consumes_volume_uom
//   qty         = unitsConsumedPerTrigger(...) × multiplier × (1 + lossFactor)
```

`unitsConsumedPerTrigger` already exists in `volumetric.ts` and returns fractional packs. We just preserve the consumed_qty + consumed_uom alongside.

The post-issue RPC (`beithady_inv_post_issue`) needs no change — it deducts `qty` from `stock.qty_on_hand`, which is procurement-grain.

## 9. Rule form — Q3 auto-default UoM

`src/app/beithady/inventory/rules/_components/rule-form-button.tsx` currently has `consumes_volume_value` + `consumes_volume_uom` as manual inputs. Updated:

- When operator selects an item, the form fetches that item's `pack_volume_uom` and pre-selects it in the rule's `consumes_volume_uom` dropdown
- If item has no `pack_volume_uom` (pure-count item), default `consumes_volume_uom` to `'pcs'`
- Operator can override — dropdown shows all UoMs, with item's UoM marked as "(default)"
- Validation at save: `consumes_volume_uom` must be in the same `MeasureKind` as item's `pack_volume_uom` (mass/volume/count) — reuse existing `areUomsCompatible` from `volumetric.ts`

## 10. Mismatch banner — already covers pack_volume

`src/app/beithady/inventory/items/_components/amazon-mismatch-banner.tsx` already compares `amazon_eg_pack_volume_value/uom` (shadow) vs `pack_volume_value/uom` (live). Keep as-is.

The "Fork to new SKU" button (Q3 from the volumetric branch) is already shipped. Keep as-is.

## 11. GRN restate workflow — already shipped

`src/app/beithady/inventory/grn/_components/restate-pack-volume-button.tsx` already exists, allows operator to update `received_pack_volume_value/uom` per GRN line, and optionally cascade to the SKU master. **Keep as-is.** No rename — the file name is fine internally; the user-visible UI doesn't surface "pack volume" terminology in the modal.

## 12. Migration plan

Single migration: `supabase/migrations/0077_inventory_procurement_restructure.sql`

```sql
ALTER TABLE beithady_inventory_issue_lines
  ADD COLUMN consumed_qty numeric NULL CHECK (consumed_qty IS NULL OR consumed_qty >= 0),
  ADD COLUMN consumed_uom text NULL REFERENCES beithady_inventory_uoms(code);

COMMENT ON COLUMN beithady_inventory_issue_lines.consumed_qty IS
  'Q5C hybrid grain — consumption-grain qty (e.g., 100 for "100 mL"). NULL for manual issues without a rule trail. Auto-issues from rules always set this.';
COMMENT ON COLUMN beithady_inventory_issue_lines.consumed_uom IS
  'UoM of consumed_qty (mL, g, pcs, etc.). NULL if consumed_qty is NULL.';

ALTER TABLE beithady_inventory_unit_configurations
  ADD COLUMN est_monthly_bookings numeric NULL CHECK (est_monthly_bookings IS NULL OR est_monthly_bookings >= 0);

COMMENT ON COLUMN beithady_inventory_unit_configurations.est_monthly_bookings IS
  'Manual override for the Procurement Need calculation in the Housekeeping Matrix. NULL falls back to "90-day Guesty avg / 3" then constant 4.';
```

No data backfill needed (both columns default null). No drops, no renames.

## 13. Files touched

**New file (1):** `supabase/migrations/0077_inventory_procurement_restructure.sql`

**Modified files (8):**
- `src/lib/beithady/inventory/catalog.ts` — `ItemRow` already has `pack_volume_*`; no type change needed unless we display est_monthly_bookings
- `src/lib/beithady/inventory/issue.ts` — `buildIssueLinesForReservation` (or wherever the auto-issue line construction lives) returns `{ consumed_qty, consumed_uom, qty }` instead of just `{ qty }`
- `src/lib/beithady/inventory/estimator.ts` — add `est_monthly_bookings` resolution + `monthly_need_packs` per line + per-config rollup
- `src/lib/beithady/inventory/estimator-shared.ts` — extend `EstimatorLine` type with `monthly_need_packs`; extend `EstimatorOutput` with `est_monthly_bookings_used` + `monthly_need_total`
- `src/app/beithady/inventory/items/_components/item-form-button.tsx` — 4-block layout; relabel Pack Volume → Pack contents; helper text
- `src/app/beithady/inventory/items/actions.ts` — no field changes; just labels (this file is server actions, no UI labels — likely no change)
- `src/app/beithady/inventory/rules/_components/rule-form-button.tsx` — auto-default `consumes_volume_uom` from selected item's `pack_volume_uom`
- `src/app/beithady/inventory/rules/estimator/page.tsx` — Monthly Need column on landing matrix
- `src/app/beithady/inventory/rules/estimator/[configId]/page.tsx` — procurement-first row layout + Monthly Need column on detail
- `src/app/api/cron/beithady-inventory-auto-issue/route.ts` — write consumed_qty + consumed_uom alongside qty

**Estimated LOC:** ~300 net (item-form rework ~80, rule-form auto-default ~30, estimator + shared types ~80, estimator pages ~80, auto-issue cron ~30).

## 14. Testing strategy

This codebase has no test framework wired into `package.json` (no `vitest`/`jest`). Verification is done via:

1. **`npm run build`** — type-checks every change; catches signature drift between caller and callee
2. **Manual smoke in dev server** (`npm run dev`):
   - Open `/beithady/inventory/items`, edit a volumetric item (e.g., a 4 L cleaner), confirm 4-block layout renders correctly with values pre-filled
   - Open a non-volumetric item (e.g., a sponge), confirm Pack contents fields are blank
   - Open `/beithady/inventory/rules/estimator/[some-config-id]` for a config that has a volumetric item; confirm row shows procurement-first layout, Line cost matches expectations, Monthly Need shows whole pack count
   - Open `/beithady/inventory/rules/estimator` (landing), confirm new MONTHLY NEED column populated
   - Add/edit a rule; selecting a volumetric item auto-fills `consumes_volume_uom`; selecting a unitary item defaults to 'pcs'
3. **Supabase MCP queries** for migration smoke + cron verification:
   - After 0077 applies, `SELECT column_name FROM information_schema.columns WHERE table_name='beithady_inventory_issue_lines'` returns `consumed_qty` + `consumed_uom`
   - After auto-issue cron runs (or local invocation), `SELECT consumed_qty, consumed_uom, qty FROM beithady_inventory_issue_lines WHERE issue_id IN (recent issues)` shows three populated values
4. **Spot-check estimator output** via a small server script that calls `computeEstimatorOutput(configId)` with a known config and asserts `monthly_need_packs` for one volumetric line equals the hand-computed value

## 15. Risks

- **Auto-issue cron writing both grains has a backfill question.** Existing posted issues have null `consumed_qty/uom`. Acceptable — we don't backfill historical issues; audit grain only populates going forward.
- **Procurement Need depends on `est_monthly_bookings`.** If Guesty 90-day data is sparse for a config (new building), the fallback constant `4` will produce a misleadingly small Monthly Need. Mitigation: surface the source via the `ⓘ` tooltip so operator knows when manual override is recommended.
- **Re-rendering the matrix landing page on every visit will run N Guesty queries (one per config).** Mitigation: `unstable_cache` with 1h TTL keyed by `unitConfigId`, plus a single batched query that gets all configs at once.
- **The first version of this spec described a greenfield rebuild.** That version is preserved in git history (commit `be05c4f`) so the wrong-direction work is not silently lost — it just got superseded.

## 16. Out of scope (deferred)

- Renaming `pack_volume_*` columns to `pack_contents_*` (cosmetic; touches every consumer; UI labels do the framing job)
- Adding a `pack_size` integer column (existing `pack_volume_value, pack_volume_uom='pcs'` model handles multi-packs)
- Multi-pack-profile SKUs ("12 × 250 mL bottles" as one SKU)
- Stock tracked at finest grain (Q5B option)
- WAC math change
- Owner-billable register UI
- Asset (V2) flag behavior
