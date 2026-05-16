# KIKA Reporting module + Picker Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Reporting hub page and Picker Report (with A4 PDF export) under the KIKA module.

**Architecture:** Server-rendered Next 16 App Router pages under `/emails/kika/reporting/*`. One pure-data builder in `src/lib/kika-picker.ts` (vitest-testable helpers for scope resolution, bucket assignment, and line netting). PDF rendered via `@react-pdf/renderer` (same engine as the existing Manufacturing PDF). Client components only where expand state is needed.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Supabase service-role client · `@react-pdf/renderer` · Vitest.

**Spec:** `docs/superpowers/specs/2026-05-16-kika-reporting-picker-design.md`

**Conventions this project follows (override the default skill steps where they conflict):**
- No branches / no PRs — commit straight to `main`, push, Vercel auto-deploys via GitHub integration.
- No `lint` script. The build gates are `npx tsc --noEmit` and `npx next build`.
- Tests are colocated `*.test.ts`. Existing pages and PDF docs in this codebase have **no tests** (see `kika-manufacturing.ts`, `kika-manufacturing-pdf.tsx`, all KIKA pages) — we test only the pure helpers in the builder, matching the existing rhythm.
- Update `SESSION_HANDOFF.md` on every meaningful turn (Stop hook enforced).

---

## File structure

### Create

| Path | Responsibility |
|---|---|
| `src/lib/kika-picker.ts` | Builder + exported types. Three small exported pure helpers (`resolveScope`, `bucketKey`, `netRemaining`) plus the main `buildKikaPickerReport({scope})` function. |
| `src/lib/kika-picker.test.ts` | Vitest unit tests for the three pure helpers. No DB mocks; tests are pure. |
| `src/lib/kika-picker-pdf.tsx` | `@react-pdf/renderer` A4 document. Mirrors `kika-manufacturing-pdf.tsx` structure. |
| `src/app/api/kika/picker-report/route.ts` | GET → calls builder → `renderToBuffer` → streams `application/pdf`. `requireDomainAccess('kika')`. |
| `src/app/emails/kika/reporting/page.tsx` | Server component, the hub (6 link cards + featured Picker card). |
| `src/app/emails/kika/reporting/picker/page.tsx` | Server component, fetches the report and renders filter chips, headline stats, buckets block, common-items block. |
| `src/app/emails/kika/reporting/picker/_components/buckets-block.tsx` | `'use client'`, expand state for "view orders" rows. Reuses `OrderNumberButton`. |
| `src/app/emails/kika/reporting/picker/_components/common-items-block.tsx` | `'use client'`, expand state for product → variants. |

### Modify

| Path | Change |
|---|---|
| `src/app/emails/[domain]/page.tsx` | Inside `d === 'kika'` block, add a 6th tile linking to `/emails/kika/reporting`. |

### Reused without change

- `OrderNumberButton` (`src/app/emails/kika/exec/_components/order-number-button.tsx`)
- `OrderDetailModal` (`src/app/emails/kika/exec/_components/order-detail-modal.tsx`)
- `requireDomainAccess('kika')` via existing `src/app/emails/kika/layout.tsx`
- Supabase service-role client `supabaseAdmin()`

---

## Task 1: Picker builder — pure helpers (TDD)

**Files:**
- Create: `src/lib/kika-picker.ts`
- Test: `src/lib/kika-picker.test.ts`

The three pure helpers (`resolveScope`, `bucketKey`, `netRemaining`) plus the exported `PickerScope` type. The full `buildKikaPickerReport` comes in Task 2.

- [ ] **Step 1: Write the failing test file**

Create `src/lib/kika-picker.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveScope, bucketKey, netRemaining } from './kika-picker';

describe('resolveScope', () => {
  const NOW = new Date('2026-05-16T12:00:00Z');

  it('returns null fromDate for "all"', () => {
    expect(resolveScope('all', NOW)).toEqual({ fromDate: null, label: 'All open backlog' });
  });

  it('subtracts 7 days for "older_than_7d" and labels it', () => {
    expect(resolveScope('older_than_7d', NOW)).toEqual({
      // 14d/7d filters mean created_at < now - Nd, so we expose this as `toDate`
      // semantically, but the helper uses `before` to stay precise.
      fromDate: null,
      toDate: '2026-05-09',
      label: 'Older than 7 days',
    });
  });

  it('subtracts 14 days for "older_than_14d"', () => {
    expect(resolveScope('older_than_14d', NOW)).toEqual({
      fromDate: null,
      toDate: '2026-05-02',
      label: 'Older than 14 days',
    });
  });

  it('returns start-of-ISO-week for "this_week" (Mon = week start)', () => {
    // 2026-05-16 is a Saturday. ISO week starts Monday → 2026-05-11.
    expect(resolveScope('this_week', NOW)).toEqual({
      fromDate: '2026-05-11',
      toDate: null,
      label: 'This week',
    });
  });
});

describe('bucketKey', () => {
  it('maps 1 → 1', () => { expect(bucketKey(1)).toBe(1); });
  it('maps 2 → 2', () => { expect(bucketKey(2)).toBe(2); });
  it('maps 3 → 3', () => { expect(bucketKey(3)).toBe(3); });
  it('clamps 4 → 4', () => { expect(bucketKey(4)).toBe(4); });
  it('clamps 99 → 4', () => { expect(bucketKey(99)).toBe(4); });
  it('clamps 0 → 1 (defensive — should not happen since 0-line orders are dropped)', () => {
    expect(bucketKey(0)).toBe(1);
  });
});

describe('netRemaining', () => {
  it('returns full qty when nothing has been fulfilled', () => {
    expect(netRemaining(3, 0)).toBe(3);
  });
  it('subtracts fulfilled qty', () => {
    expect(netRemaining(3, 1)).toBe(2);
  });
  it('returns 0 when fully fulfilled', () => {
    expect(netRemaining(3, 3)).toBe(0);
  });
  it('clamps to 0 when over-fulfilled (defensive)', () => {
    expect(netRemaining(3, 5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx vitest run src/lib/kika-picker.test.ts
```

Expected: FAIL with `Cannot find module './kika-picker'` (or similar).

- [ ] **Step 3: Implement `kika-picker.ts` with the helpers and exported types**

Create `src/lib/kika-picker.ts`:

```ts
import 'server-only';

// Type exports (full builder implementation comes in Task 2).

export type PickerScope = 'all' | 'older_than_7d' | 'older_than_14d' | 'this_week';

export type PickerOrderLine = {
  qty: number;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
};

export type PickerOrder = {
  id: number;
  name: string;
  customer_name: string | null;
  email: string | null;
  created_at: string | null;
  age_days: number | null;
  remaining_line_count: number;
  remaining_unit_count: number;
  lines: PickerOrderLine[];
};

export type PickerBucket = {
  key: 1 | 2 | 3 | 4;
  label: string;
  orders: PickerOrder[];
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
  variants: PickerCommonVariant[];
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
  buckets: PickerBucket[];
  common_items: PickerCommonItem[];
};

// ----- Pure helpers -----

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Resolves a scope choice to date bounds and a human label.
 * - `all`: no date filter
 * - `older_than_7d`: orders created strictly before (now − 7 days)
 * - `older_than_14d`: orders created strictly before (now − 14 days)
 * - `this_week`: orders created on or after the most recent Monday (UTC)
 * Returns dates as YYYY-MM-DD strings so the Supabase query can use them
 * directly without re-formatting.
 */
export function resolveScope(
  scope: PickerScope,
  now: Date
): { fromDate: string | null; toDate?: string; label: string } {
  switch (scope) {
    case 'older_than_7d': {
      const cutoff = new Date(now.getTime() - 7 * 86_400_000);
      return { fromDate: null, toDate: toIsoDate(cutoff), label: 'Older than 7 days' };
    }
    case 'older_than_14d': {
      const cutoff = new Date(now.getTime() - 14 * 86_400_000);
      return { fromDate: null, toDate: toIsoDate(cutoff), label: 'Older than 14 days' };
    }
    case 'this_week': {
      // ISO week: Monday is day 1, Sunday is day 7. JS getUTCDay() returns
      // 0 for Sunday … 6 for Saturday. Shift so Monday = 0.
      const dow = now.getUTCDay();
      const daysSinceMonday = (dow + 6) % 7;
      const monday = new Date(now.getTime() - daysSinceMonday * 86_400_000);
      return { fromDate: toIsoDate(monday), label: 'This week' };
    }
    case 'all':
    default:
      return { fromDate: null, label: 'All open backlog' };
  }
}

/** Maps a remaining-line-count to its bucket key. Clamps to [1, 4]. */
export function bucketKey(remainingLineCount: number): 1 | 2 | 3 | 4 {
  if (remainingLineCount <= 1) return 1;
  if (remainingLineCount === 2) return 2;
  if (remainingLineCount === 3) return 3;
  return 4;
}

/** Remaining qty for a line item after subtracting already-fulfilled qty.
 * Clamped to ≥ 0 (defensive against over-fulfillment data drift). */
export function netRemaining(quantity: number, alreadyFulfilled: number): number {
  const remaining = quantity - alreadyFulfilled;
  return remaining > 0 ? remaining : 0;
}

// Silence unused-import lint in this stub file. (Removed when Task 2 adds the
// builder body.)
export { ISO_DATE_RE };
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npx vitest run src/lib/kika-picker.test.ts
```

Expected: PASS · 12 / 12.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kika-picker.ts src/lib/kika-picker.test.ts
git commit -m "feat(kika-picker): builder helpers (resolveScope, bucketKey, netRemaining)"
```

---

## Task 2: Picker builder — full `buildKikaPickerReport`

**Files:**
- Modify: `src/lib/kika-picker.ts`

No new tests in this task (the same pattern as `kika-manufacturing.ts`, which has no test file). The pure helpers from Task 1 are exercised inside the builder. We verify end-to-end by loading the page in dev in Task 5.

- [ ] **Step 1: Add the builder implementation to `kika-picker.ts`**

Replace the trailing `export { ISO_DATE_RE };` line with the builder. Append below the helpers:

```ts
import { supabaseAdmin } from './supabase';

const OPEN_FULFILLMENT = new Set([
  '',
  'unfulfilled',
  'partial',
  'partially_fulfilled',
  'partially-fulfilled',
]);

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

function pickPrimaryImage(
  raw: Record<string, unknown> | null,
  variantId: number | null
): string | null {
  if (!raw) return null;
  const images = (raw['images'] as Array<Record<string, unknown>> | null) || [];
  if (variantId) {
    const variants = (raw['variants'] as Array<Record<string, unknown>> | null) || [];
    const v = variants.find(x => Number(x['id']) === variantId);
    const imageId = v && v['image_id'] != null ? Number(v['image_id']) : null;
    if (imageId) {
      const match = images.find(im => Number(im['id']) === imageId);
      if (match && typeof match['src'] === 'string') return match['src'] as string;
    }
  }
  const primary = (raw['image'] as Record<string, unknown> | null) || images[0] || null;
  if (primary && typeof primary['src'] === 'string') return primary['src'] as string;
  return null;
}

function pickVariantTitle(
  raw: Record<string, unknown> | null,
  variantId: number | null
): string | null {
  if (!raw || !variantId) return null;
  const variants = (raw['variants'] as Array<Record<string, unknown>> | null) || [];
  const v = variants.find(x => Number(x['id']) === variantId);
  if (!v) return null;
  const t = typeof v['title'] === 'string' ? (v['title'] as string) : null;
  if (t && t.toLowerCase() !== 'default title') return t;
  const opts = [v['option1'], v['option2'], v['option3']]
    .filter(o => typeof o === 'string' && o)
    .map(o => o as string);
  return opts.length > 0 ? opts.join(' / ') : null;
}

function pickVariantSku(
  raw: Record<string, unknown> | null,
  variantId: number | null
): string | null {
  if (!raw || !variantId) return null;
  const variants = (raw['variants'] as Array<Record<string, unknown>> | null) || [];
  const v = variants.find(x => Number(x['id']) === variantId);
  return v && typeof v['sku'] === 'string' ? (v['sku'] as string) : null;
}

export async function buildKikaPickerReport(params: {
  scope: PickerScope;
}): Promise<PickerReport> {
  const sb = supabaseAdmin();
  const now = new Date();
  const range = resolveScope(params.scope, now);

  // 1. Open orders matching scope.
  type OrderRow = {
    id: number;
    name: string | null;
    customer_name: string | null;
    email: string | null;
    created_at: string | null;
    fulfillment_status: string | null;
    financial_status: string | null;
    cancelled_at: string | null;
    raw: Record<string, unknown> | null;
  };
  const orders: OrderRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    let q = sb
      .from('shopify_orders')
      .select(
        'id, name, customer_name, email, created_at, fulfillment_status, financial_status, cancelled_at, raw'
      )
      .is('cancelled_at', null);
    if (range.fromDate) q = q.gte('created_at', `${range.fromDate}T00:00:00Z`);
    if (range.toDate) q = q.lt('created_at', `${range.toDate}T00:00:00Z`);
    q = q.order('created_at', { ascending: true }).range(offset, offset + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(`picker orders: ${error.message}`);
    const rows = (data as OrderRow[]) || [];
    if (rows.length === 0) break;
    orders.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const openOrders = orders.filter(o => {
    const fs = (o.fulfillment_status || '').toLowerCase();
    if (!OPEN_FULFILLMENT.has(fs)) return false;
    const fin = (o.financial_status || '').toLowerCase();
    if (fin === 'voided' || fin === 'cancelled') return false;
    return true;
  });

  if (openOrders.length === 0) {
    return {
      scope: params.scope,
      scope_label: range.label,
      generated_at: now.toISOString(),
      totals: { open_orders: 0, total_lines: 0, total_units: 0, oldest_age_days: null },
      buckets: [],
      common_items: [],
    };
  }

  // 2. Build {line_item_id -> already_fulfilled_qty} from each order's
  //    raw.fulfillments[].line_items[]. Skip cancelled/failed fulfillments.
  const fulfilledByLineItemId = new Map<number, number>();
  for (const o of openOrders) {
    const raw = (o.raw || {}) as Record<string, unknown>;
    const fulfillments = (raw['fulfillments'] as Array<Record<string, unknown>> | null) || [];
    for (const f of fulfillments) {
      const status =
        (typeof f['status'] === 'string' ? (f['status'] as string) : '').toLowerCase();
      if (status === 'cancelled' || status === 'failure') continue;
      const flines = (f['line_items'] as Array<Record<string, unknown>> | null) || [];
      for (const fl of flines) {
        const id = Number(fl['id']);
        const qty = Number(fl['quantity']);
        if (!Number.isFinite(id) || !Number.isFinite(qty) || qty <= 0) continue;
        fulfilledByLineItemId.set(id, (fulfilledByLineItemId.get(id) || 0) + qty);
      }
    }
  }

  // 3. Line items for the surviving orders.
  type LineRow = {
    id: number;
    order_id: number;
    product_id: number | null;
    variant_id: number | null;
    title: string | null;
    name: string | null;
    sku: string | null;
    quantity: number | null;
  };
  const openOrderIds = openOrders.map(o => o.id);
  const lines: LineRow[] = [];
  for (let i = 0; i < openOrderIds.length; i += 500) {
    const chunk = openOrderIds.slice(i, i + 500);
    const { data, error } = await sb
      .from('shopify_line_items')
      .select('id, order_id, product_id, variant_id, title, name, sku, quantity')
      .in('order_id', chunk);
    if (error) throw new Error(`picker lines: ${error.message}`);
    lines.push(...((data as LineRow[]) || []));
  }

  // 4. Products for description / image / variant title fallback.
  const productIds = Array.from(
    new Set(
      lines.map(l => l.product_id).filter((p): p is number => typeof p === 'number' && p > 0)
    )
  );
  type ProductRow = { id: number; title: string | null; raw: Record<string, unknown> | null };
  const productMap = new Map<number, ProductRow>();
  for (let i = 0; i < productIds.length; i += 500) {
    const chunk = productIds.slice(i, i + 500);
    const { data, error } = await sb
      .from('shopify_products')
      .select('id, title, raw')
      .in('id', chunk);
    if (error) throw new Error(`picker products: ${error.message}`);
    for (const p of (data ?? []) as ProductRow[]) productMap.set(p.id, p);
  }

  // 5. Group lines by order, drop fully shipped lines, build PickerOrder shape.
  const linesByOrder = new Map<number, LineRow[]>();
  for (const l of lines) {
    const arr = linesByOrder.get(l.order_id) || [];
    arr.push(l);
    linesByOrder.set(l.order_id, arr);
  }

  const pickerOrders: PickerOrder[] = [];
  const todayMs = now.getTime();
  for (const o of openOrders) {
    const orderLines = linesByOrder.get(o.id) || [];
    const survivingLines: PickerOrderLine[] = [];
    for (const l of orderLines) {
      const totalQty = Number(l.quantity) || 0;
      const alreadyShipped = fulfilledByLineItemId.get(l.id) || 0;
      const remaining = netRemaining(totalQty, alreadyShipped);
      if (remaining === 0) continue;
      const product = l.product_id ? productMap.get(l.product_id) : undefined;
      const productRaw = (product?.raw ?? null) as Record<string, unknown> | null;
      const productTitle =
        product?.title || l.title || l.name || '(unknown product)';
      const variantTitle = pickVariantTitle(productRaw, l.variant_id ?? null);
      const sku = l.sku || pickVariantSku(productRaw, l.variant_id ?? null);
      survivingLines.push({
        qty: remaining,
        product_title: productTitle,
        variant_title: variantTitle,
        sku,
      });
    }
    if (survivingLines.length === 0) continue;
    const createdMs = o.created_at ? Date.parse(o.created_at) : NaN;
    const ageDays = Number.isFinite(createdMs)
      ? Math.floor((todayMs - createdMs) / 86_400_000)
      : null;
    pickerOrders.push({
      id: o.id,
      name: o.name || `#${o.id}`,
      customer_name: o.customer_name,
      email: o.email,
      created_at: o.created_at,
      age_days: ageDays,
      remaining_line_count: survivingLines.length,
      remaining_unit_count: survivingLines.reduce((s, ln) => s + ln.qty, 0),
      lines: survivingLines,
    });
  }

  // 6. Bucket the orders.
  const bucketMap = new Map<1 | 2 | 3 | 4, PickerOrder[]>();
  for (const po of pickerOrders) {
    const key = bucketKey(po.remaining_line_count);
    const arr = bucketMap.get(key) || [];
    arr.push(po);
    bucketMap.set(key, arr);
  }

  const BUCKET_LABEL: Record<1 | 2 | 3 | 4, string> = {
    1: '1 line',
    2: '2 lines',
    3: '3 lines',
    4: '4+ lines',
  };

  const buckets: PickerBucket[] = ([1, 2, 3, 4] as const)
    .map(key => {
      const arr = (bucketMap.get(key) || []).slice().sort((a, b) => {
        // Oldest first
        const am = a.created_at ? Date.parse(a.created_at) : Number.MAX_SAFE_INTEGER;
        const bm = b.created_at ? Date.parse(b.created_at) : Number.MAX_SAFE_INTEGER;
        return am - bm;
      });
      return {
        key,
        label: BUCKET_LABEL[key],
        orders: arr,
        total_orders: arr.length,
        total_units: arr.reduce((s, o) => s + o.remaining_unit_count, 0),
        oldest_age_days: arr.reduce<number | null>(
          (acc, o) => (o.age_days != null && (acc == null || o.age_days > acc) ? o.age_days : acc),
          null
        ),
      };
    })
    .filter(b => b.total_orders > 0);

  // 7. Most-common items rollup. Walk surviving lines, group by product_id +
  //    variant_id. Track distinct order_ids for the orders count.
  type VariantAgg = {
    variant_id: number | null;
    variant_title: string | null;
    sku: string | null;
    orders: Set<number>;
    units: number;
  };
  type ProductAgg = {
    product_id: number;
    product_title: string;
    image_url: string | null;
    short_description: string | null;
    variants: Map<number | 'none', VariantAgg>;
    orders: Set<number>;
  };
  const productAggs = new Map<number, ProductAgg>();

  for (const po of pickerOrders) {
    const orderLines = linesByOrder.get(po.id) || [];
    for (const l of orderLines) {
      if (!l.product_id) continue;
      const totalQty = Number(l.quantity) || 0;
      const remaining = netRemaining(totalQty, fulfilledByLineItemId.get(l.id) || 0);
      if (remaining === 0) continue;
      const product = productMap.get(l.product_id);
      const productRaw = (product?.raw ?? null) as Record<string, unknown> | null;
      const pAgg: ProductAgg =
        productAggs.get(l.product_id) || {
          product_id: l.product_id,
          product_title: product?.title || l.title || l.name || '(unknown product)',
          image_url: pickPrimaryImage(productRaw, null),
          short_description: productRaw && typeof productRaw['body_html'] === 'string'
            ? stripHtml(productRaw['body_html'] as string)
            : null,
          variants: new Map(),
          orders: new Set(),
        };
      const vKey: number | 'none' = l.variant_id ?? 'none';
      const vAgg: VariantAgg =
        pAgg.variants.get(vKey) || {
          variant_id: l.variant_id ?? null,
          variant_title: pickVariantTitle(productRaw, l.variant_id ?? null),
          sku: l.sku || pickVariantSku(productRaw, l.variant_id ?? null),
          orders: new Set(),
          units: 0,
        };
      vAgg.units += remaining;
      vAgg.orders.add(po.id);
      pAgg.variants.set(vKey, vAgg);
      pAgg.orders.add(po.id);
      productAggs.set(l.product_id, pAgg);
    }
  }

  const common_items: PickerCommonItem[] = Array.from(productAggs.values())
    .map(p => {
      const variants = Array.from(p.variants.values())
        .map(v => ({
          variant_id: v.variant_id,
          variant_title: v.variant_title,
          sku: v.sku,
          orders: v.orders.size,
          units: v.units,
        }))
        .sort((a, b) => b.units - a.units);
      return {
        product_id: p.product_id,
        product_title: p.product_title,
        short_description: p.short_description,
        image_url: p.image_url,
        variants,
        total_orders: p.orders.size,
        total_units: variants.reduce((s, v) => s + v.units, 0),
      };
    })
    .sort((a, b) => {
      if (b.total_orders !== a.total_orders) return b.total_orders - a.total_orders;
      return b.total_units - a.total_units;
    });

  // 8. Totals.
  const totals = {
    open_orders: pickerOrders.length,
    total_lines: pickerOrders.reduce((s, o) => s + o.remaining_line_count, 0),
    total_units: pickerOrders.reduce((s, o) => s + o.remaining_unit_count, 0),
    oldest_age_days: pickerOrders.reduce<number | null>(
      (acc, o) => (o.age_days != null && (acc == null || o.age_days > acc) ? o.age_days : acc),
      null
    ),
  };

  return {
    scope: params.scope,
    scope_label: range.label,
    generated_at: now.toISOString(),
    totals,
    buckets,
    common_items,
  };
}
```

Remove the `export { ISO_DATE_RE };` line from the bottom (it was only there to silence unused warnings in the stub).

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: clean.

- [ ] **Step 3: Run the unit tests again to confirm helpers still work**

```bash
npx vitest run src/lib/kika-picker.test.ts
```

Expected: PASS · 12 / 12.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kika-picker.ts
git commit -m "feat(kika-picker): full buildKikaPickerReport builder"
```

---

## Task 3: Reporting hub page + KIKA-hub tile

**Files:**
- Create: `src/app/emails/kika/reporting/page.tsx`
- Modify: `src/app/emails/[domain]/page.tsx`

- [ ] **Step 1: Create the hub page**

Create `src/app/emails/kika/reporting/page.tsx`:

```tsx
import Link from 'next/link';
import {
  ChevronRight,
  ClipboardList,
  TrendingUp,
  ShoppingBag,
  Factory,
  AlertTriangle,
  Calendar,
  Calculator,
  ArrowRight,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';

export const dynamic = 'force-dynamic';

export default function KikaReportingHubPage() {
  return (
    <>
      <TopNav>
        <Link href="/emails/kika" className="ix-link">KIKA</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Reporting</span>
      </TopNav>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            KIKA · Reporting
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Reporting</h1>
          <p className="text-sm text-slate-500 mt-1">
            Operational reports and links to deeper analytics
          </p>
        </header>

        {/* Featured: Picker Report */}
        <Link
          href="/emails/kika/reporting/picker"
          className="group ix-card p-5 flex items-center justify-between hover:shadow-md transition relative overflow-hidden"
        >
          <div className="absolute -top-6 -right-6 w-40 h-40 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 opacity-[0.08] blur-2xl pointer-events-none" />
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-indigo-50 text-indigo-600">
              <ClipboardList size={24} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">Picker Report</h3>
                <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                  New · Ops
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Open orders bucketed by SKU count (1-line, 2-line, 3+) · most-common items in backlog · printable A4 picking list
              </p>
            </div>
          </div>
          <ArrowRight size={18} className="text-slate-400 group-hover:text-indigo-600 transition shrink-0" />
        </Link>

        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold pt-2">
          Existing dashboards
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HubLink
            href="/emails/kika/exec"
            icon={<TrendingUp size={20} strokeWidth={2.2} />}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            title="Executive Summary"
            blurb="KPIs, fulfillment time, delayed orders, manufacturing"
          />
          <HubLink
            href="/emails/kika/sales"
            icon={<ShoppingBag size={20} strokeWidth={2.2} />}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            title="Sales Intelligence"
            blurb="Revenue, AOV, top products, daily trend"
          />
          <HubLink
            href="/emails/kika/exec?focus=manufacturing"
            icon={<Factory size={20} strokeWidth={2.2} />}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
            title="To Manufacture"
            blurb="Production plan with stock netting"
          />
          <HubLink
            href="/emails/kika/exec?focus=delayed"
            icon={<AlertTriangle size={20} strokeWidth={2.2} />}
            iconBg="bg-rose-50"
            iconColor="text-rose-600"
            title="Delayed Orders"
            blurb="Oldest unfulfilled, sorted by age"
          />
          <HubLink
            href="/emails/kika/setup"
            icon={<Calendar size={20} strokeWidth={2.2} />}
            iconBg="bg-slate-100"
            iconColor="text-slate-600"
            title="Daily Performance Report"
            blurb="09:00 Cairo digest · history of past reports"
          />
          <HubLink
            href="/emails/kika/financials"
            icon={<Calculator size={20} strokeWidth={2.2} />}
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
            title="Financials"
            blurb="P&L from Odoo"
          />
        </div>
      </main>
    </>
  );
}

function HubLink({
  href,
  icon,
  iconBg,
  iconColor,
  title,
  blurb,
}: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className="group ix-card p-4 flex items-start gap-3 hover:shadow-md transition"
    >
      <div className={`w-10 h-10 rounded-lg inline-flex items-center justify-center ${iconBg} ${iconColor} shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{blurb}</p>
      </div>
      <ArrowRight size={16} className="text-slate-400 group-hover:text-indigo-600 transition shrink-0 ml-auto self-center" />
    </Link>
  );
}
```

- [ ] **Step 2: Add the 6th tile to the KIKA module hub**

Open `src/app/emails/[domain]/page.tsx`. Inside the `d === 'kika'` block, find the closing of the last existing link (the Inventory card). Add a new link before that closing `</div>` of the grid:

```tsx
            <Link
              href="/emails/kika/reporting"
              className="group ix-card p-5 flex items-center justify-between hover:shadow-md transition relative overflow-hidden"
            >
              <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 opacity-[0.08] blur-2xl pointer-events-none" />
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-indigo-50 text-indigo-600">
                  <ClipboardList size={24} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Reporting</h3>
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                      Ops
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Picker report · links to Exec / Sales / Mfg / Delayed / Daily / Financials
                  </p>
                </div>
              </div>
              <ArrowRight size={18} className="text-slate-400 group-hover:text-indigo-600 transition shrink-0" />
            </Link>
```

Also make sure `ClipboardList` is imported from `lucide-react` at the top of the file (`import { …, ClipboardList } from 'lucide-react';`). If `ArrowRight` isn't already imported there, that needs to be in the import list too (it should already be — used by other cards).

- [ ] **Step 3: Type-check + dev smoke test**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: clean. Then visually verify in dev (`npm run dev`):
1. `/emails/kika` shows 6 module cards now, with "Reporting" at the bottom.
2. Clicking it lands on `/emails/kika/reporting` showing the featured Picker card + 6 link cards.
3. The "To Manufacture" card jumps directly to `/emails/kika/exec?focus=manufacturing` and opens that drill-down.
4. The "Delayed" card jumps directly to `/emails/kika/exec?focus=delayed`.

- [ ] **Step 4: Commit**

```bash
git add src/app/emails/kika/reporting/page.tsx src/app/emails/[domain]/page.tsx
git commit -m "feat(kika): add Reporting hub page and 6th tile on KIKA module"
```

---

## Task 4: Picker page — server component shell

**Files:**
- Create: `src/app/emails/kika/reporting/picker/page.tsx`

This task renders the page header, "Export A4 PDF" button (the route doesn't exist yet but the link is valid), filter chips, and headline stats. Buckets and common-items blocks are stubbed with `TODO` comments — they get fleshed out in Tasks 5 and 6.

- [ ] **Step 1: Create the picker page**

Create `src/app/emails/kika/reporting/picker/page.tsx`:

```tsx
import Link from 'next/link';
import {
  ChevronRight,
  FileDown,
  Calendar,
  ClipboardList,
  Package,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildKikaPickerReport,
  type PickerScope,
} from '@/lib/kika-picker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCOPES: Array<{ id: PickerScope; label: string }> = [
  { id: 'all', label: 'All open backlog' },
  { id: 'older_than_7d', label: 'Older than 7d' },
  { id: 'older_than_14d', label: 'Older than 14d' },
  { id: 'this_week', label: 'This week only' },
];

function isScope(v: string | undefined): v is PickerScope {
  return !!v && (SCOPES.map(s => s.id) as string[]).includes(v);
}

const fmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n))
    ? '—'
    : Number(n).toLocaleString('en-US');

export default async function KikaPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const sp = await searchParams;
  const scope: PickerScope = isScope(sp.scope) ? sp.scope : 'all';
  const report = await buildKikaPickerReport({ scope });

  const pdfHref = `/api/kika/picker-report?scope=${encodeURIComponent(scope)}`;

  return (
    <>
      <TopNav>
        <Link href="/emails/kika" className="ix-link">KIKA</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/kika/reporting" className="ix-link">Reporting</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Picker Report</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium flex items-center gap-1.5">
              <ClipboardList size={12} /> KIKA · Reporting
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Picker Report</h1>
            <p className="text-sm text-slate-500 mt-1">
              Open orders grouped by SKU count · most common items in the unfulfilled backlog
            </p>
          </div>
          <a
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
          >
            <FileDown size={14} /> Export A4 PDF
          </a>
        </header>

        {/* Filter strip */}
        <section className="ix-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-indigo-600" />
            <h2 className="text-sm font-semibold">Scope</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map(s => (
              <Link
                key={s.id}
                href={s.id === 'all' ? '/emails/kika/reporting/picker' : `?scope=${s.id}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  scope === s.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </section>

        {/* Headline stats */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BigStat
            label="Open orders"
            value={fmt(report.totals.open_orders)}
            sub="unfulfilled · not cancelled"
            icon={<ClipboardList size={18} className="text-indigo-600" />}
          />
          <BigStat
            label="Total lines"
            value={fmt(report.totals.total_lines)}
            sub="remaining SKU instances"
            icon={<Layers size={18} className="text-amber-600" />}
          />
          <BigStat
            label="Total units"
            value={fmt(report.totals.total_units)}
            sub="physical units to pack"
            icon={<Package size={18} className="text-emerald-600" />}
          />
          <BigStat
            label="Oldest backlog"
            value={report.totals.oldest_age_days != null ? `${report.totals.oldest_age_days}d` : '—'}
            sub="since earliest open order"
            icon={<AlertTriangle size={18} className="text-rose-600" />}
          />
        </section>

        {/* TODO Task 5: BucketsBlock */}
        {/* TODO Task 6: CommonItemsBlock */}

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          Scope: {report.scope_label} · generated {new Date(report.generated_at).toLocaleString('en-US')}
        </footer>
      </main>
    </>
  );
}

function BigStat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="ix-card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        {icon}
      </div>
      <p className="text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + dev smoke test**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: clean. Then in dev: load `/emails/kika/reporting/picker` and verify:
1. Breadcrumb shows `KIKA › Reporting › Picker Report`.
2. Headline stats render with non-zero counts (assuming there are open orders).
3. Scope chips work — clicking "Older than 7d" navigates to `?scope=older_than_7d` and the counts change.
4. "Export A4 PDF" button is visible (links to a route that doesn't exist yet — clicking 404s — that's fine, Task 7 builds the route).

- [ ] **Step 3: Commit**

```bash
git add src/app/emails/kika/reporting/picker/page.tsx
git commit -m "feat(kika-picker): page shell with filter chips + headline stats"
```

---

## Task 5: BucketsBlock client component

**Files:**
- Create: `src/app/emails/kika/reporting/picker/_components/buckets-block.tsx`
- Modify: `src/app/emails/kika/reporting/picker/page.tsx`

- [ ] **Step 1: Create the buckets block**

Create `src/app/emails/kika/reporting/picker/_components/buckets-block.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Boxes, ChevronDown, ChevronRight } from 'lucide-react';
import type { PickerBucket } from '@/lib/kika-picker';
import { OrderNumberButton } from '@/app/emails/kika/exec/_components/order-number-button';

const fmt = (n: number): string => n.toLocaleString('en-US');

export function BucketsBlock({ buckets }: { buckets: PickerBucket[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(key: 1 | 2 | 3 | 4) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (buckets.length === 0) {
    return (
      <section className="ix-card p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Boxes size={14} className="text-indigo-600" />
          Fulfillment buckets
        </h3>
        <p className="text-sm text-slate-500 mt-2">
          Nothing open in this scope — no picker work to do.
        </p>
      </section>
    );
  }

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Boxes size={14} className="text-indigo-600" />
          Fulfillment buckets — orders by SKU count
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Click a row to see the orders in that bucket.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Bucket</th>
              <th className="px-4 py-2 text-right">Orders</th>
              <th className="px-4 py-2 text-right">Total units</th>
              <th className="px-4 py-2 text-right">Oldest</th>
              <th className="px-4 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => {
              const isOpen = expanded.has(b.key);
              const pillTone =
                b.key >= 4
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-indigo-50 text-indigo-700';
              return (
                <>
                  <tr
                    key={b.key}
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                    onClick={() => toggle(b.key)}
                  >
                    <td className="px-4 py-2">
                      <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-semibold ${pillTone}`}>
                        {b.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">
                      {fmt(b.total_orders)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {fmt(b.total_units)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[11px] text-slate-500">
                      {b.oldest_age_days != null ? `${b.oldest_age_days}d` : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-400">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-4 py-3">
                        <ul className="space-y-2">
                          {b.orders.map(o => (
                            <li
                              key={o.id}
                              className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
                            >
                              <OrderNumberButton orderId={o.id} orderName={o.name} />
                              <span className="text-slate-700 font-medium">
                                {o.customer_name || o.email || '—'}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {o.age_days != null ? `${o.age_days}d` : ''}
                              </span>
                              <span className="text-[11px] text-slate-500 w-full">
                                {o.lines.map((ln, i) => (
                                  <span key={i}>
                                    {i > 0 && <span className="text-slate-300 mx-1.5">·</span>}
                                    {ln.qty}× {ln.product_title}
                                    {ln.variant_title && (
                                      <span className="text-slate-400"> ({ln.variant_title})</span>
                                    )}
                                    {ln.sku && (
                                      <span className="font-mono text-slate-400"> {ln.sku}</span>
                                    )}
                                  </span>
                                ))}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into the picker page**

In `src/app/emails/kika/reporting/picker/page.tsx`, add the import:

```tsx
import { BucketsBlock } from './_components/buckets-block';
```

Then replace the `{/* TODO Task 5: BucketsBlock */}` comment with:

```tsx
<BucketsBlock buckets={report.buckets} />
```

- [ ] **Step 3: Type-check + dev smoke test**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: clean. Then in dev:
1. Buckets table renders with all non-empty buckets.
2. Clicking a row expands the order list below.
3. Each order in the expanded panel shows order#, customer, age, and the line items inline.
4. Clicking an order# opens the existing order detail modal.

- [ ] **Step 4: Commit**

```bash
git add src/app/emails/kika/reporting/picker/_components/buckets-block.tsx src/app/emails/kika/reporting/picker/page.tsx
git commit -m "feat(kika-picker): BucketsBlock with expandable order lists"
```

---

## Task 6: CommonItemsBlock client component

**Files:**
- Create: `src/app/emails/kika/reporting/picker/_components/common-items-block.tsx`
- Modify: `src/app/emails/kika/reporting/picker/page.tsx`

- [ ] **Step 1: Create the common items block**

Create `src/app/emails/kika/reporting/picker/_components/common-items-block.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Package, ChevronDown, ChevronRight } from 'lucide-react';
import type { PickerCommonItem } from '@/lib/kika-picker';

const fmt = (n: number): string => n.toLocaleString('en-US');

export function CommonItemsBlock({ items }: { items: PickerCommonItem[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <section className="ix-card p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Package size={14} className="text-indigo-600" />
          Most common items in unfulfilled orders
        </h3>
        <p className="text-sm text-slate-500 mt-2">No items to surface in this scope.</p>
      </section>
    );
  }

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Package size={14} className="text-indigo-600" />
          Most common items in unfulfilled orders
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Click a product to expand its variants underneath.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 w-12"></th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-right">Orders</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2 text-right">Variants</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(p => {
              const isOpen = expanded.has(p.product_id);
              return (
                <>
                  <tr
                    key={p.product_id}
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                    onClick={() => toggle(p.product_id)}
                  >
                    <td className="px-3 py-2">
                      <Thumb src={p.image_url} alt={p.product_title} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{p.product_title}</div>
                      {p.short_description && (
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 max-w-[460px]">
                          {p.short_description.slice(0, 140)}
                          {p.short_description.length > 140 ? '…' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {fmt(p.total_orders)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(p.total_units)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {p.variants.length}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                  </tr>
                  {isOpen && p.variants.map(v => (
                    <tr key={`${p.product_id}-${v.variant_id ?? 'none'}`} className="bg-indigo-50/40">
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1 pl-10 text-[12px] text-slate-700">
                        <span>{v.variant_title || '—'}</span>
                        {v.sku && (
                          <span className="ml-2 font-mono text-[11px] text-slate-400">SKU {v.sku}</span>
                        )}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums text-slate-700">{fmt(v.orders)}</td>
                      <td className="px-3 py-1 text-right tabular-nums text-slate-700">{fmt(v.units)}</td>
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1"></td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div
        className="w-10 h-10 rounded-md bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center text-slate-400"
        aria-hidden="true"
      >
        <Package size={14} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      width={40}
      height={40}
      loading="lazy"
      className="w-10 h-10 rounded-md object-cover ring-1 ring-slate-200 bg-slate-50"
    />
  );
}
```

- [ ] **Step 2: Wire it into the picker page**

In `src/app/emails/kika/reporting/picker/page.tsx`, add the import:

```tsx
import { CommonItemsBlock } from './_components/common-items-block';
```

Then replace the `{/* TODO Task 6: CommonItemsBlock */}` comment with:

```tsx
<CommonItemsBlock items={report.common_items} />
```

- [ ] **Step 3: Type-check + dev smoke test**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: clean. Then in dev:
1. Common items table renders with product rows sorted by orders desc.
2. Each product shows thumbnail + title + truncated description + totals + variant count.
3. Clicking a product row expands variant rows underneath with indented variant titles, SKUs, and per-variant counts.

- [ ] **Step 4: Commit**

```bash
git add src/app/emails/kika/reporting/picker/_components/common-items-block.tsx src/app/emails/kika/reporting/picker/page.tsx
git commit -m "feat(kika-picker): CommonItemsBlock with expandable variants"
```

---

## Task 7: PDF document + API route

**Files:**
- Create: `src/lib/kika-picker-pdf.tsx`
- Create: `src/app/api/kika/picker-report/route.ts`

- [ ] **Step 1: Create the PDF document**

Create `src/lib/kika-picker-pdf.tsx`:

```tsx
import 'server-only';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PickerReport } from './kika-picker';

const PALETTE = {
  ink: '#0f172a',
  ink2: '#334155',
  muted: '#64748b',
  brand: '#4f46e5',
  brandLight: '#eef2ff',
  line: '#e2e8f0',
  rowAlt: '#f8fafc',
  warn: '#b45309',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 50,
    paddingHorizontal: 28,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: PALETTE.ink,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: PALETTE.brand,
    marginBottom: 10,
  },
  brand: {
    fontSize: 9,
    color: PALETTE.brand,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: PALETTE.ink },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end' },
  scopeLabel: { fontSize: 8.5, color: PALETTE.muted },
  generatedAt: { fontSize: 7.5, color: PALETTE.muted, marginTop: 1 },
  totals: { flexDirection: 'row', marginBottom: 10, gap: 8 },
  totalCard: { flex: 1, backgroundColor: PALETTE.brandLight, borderRadius: 4, padding: 8 },
  totalLabel: {
    fontSize: 7,
    color: PALETTE.muted,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.ink,
    marginTop: 2,
  },
  totalSub: { fontSize: 7.5, color: PALETTE.muted, marginTop: 1 },
  sectionH: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.ink,
    marginTop: 10,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.line,
  },
  bucketH: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#3730a3',
    backgroundColor: PALETTE.brandLight,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginTop: 6,
    marginBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
  },
  orderNo: {
    width: 50,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.brand,
  },
  orderMid: { flex: 1, fontSize: 8.5 },
  orderCust: { fontFamily: 'Helvetica-Bold', color: PALETTE.ink2 },
  orderLine: { fontSize: 7.5, color: PALETTE.muted, marginTop: 1 },
  orderAge: { width: 30, fontSize: 7.5, color: PALETTE.muted, textAlign: 'right' },
  itemsThead: {
    flexDirection: 'row',
    backgroundColor: PALETTE.rowAlt,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.line,
  },
  itemsTh: {
    padding: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: PALETTE.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  itemsRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
  },
  itemsTd: { padding: 3, fontSize: 8.5 },
  colProduct: { width: 240 },
  colSku: { width: 80 },
  colOrders: { width: 50, textAlign: 'right' },
  colUnits: { width: 50, textAlign: 'right' },
  productCell: { fontFamily: 'Helvetica-Bold', color: PALETTE.ink },
  variantCell: { color: PALETTE.muted, fontSize: 8 },
  skuMono: { fontFamily: 'Courier', fontSize: 7.5, color: PALETTE.muted },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: PALETTE.muted,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: PALETTE.line,
  },
});

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function KikaPickerPdf({
  report,
  generatedAt,
}: {
  report: PickerReport;
  generatedAt: string;
}) {
  return (
    <Document
      title={`KIKA Picker Report ${report.scope_label}`}
      author="Lime Investments · KIKA"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>KIKA · PICKER REPORT</Text>
            <Text style={styles.title}>Orders to fulfill</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.scopeLabel}>Scope: {report.scope_label}</Text>
            <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Open orders</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.open_orders)}</Text>
            <Text style={styles.totalSub}>unfulfilled · not cancelled</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total lines</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.total_lines)}</Text>
            <Text style={styles.totalSub}>remaining SKU instances</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total units</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.total_units)}</Text>
            <Text style={styles.totalSub}>physical units to pack</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Oldest</Text>
            <Text style={styles.totalValue}>
              {report.totals.oldest_age_days != null ? `${report.totals.oldest_age_days}d` : '—'}
            </Text>
            <Text style={styles.totalSub}>earliest order</Text>
          </View>
        </View>

        {/* Buckets */}
        <Text style={styles.sectionH}>Fulfillment buckets — {report.scope_label}</Text>

        {report.buckets.length === 0 ? (
          <Text style={{ fontSize: 9, color: PALETTE.muted, marginTop: 4 }}>
            Nothing open in this scope — no picker work to do.
          </Text>
        ) : (
          report.buckets.map(b => (
            <View key={b.key} wrap>
              <View style={styles.bucketH}>
                <Text>{`${b.label} orders`}</Text>
                <Text>{`${fmt(b.total_orders)} orders · ${fmt(b.total_units)} units`}</Text>
              </View>
              {b.orders.map(o => (
                <View key={o.id} style={styles.orderRow} wrap={false}>
                  <Text style={styles.orderNo}>{o.name}</Text>
                  <View style={styles.orderMid}>
                    <Text style={styles.orderCust}>
                      {o.customer_name || o.email || '—'}
                    </Text>
                    {o.lines.map((ln, i) => (
                      <Text key={i} style={styles.orderLine}>
                        {`${ln.qty}× ${ln.product_title}`}
                        {ln.variant_title ? ` · ${ln.variant_title}` : ''}
                        {ln.sku ? ` (${ln.sku})` : ''}
                      </Text>
                    ))}
                  </View>
                  <Text style={styles.orderAge}>
                    {o.age_days != null ? `${o.age_days}d` : '—'}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}

        {/* Common items */}
        <Text style={styles.sectionH}>Most common items in unfulfilled orders</Text>

        {report.common_items.length === 0 ? (
          <Text style={{ fontSize: 9, color: PALETTE.muted, marginTop: 4 }}>
            No items to surface in this scope.
          </Text>
        ) : (
          <View>
            <View style={styles.itemsThead} fixed>
              <Text style={[styles.itemsTh, styles.colProduct]}>Product / Variant</Text>
              <Text style={[styles.itemsTh, styles.colSku]}>SKU</Text>
              <Text style={[styles.itemsTh, styles.colOrders]}>Orders</Text>
              <Text style={[styles.itemsTh, styles.colUnits]}>Units</Text>
            </View>
            {report.common_items.map(p => (
              <View key={p.product_id} wrap={false}>
                <View style={styles.itemsRow}>
                  <Text style={[styles.itemsTd, styles.colProduct, styles.productCell]}>
                    {p.product_title}
                  </Text>
                  <Text style={[styles.itemsTd, styles.colSku]}></Text>
                  <Text style={[styles.itemsTd, styles.colOrders, styles.productCell]}>
                    {fmt(p.total_orders)}
                  </Text>
                  <Text style={[styles.itemsTd, styles.colUnits, styles.productCell]}>
                    {fmt(p.total_units)}
                  </Text>
                </View>
                {p.variants.map(v => (
                  <View
                    key={`${p.product_id}:${v.variant_id ?? 'none'}`}
                    style={[styles.itemsRow, { backgroundColor: PALETTE.rowAlt }]}
                  >
                    <Text style={[styles.itemsTd, styles.colProduct, styles.variantCell]}>
                      {`· ${v.variant_title || '—'}`}
                    </Text>
                    <Text style={[styles.itemsTd, styles.colSku, styles.skuMono]}>
                      {v.sku || ''}
                    </Text>
                    <Text style={[styles.itemsTd, styles.colOrders, styles.variantCell]}>
                      {fmt(v.orders)}
                    </Text>
                    <Text style={[styles.itemsTd, styles.colUnits, styles.variantCell]}>
                      {fmt(v.units)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            KIKA · kika-swim-wear · Lime Investments · scope: {report.scope_label}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Create the API route**

Create `src/app/api/kika/picker-report/route.ts`:

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireDomainAccess } from '@/lib/auth';
import { buildKikaPickerReport, type PickerScope } from '@/lib/kika-picker';
import { KikaPickerPdf } from '@/lib/kika-picker-pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID_SCOPES: PickerScope[] = ['all', 'older_than_7d', 'older_than_14d', 'this_week'];

export async function GET(req: NextRequest) {
  await requireDomainAccess('kika');
  const sp = req.nextUrl.searchParams;
  const scopeRaw = sp.get('scope') ?? 'all';
  const scope: PickerScope = (VALID_SCOPES as string[]).includes(scopeRaw)
    ? (scopeRaw as PickerScope)
    : 'all';

  const report = await buildKikaPickerReport({ scope });

  const generatedAt = new Date().toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: any = React.createElement(KikaPickerPdf, { report, generatedAt });
  const buffer = await renderToBuffer(element);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `kika-picker-report-${stamp}-${scope}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 3: Type-check + build verify**

```bash
npx tsc --noEmit -p tsconfig.json
npx next build 2>&1 | grep -i -E "error|fail" | head -5
```

Expected: tsc clean. `next build` exits 0 (no `error` or `fail` lines from the build phase).

- [ ] **Step 4: Smoke test the PDF in dev**

Run `npm run dev`, log in, then in a new tab open:
- `http://localhost:3000/api/kika/picker-report?scope=all`

Expected: A PDF opens inline in the browser. Cover strip says "KIKA · PICKER REPORT", totals strip shows non-zero numbers, every non-empty bucket is rendered, common-items table at the bottom, page numbers in the footer.

Also click "Export A4 PDF" on the picker page itself — should open the same PDF.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kika-picker-pdf.tsx src/app/api/kika/picker-report/route.ts
git commit -m "feat(kika-picker): A4 PDF document + GET /api/kika/picker-report"
```

---

## Task 8: Final verify + push + SESSION_HANDOFF

- [ ] **Step 1: Full type-check and build**

```bash
npx tsc --noEmit -p tsconfig.json
npx next build 2>&1 | tail -50
```

Both must complete cleanly. The route table should list `/emails/kika/reporting`, `/emails/kika/reporting/picker`, and `/api/kika/picker-report` (the latter under `.next/server/app/api/kika/`).

- [ ] **Step 2: Run unit tests**

```bash
npx vitest run src/lib/kika-picker.test.ts
```

Expected: all 12 helper tests PASS.

- [ ] **Step 3: Append to SESSION_HANDOFF.md**

Prepend a new dated section at the top of `SESSION_HANDOFF.md` describing what shipped (Reporting hub, Picker page, PDF route, the 6th tile on KIKA hub). Note that the spec lives at `docs/superpowers/specs/2026-05-16-kika-reporting-picker-design.md`.

- [ ] **Step 4: Push to main (auto-deploys via Vercel)**

```bash
git fetch origin main
git rebase origin/main   # only if behind
git push origin main
```

- [ ] **Step 5: Post-deploy smoke (after Vercel reports success)**

In production:
1. `/emails/kika` shows 6 cards including Reporting.
2. `/emails/kika/reporting` renders the hub.
3. `/emails/kika/reporting/picker` renders buckets + common items. Filter chips work.
4. "Export A4 PDF" opens a real PDF with the right contents.
5. Order# clicks anywhere open the existing order detail modal.

---

## Self-review summary

**Spec coverage** — every section of the spec maps to a task:
- §3 Reporting hub → Task 3
- §4 Picker page (filter chips, headline stats, buckets, common items) → Tasks 4, 5, 6
- §5 A4 PDF → Task 7
- §6 Data model → Task 1 (types) + Task 2 (full builder shape)
- §7 Builder algorithm → Task 2 (full implementation, exercises Task 1 helpers)
- §8 File/module layout → Tasks 1–7 each create one file from the table
- §9 Edge cases → handled in builder (Task 2): all-shipped order skipped, free-text lines included in buckets but excluded from common-items rollup, missing product row fallback to line-item title, empty scope handled
- §10 Out of scope → respected (no CSV, no email cron, no stock toggle)
- §12 Acceptance criteria → Task 8 verifies each

**Placeholder scan** — all `TODO Task N` comments in the plan refer to **explicitly defined task numbers** (Tasks 5 and 6) that fill them in, not actual placeholders. No "TBD", "implement later", or vague guidance.

**Type consistency** — `PickerScope`, `PickerBucket`, `PickerOrder`, `PickerOrderLine`, `PickerCommonItem`, `PickerCommonVariant`, `PickerReport` are all defined in Task 1's `kika-picker.ts` types and used unchanged in Tasks 2, 4, 5, 6, 7. `bucketKey` / `netRemaining` / `resolveScope` signatures defined in Task 1 are called identically in Task 2's builder.
