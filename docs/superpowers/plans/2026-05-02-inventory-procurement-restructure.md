# Inventory Procurement Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the existing volumetric inventory system as procurement-first in the UI, add Q5C hybrid issue lines (audit grain + pack grain), Q3 rule-form UoM auto-default, and a Procurement Need column on the Housekeeping Matrix.

**Architecture:** All data-model groundwork is already shipped (migration 0066, `volumetric.ts`, item form `pack_volume_*`, rule form `consumes_volume_*`, mismatch banner, GRN restate). This plan adds one tiny migration (`0077`) for the two new columns, extends the auto-issue cron to write both grains, threads `est_monthly_bookings` + `monthly_need_packs` through the estimator pipeline, restructures the item form into 4 procurement-oriented blocks, auto-defaults the rule UoM dropdown from the selected item, and adds a Monthly Need column to both matrix pages.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Tailwind, Supabase Postgres + JS client, server actions, no test framework wired into `package.json` — verification is `npm run build` + manual smoke + Supabase MCP queries. Per `AGENTS.md`, every commit auto-deploys via `git push origin <branch>:main` (Vercel GitHub integration).

**Spec:** [docs/superpowers/specs/2026-05-02-inventory-procurement-vs-housekeeping-design.md](../specs/2026-05-02-inventory-procurement-vs-housekeeping-design.md)

---

## File structure

**New files (1):**
- `supabase/migrations/0077_inventory_procurement_restructure.sql` — adds `consumed_qty/uom` to issue_lines, `est_monthly_bookings` to unit_configurations

**Modified files (8):**
- `src/lib/beithady/inventory/estimator-shared.ts` — extend `EstimatorLine` with `consumes_volume_*` echo + `monthly_need_packs`; extend `EstimatorOutput` with `monthly_need_total_packs` + `est_monthly_bookings_used`
- `src/lib/beithady/inventory/estimator.ts` — resolve `est_monthly_bookings` per config (manual override → Guesty 90d avg → fallback `4`); compute `monthly_need_packs` per line + per-config rollup
- `src/lib/beithady/inventory/issue.ts` — extend `AutoIssueComputation.lines[]` with `consumed_qty/consumed_uom`; volumetric path when both rule and item have volumetric data, legacy fallback otherwise
- `src/app/api/cron/beithady-inventory-auto-issue/route.ts` — pass `consumed_qty/consumed_uom` into the issue-lines insert
- `src/app/beithady/inventory/items/_components/item-form-button.tsx` — reorganize into 4 visual blocks; relabel "Pack Volume" → "Pack contents" with procurement-framed helper text
- `src/app/beithady/inventory/rules/_components/rule-form-button.tsx` — auto-default `consumes_volume_uom` from selected item's `pack_volume_uom`; add inline helper text
- `src/app/beithady/inventory/rules/estimator/page.tsx` — add `MONTHLY NEED` column to landing matrix
- `src/app/beithady/inventory/rules/estimator/[configId]/page.tsx` — render rows procurement-first (pack info primary, consumption math secondary); add Monthly Need column

---

### Task 1: Migration 0077 — schema additions

**Files:**
- Create: `supabase/migrations/0077_inventory_procurement_restructure.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Phase M.17 — Procurement-first inventory restructure
-- Adds two columns:
-- 1. issue_lines.consumed_qty + consumed_uom (Q5C hybrid grain — audit-grain
--    consumption alongside the pack-grain qty already deducted from stock)
-- 2. unit_configurations.est_monthly_bookings (manual override for the
--    Procurement Need calc in the Housekeeping Matrix)
-- No backfill, no drops, no renames. Both columns nullable.

ALTER TABLE beithady_inventory_issue_lines
  ADD COLUMN IF NOT EXISTS consumed_qty numeric NULL
    CHECK (consumed_qty IS NULL OR consumed_qty >= 0),
  ADD COLUMN IF NOT EXISTS consumed_uom text NULL
    REFERENCES beithady_inventory_uoms(code) ON DELETE SET NULL;

COMMENT ON COLUMN beithady_inventory_issue_lines.consumed_qty IS
  'Q5C hybrid grain — consumption-grain qty (e.g., 100 for "100 mL"). NULL for manual issues without a rule trail. Auto-issues from rules always set this.';
COMMENT ON COLUMN beithady_inventory_issue_lines.consumed_uom IS
  'UoM of consumed_qty (mL, g, pcs, etc.). NULL if consumed_qty is NULL.';

ALTER TABLE beithady_inventory_unit_configurations
  ADD COLUMN IF NOT EXISTS est_monthly_bookings numeric NULL
    CHECK (est_monthly_bookings IS NULL OR est_monthly_bookings >= 0);

COMMENT ON COLUMN beithady_inventory_unit_configurations.est_monthly_bookings IS
  'Manual override for the Procurement Need calc in the Housekeeping Matrix. NULL falls back to "90-day Guesty avg / 3" then constant 4.';
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP `apply_migration` tool against the `bpjproljatbrbmszwbov` project with name `0077_inventory_procurement_restructure` and the SQL above. Confirm the response includes no error.

- [ ] **Step 3: Verify the columns exist**

Run via Supabase MCP `execute_sql`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('beithady_inventory_issue_lines', 'beithady_inventory_unit_configurations')
  AND column_name IN ('consumed_qty', 'consumed_uom', 'est_monthly_bookings');
```

Expected: 3 rows — `consumed_qty (numeric, YES)`, `consumed_uom (text, YES)`, `est_monthly_bookings (numeric, YES)`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0077_inventory_procurement_restructure.sql
git commit -m "feat(inventory): migration 0077 — issue_lines hybrid grain + est_monthly_bookings"
git push origin claude/eager-johnson-cce95a:main
```

---

### Task 2: Extend estimator types with Monthly Need

**Files:**
- Modify: `src/lib/beithady/inventory/estimator-shared.ts:214-246`

- [ ] **Step 1: Extend `EstimatorLine` and `EstimatorOutput`**

After the existing `unit_cost_is_estimate: boolean;` field (line ~235), add to `EstimatorLine`:

```typescript
  // M.17 — Procurement Need (whole packs to buy monthly)
  monthly_need_packs: number;   // ceil(effective_qty × est_monthly_bookings)
  // M.17 — echo of consumes_volume on the rule (for procurement-first display)
  consumes_volume_value: number | null;
  consumes_volume_uom: string | null;
```

After the existing `computed_at: string;` field on `EstimatorOutput` (line ~245), add:

```typescript
  // M.17 — total whole-pack monthly need across all lines in this config
  monthly_need_total_packs: number;
  // M.17 — which est_monthly_bookings value drove the calc, and where it came from
  est_monthly_bookings_used: number;
  est_monthly_bookings_source: 'manual_override' | 'guesty_90d_avg' | 'default_constant';
```

- [ ] **Step 2: Extend `UnitConfiguration` with the new column**

Locate the `UnitConfiguration` type (line ~21) and append a field:

```typescript
  est_monthly_bookings: number | null;  // M.17 — manual override; null falls back to Guesty avg
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: build succeeds (no TS errors). The `EstimatorLine` / `EstimatorOutput` consumers in estimator.ts will now error because they don't yet populate the new fields — that's fixed in Task 3.

If build fails for a different reason, fix that before moving on.

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady/inventory/estimator-shared.ts
git commit -m "feat(inventory): extend estimator types with monthly_need_packs + est_monthly_bookings"
```

(Don't push yet — Task 3 fixes the consumer side; we push together after Task 3 to avoid a broken intermediate deploy.)

---

### Task 3: Estimator computes Monthly Need

**Files:**
- Modify: `src/lib/beithady/inventory/estimator.ts`

- [ ] **Step 1: Add est_monthly_bookings resolver**

Insert this helper near the top of `estimator.ts` (after the existing imports, before `listUnitConfigurations`):

```typescript
import { unstable_cache } from 'next/cache';

// Resolves est_monthly_bookings per unit_config:
//   1. unit_configurations.est_monthly_bookings (manual override)
//   2. Guesty confirmed/checked_out 90d avg (cached 1h per config)
//   3. Constant 4 (sensible default for small portfolio)
async function resolveMonthlyBookings(
  config: UnitConfiguration,
): Promise<{ value: number; source: 'manual_override' | 'guesty_90d_avg' | 'default_constant' }> {
  if (config.est_monthly_bookings != null && config.est_monthly_bookings >= 0) {
    return { value: Number(config.est_monthly_bookings), source: 'manual_override' };
  }
  const guesty = await guestyAvgFor(config.id);
  if (guesty != null) return { value: guesty, source: 'guesty_90d_avg' };
  return { value: 4, source: 'default_constant' };
}

const guestyAvgFor = unstable_cache(
  async (unitConfigId: string): Promise<number | null> => {
    const sb = supabaseAdmin();
    // 90-day window
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data } = await sb
      .from('beithady_inventory_listing_unit_config')
      .select('listing_id')
      .eq('unit_config_id', unitConfigId);
    const listingIds = (data || []).map(r => (r as { listing_id: string }).listing_id);
    if (listingIds.length === 0) return null;
    const { count } = await sb
      .from('guesty_reservations')
      .select('id', { count: 'exact', head: true })
      .in('listing_id', listingIds)
      .in('status', ['confirmed', 'checked_out'])
      .gte('check_in_date', cutoff);
    if (count == null) return null;
    return count / 3;  // 90 days ≈ 3 months
  },
  ['inventory-estimator-monthly-bookings'],
  { revalidate: 3600, tags: ['inventory-estimator-monthly-bookings'] },
);
```

- [ ] **Step 2: Update `computeEstimatorOutput` to populate new fields**

Inside `computeEstimatorOutput`, after the line `const lines: EstimatorLine[] = [];` (line ~158), insert:

```typescript
  const monthlyBookings = await resolveMonthlyBookings(config);
```

Then inside the per-item loop, where the existing code sets `effective_qty` and `line_total_egp` (around line ~210), also compute `monthly_need_packs` and pass through `consumes_volume_*`:

```typescript
    // M.17 — Procurement Need: whole packs to buy monthly. Round up.
    const monthlyNeedPacks = Math.ceil(effectiveQty * monthlyBookings.value);

    lines.push({
      item_id: it.id,
      item_sku: it.sku,
      item_name_en: it.name_en,
      item_name_ar: it.name_ar,
      category_code: catCode,
      group,
      uom: it.uom,
      formula_kind: rulePicked.formula_kind,
      base_qty: baseQty,
      computed_qty: computedQty,
      loss_factor_pct: Number(rulePicked.loss_factor_pct),
      effective_qty: effectiveQty,
      unit_cost_egp: unitCost,
      line_total_egp: effectiveQty * unitCost,
      amazon_eg_url: it.amazon_eg_url,
      amazon_eg_image_url: it.amazon_eg_image_url,
      amazon_eg_status: (it.amazon_eg_last_status as EstimatorLine['amazon_eg_status']) || null,
      rule_scope: rulePicked.scope,
      has_listing_override: !!override,
      ai_info_summary_en: it.ai_info?.summary_en ?? null,
      unit_cost_is_estimate: unitCostIsEstimate,
      // M.17 fields
      monthly_need_packs: monthlyNeedPacks,
      consumes_volume_value: rulePicked.consumes_volume_value != null ? Number(rulePicked.consumes_volume_value) : null,
      consumes_volume_uom: rulePicked.consumes_volume_uom,
    });
```

(Replace the existing `lines.push({ ... })` block — the new fields slot in alongside the existing ones.)

- [ ] **Step 3: Update the EstimatorOutput return**

At the bottom of `computeEstimatorOutput`, where the function returns `EstimatorOutput`, add the totals:

```typescript
  const monthlyNeedTotalPacks = lines.reduce((acc, l) => acc + l.monthly_need_packs, 0);

  return {
    unit_config: config,
    listing_id: listingId || null,
    lines,
    totals_by_group: totalsByGroup,
    total_per_checkin_egp: total,
    total_per_guest_egp: config.guest_capacity > 0 ? total / config.guest_capacity : 0,
    computed_at: new Date().toISOString(),
    // M.17 fields
    monthly_need_total_packs: monthlyNeedTotalPacks,
    est_monthly_bookings_used: monthlyBookings.value,
    est_monthly_bookings_source: monthlyBookings.source,
  };
```

- [ ] **Step 4: Update `listUnitConfigSummaries` to surface monthly need**

In `listUnitConfigSummaries` (line ~267), extend the return type and value:

```typescript
export type UnitConfigSummary = {
  config: UnitConfiguration;
  total_per_checkin_egp: number;
  line_count: number;
  listing_count: number;
  monthly_need_total_packs: number;       // M.17
  est_monthly_bookings_source: 'manual_override' | 'guesty_90d_avg' | 'default_constant';  // M.17
};
```

And inside the loop:

```typescript
    out.push({
      config: c,
      total_per_checkin_egp: o?.total_per_checkin_egp || 0,
      line_count: o?.lines.length || 0,
      listing_count: counts[c.id] || 0,
      monthly_need_total_packs: o?.monthly_need_total_packs || 0,
      est_monthly_bookings_source: o?.est_monthly_bookings_source || 'default_constant',
    });
```

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: build succeeds. If it fails because the `est_monthly_bookings` field on `UnitConfiguration` isn't in the SELECT list of `listUnitConfigurations`, add `est_monthly_bookings` to the `.select(...)` calls or use `*` if already used.

Check: `grep "from('beithady_inventory_unit_configurations').select" src/lib/beithady/inventory/estimator.ts` — confirm the query returns the new column. If using `select('*')`, no change needed.

- [ ] **Step 6: Commit + push (combined with Task 2)**

```bash
git add src/lib/beithady/inventory/estimator.ts
git commit -m "feat(inventory): estimator computes monthly_need_packs + est_monthly_bookings resolution"
git push origin claude/eager-johnson-cce95a:main
```

(This pushes Task 2 + Task 3 together. Vercel auto-deploys; the existing UI doesn't read the new fields yet, so no visible change.)

---

### Task 4: Add Monthly Need column to landing matrix

**Files:**
- Modify: `src/app/beithady/inventory/rules/estimator/page.tsx`

- [ ] **Step 1: Read the existing landing matrix**

Open `src/app/beithady/inventory/rules/estimator/page.tsx` and locate the `<table>` that renders the `UNIT CONFIGURATIONS` section. Identify the existing `<th>` cells: CONFIGURATION, TIER, BEDROOMS, BATHROOMS, GUESTS, ITEMS, LISTINGS, TOTAL / CHECK-IN, PER GUEST.

- [ ] **Step 2: Add the MONTHLY NEED column header**

Insert a new `<th>` between `LISTINGS` and `TOTAL / CHECK-IN`:

```tsx
<th className="text-right py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
  Monthly need
  <span
    className="ml-1 text-slate-400 cursor-help"
    title="Whole packs to buy monthly across all line items. Source: manual override > 90-day Guesty avg > default 4 bookings/month."
  >
    ⓘ
  </span>
</th>
```

- [ ] **Step 3: Add the MONTHLY NEED cell per row**

In the row-rendering loop (where `summary.config.code`, `summary.listing_count`, etc. are rendered), insert a new cell between `LISTINGS` and `TOTAL / CHECK-IN`:

```tsx
<td className="text-right py-3 px-4 tabular-nums">
  <span className="font-semibold">{summary.monthly_need_total_packs}</span>
  <span className="text-slate-400 text-[10px] ml-1">packs</span>
  {summary.est_monthly_bookings_source === 'default_constant' && (
    <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">est. (no Guesty data)</div>
  )}
</td>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: success. If a TS error reports a missing `monthly_need_total_packs` on the summary type, confirm Task 3 step 4 was completed.

- [ ] **Step 5: Manual smoke**

Run: `npm run dev` and open http://localhost:3000/beithady/inventory/rules/estimator
Expected: table now shows a `Monthly need` column with integer pack counts. If a config has no Guesty 90-day reservations, an "est. (no Guesty data)" hint shows beneath the number.

- [ ] **Step 6: Commit + push**

```bash
git add src/app/beithady/inventory/rules/estimator/page.tsx
git commit -m "feat(inventory): matrix landing — Monthly need column"
git push origin claude/eager-johnson-cce95a:main
```

---

### Task 5: Procurement-first per-config detail rows + Monthly Need column

**Files:**
- Modify: `src/app/beithady/inventory/rules/estimator/[configId]/page.tsx`

- [ ] **Step 1: Read the existing per-config detail page**

Open `src/app/beithady/inventory/rules/estimator/[configId]/page.tsx`. Identify how `EstimatorLine[]` rows are rendered today (likely a `.map(line => ...)` over `output.lines`).

- [ ] **Step 2: Build a `LineRow` component (inline or new component)**

Replace the existing line-row rendering with a procurement-first layout. The primary line shows the SKU, UoM, and per-pack price. The secondary line shows the consumption math + line cost + monthly need:

```tsx
function LineRow({ line }: { line: EstimatorLine }) {
  const hasVolumetric = line.consumes_volume_value != null && line.consumes_volume_uom != null;
  const fractionalPacks = line.unit_cost_egp > 0 ? line.line_total_egp / line.unit_cost_egp : 0;

  return (
    <div className="border-b border-slate-200 dark:border-slate-700 py-3 px-2">
      {/* Primary: procurement view */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {line.amazon_eg_image_url && (
            <img src={line.amazon_eg_image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
          )}
          <span className="font-medium truncate">{line.item_name_en}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-500 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">{line.uom}</span>
        </div>
        <div className="text-right tabular-nums flex-shrink-0">
          <span className="font-semibold">{line.unit_cost_egp.toFixed(2)}</span>
          <span className="text-slate-400 text-[10px] ml-1">EGP/{line.uom}</span>
        </div>
      </div>

      {/* Secondary: consumption math */}
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-2">
        ↳ Consumes {hasVolumetric
          ? `${line.consumes_volume_value} ${line.consumes_volume_uom}`
          : `${line.base_qty} ${line.uom}`} per {formulaShort(line.formula_kind)}
        {' '}(= {fractionalPacks.toFixed(3)} {line.uom})
      </div>

      {/* Secondary: cost + monthly need */}
      <div className="text-[11px] text-slate-500 dark:text-slate-400 pl-2 flex items-center gap-3">
        <span>↳ Line cost: <span className="font-medium text-slate-700 dark:text-slate-200">{line.line_total_egp.toFixed(2)} EGP</span></span>
        <span>·</span>
        <span>Monthly need: <span className="font-medium text-slate-700 dark:text-slate-200">{line.monthly_need_packs} pack{line.monthly_need_packs === 1 ? '' : 's'}</span></span>
      </div>
    </div>
  );
}

function formulaShort(f: FormulaKind): string {
  switch (f) {
    case 'per_checkin': return 'check-in';
    case 'per_night': return 'night';
    case 'per_guest_per_night': return 'guest-night';
    case 'per_2_guests_per_night': return '2-guest-night';
    case 'fixed_per_stay': return 'stay';
    case 'per_bedroom_per_checkin': return 'bedroom · check-in';
    case 'per_bathroom_per_checkin': return 'bathroom · check-in';
    case 'per_guest_per_checkin': return 'guest · check-in';
    case 'fractional_per_checkin': return 'check-in (shared)';
  }
}
```

(Import `FormulaKind` and `EstimatorLine` from `@/lib/beithady/inventory/estimator-shared` at the top of the file.)

- [ ] **Step 3: Replace the existing row rendering with `<LineRow line={line} />`**

Wherever the existing page maps over `output.lines`, replace each row's rendering with `<LineRow key={line.item_id} line={line} />`.

- [ ] **Step 4: Add the "Monthly need" rollup near the top of the page**

If the page has a totals header (showing `total_per_checkin_egp`, `total_per_guest_egp`), add a third tile:

```tsx
<div className="ix-card p-4">
  <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Monthly procurement need</div>
  <div className="text-2xl font-semibold tabular-nums mt-1">
    {output.monthly_need_total_packs}
    <span className="text-slate-400 text-sm ml-1">packs</span>
  </div>
  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
    Based on {output.est_monthly_bookings_used} bookings/mo (
    {output.est_monthly_bookings_source === 'manual_override' && 'manual override'}
    {output.est_monthly_bookings_source === 'guesty_90d_avg' && '90-day Guesty avg'}
    {output.est_monthly_bookings_source === 'default_constant' && 'default — no Guesty data'}
    )
  </div>
</div>
```

- [ ] **Step 5: Build + smoke**

Run: `npm run build`
Then: `npm run dev` → http://localhost:3000/beithady/inventory/rules/estimator/<some-config-id>
Expected: rows render procurement-first with item name, UoM badge, EGP/pack price as the primary line. Below each row, two secondary lines show consumption math + monthly need. A "Monthly procurement need" tile appears at the top.

- [ ] **Step 6: Commit + push**

```bash
git add src/app/beithady/inventory/rules/estimator/[configId]/page.tsx
git commit -m "feat(inventory): matrix detail — procurement-first row layout + monthly need"
git push origin claude/eager-johnson-cce95a:main
```

---

### Task 6: Auto-issue cron writes both grains

**Files:**
- Modify: `src/lib/beithady/inventory/issue.ts:116-198`

- [ ] **Step 1: Extend `AutoIssueComputation` type**

Replace the existing `AutoIssueComputation` type at line ~116:

```typescript
export type AutoIssueComputation = {
  reservation_id: string;
  building_code: string;
  warehouse_id: string | null;
  lines: Array<{
    item_id: string;
    qty: number;                         // packs deducted from stock
    consumed_qty: number;                // M.17 — audit grain (mL, g, pcs)
    consumed_uom: string;                // M.17 — UoM of consumed_qty
    rule_id: string;
    formula_kind: string;
  }>;
};
```

- [ ] **Step 2: Update the rules SELECT to pull volumetric + item UoM data**

Replace the rules SELECT at line ~143:

```typescript
  // Find applicable rules + their items' volumetric + UoM data
  const { data: rulesRaw } = await sb
    .from('beithady_inventory_consumption_rules')
    .select(`
      id, scope, scope_value, item_id, formula_kind, qty, loss_factor_pct,
      consumes_volume_value, consumes_volume_uom,
      item:beithady_inventory_items(uom, pack_volume_value, pack_volume_uom)
    `)
    .eq('active', true);

  type RuleRow = {
    id: string; scope: string; scope_value: string | null;
    item_id: string; formula_kind: string; qty: number; loss_factor_pct: number;
    consumes_volume_value: number | null; consumes_volume_uom: string | null;
    item: { uom: string; pack_volume_value: number | null; pack_volume_uom: string | null } | null;
  };
  const all = (rulesRaw as RuleRow[] | null) || [];
```

- [ ] **Step 3: Compute both grains in the line-builder**

Replace the existing `Array.from(byItem.values()).map(r => { ... })` block at line ~172 with:

```typescript
  const lines = Array.from(byItem.values()).map(r => {
    let multiplier = 1;
    switch (r.formula_kind) {
      case 'per_guest_per_night': multiplier = reservation.guests * reservation.nights; break;
      case 'per_night': multiplier = reservation.nights; break;
      case 'per_2_guests_per_night': multiplier = Math.ceil(reservation.guests / 2) * reservation.nights; break;
      case 'per_checkin': multiplier = 1; break;
      case 'fixed_per_stay': multiplier = 1; break;
      default: multiplier = 1;
    }
    const lossMul = 1 + (Number(r.loss_factor_pct) / 100);

    // Volumetric path: rule has consumes_volume + item has pack_volume
    const itemPackValue = r.item?.pack_volume_value ?? null;
    const itemPackUom = r.item?.pack_volume_uom ?? null;
    const ruleConsumesValue = r.consumes_volume_value;
    const ruleConsumesUom = r.consumes_volume_uom;
    const itemUom = r.item?.uom ?? 'pcs';

    let qtyPacks: number;
    let consumedQty: number;
    let consumedUom: string;

    if (
      itemPackValue != null && itemPackUom != null &&
      ruleConsumesValue != null && ruleConsumesUom != null
    ) {
      // Volumetric: e.g., 100 mL consumed, 4 L pack → 0.025 packs
      const packsPerTrigger = unitsConsumedPerTrigger({
        consumes_value: ruleConsumesValue,
        consumes_uom: ruleConsumesUom,
        pack_value: itemPackValue,
        pack_uom: itemPackUom,
      });
      qtyPacks = packsPerTrigger * multiplier * lossMul;
      consumedQty = ruleConsumesValue * multiplier * lossMul;
      consumedUom = ruleConsumesUom;
    } else {
      // Legacy: rule.qty in pieces (or whatever item.uom is); just apply multipliers
      qtyPacks = Number(r.qty) * multiplier * lossMul;
      consumedQty = Number(r.qty) * multiplier * lossMul;
      consumedUom = itemUom;
    }

    return {
      item_id: r.item_id,
      qty: Math.ceil(qtyPacks * 100) / 100,
      consumed_qty: Math.ceil(consumedQty * 100) / 100,
      consumed_uom: consumedUom,
      rule_id: r.id,
      formula_kind: r.formula_kind,
    };
  });
```

Add the `unitsConsumedPerTrigger` import to the top of the file:

```typescript
import { unitsConsumedPerTrigger } from './volumetric';
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success. If `unitsConsumedPerTrigger` signature differs from above, check `src/lib/beithady/inventory/volumetric.ts:118` for the actual signature and adapt the call site.

- [ ] **Step 5: Commit (don't push yet — Task 7 finishes the cron path)**

```bash
git add src/lib/beithady/inventory/issue.ts
git commit -m "feat(inventory): auto-issue computes hybrid grain (consumed_qty + qty in packs)"
```

---

### Task 7: Cron route inserts hybrid grain into issue lines

**Files:**
- Modify: `src/app/api/cron/beithady-inventory-auto-issue/route.ts:98-106`

- [ ] **Step 1: Pass new fields into the lines insert**

Replace the `linesToInsert` block at line ~98 with:

```typescript
      const linesToInsert = computation.lines.map((l, i) => ({
        issue_id: header.id,
        line_no: i + 1,
        item_id: l.item_id,
        qty: l.qty,
        consumed_qty: l.consumed_qty,    // M.17
        consumed_uom: l.consumed_uom,    // M.17
        batch_no_picked: '__bulk__',
        note: `${l.formula_kind} (rule ${l.rule_id})`,
      }));
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Trigger the cron locally to verify**

Run the dev server (`npm run dev`), then in another terminal:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/beithady-inventory-auto-issue?force=1"
```

Expected: JSON response with `created`, `posted`, `errors[]` fields. If `errors` is non-empty, inspect.

- [ ] **Step 4: Verify both grains landed in the DB**

Via Supabase MCP:

```sql
SELECT issue_id, item_id, qty, consumed_qty, consumed_uom
FROM beithady_inventory_issue_lines
WHERE consumed_qty IS NOT NULL
ORDER BY id DESC
LIMIT 5;
```

Expected: rows with three populated values — for a volumetric item, `consumed_qty=100, consumed_uom='mL', qty=0.025`. For a pure-count item, `consumed_qty=qty, consumed_uom=item.uom`.

- [ ] **Step 5: Commit + push (Tasks 6 + 7 together)**

```bash
git add src/app/api/cron/beithady-inventory-auto-issue/route.ts
git commit -m "feat(inventory): cron writes hybrid issue lines (audit grain + pack grain)"
git push origin claude/eager-johnson-cce95a:main
```

---

### Task 8: Rule form auto-defaults consumes_volume_uom from item

**Files:**
- Modify: `src/app/beithady/inventory/rules/_components/rule-form-button.tsx`

- [ ] **Step 1: Read the existing rule form**

Open `src/app/beithady/inventory/rules/_components/rule-form-button.tsx`. Find the `consumes_volume_uom` dropdown around line ~178 and the item-selection dropdown (likely earlier in the form).

- [ ] **Step 2: Pass items list with pack_volume_uom into the component**

If the rule form receives an `items` prop containing the catalog rows, ensure the item type includes `pack_volume_value` and `pack_volume_uom`. If not, extend the prop type:

```typescript
type RuleFormItem = {
  id: string;
  sku: string;
  name_en: string;
  uom: string;
  pack_volume_value: number | null;
  pack_volume_uom: string | null;
};
```

Confirm the parent page passes these fields when rendering the form. If not, update the parent's SELECT to include them (`pack_volume_value, pack_volume_uom`).

- [ ] **Step 3: Auto-default `consumes_volume_uom` when item changes**

Inside the form's item-selection handler (whatever updates `form.item_id`), add:

```typescript
function pickItem(itemId: string) {
  const item = items.find(i => i.id === itemId);
  if (!item) {
    update('item_id', itemId);
    return;
  }
  setForm(f => ({
    ...f,
    item_id: itemId,
    // Auto-default consumes_volume_uom from item's pack_volume_uom (Q3)
    // Only if the operator hasn't already set a UoM manually for this rule
    consumes_volume_uom: f.consumes_volume_uom || item.pack_volume_uom || (f.consumes_volume_value != null ? 'pcs' : null),
  }));
}
```

Wire this into the item dropdown's `onChange` (replacing the existing simple `update('item_id', e.target.value)` call).

- [ ] **Step 4: Add a helper hint under the UoM dropdown**

Just below the `consumes_volume_uom` dropdown, add a one-line hint that explains why a default was chosen:

```tsx
{form.item_id && (() => {
  const item = items.find(i => i.id === form.item_id);
  if (item?.pack_volume_uom && form.consumes_volume_uom === item.pack_volume_uom) {
    return <span className="text-[10px] text-slate-400">Defaulted from item&apos;s pack ({item.pack_volume_value} {item.pack_volume_uom}); change if you measure consumption in a compatible unit (e.g., {item.pack_volume_uom === 'L' ? 'mL' : 'g'}).</span>;
  }
  return null;
})()}
```

- [ ] **Step 5: Validate UoM compatibility at save**

Find the form's submit handler (likely `handleSubmit`) and add a pre-submit check:

```typescript
import { areUomsCompatible } from '@/lib/beithady/inventory/volumetric';

// Inside handleSubmit, before the action call:
if (form.consumes_volume_uom && form.item_id) {
  const item = items.find(i => i.id === form.item_id);
  if (item?.pack_volume_uom && !areUomsCompatible(form.consumes_volume_uom, item.pack_volume_uom)) {
    setError(`Rule UoM "${form.consumes_volume_uom}" is incompatible with item's pack UoM "${item.pack_volume_uom}". Pick a compatible UoM (same dimensional family).`);
    return;
  }
}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Manual smoke**

Run: `npm run dev` and open http://localhost:3000/beithady/inventory/rules
- Add a new rule, select a volumetric item (e.g., the 4 L cleaner): the `consumes_volume_uom` dropdown auto-defaults to `L` with a hint "Defaulted from item's pack (4 L)..."
- Try to set `consumes_volume_uom = 'kg'` and save: the form blocks with the incompatibility message
- Switch back to `mL` and save: succeeds

- [ ] **Step 8: Commit + push**

```bash
git add src/app/beithady/inventory/rules/_components/rule-form-button.tsx
git commit -m "feat(inventory): rule form auto-defaults consumes_volume_uom from item + UoM compat check"
git push origin claude/eager-johnson-cce95a:main
```

---

### Task 9: Item form 4-block procurement-first layout

**Files:**
- Modify: `src/app/beithady/inventory/items/_components/item-form-button.tsx`

- [ ] **Step 1: Read the existing form**

Open `src/app/beithady/inventory/items/_components/item-form-button.tsx`. The current modal renders fields in roughly the order: SKU, Brand, Name (EN/AR), Category, UoM, Currency, Min/Max/Reorder qty, Cost, Pack Volume Value/UoM, Barcode, Description, toggles. We're going to reorganize into 4 visual blocks.

- [ ] **Step 2: Add a `Block` helper component at the bottom of the file**

Add this near the existing `Field` and `Toggle` helpers:

```tsx
function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-2">
        {label}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Restructure the form's body**

Inside the `<form onSubmit={handleSubmit} ...>` element, replace the existing flat layout with four `<Block>` wrappers in this order:

```tsx
<Block label="Identification">
  <div className="grid grid-cols-2 gap-3">
    <Field label="SKU" required>
      <input type="text" value={form.sku} onChange={e => update('sku', e.target.value)} required minLength={2} className="ix-input w-full font-mono" placeholder="CON-TR-FINE12" />
    </Field>
    <Field label="Brand">
      <input type="text" value={form.brand || ''} onChange={e => update('brand', e.target.value || null)} className="ix-input w-full" placeholder="Fine" />
    </Field>
  </div>
  <div className="grid grid-cols-2 gap-3">
    <Field label="Name (EN)" required>
      <input type="text" value={form.name_en} onChange={e => update('name_en', e.target.value)} required className="ix-input w-full" />
    </Field>
    <Field label="الاسم (عربي)" required>
      <input type="text" value={form.name_ar} onChange={e => update('name_ar', e.target.value)} required dir="rtl" className="ix-input w-full" />
    </Field>
  </div>
  <Field label="Barcode">
    <input type="text" value={form.barcode || ''} onChange={e => update('barcode', e.target.value || null)} className="ix-input w-full font-mono" />
  </Field>
</Block>

<Block label="Procurement (how it's bought)">
  <div className="grid grid-cols-2 gap-3">
    <Field label="Category" required>
      <select value={form.category_id} onChange={e => pickCategory(e.target.value)} required className="ix-input w-full">
        {categories.map(c => <option key={c.id} value={c.id}>{c.name_en}</option>)}
      </select>
    </Field>
    <Field label="UoM (how it's sold)" required>
      <select value={form.uom} onChange={e => update('uom', e.target.value)} required className="ix-input w-full">
        {uoms.map(u => <option key={u.code} value={u.code}>{u.code} — {u.name_en}</option>)}
      </select>
    </Field>
  </div>
  <Field label="Pack contents">
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="0"
        step="0.01"
        value={form.pack_volume_value ?? ''}
        onChange={e => update('pack_volume_value', e.target.value ? parseFloat(e.target.value) : null)}
        className="ix-input w-32"
        placeholder="e.g. 4 for a 4 kg pack"
      />
      <select
        value={form.pack_volume_uom ?? ''}
        onChange={e => update('pack_volume_uom', e.target.value || null)}
        className="ix-input w-40"
      >
        <option value="">— select —</option>
        {uoms.map(u => <option key={u.code} value={u.code}>{u.code} — {u.name_en}</option>)}
      </select>
    </div>
    <span className="block text-[10px] text-slate-400 mt-1">
      For items sold by volume, weight, or as a multi-pack. Example: 4 L cleaner bottle, 3 sponges per pack, 250 g detergent box. Leave both blank for unitary items (towels, single sponges).
    </span>
  </Field>
  <Field label={`Cost / pack (${form.currency})`}>
    <input type="number" min="0" step="0.01" value={form.default_cost_egp} onChange={e => update('default_cost_egp', parseFloat(e.target.value) || 0)} className="ix-input w-full" />
  </Field>
</Block>

<Block label="Stock control">
  <div className="grid grid-cols-3 gap-3">
    <Field label="Min qty (packs)">
      <input type="number" min="0" step="0.01" value={form.min_qty} onChange={e => update('min_qty', parseFloat(e.target.value) || 0)} className="ix-input w-full" />
    </Field>
    <Field label="Max qty (packs)">
      <input type="number" min="0" step="0.01" value={form.max_qty ?? ''} onChange={e => update('max_qty', e.target.value ? parseFloat(e.target.value) : null)} className="ix-input w-full" />
    </Field>
    <Field label="Reorder qty (packs)">
      <input type="number" min="0" step="0.01" value={form.reorder_qty ?? ''} onChange={e => update('reorder_qty', e.target.value ? parseFloat(e.target.value) : null)} className="ix-input w-full" />
    </Field>
  </div>
  <div className="grid grid-cols-2 gap-2">
    <Toggle label="Batch tracked" value={form.batch_tracked} onChange={v => update('batch_tracked', v)} />
    <Toggle label="Expiry tracked" value={form.expiry_tracked} onChange={v => update('expiry_tracked', v)} />
  </div>
</Block>

<Block label="Classification">
  <div className="grid grid-cols-2 gap-2">
    <Toggle label="Owner billable" value={form.owner_billable} onChange={v => update('owner_billable', v)} />
    <Toggle label="Asset (V2)" value={form.is_asset} onChange={v => update('is_asset', v)} />
  </div>
  <Field label="Description">
    <textarea value={form.description || ''} onChange={e => update('description', e.target.value || null)} rows={2} className="ix-input w-full" />
  </Field>
</Block>
```

(Keep the existing error display and submit/cancel button row outside the Blocks, at the bottom of the form.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Manual smoke**

Run: `npm run dev` → http://localhost:3000/beithady/inventory/items
- Click "Add item": modal renders 4 visual blocks in order Identification → Procurement → Stock control → Classification
- Click Edit on a volumetric item (e.g., a 4 L cleaner): "Pack contents" shows `4` and `L` pre-filled with the helper text below
- Click Edit on a unitary item (e.g., a single sponge SKU): "Pack contents" is blank
- Save edits to a test item: changes persist correctly (no regressions vs. the old layout)

- [ ] **Step 6: Commit + push**

```bash
git add src/app/beithady/inventory/items/_components/item-form-button.tsx
git commit -m "feat(inventory): item form 4-block procurement-first layout (Identification / Procurement / Stock / Classification)"
git push origin claude/eager-johnson-cce95a:main
```

---

### Task 10: Final integration smoke + ship handoff

**Files:**
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 1: Run full type-check + build**

Run: `npm run build`
Expected: clean build, no errors.

- [ ] **Step 2: End-to-end manual smoke against dev server**

Run: `npm run dev`, then walk through:
1. `/beithady/inventory/items` — open Edit on a volumetric item, see 4-block layout, "Pack contents" pre-filled. Save.
2. `/beithady/inventory/rules` — add a new rule for a volumetric item; UoM dropdown auto-defaults; incompatibility check rejects bad UoMs.
3. `/beithady/inventory/rules/estimator` — landing matrix shows MONTHLY NEED column.
4. `/beithady/inventory/rules/estimator/<config-id>` — detail page shows procurement-first rows with Monthly Need; top tile shows Monthly procurement need with source attribution.
5. Trigger cron: `curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/beithady-inventory-auto-issue?force=1"` — Supabase MCP confirms `consumed_qty/uom + qty` all populated on new issue lines.

- [ ] **Step 3: Update SESSION_HANDOFF.md**

Add a new "🟢 Latest turn" section at the top documenting:
- Migration 0077 applied
- 8 modified files for procurement-first restructure
- Verified via build + dev server smoke + Supabase MCP
- Commit SHAs of each task's commit

- [ ] **Step 4: Commit + push handoff**

```bash
git add SESSION_HANDOFF.md
git commit -m "docs: handoff — inventory procurement-first restructure shipped"
git push origin claude/eager-johnson-cce95a:main
```

- [ ] **Step 5: Verify Vercel deploy**

Wait for Vercel's GitHub integration to mark the latest commit READY (typically 60-120s). Open the prod URL and re-run the same smoke checks from Step 2 against prod.

If anything regresses in prod, revert with `git revert <sha>` + push, then debug.

---

## Self-review

**Spec coverage check:** Each spec section maps to a task —
- §5.1 (already shipped) → no task needed
- §5.2 (new schema) → Task 1
- §6 (item form 4-block) → Task 9
- §7.1 (per-config detail) → Task 5
- §7.2 (landing matrix) → Task 4
- §7.3 (est_monthly_bookings resolution) → Task 3 (helper)
- §8 (auto-issue Q5C) → Task 6 (computation) + Task 7 (cron insert)
- §9 (rule form Q3) → Task 8
- §10 (mismatch banner) → no task needed (already covers pack_volume)
- §11 (GRN restate) → no task needed (already shipped)
- §12 (migration) → Task 1
- §13 (files touched) → matches task file lists
- §14 (testing strategy) → Task 10 (smoke); no test framework, so verification is `npm run build` + manual + Supabase MCP throughout

**Placeholder scan:** No "TBD", "TODO", "fill in", or vague "add appropriate X" steps. Each step has either real SQL, real code blocks, or a real command with expected output.

**Type consistency check:**
- `monthly_need_packs` (number) appears in Task 2 (type extension), Task 3 (population), Task 4 (consumer reads `summary.monthly_need_total_packs`), Task 5 (consumer reads `line.monthly_need_packs`). Names match.
- `consumed_qty / consumed_uom` columns added in Task 1; type added to `AutoIssueComputation` in Task 6 step 1; populated in Task 6 step 3; inserted in Task 7 step 1. Names match.
- `est_monthly_bookings_source` enum literal `'manual_override' | 'guesty_90d_avg' | 'default_constant'` appears in Task 2 (type), Task 3 (population), Task 4 (UI render), Task 5 (UI render). Values match.
- `unitsConsumedPerTrigger` from `volumetric.ts` — Task 6 imports it. The signature in `volumetric.ts:118` may differ from the call site; Task 6 step 4 explicitly says to check and adapt.
- `areUomsCompatible` from `volumetric.ts` — Task 8 imports it. Signature is `(a, b: string | null | undefined) => boolean`, used in Task 8 step 5 with two strings. Match.

No issues found. Plan ready for execution.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-inventory-procurement-restructure.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
