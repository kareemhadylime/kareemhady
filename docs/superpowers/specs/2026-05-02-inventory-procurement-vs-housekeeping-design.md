# Inventory = Procurement / Housekeeping = Consumption — Design Spec

**Date:** 2026-05-02
**Status:** Approved (user signoff: "Approvd", 2026-05-02)
**Author:** Claude (brainstormed with Kareem)
**Branch:** target = `main` (greenfield single-PR rebuild)
**Discarded predecessors:** `claude/festive-lamport-b23de0`, `claude/sweet-lovelace-fa4cf6`

## 1. Problem statement

Today's `beithady_inventory_items` mixes two semantics in a single row:

- `default_cost_egp` is per-pack (procurement view) — what the buyer pays the vendor
- `amazon_eg_pack_size` is the count of pieces inside a pack — used silently by the estimator (`src/lib/beithady/inventory/estimator.ts:195-201`) to divide the pack price into a per-piece cost for housekeeping math

This works, but the form and list UIs surface the per-pack number with no signal that the matrix downstream is dividing it. The volumetric experimental branches (`festive-lamport-b23de0`, `sweet-lovelace-fa4cf6`) tried to fix this by adding `pack_volume_value/uom` fields directly to the item form alongside a "None (legacy count math)" affordance. That made the contradiction worse — the item form became a mix of "what you bought" and "how it gets consumed".

The auto-issue cron in `src/lib/beithady/inventory/issue.ts:172-190` compounds the problem: it deducts `rule.qty` directly from `stock.qty_on_hand` (which is in pack-units), so a rule that says "1 sponge per check-in" deducts 1 *pack* from stock — three times the intended consumption.

User mandate: **Inventory module reflects the item as procurement buys it. All sub-pack / partial-use math lives in the Housekeeping Matrix.**

## 2. Goals

1. Item form contains only procurement-facing data — no consumption math fields.
2. Pack-content metadata (e.g., "4 L per bottle") lives on the item as a single source of truth, framed as a vendor spec.
3. Consumption rules carry their own UoM (`piece`, `mL`, `g`) and can be expressed in any unit dimensionally compatible with the item's pack contents.
4. Housekeeping Matrix display is procurement-first: rows show what you buy and how much, with consumption math as secondary detail.
5. Stock balance stays in pack units (procurement-aligned). Issue lines record both consumption-grain (audit) and pack-grain (stock movement) values.
6. Matrix landing page exposes a "Monthly procurement need" column so the matrix is actionable for reorder, not just costing.

## 3. Non-goals

- Multi-pack-profile SKUs (e.g., "12 × 250 mL bottles" as one SKU). One `pack_contents` per item.
- Stock tracked at finest grain (pieces / mL / g). Stock stays in packs; counts reconcile drift.
- Weighted-average-cost recompute changes. `avg_cost_egp` stays per-pack.
- Owner-billable register UI (still V2).
- Asset (V2) flag behavior changes.

## 4. Design decisions (Q&A trail)

| # | Question | Choice | Why |
|---|---|---|---|
| Q1 | What stays on the item as procurement metadata? | **A** — `pack_size` (count) only; volumetric math moves to rules | Procurement clarity; "as purchased" mandate |
| Q2 | Where does "1 bottle = 4 L" live? | **A** — on the item, labeled as procurement metadata | Single source of truth; rules read it; no per-rule duplication |
| Q3 | How does a rule express its consumption qty? | **A** — rule auto-picks UoM from item; operator can override | Least friction; item is source of truth; UoM compatibility validated at save |
| Q4 | Matrix line display style | **A + bonus** — procurement-first primary line, consumption math secondary, plus Monthly procurement need column | Matrix should be actionable for buying, not just costing |
| Q5 | Stock grain | **C** — hybrid: stock in packs, issue records both consumed-grain and pack-grain | Procurement-aligned stock; full audit trail of what was actually consumed |
| Approach | How to ship | **1** — greenfield single-PR rebuild | Volumetric branch UI choices are exactly what we're redesigning; refactor cost > rebuild cost |

## 5. Data model

### 5.1 Items (`beithady_inventory_items`)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `pack_size` | `int` | `1`, `NOT NULL`, `CHECK (pack_size >= 1)` | Count of pieces inside one procurement pack (3-pack of sponges → 3; single bottle → 1) |
| `pack_contents_value` | `numeric` | nullable | For volumetric/mass items: amount inside one pack (4 L bottle → 4) |
| `pack_contents_uom` | `text` | nullable, `CHECK in ('L','mL','kg','g')` | UoM of pack contents |
| `default_cost_egp` | unchanged | — | Stays per **pack** (procurement-correct) |

**Constraint:** `CHECK ((pack_contents_value IS NULL) = (pack_contents_uom IS NULL))` — both set or both null.

**Repurposed column:** `amazon_eg_pack_size` is **kept** as a shadow column — its role shifts from "the canonical pack-size used silently by the estimator" to "what the AI extracted from the Amazon listing, used by the mismatch banner to flag drift vs the live `pack_size`". Same data, narrower contract. The new `amazon_eg_pack_contents_value/uom` columns play the same shadow role for volumetric metadata.

### 5.2 Consumption rules (`beithady_inventory_consumption_rules`)

| Column | Change | Purpose |
|---|---|---|
| `qty` | rename → `consumes_qty` | Same semantics, clearer name |
| `consumes_uom` | new `text NOT NULL DEFAULT 'piece'` | UoM the rule consumes in |

**Validation at save (application layer):**
- `consumes_uom` must be `'piece'` if item has no `pack_contents_uom`
- Otherwise must be in the same dimensional family as `pack_contents_uom` (mass family: `kg`/`g`; volume family: `L`/`mL`)
- Reject `100 kg` for a `4 L` item

### 5.3 Issue lines (`beithady_inventory_issue_lines`) — Q5C hybrid

| Column | Change | Purpose |
|---|---|---|
| `consumed_qty` | new `numeric NULL` | Audit grain (100 mL, 1 piece) |
| `consumed_uom` | new `text NULL` | UoM of consumption (`piece`, `mL`, `g`) |
| `qty` | unchanged | Stays as packs deducted from stock |

`consumed_qty`/`consumed_uom` are nullable for back-compat with manual issues that may not have a rule trail; auto-issues from rules always set them.

### 5.4 Stock balance (`beithady_inventory_stock`)

No schema change. `qty_on_hand` stays in pack units (already `numeric`, fractional decimals already allowed).

## 6. Item form layout (procurement-first)

Reorganized into 4 visual blocks under one modal:

```
┌─ IDENTIFICATION ─────────────────────────────────────────┐
│ SKU · Brand · Name (EN) · Name (AR) · Barcode · Photo   │
└──────────────────────────────────────────────────────────┘
┌─ PROCUREMENT (how it's bought) ──────────────────────────┐
│ Category · UoM (pack / box / bottle / each)              │
│ Pack size: [3]   ⓘ pieces inside one pack                │
│ Pack contents: [4] [L ▼]   ⓘ for volumetric items only   │
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

**Killed:** the "Pack Volume (Value)" / "Pack Volume (UoM)" header from the volumetric branches with its "None (legacy count math)" placeholder. Replaced by "Pack contents" inside the Procurement block, framed as a vendor spec.

**Field rules in the form:**
- `pack_size` always shown (defaults to 1, must be >= 1)
- `pack_contents_value` + `pack_contents_uom` shown together; clearing one clears the other
- `pack_size` placeholder text: "pieces inside one pack" (not "qty per pack" — clarity)
- `pack_contents` helper text: "for items sold by volume or weight (cleaner, detergent, etc.); leave blank for unitary items"

## 7. Matrix UI

### 7.1 Per-config detail page (`/beithady/inventory/rules/estimator/[configId]`)

Each row's primary line is procurement; secondary detail explains the consumption math.

```
┌─────────────────────────────────────────────────────────────────┐
│ Kitchen Sponge 3-Pack    pack    6.28 EGP/pack                  │
│ ↳ Consumes 1 piece per check-in (= 0.33 packs)                  │
│ ↳ Line cost: 2.09 EGP   ·   Monthly need: 10 packs              │
└─────────────────────────────────────────────────────────────────┘
```

New columns on the per-config table:
- **Line cost** — `effective_qty × unit_cost` in EGP, where `effective_qty` is fractional packs and `unit_cost` is pack price
- **Monthly procurement need** — `ceil(consumption_per_checkin × est_monthly_bookings / pack_size_or_pack_contents_value)` rendered as whole packs

### 7.2 Matrix landing page (`/beithady/inventory/rules/estimator`)

Adds one column to the existing `UNIT CONFIGURATIONS` table:
- **MONTHLY NEED** — sum of all per-line monthly needs across the config (in pack-units, summed across heterogeneous items as a count)

Existing columns kept: `TOTAL / CHECK-IN`, `PER GUEST` (these remain consumption-cost views, useful for COGS attribution).

### 7.3 Estimated bookings source

`est_monthly_bookings` per config:
1. If a per-config `est_monthly_bookings` value is set on `beithady_inventory_unit_configurations`, use it
2. Else, query Guesty `confirmed`+`checked_out` reservations from the last 90 days, divided by 3, scoped to listings where `unit_config_id` = current config
3. Else, fallback constant `4` (sensible default for a small portfolio)

Source visibility: small `ⓘ` next to the Monthly Need column header explains the source ("90-day Guesty avg" / "manual override" / "default").

## 8. Stock posting & auto-issue cron

### 8.1 New helper: `consumptionToPacks(rule, item) → number`

Located in `src/lib/beithady/inventory/volumetric.ts` (new file, cherry-picked structure from `claude/festive-lamport-b23de0` then renamed and slimmed):

```typescript
export function consumptionToPacks(
  rule: { consumes_qty: number; consumes_uom: string },
  item: { pack_size: number; pack_contents_value: number | null; pack_contents_uom: string | null },
): number {
  // Pure-count item: rule must be in 'piece'
  if (!item.pack_contents_value || !item.pack_contents_uom) {
    if (rule.consumes_uom !== 'piece') {
      throw new Error(`Rule UoM '${rule.consumes_uom}' incompatible with pure-count item`);
    }
    return rule.consumes_qty / item.pack_size;
  }
  // Volumetric item: convert rule UoM to item's pack_contents UoM, then divide
  const ruleAmtInItemUom = convertVolume(
    rule.consumes_qty,
    rule.consumes_uom,
    item.pack_contents_uom,
  );
  return ruleAmtInItemUom / item.pack_contents_value;
}
```

`convertVolume` and `parseVolumeFromText` are cherry-picked from the volumetric branch's `volumetric.ts` (math is already correct).

### 8.2 Auto-issue cron (`src/app/api/cron/beithady-inventory-auto-issue/route.ts`)

Currently writes one `qty` per issue line. Updated to write three values:

```typescript
const consumedQty = rule.consumes_qty * formulaMultiplier * (1 + lossFactor);
const packsQty = consumptionToPacks(rule, item) * formulaMultiplier * (1 + lossFactor);

return {
  item_id: item.id,
  consumed_qty: round2(consumedQty),
  consumed_uom: rule.consumes_uom,
  qty: round2(packsQty),  // packs, deducted from stock
  rule_id: rule.id,
};
```

### 8.3 Post-issue RPC (`beithady_inv_post_issue` in `0050_beithady_inventory_issue_posting.sql`)

**No math change.** Already deducts `qty` from `qty_on_hand`. We only ensure callers compute `qty` in packs — no SQL changes needed.

### 8.4 Estimator cost computation (`src/lib/beithady/inventory/estimator.ts:191-225`)

Current code divides `amazon_eg_price_egp / amazon_eg_pack_size` for unit cost. Replaced by:

```typescript
const fractionalPacks = consumptionToPacks(rulePicked, it) * multiplier;
const effectivePacks = fractionalPacks * (1 + lossFactor);
const lineTotal = effectivePacks * unitCostPerPack;  // unitCostPerPack = default_cost_egp or amazon_eg_price_egp
```

`unit_cost_is_estimate` flag stays — true when no Amazon price exists, false when Amazon price drives the pack cost.

## 9. Amazon EG sourcer

### 9.1 AI extraction

The Haiku prompt in `src/lib/beithady/inventory/amazon-eg-sourcer.ts` already extracts pack size from product names. Updated to also extract `pack_contents_value` + `pack_contents_uom`:

- "Cleaner 4L Bottle" → `pack_size: 1, pack_contents_value: 4, pack_contents_uom: 'L'`
- "Sponges 3-Pack" → `pack_size: 3, pack_contents_value: null, pack_contents_uom: null`
- "Detergent 2.5 kg Box" → `pack_size: 1, pack_contents_value: 2.5, pack_contents_uom: 'kg'`

### 9.2 Shadow columns

New shadow columns on `beithady_inventory_items` for the review-before-apply pattern (existing pattern for `amazon_eg_url_reviewed_at`):
- `amazon_eg_pack_contents_value` `numeric NULL`
- `amazon_eg_pack_contents_uom` `text NULL`

`Apply Amazon details` action (existing) is extended to copy shadow → live columns and stamp `amazon_eg_url_reviewed_at`.

### 9.3 Mismatch banner

The existing SKU-size-mismatch banner concept is kept and extended to cover `pack_contents` mismatches:
- Banner fires when `amazon_eg_pack_size != pack_size` OR `amazon_eg_pack_contents_value/uom != pack_contents_value/uom`
- Three resolution buttons (existing): Accept Amazon, Keep current, Open Amazon URL
- Fourth violet button: "Fork to new SKU" (kept from volumetric branch design — used when Amazon listing is genuinely a different product, not just shrinkflation)

## 10. GRN restate workflow

Kept and renamed:

- File rename: `src/app/beithady/inventory/grn/_components/restate-pack-volume-button.tsx` → `restate-pack-contents-button.tsx`
- Action rename: `restateGrnLinePackVolumeAction` → `restateGrnLinePackContentsAction`
- Modal updates `received_pack_size` and/or `received_pack_contents_value/uom` on the GRN line
- Checkbox: "Also update SKU master" — when checked, cascades to item's `pack_size` / `pack_contents_*`
- Audit-logged via `beithady_inventory_audit_logs` (existing pattern) with before/after values
- Refuses on `posted` / `approved` GRN status

GRN line columns added in migration 0066:
- `received_pack_size` `int NULL`
- `received_pack_contents_value` `numeric NULL`
- `received_pack_contents_uom` `text NULL`

These default to NULL (= "received as declared on item master"). Restate workflow populates them when actual receipt differs.

## 11. Migration plan

### 11.1 Migration 0066 — additive only

`supabase/migrations/0066_inventory_procurement_consumption_split.sql`:

```sql
-- Items
ALTER TABLE beithady_inventory_items
  ADD COLUMN pack_size int NOT NULL DEFAULT 1 CHECK (pack_size >= 1),
  ADD COLUMN pack_contents_value numeric NULL,
  ADD COLUMN pack_contents_uom text NULL CHECK (
    pack_contents_uom IS NULL OR pack_contents_uom IN ('L','mL','kg','g')
  ),
  ADD CONSTRAINT pack_contents_both_or_neither
    CHECK ((pack_contents_value IS NULL) = (pack_contents_uom IS NULL)),
  ADD COLUMN amazon_eg_pack_contents_value numeric NULL,
  ADD COLUMN amazon_eg_pack_contents_uom text NULL CHECK (
    amazon_eg_pack_contents_uom IS NULL OR amazon_eg_pack_contents_uom IN ('L','mL','kg','g')
  );

-- Backfill pack_size from existing amazon_eg_pack_size
UPDATE beithady_inventory_items
  SET pack_size = COALESCE(amazon_eg_pack_size, 1)
  WHERE pack_size = 1;

-- Consumption rules
ALTER TABLE beithady_inventory_consumption_rules
  RENAME COLUMN qty TO consumes_qty;
ALTER TABLE beithady_inventory_consumption_rules
  ADD COLUMN consumes_uom text NOT NULL DEFAULT 'piece' CHECK (
    consumes_uom IN ('piece','L','mL','kg','g')
  );

-- Issue lines
ALTER TABLE beithady_inventory_issue_lines
  ADD COLUMN consumed_qty numeric NULL,
  ADD COLUMN consumed_uom text NULL CHECK (
    consumed_uom IS NULL OR consumed_uom IN ('piece','L','mL','kg','g')
  );

-- GRN lines (restate columns)
ALTER TABLE beithady_inventory_grn_lines
  ADD COLUMN received_pack_size int NULL CHECK (
    received_pack_size IS NULL OR received_pack_size >= 1
  ),
  ADD COLUMN received_pack_contents_value numeric NULL,
  ADD COLUMN received_pack_contents_uom text NULL CHECK (
    received_pack_contents_uom IS NULL OR received_pack_contents_uom IN ('L','mL','kg','g')
  );

-- Unit configurations: optional manual override for monthly bookings
ALTER TABLE beithady_inventory_unit_configurations
  ADD COLUMN est_monthly_bookings numeric NULL CHECK (
    est_monthly_bookings IS NULL OR est_monthly_bookings >= 0
  );
```

### 11.2 Backward compatibility

- Existing rules without `consumes_uom` get the default `'piece'` from migration — semantically identical for **pure-count** items (where today's rules implicitly mean "1 piece")
- Existing items without `pack_size` set get `1` — semantically identical (pure-count single-piece items)
- Existing items where `amazon_eg_pack_size` is set get `pack_size` backfilled from that value
- Existing issue lines have null `consumed_qty`/`consumed_uom` — the audit grain only populates going forward
- **Estimator math is consistent for pure-count items only.** For an existing 3-pack of sponges with rule `qty: 1, formula: per_checkin`, today's `unitCost = amazon_eg_price / amazon_eg_pack_size = 6.28/3 = 2.09 EGP/piece × 1 = 2.09 EGP/checkin` matches new `fractionalPacks = 1/3 × pack_price 6.28 = 2.09 EGP/checkin`. ✓
- **Volumetric items need a manual transition.** For an existing 4 L cleaner bottle with rule `qty: 1, formula: per_checkin` (today: deducts 1 bottle/check-in), after migration: rule auto-gets `consumes_uom='piece'`, but item has no `pack_contents` set yet, so `consumptionToPacks` runs the pure-count branch and returns `1/1 = 1 pack` — same as today, no breakage. **Operator action required to unlock fractional volumetric:** open the item, set `pack_contents = 4 L`. After that, the rule must be updated to volumetric (e.g., `consumes_qty: 100, consumes_uom: 'mL'`) — until then, the rule still works in piece-mode. So the transition is non-breaking but requires manual rule rewrites to actually realize the new feature for volumetric items.

**Migration runbook (post-deploy):**
1. Deploy 0066 + code (estimator reads new `pack_size`, defaults `pack_contents` to null).
2. For each volumetric item, operator opens item form, fills in `pack_contents` (e.g., `4 L`).
3. For each rule pointing at a now-volumetric item, operator opens rule form, switches `consumes_qty` + `consumes_uom` to volumetric grain (e.g., `100 mL`).
4. Validate by spot-checking the estimator output for one config that uses each volumetric item.

## 12. Files touched (preview, ~14 files + 1 migration)

**New files:**
- `supabase/migrations/0066_inventory_procurement_consumption_split.sql`
- `src/lib/beithady/inventory/volumetric.ts` (cherry-pick parseVolumeFromText/convertVolume/consumptionToPacks)

**Renamed files:**
- `src/app/beithady/inventory/grn/_components/restate-pack-volume-button.tsx` → `restate-pack-contents-button.tsx` (note: this file does NOT exist on main; it's a new file matching the old branch's concept)

**Modified files:**
- `src/lib/beithady/inventory/catalog.ts` — `ItemRow` type adds `pack_size` + `pack_contents_value/uom` + `amazon_eg_pack_contents_value/uom`; SELECT queries return both live and shadow columns for the mismatch banner to compare
- `src/lib/beithady/inventory/estimator.ts` — replace per-piece division with `consumptionToPacks`
- `src/lib/beithady/inventory/issue.ts` — auto-issue computes consumed_qty + qty (packs)
- `src/lib/beithady/inventory/rules.ts` — `ConsumptionRule` type adds `consumes_uom`, save validation
- `src/lib/beithady/inventory/amazon-eg-sourcer.ts` — Haiku prompt extracts pack_contents; writes shadow cols
- `src/app/beithady/inventory/items/_components/item-form-button.tsx` — 4-block layout, Pack size + Pack contents fields
- `src/app/beithady/inventory/items/_components/items-section-list.tsx` — list rows show "/pack" suffix on price; Pack contents badge
- `src/app/beithady/inventory/items/actions.ts` — `ItemFormInput` type adds new fields, validation
- `src/app/beithady/inventory/rules/_components/rule-form-button.tsx` — `consumes_uom` dropdown that defaults from item
- `src/app/beithady/inventory/rules/estimator/[configId]/page.tsx` — procurement-first row display + Procurement Need column
- `src/app/beithady/inventory/rules/estimator/page.tsx` — Monthly Need column on landing matrix
- `src/app/beithady/inventory/grn/[id]/page.tsx` — wire restate-pack-contents-button on GRN lines
- `src/app/api/cron/beithady-inventory-auto-issue/route.ts` — write consumed_qty + qty from new helper
- `src/app/beithady/inventory/items/_components/amazon-mismatch-banner.tsx` — extend mismatch detection to pack_contents

**Estimated LOC:** ~600 net (additions outnumber deletions; volumetric.ts ~150, item-form rework ~120, estimator ~80, mismatch banner ~50, others smaller).

## 13. Testing strategy

- **Unit tests** for `volumetric.ts` (`convertVolume`, `consumptionToPacks`) covering: pure-count items, L↔mL conversion, kg↔g conversion, dimensional-mismatch errors
- **Estimator integration test** using a seeded unit_config + 3 items (sponge 3-pack pure-count; cleaner 4 L volumetric; detergent 2.5 kg mass) + rules consuming 1 piece / 100 mL / 200 g — assert per-line costs and Monthly Need totals
- **Auto-issue cron test** asserting both `consumed_qty` (audit grain) and `qty` (packs) are written correctly for one of each item type
- **Item form UI test** (existing test pattern) verifying form submits with valid pack_size/pack_contents and rejects mismatched both-or-neither
- **Migration smoke test:** run 0066 against a copy of prod data (Supabase MCP `apply_migration` to a branch), spot-check that `pack_size` backfilled from `amazon_eg_pack_size` correctly, that no rules lost their qty values

## 14. Open questions / risks

- **`amazon_eg_pack_size` column repurposed as shadow** — kept indefinitely for the mismatch banner to compare AI-extracted vs live `pack_size`. Some references in code (e.g., `catalog.ts` SELECT lists, mismatch banner) still read it, by design.
- **Existing issue lines have null `consumed_qty`/`consumed_uom`.** Acceptable — audit grain only populates going forward.
- **Volumetric-item rules need manual rewrite to unlock fractional consumption.** See migration runbook in §11.2. Until rewritten, volumetric items behave exactly as today (1 bottle deducted per trigger).
- **`restate-pack-contents-button.tsx` is a new file, not a rename.** The volumetric-branch's `restate-pack-volume-button.tsx` does not exist on main. §10 builds this fresh.
- **Bookings-per-month query performance.** If per-config Guesty 90-day average is computed on every matrix landing page render, it's a heavy query. Mitigation: cache per-config result for 1 hour in a small in-memory map, bust on `revalidateTag`.

## 15. Out of scope (deferred)

- Multi-pack profiles ("12 × 250 mL bottles" as a single SKU)
- Stock tracked at finest grain (Q5B option)
- Weighted-average-cost recompute changes
- Owner-billable register UI
- Asset (V2) flag behavior
