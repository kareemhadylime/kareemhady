import 'server-only';
import { supabaseAdmin } from '../supabase';
import { addDays } from './cairo-dates';
import { ordersInRange, linesForOrders, type KikaCorpus } from './corpus';
import type { InventoryRow, InventorySection } from './types';

// Inventory health for the daily report. Pulls every active product from
// `shopify_products`, walks `raw.variants[]` to read `inventory_quantity`
// and SKU labels, and computes a 14-day rolling velocity per variant from
// the corpus line items.
//
// Status buckets (Q7 — hardcoded thresholds, UI editor v2):
//   - stockout  → on_hand=0 AND velocity>0 (sold out, was selling)
//   - low       → days_of_cover < 14
//   - overstock → days_of_cover > 120 (top 10 only — long tail is noise)
//   - healthy   → everything else
//
// Velocity = units sold / 14 days, rolling. For a brand new variant with
// only 3 days of sales data, velocity uses the full 14-day window — this
// under-counts pace but is conservative for stockout flagging (better to
// flag too much than too little).

const STOCKOUT_VELOCITY_FLOOR = 0.1;       // ≥ 0.1 units/day in 14 days = "was selling"
const LOW_STOCK_DAYS = 14;
const OVERSTOCK_DAYS = 120;
const VELOCITY_WINDOW = 14;

type ProductRaw = {
  id: number;
  title: string | null;
  status: string | null;
  raw: Record<string, unknown> | null;
};

function pickString(obj: Record<string, unknown>, k: string): string | null {
  const v = obj[k];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function pickNumber(obj: Record<string, unknown>, k: string): number | null {
  const v = obj[k];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function variantLabel(v: Record<string, unknown>): string | null {
  const title = pickString(v, 'title');
  // Shopify default variant has title='Default Title' — collapse to null.
  if (!title || /default/i.test(title)) return null;
  return title;
}

export async function buildInventorySection(
  corpus: KikaCorpus,
  yesterdayYmd: string
): Promise<InventorySection> {
  const sb = supabaseAdmin();

  // Pull active products only — archived/draft aren't sellable so a
  // stockout flag would be noise. Variants live in `raw.variants[]`.
  const { data, error } = await sb
    .from('shopify_products')
    .select('id, title, status, raw')
    .eq('status', 'active')
    .limit(2000);
  if (error) throw new Error(`kika_inventory products: ${error.message}`);
  const products = (data as ProductRaw[]) || [];

  // Compute 14-day per-variant velocity from corpus line items.
  // Window: yesterday-13 → yesterday inclusive. Falls inside the 60-day
  // corpus window so no extra query needed.
  const velocityFrom = addDays(yesterdayYmd, -(VELOCITY_WINDOW - 1));
  const velocityWindowOrders = ordersInRange(corpus, velocityFrom, yesterdayYmd).filter(
    o => !o.is_cancelled
  );
  const lines = linesForOrders(corpus, velocityWindowOrders.map(o => o.id));
  const velocityByVariant = new Map<string, number>();
  for (const li of lines) {
    if (!li.variant_id) continue;
    const k = String(li.variant_id);
    velocityByVariant.set(k, (velocityByVariant.get(k) || 0) + li.quantity);
  }

  let totalSkusTracked = 0;
  const stockouts: InventoryRow[] = [];
  const low: InventoryRow[] = [];
  const overstockCandidates: InventoryRow[] = [];

  for (const p of products) {
    const raw = (p.raw || {}) as Record<string, unknown>;
    const variants =
      (raw.variants as Array<Record<string, unknown>> | null) || [];
    for (const v of variants) {
      const variantId = (v.id as number | string | undefined) ?? null;
      const onHand = pickNumber(v, 'inventory_quantity');
      if (onHand === null) continue;
      totalSkusTracked += 1;
      const unitsSold = velocityByVariant.get(String(variantId)) || 0;
      const velocity = unitsSold / VELOCITY_WINDOW;
      const daysOfCover =
        velocity > 0 ? onHand / velocity : null;
      const row: InventoryRow = {
        product_id: p.id,
        variant_id: variantId,
        title: p.title || 'Untitled',
        variant_label: variantLabel(v),
        on_hand: onHand,
        daily_velocity: Number(velocity.toFixed(2)),
        days_of_cover:
          daysOfCover !== null ? Number(daysOfCover.toFixed(1)) : null,
        status: 'healthy',
      };

      if (onHand <= 0 && velocity >= STOCKOUT_VELOCITY_FLOOR) {
        row.status = 'stockout';
        stockouts.push(row);
      } else if (
        daysOfCover !== null &&
        daysOfCover < LOW_STOCK_DAYS &&
        velocity > 0
      ) {
        row.status = 'low';
        low.push(row);
      } else if (
        daysOfCover !== null &&
        daysOfCover > OVERSTOCK_DAYS
      ) {
        row.status = 'overstock';
        overstockCandidates.push(row);
      }
    }
  }

  // Sort each bucket sensibly:
  //   stockouts: highest velocity first (biggest revenue loss)
  //   low: lowest days_of_cover first (most urgent to reorder)
  //   overstock: highest days_of_cover first
  stockouts.sort((a, b) => b.daily_velocity - a.daily_velocity);
  low.sort((a, b) => (a.days_of_cover ?? 0) - (b.days_of_cover ?? 0));
  overstockCandidates.sort(
    (a, b) => (b.days_of_cover ?? 0) - (a.days_of_cover ?? 0)
  );

  return {
    stockouts,
    low,
    overstock: overstockCandidates.slice(0, 10),
    total_skus_tracked: totalSkusTracked,
  };
}
