# KIKA Reporting module + Picker Report — design

**Date:** 2026-05-16
**Author:** Claude + kareem (brainstorm session)
**Status:** Draft → awaiting kareem approval before writing implementation plan

## 1. Summary

Adds two things to the KIKA module:

1. A new **Reporting** hub page at `/emails/kika/reporting`. Card-style index that groups links to existing dashboards (Exec, Sales, To Manufacture, Delayed, Daily Report, Financials) and hosts the new Picker Report as a featured tile.
2. A new **Picker Report** at `/emails/kika/reporting/picker`. Ops-facing report that buckets open unfulfilled orders by distinct line-item count (1 / 2 / 3 / 4+) and lists the most common items in the unfulfilled backlog. Exportable as an A4 PDF for the warehouse.

No changes to the data layer. All reads happen against the existing `shopify_orders` / `shopify_line_items` / `shopify_products` mirror tables. Re-uses the order-detail modal (`OrderNumberButton`) and the `@react-pdf/renderer` pattern already established by the Manufacturing PDF.

## 2. Decisions locked in

| Decision | Choice |
|---|---|
| Workflow | Print/export pick list (no in-app fulfilling actions) |
| Bucket definition | Distinct line items (SKUs), not total units |
| Stock filter | Include ALL open orders regardless of stock — KIKA's `inventory_quantity` is unreliable |
| Most-common items grouping | Product list with expandable variants underneath |
| Time scope | Default to all open backlog; optional filter chips for "Older than 7d / 14d / This week only" |
| Page structure | Card hub (Approach A) — matches existing KIKA hub pattern |
| Theme | Reuse existing KIKA tokens — no new colors, no new gradients |

## 3. Reporting hub page — `/emails/kika/reporting`

Server component. Static layout, no data fetching needed beyond the page itself rendering.

**Layout (top to bottom):**

1. **TopNav breadcrumb:** `KIKA › Reporting`.
2. **Page header:** `<h1>Reporting</h1>` with a slate-500 sub-line "Operational reports and links to deeper analytics".
3. **Featured card — Picker Report.** Indigo accent (same family as the To Manufacture tile on Exec). White `ix-card` body, indigo icon, "NEW · OPS" tag. Links to `/emails/kika/reporting/picker`. Larger than the link cards beneath (full-width or 2-col span).
4. **Section label:** "Existing dashboards" (small uppercase slate-500).
5. **Link cards grid** (2-col): six cards linking to existing surfaces. Each card uses the same colored icon family as the destination page:

| Card | Color | Destination |
|---|---|---|
| Executive Summary | amber | `/emails/kika/exec` |
| Sales Intelligence | emerald | `/emails/kika/sales` |
| To Manufacture | indigo | `/emails/kika/exec?focus=manufacturing` (deep-link) |
| Delayed Orders | rose | `/emails/kika/exec?focus=delayed` (deep-link) |
| Daily Performance Report | slate | `/emails/kika/setup` (history sub-link) |
| Financials | violet | `/emails/kika/financials` |

**Auth:** inherited from `src/app/emails/kika/layout.tsx` (`requireDomainAccess('kika')`).

## 4. Picker Report page — `/emails/kika/reporting/picker`

Server component fetches the report; client child components handle expand state.

**Layout (top to bottom):**

1. **TopNav breadcrumb:** `KIKA › Reporting › Picker Report`.
2. **Header row:** `<h1>Picker Report</h1>` on the left, "Export A4 PDF" button on the right (indigo, links to `/api/kika/picker-report?scope=<current>`).
3. **Filter strip (server-rendered chips):** "All open backlog" (default) · "Older than 7d" · "Older than 14d" · "This week only". Implemented as `<Link>` chips with `?scope=` query param, same pattern as the Exec `PeriodFilter`.
4. **Headline stats** (4 BigStat cards, reuse the Exec `BigStat` style or inline equivalent):
   - Open orders
   - Total lines — sum of remaining line items across all open orders (a SKU on 9 orders counts as 9). This is "how many picker stops total", not "how many unique SKUs".
   - Total units (sum of qty across all open orders, post partial-netting)
   - Oldest backlog age (days)
5. **Fulfillment buckets table** — client component for the expand-state. Rows: `1 line`, `2 lines`, `3 lines`, `4+ lines`. Empty buckets are hidden. Columns:
   - Bucket pill
   - Orders (right-aligned)
   - Total units (right-aligned)
   - Oldest order age (right-aligned)
   - "view orders" expand toggle

   When expanded, an inline panel under the bucket row shows that bucket's orders, each rendered as:
   `<OrderNumberButton orderId orderName>` · customer name · age · inline list of `qty × Product · Variant (SKU)`.
   Order# click opens the existing order detail modal.
6. **Most common items table** — client component for the expand-state. Top row is a column header (`Product / Variant`, `SKU`, `Orders`, `Units`, `Variants`). Each product row shows thumbnail + product title + truncated description, totals across all variants, plus the count of variants. Click → expands variant rows underneath, indented, each with variant title + SKU + per-variant orders/units.

**Auth:** inherited.

## 5. A4 PDF format — `/api/kika/picker-report`

`@react-pdf/renderer`, same pattern as `kika-manufacturing-pdf.tsx`. A4 portrait. Streams as `application/pdf` with `Content-Disposition: inline; filename="kika-picker-report-YYYY-MM-DD.pdf"`.

**Page layout:**

1. **Fixed header strip** (every page): `KIKA · PICKER REPORT` brand line, `Orders to fulfill` title, right-aligned scope label and generated-at timestamp. Indigo divider line below.
2. **Headline totals strip** (4 cards, first page only): Open orders / Total lines / Total units / Oldest. Same indigo light-bg cards as the Manufacturing PDF.
3. **Fulfillment buckets section:**
   - Section title `Fulfillment buckets — all open orders` (or filtered scope label).
   - For each non-empty bucket, an indigo bucket-header strip showing `1-line orders · 28 orders · 32 units` style summary.
   - Below the bucket header, one row per order:
     - Left: order# (indigo bold)
     - Middle: customer name (bold) on line 1, then each line item on its own sub-line as `qty × Product · Variant (SKU)`
     - Right: age in days
   - Orders inside a bucket sorted oldest-first.
4. **Most common items section** (each product row uses `wrap={false}` so a single product+description block never splits across pages; new pages flow naturally when the cursor runs out of room):
   - Section title `Most common items in unfulfilled orders`.
   - Two-column-ish layout: Product/Variant · SKU · Orders · Units.
   - Product rows are bold; variant rows indented with `· ` prefix and a muted background.
5. **Fixed footer** (every page): brand line + scope on the left, `Page N of M` on the right. Auto-generated via `render={({pageNumber,totalPages}) => …}`.

Edge case: if `report.totals.open_orders === 0`, the bucket and items sections render placeholder text `Nothing open in this scope`.

## 6. Data model

### Builder return shape

```ts
// src/lib/kika-picker.ts
export type PickerScope = 'all' | 'older_than_7d' | 'older_than_14d' | 'this_week';

export type PickerOrderLine = {
  qty: number;            // remaining qty after partial-fulfillment netting
  product_title: string;
  variant_title: string | null;
  sku: string | null;
};

export type PickerOrder = {
  id: number;
  name: string;           // e.g. "#19005"
  customer_name: string | null;
  email: string | null;
  created_at: string | null;
  age_days: number | null;
  remaining_line_count: number;   // post-netting
  remaining_unit_count: number;
  lines: PickerOrderLine[];
};

export type PickerBucket = {
  key: 1 | 2 | 3 | 4;     // 4 means "4+"
  label: string;          // "1 line" | "2 lines" | "3 lines" | "4+ lines"
  orders: PickerOrder[];  // sorted oldest-first
  total_orders: number;
  total_units: number;
  oldest_age_days: number | null;
};

export type PickerCommonVariant = {
  variant_id: number | null;
  variant_title: string | null;
  sku: string | null;
  orders: number;
  units: number;
};

export type PickerCommonItem = {
  product_id: number;
  product_title: string;
  short_description: string | null;
  image_url: string | null;
  variants: PickerCommonVariant[];  // sorted by units desc
  total_orders: number;
  total_units: number;
};

export type PickerReport = {
  scope: PickerScope;
  scope_label: string;
  generated_at: string;
  totals: {
    open_orders: number;
    total_lines: number;
    total_units: number;
    oldest_age_days: number | null;
  };
  buckets: PickerBucket[];          // empty buckets omitted
  common_items: PickerCommonItem[]; // sorted by total_orders desc
};
```

## 7. Builder algorithm

`buildKikaPickerReport({ scope }): Promise<PickerReport>`

1. **Pull open orders.** Same WHERE clause as the Manufacturing builder, plus scope filter:
   - `cancelled_at IS NULL`
   - `fulfillment_status` ∈ {null, '', 'unfulfilled', 'partial', 'partially_fulfilled', 'partially-fulfilled'}
   - `financial_status` ∉ {'voided', 'cancelled'}
   - Scope filters added on top of the WHERE:
     - `all` → no date filter
     - `older_than_7d` → `created_at < (now - 7 days)`
     - `older_than_14d` → `created_at < (now - 14 days)`
     - `this_week` → `created_at >= (start of current ISO week, Africa/Cairo midnight)`
   - Select `id, name, customer_name, email, created_at, fulfillment_status, financial_status, cancelled_at, raw` (need `raw` for fulfillments[]).

2. **Pull line items** for those order ids: `id, order_id, product_id, variant_id, title, name, sku, quantity`.

3. **Pull products** for distinct product_ids appearing in those line items: `id, title, raw` (need `raw` for description, primary image, variant info).

4. **Build `fulfilledByLineItemId` map** from each order's `raw.fulfillments[].line_items[]` (skip status=cancelled/failure). Identical to the existing Manufacturing builder.

5. **For each order, project to `PickerOrder`:**
   - For each line item: `remaining = max(0, quantity - fulfilledByLineItemId.get(line_id))`.
   - Drop lines with `remaining === 0`.
   - If all lines are dropped, skip the order entirely (its `fulfillment_status` should be `fulfilled` but defensively we still skip).
   - `remaining_line_count` = surviving line count.
   - `remaining_unit_count` = sum of `remaining` across surviving lines.
   - Per line, look up product info (title, variant title via `pickVariantTitle`, sku fallback to variant.sku).
   - `age_days` = days since `created_at`.

6. **Bucket the orders.** For each order, `bucketKey = min(4, remaining_line_count)`. Group into `buckets[1..4]`. Sort each bucket's orders by `created_at` ascending. Drop empty buckets.

7. **Build `common_items` rollup.** For each surviving (order, line) pair where `product_id != null`:
   - Increment `commonItemMap[product_id].variants[variant_id].units += remaining`
   - Increment `commonItemMap[product_id].variants[variant_id].orders` by 1 *if first occurrence in this order*
   - Track per-product `total_orders` (distinct orders containing this product) and `total_units` (sum across variants).
   - For each product row: enrich with `title`, `body_html` stripped → `short_description`, primary image.
   - Sort variants within a product by `units` desc.
   - Sort the products array by `total_orders` desc, then `total_units` desc.

8. **Totals:**
   - `open_orders` = orders array length (post-drop-empty).
   - `total_lines` = sum of `remaining_line_count`.
   - `total_units` = sum of `remaining_unit_count`.
   - `oldest_age_days` = max `age_days` across orders.

9. **Return.**

## 8. File / module layout

### New files

| Path | Purpose |
|---|---|
| `src/lib/kika-picker.ts` | Builder + types (`buildKikaPickerReport`, all the `Picker*` exports above). Imports `pickVariantTitle`, `pickProductImage`, `stripHtml` patterns from the existing Manufacturing builder — extract them into a shared `kika-shopify-helpers.ts` only if duplication becomes painful, otherwise inline. |
| `src/lib/kika-picker-pdf.tsx` | A4 `@react-pdf/renderer` document, mirrors `kika-manufacturing-pdf.tsx`. |
| `src/app/api/kika/picker-report/route.ts` | GET → calls builder → renders via `renderToBuffer` → returns `application/pdf`. Auth `requireDomainAccess('kika')`. |
| `src/app/emails/kika/reporting/page.tsx` | Server component, the hub. |
| `src/app/emails/kika/reporting/picker/page.tsx` | Server component, fetches report, lays out the page. |
| `src/app/emails/kika/reporting/picker/_components/buckets-block.tsx` | `'use client'`, renders bucket rows + expand state for the inline orders panel. |
| `src/app/emails/kika/reporting/picker/_components/common-items-block.tsx` | `'use client'`, renders product rows + expand state for variant breakdown. |

### Modified files

| Path | Change |
|---|---|
| `src/app/emails/[domain]/page.tsx` | Inside the `d === 'kika'` block, add a 6th card linking to `/emails/kika/reporting`. Indigo accent (icon `Factory` or `ClipboardList`). Slot at the end of the grid after Inventory. |

### Reused (no changes)

- `OrderNumberButton` + `OrderDetailModal` (the click target inside bucket-expanded views).
- `requireDomainAccess('kika')` via the existing kika layout.
- `@react-pdf/renderer` infrastructure (no new deps).

## 9. Edge cases

| Case | Behavior |
|---|---|
| All lines on an order fully shipped (partial → effectively fulfilled) | Order skipped entirely from buckets and common-items rollup. |
| Free-text line items (no `product_id`) | Counted in bucket line-count, excluded from common-items rollup (same as Manufacturing). |
| Variant whose product row is missing from `shopify_products` | Bucket still gets the order; common-items row uses line-item title as fallback. |
| `oldest_age_days` over 365 | Render as "365+d" in PDF and on screen to prevent layout blow-up. (Doesn't actually happen at current scale, but defensive.) |
| Empty backlog at the chosen scope | On-screen page renders "Nothing open in this scope" empty state. PDF still generates with empty bucket and common-items sections both showing the empty placeholder. |
| Filter switches mid-session | Scope is a query param, page is server-rendered, so switching chips reloads the page with the new scope. PDF link query param is rebuilt from the current scope. |

## 10. Out of scope (future)

- In-app fulfillment actions (mark fulfilled, print picking slip per order). User explicitly chose "print/export only" for v1.
- CSV export. PDF only for v1.
- Per-bucket separate PDF download. Single combined PDF for v1.
- Daily auto-email of the picker report. Possible future addition by piggy-backing on the existing 09:00 Cairo daily-report cron, but out of scope here.
- Stock-aware "fulfillable now" toggle. User chose to ignore stock.
- Bilingual / Arabic labels in the PDF. Helvetica-only for v1.

## 11. Open questions

None remaining at design time. All clarifying questions answered in §2.

## 12. Acceptance criteria

- `/emails/kika/reporting` renders the hub with the 6 link cards + featured Picker Report card. Each link goes to the right destination (and the two deep-links land on the right `?focus=` drill-down).
- `/emails/kika/reporting/picker` renders the page with filter chips, headline stats, buckets, and common items. Filter chips switch the displayed data. Empty buckets are hidden. Order# click opens the existing order detail modal.
- `/api/kika/picker-report?scope=all` returns an A4 PDF that opens inline in the browser. The PDF contains the totals strip, every bucket with every order listed (no truncation), and the full most-common-items table. Page numbers in the footer.
- `tsc --noEmit` is clean.
- `next build` is green.
